import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { verifyUnsubscribeToken } from "@/utils/unsubscribe-token";
import {
  MASTER_PREF_KEY,
  notificationEmailConfig,
  type NotificationType,
} from "@/utils/notifications";

// One-click unsubscribe target for optional notification emails. No session required —
// the signed token (issued by the email worker) carries the user id + category, so a
// click straight from an email works. Uses the service-role client because there is no
// authenticated user; the user id comes only from the verified token.

async function applyUnsubscribe(
  token: string | null,
): Promise<{ ok: boolean; status: number; message: string }> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    return { ok: false, status: 500, message: "Unsubscribe is not configured." };
  }
  if (!token) {
    return { ok: false, status: 400, message: "Missing unsubscribe token." };
  }

  const payload = await verifyUnsubscribeToken(token, secret);
  if (!payload) {
    return {
      ok: false,
      status: 400,
      message: "This unsubscribe link is invalid or has expired.",
    };
  }

  // Only the master switch or a genuinely email-eligible category may be stored.
  const isMaster = payload.t === MASTER_PREF_KEY;
  const cfg = notificationEmailConfig[payload.t as NotificationType];
  if (!isMaster && (!cfg || !cfg.supportsEmail)) {
    return { ok: false, status: 400, message: "Unknown notification category." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("user_notification_preferences").upsert(
    {
      user_id: payload.u,
      notification_type: payload.t,
      enabled: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,notification_type" },
  );

  if (error) {
    console.error("unsubscribe upsert error:", error);
    return {
      ok: false,
      status: 500,
      message: "Could not update your preferences. Please try again.",
    };
  }

  const label = isMaster ? "all notification emails" : cfg?.label ?? payload.t;
  return {
    ok: true,
    status: 200,
    message: `You've been unsubscribed from ${label}. You can re-enable emails anytime in your account settings.`,
  };
}

// A browser GET (footer link, or a mail client that renders the List-Unsubscribe URL as
// a plain link) is redirected to the public, branded /unsubscribe page, which performs
// the mutation via POST below. The page — not this handler — is the confirmation UI.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(
    new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, request.url),
  );
}

// The actual mutation. Called by the /unsubscribe page's client and by RFC 8058
// one-click unsubscribe (List-Unsubscribe-Post). Returns JSON.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await applyUnsubscribe(token);
  return NextResponse.json({ ok: result.ok, message: result.message }, {
    status: result.status,
  });
}
