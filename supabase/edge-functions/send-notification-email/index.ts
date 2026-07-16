// @ts-nocheck
//
// send-notification-email — SES worker for the notification email outbox.
//
// Invoked (a) immediately by a Database Webhook on notification_deliveries INSERT and
// (b) periodically by a recovery cron. Either way it self-claims a batch of due rows
// from the outbox (claim_notification_deliveries RPC, FOR UPDATE SKIP LOCKED), resolves
// eligibility + recipient, renders via the shared layout, sends through Amazon SES
// (SESv2 API, signed with aws4fetch), and records the outcome. Idempotent and safe to
// run concurrently.
//
// Auth: verify_jwt=false; the WEBHOOK_SECRET header is the gate (same pattern as
// discord-campaign-bot). Uses the service-role key to bypass RLS on the worker-only
// notification_deliveries table.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import {
  emailLayout,
  notificationTextToHtml,
  notificationTextToPlain,
} from "./_email-layout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
const AWS_REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
const SES_FROM_EMAIL = Deno.env.get("SES_FROM_EMAIL");
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET");
const APP_URL = Deno.env.get("APP_URL") ?? "https://www.mundamanager.com";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / WEBHOOK_SECRET");
}
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !SES_FROM_EMAIL || !UNSUBSCRIBE_SECRET) {
  throw new Error("Missing AWS SES / UNSUBSCRIBE_SECRET configuration");
}

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const MASTER_PREF_KEY = "all";

// Mirror of the email-eligible subset of utils/notifications/email-config.ts. Kept in
// sync deliberately — see the note in _email-layout.ts about the Deno/Next import split.
const EMAIL_CONFIG: Record<string, { defaultEnabled: boolean; subject: string }> = {
  invite: { defaultEnabled: true, subject: "You have a new invitation on Munda Manager" },
  gang_invite: { defaultEnabled: true, subject: "Someone wants to add your gang to a campaign" },
  friend_request: { defaultEnabled: true, subject: "You have a new friend request on Munda Manager" },
};

function isEmailEnabled(
  type: string,
  prefs: { notification_type: string; enabled: boolean }[],
): boolean {
  const cfg = EMAIL_CONFIG[type];
  if (!cfg) return false;
  const master = prefs.find((p) => p.notification_type === MASTER_PREF_KEY);
  if (master && master.enabled === false) return false;
  const perType = prefs.find((p) => p.notification_type === type);
  return perType ? perType.enabled : cfg.defaultEnabled;
}

// Mirror of signUnsubscribeToken in utils/notifications/unsubscribe-token.ts.
const encoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signUnsubscribeToken(
  payload: { u: string; t: string; e: number },
  secret: string,
): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(sig))}`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const aws = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  service: "ses",
});

async function sendViaSes(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; status: number; error: string }> {
  const endpoint = `https://email.${AWS_REGION}.amazonaws.com/v2/email/outbound-emails`;
  const payload = {
    FromEmailAddress: SES_FROM_EMAIL,
    Destination: { ToAddresses: [input.to] },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: input.html, Charset: "UTF-8" },
          Text: { Data: input.text, Charset: "UTF-8" },
        },
        Headers: [
          { Name: "List-Unsubscribe", Value: `<${input.unsubscribeUrl}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      },
    },
  };

  try {
    const res = await aws.fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: bodyText.slice(0, 500) };
    }
    let messageId: string | undefined;
    try {
      messageId = JSON.parse(bodyText).MessageId;
    } catch {
      // MessageId is best-effort.
    }
    return { ok: true, messageId };
  } catch (err) {
    // Network / signing errors are transient.
    return { ok: false, status: 0, error: String(err).slice(0, 500) };
  }
}

async function markStatus(id: string, fields: Record<string, unknown>) {
  await supabase
    .from("notification_deliveries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// Resolve everything needed to send one delivery, or a reason to skip it.
async function buildEmail(delivery: {
  id: string;
  notification_id: string;
  user_id: string;
}): Promise<
  | { skip: string }
  | { to: string; subject: string; html: string; text: string; unsubscribeUrl: string }
> {
  const { data: notification } = await supabase
    .from("notifications")
    .select("id, type, text, link")
    .eq("id", delivery.notification_id)
    .maybeSingle();

  if (!notification) return { skip: "notification no longer exists" };

  const cfg = EMAIL_CONFIG[notification.type];
  if (!cfg) return { skip: `type '${notification.type}' is not email-eligible` };

  const { data: prefs } = await supabase
    .from("user_notification_preferences")
    .select("notification_type, enabled")
    .eq("user_id", delivery.user_id);

  if (!isEmailEnabled(notification.type, prefs ?? [])) {
    return { skip: "user has email disabled for this category" };
  }

  const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(
    delivery.user_id,
  );
  if (userError || !userResult?.user) return { skip: "user not found" };
  const authUser = userResult.user;
  if (!authUser.email) return { skip: "user has no email address" };
  if (!authUser.email_confirmed_at) return { skip: "user email not confirmed" };

  const token = await signUnsubscribeToken(
    { u: delivery.user_id, t: notification.type, e: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    UNSUBSCRIBE_SECRET,
  );
  const unsubscribeUrl = `${APP_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;

  const { html, text } = emailLayout({
    subject: cfg.subject,
    bodyHtml: notificationTextToHtml(notification.text),
    bodyText: notificationTextToPlain(notification.text),
    ctaUrl: notification.link,
    appUrl: APP_URL,
    preferencesUrl: `${APP_URL}/account`,
    unsubscribeUrl,
  });

  return { to: authUser.email, subject: cfg.subject, html, text, unsubscribeUrl };
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  // Dry run: render due rows read-only (no claim, no send, no status change) so the
  // template + recipient resolution can be inspected safely.
  if (dryRun) {
    const { data: due } = await supabase
      .from("notification_deliveries")
      .select("id, notification_id, user_id")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(5);

    const previews = [];
    for (const d of due ?? []) {
      const built = await buildEmail(d);
      previews.push("skip" in built ? { id: d.id, skipped: built.skip } : {
        id: d.id,
        to: built.to,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
    }
    return Response.json({ dryRun: true, count: previews.length, previews });
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_notification_deliveries",
    { batch_size: BATCH_SIZE },
  );
  if (claimError) {
    console.error("claim error:", claimError);
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of claimed ?? []) {
    try {
      const built = await buildEmail(d);
      if ("skip" in built) {
        await markStatus(d.id, { status: "skipped", last_error: built.skip });
        skipped++;
        continue;
      }

      const result = await sendViaSes({
        to: built.to,
        subject: built.subject,
        html: built.html,
        text: built.text,
        unsubscribeUrl: built.unsubscribeUrl,
      });

      if (result.ok) {
        await markStatus(d.id, {
          status: "sent",
          provider: "ses",
          provider_message_id: result.messageId ?? null,
          sent_at: new Date().toISOString(),
          last_error: null,
        });
        sent++;
      } else {
        // 429 / 5xx / network (status 0) are transient; other 4xx are permanent.
        const transient = result.status === 0 || result.status === 429 || result.status >= 500;
        if (transient && d.attempts < MAX_ATTEMPTS) {
          const backoffMs = Math.pow(2, d.attempts) * 60 * 1000;
          await markStatus(d.id, {
            status: "failed",
            last_error: `SES ${result.status}: ${result.error}`,
            next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
          });
        } else {
          await markStatus(d.id, {
            status: "abandoned",
            last_error: `SES ${result.status}: ${result.error}`,
          });
        }
        failed++;
      }
    } catch (err) {
      console.error("delivery error:", d.id, err);
      await markStatus(d.id, {
        status: d.attempts < MAX_ATTEMPTS ? "failed" : "abandoned",
        last_error: String(err).slice(0, 500),
        next_attempt_at: new Date(Date.now() + Math.pow(2, d.attempts) * 60 * 1000).toISOString(),
      });
      failed++;
    }
  }

  return Response.json({ claimed: claimed?.length ?? 0, sent, skipped, failed });
});
