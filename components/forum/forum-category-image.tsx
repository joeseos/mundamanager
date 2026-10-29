import { escapeHtml } from '@/utils/html';

interface ForumCategoryImageProps {
  url: string;
  className: string;
}

/**
 * Category image as HTML so a failed load can hide itself with
 * onerror="this.style.display='none'". These pages are server components,
 * and a React onError handler cannot be passed from one.
 * display:contents keeps the img as the flex item.
 * dark:invert flips the SVG colours while the page is in the dark theme.
 */
export function ForumCategoryImage({ url, className }: ForumCategoryImageProps) {
  const html = `<img src="${escapeHtml(url)}" alt="" class="${escapeHtml(className)} dark:invert" onerror="this.style.display='none'">`;
  return <span className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}
