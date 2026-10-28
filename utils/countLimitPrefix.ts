/** The rulebook's count in front of a name: "0-1 Stimmer", "2+ Forge-Born", or "1-3". */
export function countLimitPrefix({ min_count, max_count }: { min_count?: number | null; max_count?: number | null }): string {
  const min = min_count && min_count > 0 ? min_count : null;
  const max = max_count && max_count > 0 ? max_count : null;
  if (min && max) return `${min}-${max} `;
  if (min) return `${min}+ `;
  if (max) return `0-${max} `;
  return '';
}

/**
 * Live count against a fighter-type cap ("3/2"), a minimum-only rulebook prefix ("2+"),
 * or an em dash when the type has neither. A maximum wins when both are set: the dropdown
 * compares how many are already in the gang. `over` is true when that count reaches or exceeds the cap.
 */
export function fighterCountLimitDisplay({
  min_count,
  max_count,
  current,
}: {
  min_count?: number | null;
  max_count?: number | null;
  current: number;
}): { text: string; over: boolean } {
  const min = min_count && min_count > 0 ? min_count : null;
  const max = max_count && max_count > 0 ? max_count : null;
  if (max) return { text: `${current}/${max}`, over: current >= max };
  if (min) return { text: `${min}+`, over: false };
  return { text: '\u2014', over: false };
}
