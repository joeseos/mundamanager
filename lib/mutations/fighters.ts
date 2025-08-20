import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFighterXp, updateFighterDetails } from '@/app/actions/edit-fighter';
import { addSkillAdvancement, deleteAdvancement } from '@/app/actions/fighter-advancement';
import { queryKeys } from '@/lib/queries/keys';

// Fighter XP Mutation with Optimistic Updates
export const useUpdateFighterXp = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateFighterXp,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot the previous value
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Optimistically update the fighter XP
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          xp: (old.xp || 0) + variables.xp_to_add,
          total_xp: (old.total_xp || 0) + variables.xp_to_add
        };
      });
      
      // Return a context object with the snapshotted value
      return { previousFighter };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server state
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    }
  });
};

// Fighter Details Mutation with Optimistic Updates
export const useUpdateFighterDetails = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateFighterDetails,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot the previous value
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Optimistically update the fighter details
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          // Only update fields that are provided in variables
          ...(variables.fighter_name !== undefined && { fighter_name: variables.fighter_name }),
          ...(variables.label !== undefined && { label: variables.label }),
          ...(variables.kills !== undefined && { kills: variables.kills }),
          ...(variables.cost_adjustment !== undefined && { cost_adjustment: variables.cost_adjustment }),
          ...(variables.note !== undefined && { note: variables.note }),
          ...(variables.note_backstory !== undefined && { note_backstory: variables.note_backstory }),
          ...(variables.fighter_type !== undefined && { 
            fighter_type: typeof old.fighter_type === 'object' 
              ? { ...old.fighter_type, fighter_type: variables.fighter_type }
              : variables.fighter_type 
          }),
          ...(variables.fighter_class !== undefined && { fighter_class: variables.fighter_class }),
          ...(variables.special_rules !== undefined && { special_rules: variables.special_rules })
        };
      });
      
      return { previousFighter };
    },
    onError: (err, variables, context) => {
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Invalidate and refetch fighter data and potentially gang data if type/cost changed
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
    }
  });
};

// Fighter Skill Addition Mutation
export const useAddFighterSkill = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addSkillAdvancement,
    onMutate: async (variables) => {
      // Cancel queries for skills and fighter details
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot previous values
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Note: We can't easily do optimistic update for skills since we don't know the skill name
      // without making an additional API call. We'll let the onSettled handle the refresh.
      // This still provides fast feedback through the loading state.
      
      return { previousSkills, previousFighter };
    },
    onError: (err, variables, context) => {
      // Restore previous state on error
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Refetch skills and fighter data
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    }
  });
};

// Fighter Skill/Advancement Deletion Mutation
export const useDeleteFighterAdvancement = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteAdvancement,
    onMutate: async (variables) => {
      // Cancel queries
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot previous values
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Optimistically remove the item from skills if it's a skill deletion
      if (variables.advancement_type === 'skill') {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (old: any) => {
          if (!old || typeof old !== 'object') return old;
          
          // Remove the skill with matching ID
          const updatedSkills = { ...old };
          Object.keys(updatedSkills).forEach(skillName => {
            if (updatedSkills[skillName]?.id === variables.advancement_id) {
              delete updatedSkills[skillName];
            }
          });
          return updatedSkills;
        });
      }
      
      return { previousSkills, previousEffects, previousFighter };
    },
    onError: (err, variables, context) => {
      // Restore previous states on error
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Refetch all relevant data
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    }
  });
};

// Fighter Status Mutation (kill, retire, etc.)
export const useUpdateFighterStatus = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { fighter_id: string; action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'capture' | 'delete'; sell_value?: number }) => {
      // Import the action dynamically to avoid circular dependencies
      const { editFighterStatus } = await import('@/app/actions/edit-fighter');
      return editFighterStatus(params);
    },
    onMutate: async (variables) => {
      // Cancel queries
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot previous value
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Optimistically update fighter status based on action
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => {
        if (!old) return old;
        
        const updated = { ...old };
        
        switch (variables.action) {
          case 'kill':
            updated.killed = !old.killed;
            break;
          case 'retire':
            updated.retired = !old.retired;
            break;
          case 'sell':
            updated.enslaved = true;
            break;
          case 'rescue':
            updated.enslaved = false;
            break;
          case 'starve':
            updated.starved = !old.starved;
            break;
          case 'recover':
            updated.recovery = !old.recovery;
            break;
          case 'capture':
            updated.captured = !old.captured;
            break;
        }
        
        return updated;
      });
      
      return { previousFighter };
    },
    onError: (err, variables, context) => {
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Refetch fighter and gang data (status changes can affect gang)
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      // Note: We'd need gangId here to invalidate gang data, can be added as parameter
    }
  });
};