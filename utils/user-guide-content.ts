import { decodeHtmlEntities } from '@/utils/htmlCleanUp';

/**
 * Turns stored user guide HTML (TipTap output) into renderable HTML with a
 * stable, unique `id` on every h1–h3, plus the flat heading list used to
 * build the table of contents.
 *
 * Pure string processing so it runs on the server and the client alike and
 * needs no DOM.
 */

export type UserGuideHeadingLevel = 1 | 2 | 3;

export interface UserGuideHeading {
  id: string;
  text: string;
  level: UserGuideHeadingLevel;
}

export interface PreparedUserGuide {
  html: string;
  headings: UserGuideHeading[];
}

const HEADING_RE = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
const ID_ATTR_RE = /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const TAG_RE = /<[^>]*>/g;
/** Anchor injected by a previous run (defensive, in case prepared HTML is re-prepared). */
const HEADING_ANCHOR_RE = /<a\b[^>]*\bclass\s*=\s*(?:"[^"]*\bheading-anchor\b[^"]*"|'[^']*\bheading-anchor\b[^']*')[^>]*>[\s\S]*?<\/a>/gi;

/** Class on the hover-revealed "#" link appended to each heading; styled by the renderer. */
export const HEADING_ANCHOR_CLASS = 'heading-anchor';

/** Lowercase, ASCII-safe slug. Empty input falls back to "section". */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

/** Plain text of a heading's inner HTML (tags stripped, entities decoded). */
export function headingTextFromHtml(innerHtml: string): string {
  return decodeHtmlEntities(innerHtml.replace(TAG_RE, '')).replace(/\s+/g, ' ').trim();
}

export function prepareUserGuideContent(html: string): PreparedUserGuide {
  const headings: UserGuideHeading[] = [];
  const seen = new Map<string, number>();

  const preparedHtml = (html || '').replace(
    HEADING_RE,
    (_match, levelStr: string, attrs: string, rawInner: string) => {
      const level = Number(levelStr) as UserGuideHeadingLevel;
      const inner = rawInner.replace(HEADING_ANCHOR_RE, '');
      const text = headingTextFromHtml(inner);
      const base = slugifyHeading(text);

      // Dedupe: first occurrence keeps the base slug, later ones get -2, -3, …
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const id = count === 1 ? base : `${base}-${count}`;

      // Empty headings still get an id (so the HTML stays consistent) but
      // have nothing to show in the table of contents.
      if (text) {
        headings.push({ id, text, level });
      }

      // Any id already on the tag is replaced so IDs are always derived from
      // the current content.
      const cleanedAttrs = attrs.replace(ID_ATTR_RE, '');
      // Hover-revealed permalink ("#") so readers can grab a link to the section.
      const anchor = text
        ? `<a href="#${id}" class="${HEADING_ANCHOR_CLASS}" aria-label="Link to this section">#</a>`
        : '';
      return `<h${level}${cleanedAttrs} id="${id}">${inner}${anchor}</h${level}>`;
    }
  );

  return { html: preparedHtml, headings };
}
