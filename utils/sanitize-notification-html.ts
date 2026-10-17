import sanitizeHtml from 'sanitize-html';

// TipTap output for an admin notification: blocks, marks, text colour, alignment,
// and http(s) or site-relative links. Anything else is dropped. Callers still
// sanitize on render because a signed-in user can insert notification text.
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i],
      'text-align': [/^(?:left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Absolute links leave the app. Relative links stay in this tab.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const next: Record<string, string> = { href };
      if (/^https?:\/\//i.test(href)) {
        next.target = '_blank';
        next.rel = 'noopener noreferrer nofollow';
      }
      return { tagName, attribs: next };
    },
  },
};

export function sanitizeNotificationHtml(html: string): string {
  return sanitizeHtml(html, options);
}
