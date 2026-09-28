/** The rulebook's count in front of a name: "0-1 Stimmer", "2+ Forge-Born", or "1-3". */
export function countLimitPrefix({ min_count, max_count }: { min_count?: number | null; max_count?: number | null }): string {
  const min = min_count && min_count > 0 ? min_count : null;
  const max = max_count && max_count > 0 ? max_count : null;
  if (min && max) return `${min}-${max} `;
  if (min) return `${min}+ `;
  if (max) return `0-${max} `;
  return '';
}
