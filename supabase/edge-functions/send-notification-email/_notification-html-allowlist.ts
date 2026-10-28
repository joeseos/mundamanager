// Shared by the Next sanitizer and the SES worker. This file imports nothing:
// Deno loads it with a .ts extension, and Next loads it through @/.

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR = /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*(?:,|\/)\s*[\d.]+%?)?\s*\)$/i;
const TEXT_ALIGN = /^(?:left|right|center|justify)$/i;

export function authorColor(value: string): string | null {
  const trimmed = value.trim().replace(/!important$/i, "").trim();
  if (HEX_COLOR.test(trimmed)) return trimmed;
  const match = trimmed.match(RGB_COLOR);
  if (!match) return null;
  const channels = [match[1], match[2], match[3]].map((part) => Number(part));
  if (channels.some((channel) => channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function filterAuthorStyle(style: string | undefined): string {
  if (!style) return "";
  const kept: string[] = [];
  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (prop === "color") {
      const hex = authorColor(value);
      if (hex) kept.push(`color:${hex}`);
    } else if (prop === "text-align" && TEXT_ALIGN.test(value)) {
      kept.push(`text-align:${value.toLowerCase()}`);
    }
  }
  return kept.join(";");
}

function withAuthorStyle(tagName: string, attribs: Record<string, string>) {
  const style = filterAuthorStyle(attribs.style);
  const next = { ...attribs };
  if (style) next.style = style;
  else delete next.style;
  return { tagName, attribs: next };
}

export function isKeptHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/")) return true;
  return /^https:\/\//i.test(trimmed);
}

export const notificationHtmlSanitizeOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
  },
  // Style strings are already reduced in transformTags. Skipping PostCSS keeps
  // those colours when this runs in the browser.
  parseStyleAttributes: false,
  allowedSchemes: ["https"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard" as const,
  transformTags: {
    span: withAuthorStyle,
    p: withAuthorStyle,
    h1: withAuthorStyle,
    h2: withAuthorStyle,
    h3: withAuthorStyle,
    // http, javascript:, and other non-https links keep their text and lose the href.
    a: (tagName: string, attribs: Record<string, string>) => {
      const href = (attribs.href ?? "").trim();
      if (!isKeptHref(href)) {
        return { tagName: "span", attribs: {} };
      }
      const next: Record<string, string> = { href };
      if (/^https:\/\//i.test(href)) {
        next.target = "_blank";
        next.rel = "noopener noreferrer nofollow";
      }
      return { tagName, attribs: next };
    },
  },
};
