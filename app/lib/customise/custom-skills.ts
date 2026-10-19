import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CUSTOM_ROW } from './custom-row';

export interface CustomSkill {
  id: string;
  user_id: string | null;
  skill_name: string | null;
  skill_type_id?: string | null;
  custom_skill_type_id?: string | null;
  skill_type_name?: string;
  description?: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Derived from skill_types / custom_skill_types edition. */
  edition_slug?: string | null;
}

export async function getUserCustomSkills(userId: string): Promise<CustomSkill[]> {
  return unstable_cache(
    async () => {
      const customSkills = await getAppDb().query.customSkills.findMany({
        ...CUSTOM_ROW,
        where: (skill, { eq }) => eq(skill.user_id, userId),
        orderBy: (skill, { asc }) => asc(skill.skill_name),
        with: {
          skill_type: { columns: { name: true }, with: { editions: { columns: { slug: true } } } },
          custom_skill_type: { columns: { name: true }, with: { editions: { columns: { slug: true } } } },
        },
      });

      return customSkills.map(({ skill_type, custom_skill_type, ...skill }) => ({
        ...skill,
        skill_type_name: skill_type?.name || custom_skill_type?.name || 'Unknown',
        edition_slug: custom_skill_type?.editions?.slug ?? skill_type?.editions?.slug ?? null,
      }));
    },
    [`user-custom-skills-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
