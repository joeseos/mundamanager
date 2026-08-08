import { EDITION_N26 } from '@/types/edition';
import { skillSetRankN23 } from '@/utils/skillSetRankN23';
import { skillSetRankN26 } from '@/utils/skillSetRankN26';

export { skillSetRankN23 } from '@/utils/skillSetRankN23';
export { skillSetRankN26 } from '@/utils/skillSetRankN26';

/**
 * Edition-specific skill-set sort/group ranks. Null / unknown slug uses N23
 * (same fallback as other unset edition catalog data).
 */
export function getSkillSetRank(
  editionSlug?: string | null
): { [key: string]: number } {
  return editionSlug === EDITION_N26 ? skillSetRankN26 : skillSetRankN23;
}
