import sanitizeHtml from 'sanitize-html';
import { notificationHtmlSanitizeOptions } from '@/supabase/edge-functions/send-notification-email/_notification-html-allowlist';
import { isUuid } from '@/utils/uuid';

// TipTap output for an admin notification: blocks, marks, text colour, alignment,
// and https or site-relative links. The allowlist lives next to the email worker
// so Deno and Next share one copy. Callers still sanitize on render because a
// signed-in user can insert notification text.

export function sanitizeNotificationHtml(html: string): string {
  return sanitizeHtml(html, notificationHtmlSanitizeOptions);
}

// Article and forum post HTML, rendered on public pages. Forum posts can be
// written by any signed-in user. Same allowlist as notifications, plus what the
// full editor can produce: images, headings 4–6, code, horizontal rules, and
// only the editor's own classes on links and images (they keep links blue on the
// dark theme), so a post can't restyle the page with other classes. @mentions keep
// their user id, and their link is rebuilt from it.

const { a: notificationLink } = notificationHtmlSanitizeOptions.transformTags;

const articleHtmlSanitizeOptions: sanitizeHtml.IOptions = {
  ...notificationHtmlSanitizeOptions,
  allowedTags: [
    ...notificationHtmlSanitizeOptions.allowedTags,
    'h4', 'h5', 'h6', 'code', 'pre', 'hr', 'img',
  ],
  allowedAttributes: {
    ...notificationHtmlSanitizeOptions.allowedAttributes,
    a: [...notificationHtmlSanitizeOptions.allowedAttributes.a, 'class', 'data-type', 'data-id', 'data-label'],
    img: ['src', 'alt', 'title', 'width', 'class', 'data-align'],
  },
  // The classes RichTextEditor puts on links and images
  allowedClasses: {
    a: ['text-blue-600', 'underline', 'cursor-pointer'],
    img: ['max-w-full', 'h-auto', 'rounded-md', 'my-2'],
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !isExternalImage(frame.attribs.src),
  transformTags: {
    ...notificationHtmlSanitizeOptions.transformTags,
    a: (tagName, attribs) => {
      if (attribs['data-type'] === 'mention' && isUuid(attribs['data-id'])) {
        const id = attribs['data-id'].toLowerCase();
        const { 'data-label': label = '' } = attribs;
        return {
          tagName,
          attribs: { href: `/user/${id}`, class: 'text-blue-600', 'data-type': 'mention', 'data-id': id, 'data-label': label },
        };
      }
      const result = notificationLink(tagName, attribs);
      return result.tagName === 'a' && attribs.class
        ? { ...result, attribs: { ...result.attribs, class: attribs.class } }
        : result;
    },
  },
};

// Images load by themselves when the page shows, with the reader's cookies on our
// own site, so a post's image could make readers call our routes. Only https
// images from other sites are kept (uploads are on Supabase storage).
function isExternalImage(src: string | undefined): boolean {
  try {
    const url = new URL(src ?? '');
    return url.protocol === 'https:' && !/(^|\.)mundamanager\.com\.?$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, articleHtmlSanitizeOptions);
}
