export const FIGHTER_SKILL_ACCESS_QUERY_KEY = 'fighter-skill-access' as const;

export type FighterSkillAccessRow = {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null;
  override_access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null;
  skill_type_name: string;
};

export type FighterSkillAccessResponse = {
  skill_access: FighterSkillAccessRow[];
};

export function fighterSkillAccessQueryKey(fighterId: string) {
  return [FIGHTER_SKILL_ACCESS_QUERY_KEY, fighterId] as const;
}

export class FighterSkillAccessHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FighterSkillAccessHttpError';
    this.status = status;
  }
}

export async function fetchFighterSkillAccess(
  fighterId: string
): Promise<FighterSkillAccessResponse> {
  const response = await fetch(
    `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}`
  );
  if (!response.ok) {
    let message = 'Failed to fetch skill access';
    try {
      const errorData = await response.json();
      if (typeof errorData?.error === 'string' && errorData.error) {
        message = errorData.error;
      }
    } catch {
      // Keep the default message when the body is not JSON.
    }
    throw new FighterSkillAccessHttpError(message, response.status);
  }
  return response.json();
}

/** Shared with Customise Skill Set Access so prefetch, the Advancements modal, and that editor hit one cache. */
export function fighterSkillAccessQueryOptions(fighterId: string) {
  return {
    queryKey: fighterSkillAccessQueryKey(fighterId),
    queryFn: () => fetchFighterSkillAccess(fighterId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: (failureCount: number, error: Error) => {
      if (error instanceof FighterSkillAccessHttpError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 3;
    },
  };
}
