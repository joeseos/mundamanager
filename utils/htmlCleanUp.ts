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


