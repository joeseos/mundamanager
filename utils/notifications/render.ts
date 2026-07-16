import { escapeHtml } from '../html';

// Shared renderer for notification `text`. Both the in-app notification list and the
// email worker derive their output from this single function so the two channels never
// drift. Notification text uses two conventions: **bold** and \n line breaks.
//
// NOTE on line breaks: the in-app list renders with the CSS `whitespace-pre-line`, so
// literal \n already become visual line breaks there — it must NOT get <br>. Email HTML
// has no such CSS, so the email worker passes { newlineToBr: true }.

export function notificationTextToHtml(
  text: string,
  opts?: { newlineToBr?: boolean },
): string {
  const html = escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return opts?.newlineToBr ? html.replace(/\n/g, '<br />') : html;
}

// Plain-text form for the text/plain part of emails: drop the ** markers, keep \n.
export function notificationTextToPlain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}
