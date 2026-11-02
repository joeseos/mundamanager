'use client';

import { useQuery } from '@tanstack/react-query';

export type AcquisitionType = {
  name: string;
  type_id: string;
  xp_cost: number;
  credit_cost: number;
};

/** One skill from get_available_skills, standard or custom. */
export type AvailableSkill = {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available_acquisition_types: AcquisitionType[];
  available: boolean;
  is_custom: boolean;
  cost: number;
};

/** gcTime 0: costs and `available` change with every skill or Advancement the fighter gains or loses. */
export function useAvailableSkills(fighterId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['fighter-available-skills', fighterId],
    queryFn: async (): Promise<AvailableSkill[]> => {
      const response = await fetch(`/api/fighters/${fighterId}/available-skills`);
      if (!response.ok) throw new Error('Failed to fetch available skills');
      const data: { skills: AvailableSkill[] } = await response.json();
      return data.skills;
    },
    enabled,
    gcTime: 0,
  });
}
