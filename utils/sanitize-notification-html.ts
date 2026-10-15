import sanitizeHtml from 'sanitize-html';

// TipTap output for an admin notification: blocks, marks, text colour, alignment,
// and http(s) or site-relative links. Anything else is dropped. The leading-"<"
// check is not a trust boundary — any signed-in user can insert notification text.
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'span',
  ],
  allowedAttributes: {
    a: ['href'],
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
  allowedSchemesByTag: {
    a: ['http', 'https'],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitizeNotificationHtml(html: string): string {
  return sanitizeHtml(html, options);
}
