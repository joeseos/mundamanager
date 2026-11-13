/**
 * Shared query definitions for a fighter's skill sets and skill access, used by
 * the Advancements and Skill Access modals so both read one cache entry.
 * gcTime 0: promotions, fighter edits and skills gained change these, so they are
 * fetched fresh whenever a modal opens.
 */

import { queryOptions } from '@tanstack/react-query';

export interface FighterSkillAccess {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null; // default from fighter type
  override_access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null; // override from archetype
  skill_type_name: string;
}

export interface SkillInSet {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available: boolean;
  usable?: boolean;
  usable_by?: string[] | null;
}

/** Standard and custom skill types (including campaign-shared customs) for the fighter. */
export const fighterSkillTypesQuery = (fighterId: string, editionSlug?: string | null) =>
  queryOptions({
    queryKey: ['skill-types', fighterId, editionSlug ?? null],
    queryFn: async ({ signal }): Promise<Array<{ id: string; name: string; is_custom?: boolean }>> => {
      const params = new URLSearchParams({ fighterId });
      if (editionSlug) params.set('edition_slug', editionSlug);
      const response = await fetch(`/api/skill-types?${params}`, { signal });
      if (!response.ok) throw new Error('Failed to fetch skill types');
      return response.json();
    },
    gcTime: 0,
  });

/**
 * The fighter's skill access, or with `preview` what it would be as another fighter
 * type (with `skillTypeId`, also that set's skills).
 */
export const fighterSkillAccessQuery = (
  fighterId: string,
  preview?: { previewFighterTypeId: string; skillTypeId?: string }
) =>
  queryOptions({
    queryKey: preview ? ['fighter-skill-access', fighterId, preview] : ['fighter-skill-access', fighterId],
    queryFn: async ({ signal }): Promise<{ skill_access?: FighterSkillAccess[]; skills?: SkillInSet[] }> => {
      const response = await fetch(`/api/fighters/skill-access?${new URLSearchParams({ fighterId, ...preview })}`, { signal });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch skill access');
      }
      return response.json();
    },
    gcTime: 0,
  });
