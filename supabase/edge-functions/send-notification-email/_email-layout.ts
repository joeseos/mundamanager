// @ts-nocheck
//
// Single source of styling for application emails sent via SES. This is NOT the
// Supabase Dashboard email templates — those only style Auth emails (verify/reset),
// which are untouched. Email clients strip <head>/external CSS and don't support
// flex/grid, so this uses a table-based layout with inline styles only.
//
// The notification-text renderers below mirror utils/notifications/render.ts (kept in
// sync deliberately): Deno requires explicit .ts extensions on relative imports while
// the Next files are extensionless, so the worker carries its own copy rather than
// importing across the runtime boundary.

const BRAND = {
  name: "Munda Manager",
  headerBg: "#111827",
  headerText: "#ffffff",
  accent: "#4f46e5",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f3f4f6",
  font:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Attribute-safe href: only allow http(s) or site-relative URLs (blocks javascript:,
// data:, etc.), then escape for attribute context. Returns null for anything else so the
// caller can drop the link rather than emit an unsafe href. Defence-in-depth: today
// notification.link is only ever NULL or UUID-built, but this stops a future producer from
// turning free text in `link` into an href-attribute breakout.
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return null;
  return escapeHtml(trimmed);
}

// Mirrors notificationTextToHtml(text, { newlineToBr: true }).
export function notificationTextToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

// Mirrors notificationTextToPlain.
export function notificationTextToPlain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export interface EmailLayoutInput {
  subject: string;
  bodyHtml: string; // already escaped via notificationTextToHtml
  bodyText: string;
  ctaUrl?: string | null;
  ctaLabel?: string;
  appUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
}

export function emailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const {
    subject,
    bodyHtml,
    bodyText,
    ctaUrl,
    ctaLabel = "View in Munda Manager",
    appUrl,
    preferencesUrl,
    unsubscribeUrl,
  } = input;
  const logoUrl = `${appUrl}/images/favicon-192x192.png`;

  const safeCtaUrl = safeUrl(ctaUrl);
  const button = safeCtaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr><td style="border-radius:6px;background:${BRAND.accent};">
           <a href="${safeCtaUrl}" style="display:inline-block;padding:12px 20px;font-family:${BRAND.font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(ctaLabel)}</a>
         </td></tr>
       </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.headerBg};padding:16px 24px;">
          <img src="${logoUrl}" width="32" height="32" alt="${BRAND.name}" style="vertical-align:middle;border-radius:6px;">
          <span style="font-family:${BRAND.font};font-size:18px;font-weight:700;color:${BRAND.headerText};vertical-align:middle;margin-left:10px;">${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:24px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.text};">
          ${bodyHtml}
          ${button}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:12px;line-height:1.6;color:${BRAND.muted};">
          You received this email because of your Munda Manager notification settings.<br />
          <a href="${preferencesUrl}" style="color:${BRAND.muted};text-decoration:underline;">Manage email preferences</a>
          &middot;
          <a href="${unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    bodyText,
    // Same scheme validation as the HTML button; keep the raw (unescaped) URL for text.
    safeCtaUrl ? `\n${ctaLabel}: ${ctaUrl}` : "",
    `\n—\nManage email preferences: ${preferencesUrl}`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}
