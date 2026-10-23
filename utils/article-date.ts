/** "23 October 2026". Fixed locale and time zone so server and client render the same text. */
export function formatArticleDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
