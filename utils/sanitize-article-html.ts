import sanitizeHtml from 'sanitize-html';
import { notificationHtmlSanitizeOptions } from '@/supabase/edge-functions/send-notification-email/_notification-html-allowlist';

// Article HTML is written by editors, who are not all admins, and rendered on a
// public page. Same allowlist as notifications, plus what the full article editor
// can produce: images, headings 4–6, code, horizontal rules, and the editor's
// classes on links and images (they keep links blue on the dark theme).

const { a: notificationLink } = notificationHtmlSanitizeOptions.transformTags;

const articleHtmlSanitizeOptions: sanitizeHtml.IOptions = {
  ...notificationHtmlSanitizeOptions,
  allowedTags: [
    ...notificationHtmlSanitizeOptions.allowedTags,
    'h4', 'h5', 'h6', 'code', 'pre', 'hr', 'img',
  ],
  allowedAttributes: {
    ...notificationHtmlSanitizeOptions.allowedAttributes,
    a: [...notificationHtmlSanitizeOptions.allowedAttributes.a, 'class'],
    img: ['src', 'alt', 'title', 'width', 'class', 'data-align'],
  },
  transformTags: {
    ...notificationHtmlSanitizeOptions.transformTags,
    a: (tagName, attribs) => {
      const result = notificationLink(tagName, attribs);
      return result.tagName === 'a' && attribs.class
        ? { ...result, attribs: { ...result.attribs, class: attribs.class } }
        : result;
    },
  },
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, articleHtmlSanitizeOptions);
}
