// Helpers for working with HTML content in rich text fields

/**
 * Returns true if the given HTML string is effectively "empty":
 * - No textual content once tags/whitespace are stripped
 * - And no <img> tags with a src attribute
 */
export const isHtmlEffectivelyEmpty = (htmlContent: string) => {
  if (!htmlContent) return true;

  // If there's at least one image, treat content as non-empty
  const hasImage = /<img\b[^>]*src=["']?[^"'>]+["']?[^>]*>/i.test(htmlContent);
  if (hasImage) return false;

  // Remove HTML tags and check if there's any meaningful text
  const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
  return textContent.length === 0;
};

function numericEntityToChar(full: string, code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return full;
  }
}

function decodeHtmlEntitiesServerFallback(str: string): string {
  let out = str.replace(/&nbsp;/gi, " ");
  for (let i = 0; i < 8; i += 1) {
    const next = out
      .replace(/&#(\d+);/g, (full, n) => numericEntityToChar(full, Number(n)))
      .replace(/&#x([\da-fA-F]+);/gi, (full, h) =>
        numericEntityToChar(full, parseInt(h, 16)),
      )
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/&hellip;/gi, "…")
      .replace(/&rsquo;/gi, "’")
      .replace(/&lsquo;/gi, "‘")
      .replace(/&rdquo;/gi, "”")
      .replace(/&ldquo;/gi, "“")
      .replace(/&gt;/gi, ">")
      .replace(/&lt;/gi, "<")
      .replace(/&amp;/gi, "&");
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Decodes HTML entities to plain text. Uses the browser when available;
 * otherwise a small decoder (sufficient for SSR and typical rich-text output).
 */
export function decodeHtmlEntities(str: string): string {
  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.innerHTML = str;
    return textArea.value;
  }
  return decodeHtmlEntitiesServerFallback(str);
}

