import sanitizeHtml from 'sanitize-html';
import { notificationHtmlSanitizeOptions } from '@/supabase/edge-functions/send-notification-email/_notification-html-allowlist';

// TipTap output for an admin notification: blocks, marks, text colour, alignment,
// and https or site-relative links. The allowlist lives next to the email worker
// so Deno and Next share one copy. Callers still sanitize on render because a
// signed-in user can insert notification text.

export function sanitizeNotificationHtml(html: string): string {
  return sanitizeHtml(html, notificationHtmlSanitizeOptions);
}
