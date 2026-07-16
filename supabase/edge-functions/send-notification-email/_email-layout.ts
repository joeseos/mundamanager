// @ts-nocheck
//
// Single source of styling for application emails sent via SES. This is NOT the
// Supabase Dashboard email templates — those style the Auth emails (verify/reset). The
// palette/structure below intentionally MIRRORS that Auth template (dark card, white
// header wordmark, white button, community footer) so application emails look the same.
// Email clients strip <head>/external CSS and don't support flex/grid, so this uses a
// table-based layout with inline styles only.
//
// The notification-text renderers below mirror utils/notifications/render.ts (kept in
// sync deliberately): Deno requires explicit .ts extensions on relative imports while
// the Next files are extensionless, so the worker carries its own copy rather than
// importing across the runtime boundary.

const BRAND = {
  name: "Munda Manager",
  bg: "#0a0a0a", // page background
  card: "#141414", // email card
  border: "#262626",
  heading: "#ffffff",
  body: "#a1a1a1", // body copy
  footer: "#525252", // footer copy
  link: "#a1a1a1", // footer links
  buttonBg: "#ffffff",
  buttonText: "#0a0a0a",
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
    preferencesUrl,
    unsubscribeUrl,
  } = input;

  const safeCtaUrl = safeUrl(ctaUrl);
  const button = safeCtaUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
                <tr>
                  <td align="center" bgcolor="${BRAND.buttonBg}" style="border-radius:6px;">
                    <a href="${safeCtaUrl}" target="_blank" style="background-color:${BRAND.buttonBg};border:1px solid ${BRAND.buttonBg};border-radius:6px;color:${BRAND.buttonText};display:inline-block;font-size:14px;font-weight:600;line-height:1;padding:14px 28px;text-decoration:none;font-family:sans-serif;">${escapeHtml(ctaLabel)}</a>
                  </td>
                </tr>
              </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:${BRAND.font};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background-color:${BRAND.card};border-radius:12px;border:1px solid ${BRAND.border};">

          <tr>
            <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid ${BRAND.border};">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:${BRAND.heading};letter-spacing:-0.5px;">${BRAND.name}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:${BRAND.heading};">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.body};">${bodyHtml}</p>
              ${button}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;border-top:1px solid ${BRAND.border};text-align:center;">
              <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:${BRAND.footer};">
                You received this email because of your Munda Manager notification settings.<br>
                <a href="${preferencesUrl}" style="color:${BRAND.link};text-decoration:underline;">Manage email preferences</a>
                &middot;
                <a href="${unsubscribeUrl}" style="color:${BRAND.link};text-decoration:underline;">Unsubscribe</a>
              </p>
              <p style="margin:0;font-size:12px;color:${BRAND.footer};">© Munda Manager · Built by the community</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
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
