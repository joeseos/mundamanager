import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFighterXp } from '@/app/actions/edit-fighter';
import { addSkillAdvancement, deleteAdvancement } from '@/app/actions/fighter-advancement';
import { queryKeys } from '@/lib/queries/keys';
import { createClient } from '@/utils/supabase/client';
import { Equipment } from '@/types/equipment';

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
    onError: (_err, _variables, context) => {
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

// Fighter Details Mutation with Optimistic Updates (Client-side only, no Server Actions)
export const useUpdateFighterDetails = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      fighter_id: string;
      fighter_name?: string;
      label?: string;
      kills?: number;
      cost_adjustment?: number;
      special_rules?: string[];
      fighter_class?: string;
      fighter_class_id?: string;
      fighter_type?: string;
      fighter_type_id?: string;
      fighter_sub_type?: string | null;
      fighter_sub_type_id?: string | null;
      note?: string;
      note_backstory?: string;
      fighter_gang_legacy_id?: string | null;
    }) => {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      
      // Client-side authentication check
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // OPTIMIZATION: Get current fighter data to compare values for change detection
      const { data: currentFighter, error: currentFighterError } = await supabase
        .from('fighters')
        .select('cost_adjustment, fighter_type_id, fighter_sub_type_id, gang_id')
        .eq('id', params.fighter_id)
        .single();

      if (currentFighterError) {
        throw new Error(`Failed to get current fighter data: ${currentFighterError.message}`);
      }

      // Build update object with only provided fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (params.fighter_name !== undefined) updateData.fighter_name = params.fighter_name.trimEnd();
      if (params.label !== undefined) updateData.label = params.label;
      if (params.kills !== undefined) updateData.kills = params.kills;
      if (params.cost_adjustment !== undefined) updateData.cost_adjustment = params.cost_adjustment;
      if (params.special_rules !== undefined) updateData.special_rules = params.special_rules;
      if (params.fighter_class !== undefined) updateData.fighter_class = params.fighter_class;
      if (params.fighter_class_id !== undefined) updateData.fighter_class_id = params.fighter_class_id;
      if (params.fighter_type !== undefined) updateData.fighter_type = params.fighter_type;
      if (params.fighter_type_id !== undefined) updateData.fighter_type_id = params.fighter_type_id;
      if (params.fighter_sub_type !== undefined) updateData.fighter_sub_type = params.fighter_sub_type;
      if (params.fighter_sub_type_id !== undefined) updateData.fighter_sub_type_id = params.fighter_sub_type_id;
      if (params.note !== undefined) updateData.note = params.note;
      if (params.note_backstory !== undefined) updateData.note_backstory = params.note_backstory;
      if (params.fighter_gang_legacy_id !== undefined) updateData.fighter_gang_legacy_id = params.fighter_gang_legacy_id;

      // Update fighter using direct Supabase client
      const { data: updatedFighter, error: updateError } = await supabase
        .from('fighters')
        .update(updateData)
        .eq('id', params.fighter_id)
        .select('id, fighter_name, label, kills, cost_adjustment')
        .single();

      if (updateError) throw updateError;

      // OPTIMIZATION: Only handle rating updates if cost_adjustment actually changed (value comparison)
      // Handle string/number conversion from database
      const currentCostAdjustment = Number(currentFighter.cost_adjustment) || 0;
      const newCostAdjustment = Number(params.cost_adjustment) || 0;
      const costAdjustmentChanged = params.cost_adjustment !== undefined && 
        newCostAdjustment !== currentCostAdjustment;
      
      if (costAdjustmentChanged) {
        try {
          // Get gang data for rating update (we already have fighter status from currentFighter check)
          const { data: gangData } = await supabase
            .from('gangs')
            .select('rating')
            .eq('id', currentFighter.gang_id)
            .single();

          if (gangData) {
            const delta = newCostAdjustment - currentCostAdjustment;
            
            if (delta !== 0) {
              const newRating = Math.max(0, (gangData.rating || 0) + delta);
              await supabase
                .from('gangs')
                .update({ rating: newRating })
                .eq('id', currentFighter.gang_id);
            }
          }
        } catch (e) {
          console.error('Failed to update rating after cost_adjustment change:', e);
          // Don't throw - this is a non-critical update
        }
      } else if (params.cost_adjustment !== undefined) {
      }

      return {
        success: true,
        data: { 
          fighter: updatedFighter
        },
        // Pass change detection data to onSettled
        changedValues: {
          costAdjustmentChanged,
          fighterTypeChanged: params.fighter_type_id !== undefined && 
            params.fighter_type_id !== currentFighter.fighter_type_id,
          subTypeChanged: params.fighter_sub_type_id !== undefined && 
            params.fighter_sub_type_id !== currentFighter.fighter_sub_type_id
        }
      };
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches - only for basic fighter data
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId), exact: true });
      
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
          ...(variables.fighter_type_id !== undefined && { 
            fighter_type: typeof old.fighter_type === 'object' 
              ? { ...old.fighter_type, fighter_type_id: variables.fighter_type_id }
              : { fighter_type: old.fighter_type || variables.fighter_type || '', fighter_type_id: variables.fighter_type_id }
          }),
          ...(variables.fighter_class !== undefined && { fighter_class: variables.fighter_class }),
          ...(variables.fighter_class_id !== undefined && { fighter_class_id: variables.fighter_class_id }),
          ...(variables.special_rules !== undefined && { special_rules: variables.special_rules }),
          // OPTIMIZED: Simplified sub-type optimistic updates
          ...(variables.fighter_sub_type_id !== undefined && {
            fighter_sub_type: variables.fighter_sub_type_id ? {
              fighter_sub_type: variables.fighter_sub_type || old.fighter_sub_type?.fighter_sub_type || '',
              fighter_sub_type_id: variables.fighter_sub_type_id
            } : null,
            fighter_sub_type_id: variables.fighter_sub_type_id
          }),
          // Handle standalone sub-type name updates (less common)
          ...(variables.fighter_sub_type !== undefined && variables.fighter_sub_type_id === undefined && {
            fighter_sub_type: variables.fighter_sub_type ? {
              ...old.fighter_sub_type,
              fighter_sub_type: variables.fighter_sub_type
            } : null
          }),
          // Add gang legacy optimistic update
          ...(variables.fighter_gang_legacy_id !== undefined && { 
            fighter_gang_legacy_id: variables.fighter_gang_legacy_id,
            fighter_gang_legacy: variables.fighter_gang_legacy_id ? 
              (old.fighter_gang_legacy || { id: variables.fighter_gang_legacy_id }) : null
          })
        };
      });
      
      return { previousFighter, variables };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: (data, _error, _variables) => {
      // OPTIMIZED: Use actual value changes instead of field presence
      const changedValues = data?.changedValues;
      
      // Always invalidate basic fighter data with exact matching to prevent cascading
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.fighters.detail(fighterId), 
        exact: true 
      });
      
      // CRITICAL: Only invalidate total cost if values that actually affect cost changed
      // This prevents the cascade of equipment/skills/effects/vehicles queries
      const needsCostRefetch = changedValues?.costAdjustmentChanged || changedValues?.fighterTypeChanged;
      
      if (needsCostRefetch) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.fighters.totalCost(fighterId),
          exact: true 
        });
      } else {
        // Sub-type only changes don't affect base fighter cost calculation
        // This prevents the cascade of 5+ additional API calls
      }
      
      // CRITICAL: Don't invalidate equipment, skills, effects, or vehicles for basic detail changes
      // These are separate concerns and don't need to refetch when fighter details change
    }
  });
};

// Fighter Skill Addition Mutation
export const useAddFighterSkill = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addSkillAdvancement,
    onMutate: async (variables) => {
      // Cancel queries for skills only - don't touch fighter detail
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      
      // Snapshot previous values
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
      
      // Optimistic update with skill name if provided
      if (variables.skill_name) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (old: any) => {
          if (!old || typeof old !== 'object') return old;
          
          // Add the new skill optimistically
          const updatedSkills = { ...old };
          updatedSkills[variables.skill_name!] = {
            id: `temp-${Date.now()}`, // Temporary ID
            xp_cost: variables.xp_cost,
            credits_increase: variables.credits_increase,
            acquired_at: new Date().toISOString(),
            is_advance: variables.is_advance ?? false,
            fighter_injury_id: null,
            injury_name: null
          };
          
          return updatedSkills;
        });
      }
      
      return { previousSkills };
    },
    onError: (_err, _variables, context) => {
      // Restore previous state on error
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
    },
    onSettled: () => {
      // Only invalidate skills - no need to invalidate entire fighter detail
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
    }
  });
};

// Fighter Skill/Advancement Deletion Mutation
export const useDeleteFighterAdvancement = (fighterId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteAdvancement,
    onMutate: async (variables) => {
      // Only cancel and handle queries relevant to the advancement type
      if (variables.advancement_type === 'skill') {
        await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
        
        // Snapshot previous skills
        const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
        
        // Optimistically remove the skill
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
        
        return { previousSkills, advancementType: 'skill' };
      } else {
        // For non-skill advancements (characteristics, etc.), handle effects
        await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
        
        const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
        
        return { previousEffects, advancementType: 'other' };
      }
    },
    onError: (_err, _variables, context) => {
      // Restore previous states based on advancement type
      if (context?.advancementType === 'skill' && context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      } else if (context?.advancementType === 'other' && context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Only invalidate what's relevant to the advancement type
      if (variables.advancement_type === 'skill') {
        queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      }
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

// Equipment Selling Mutation with Optimistic Updates
export const useSellFighterEquipment = (fighterId: string, gangId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { fighter_equipment_id: string; manual_cost?: number }) => {
      const supabase = createClient();
      
      // Client-side authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Not authenticated');
      }
      
      // Get the equipment data first
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('fighter_equipment')
        .select(`
          id,
          fighter_id,
          vehicle_id,
          equipment_id,
          custom_equipment_id,
          purchase_cost
        `)
        .eq('id', params.fighter_equipment_id)
        .single();

      if (equipmentError || !equipmentData) {
        throw new Error(`Fighter equipment with ID ${params.fighter_equipment_id} not found`);
      }

      // Verify this equipment belongs to the specified fighter
      if (equipmentData.fighter_id !== fighterId) {
        throw new Error('Equipment does not belong to this fighter');
      }

      // Determine sell value (manual or default to purchase cost)
      const sellValue = params.manual_cost ?? equipmentData.purchase_cost ?? 0;

      // Get current gang data and verify permissions
      const { data: currentGang, error: getCurrentError } = await supabase
        .from('gangs')
        .select('credits, rating, user_id')
        .eq('id', gangId)
        .single();
        
      if (getCurrentError || !currentGang) {
        throw new Error('Failed to get current gang data');
      }
      
      // Check if user owns this gang
      if (currentGang.user_id !== user.id) {
        throw new Error('Permission denied: You do not own this gang');
      }

      // Find associated effects before deletion
      const { data: associatedEffects } = await supabase
        .from('fighter_effects')
        .select('id, type_specific_data')
        .eq('fighter_equipment_id', params.fighter_equipment_id);

      // Delete equipment first
      const { error: deleteError } = await supabase
        .from('fighter_equipment')
        .delete()
        .eq('id', params.fighter_equipment_id);

      if (deleteError) {
        throw new Error(`Failed to delete equipment: ${deleteError.message}`);
      }

      // Update gang credits
      const newCredits = currentGang.credits + sellValue;
      const { data: updatedGang, error: updateError } = await supabase
        .from('gangs')
        .update({ credits: newCredits })
        .eq('id', gangId)
        .select('id, credits')
        .single();
        
      if (updateError || !updatedGang) {
        throw new Error(`Failed to update gang credits: ${updateError?.message}`);
      }

      // Calculate rating delta: subtract purchase_cost and associated effects credits
      let ratingDelta = 0;
      if (equipmentData.fighter_id) {
        ratingDelta -= (equipmentData.purchase_cost || 0);
        const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => 
          s + (eff.type_specific_data?.credits_increase || 0), 0);
        ratingDelta -= effectsCredits;
      }

      // Update gang rating if needed
      if (ratingDelta !== 0) {
        const newRating = Math.max(0, currentGang.rating + ratingDelta);
        await supabase
          .from('gangs')
          .update({ rating: newRating })
          .eq('id', gangId);
      }

      return {
        gang: {
          id: updatedGang.id,
          credits: updatedGang.credits
        },
        equipment_sold: {
          id: equipmentData.id,
          fighter_id: equipmentData.fighter_id,
          vehicle_id: equipmentData.vehicle_id,
          equipment_id: equipmentData.equipment_id,
          custom_equipment_id: equipmentData.custom_equipment_id,
          sell_value: sellValue
        },
        rating_delta: ratingDelta
      };
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (prevents race conditions)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.detail(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      
      // Snapshot previous values for rollback
      const previousEquipment = queryClient.getQueryData<Equipment[]>(queryKeys.fighters.equipment(fighterId));
      const previousTotalCost = queryClient.getQueryData<number>(queryKeys.fighters.totalCost(fighterId));
      const previousGang = queryClient.getQueryData(queryKeys.gangs.detail(gangId));
      const previousGangCredits = queryClient.getQueryData<number>(queryKeys.gangs.credits(gangId));
      
      // Find the equipment being sold
      const equipmentToSell = previousEquipment?.find(
        item => item.fighter_equipment_id === variables.fighter_equipment_id
      );
      
      if (equipmentToSell && previousEquipment) {
        // Calculate sell value
        const sellValue = variables.manual_cost ?? equipmentToSell.purchase_cost ?? 0;
        
        // Optimistically remove equipment from equipment list
        const updatedEquipment = previousEquipment.filter(
          item => item.fighter_equipment_id !== variables.fighter_equipment_id
        );
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), updatedEquipment);
        
        // Optimistically update fighter's total cost (decrease by equipment's purchase cost)
        if (previousTotalCost !== undefined) {
          const equipmentCost = equipmentToSell.purchase_cost ?? 0;
          const newTotalCost = previousTotalCost - equipmentCost;
          queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), newTotalCost);
        }
        
        // Optimistically update gang credits in both caches
        queryClient.setQueryData(queryKeys.gangs.detail(gangId), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            credits: (old.credits || 0) + sellValue
          };
        });
        
        // Also update the specific credits cache used by useGetGangCredits
        const currentCredits = queryClient.getQueryData<number>(queryKeys.gangs.credits(gangId)) || 0;
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), currentCredits + sellValue);
      }
      
      return { 
        previousEquipment, 
        previousTotalCost,
        previousGang, 
        previousGangCredits,
        equipmentToSell
      };
    },
    onError: (error, variables, context) => {
      // Comprehensive rollback of all optimistic updates on error
      console.error('Equipment sale failed, rolling back optimistic updates:', error);
      
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }
      if (context?.previousGang) {
        queryClient.setQueryData(queryKeys.gangs.detail(gangId), context.previousGang);
      }
      if (context?.previousGangCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousGangCredits);
      }
    },
    onSuccess: (result) => {
      // Server confirmed deletion - now safe to invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // Update both gang credits caches with server-confirmed value
      queryClient.setQueryData(queryKeys.gangs.detail(gangId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          credits: result.gang.credits
        };
      });
      
      // CRITICAL: Also update the specific credits cache used by useGetGangCredits
      queryClient.setQueryData(queryKeys.gangs.credits(gangId), result.gang.credits);
    }
  });
};

// Equipment Move to Stash Mutation with Optimistic Updates
export const useMoveEquipmentToStash = (fighterId: string, gangId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { fighter_equipment_id: string }) => {
      // Import the action dynamically to avoid circular dependencies
      const { moveEquipmentToStash } = await import('@/app/actions/move-to-stash');
      return moveEquipmentToStash(params);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (prevents race conditions)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.detail(gangId) });
      
      // Snapshot previous values for rollback
      const previousEquipment = queryClient.getQueryData<Equipment[]>(queryKeys.fighters.equipment(fighterId));
      const previousTotalCost = queryClient.getQueryData<number>(queryKeys.fighters.totalCost(fighterId));
      const previousGang = queryClient.getQueryData(queryKeys.gangs.detail(gangId));
      
      // Find the equipment being moved to stash
      const equipmentToMove = previousEquipment?.find(
        item => item.fighter_equipment_id === variables.fighter_equipment_id
      );
      
      if (equipmentToMove && previousEquipment) {
        // Optimistically remove equipment from equipment list
        const updatedEquipment = previousEquipment.filter(
          item => item.fighter_equipment_id !== variables.fighter_equipment_id
        );
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), updatedEquipment);
        
        // Optimistically update fighter's total cost (decrease by equipment's purchase cost)
        if (previousTotalCost !== undefined) {
          const equipmentCost = equipmentToMove.purchase_cost ?? 0;
          const newTotalCost = previousTotalCost - equipmentCost;
          queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), newTotalCost);
        }
        
        // Note: We don't optimistically update gang stash here since that would require 
        // knowing the current stash state. The server response will trigger cache invalidation.
      }
      
      return { 
        previousEquipment, 
        previousTotalCost,
        previousGang,
        equipmentToMove
      };
    },
    onError: (error, variables, context) => {
      // Comprehensive rollback of all optimistic updates on error
      console.error('Move to stash failed, rolling back optimistic updates:', error);
      
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }
      if (context?.previousGang) {
        queryClient.setQueryData(queryKeys.gangs.detail(gangId), context.previousGang);
      }
    },
    onSuccess: (result) => {
      // Server confirmed move - now safe to invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // Invalidate gang stash to show the newly added equipment
      queryClient.invalidateQueries({ queryKey: ['gang-stash', gangId] });
      
      // Also invalidate gang detail to refresh stash display
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.detail(gangId) });
    }
  });
};

// Equipment Delete Mutation with Optimistic Updates
export const useDeleteFighterEquipment = (fighterId: string, gangId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { fighter_equipment_id: string; equipment_id: string }) => {
      // Import the action dynamically to avoid circular dependencies
      const { deleteEquipmentFromFighter } = await import('@/app/actions/equipment');
      return deleteEquipmentFromFighter({
        fighter_equipment_id: params.fighter_equipment_id,
        gang_id: gangId,
        fighter_id: fighterId
      });
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (prevents race conditions)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.detail(gangId) });
      
      // Snapshot previous values for rollback
      const previousEquipment = queryClient.getQueryData<Equipment[]>(queryKeys.fighters.equipment(fighterId));
      const previousTotalCost = queryClient.getQueryData<number>(queryKeys.fighters.totalCost(fighterId));
      const previousGang = queryClient.getQueryData(queryKeys.gangs.detail(gangId));
      
      // Find the equipment being deleted
      const equipmentToDelete = previousEquipment?.find(
        item => item.fighter_equipment_id === variables.fighter_equipment_id
      );
      
      if (equipmentToDelete && previousEquipment) {
        // Optimistically remove equipment from equipment list
        const updatedEquipment = previousEquipment.filter(
          item => item.fighter_equipment_id !== variables.fighter_equipment_id
        );
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), updatedEquipment);
        
        // Optimistically update fighter's total cost (decrease by equipment's purchase cost)
        if (previousTotalCost !== undefined) {
          const equipmentCost = equipmentToDelete.purchase_cost ?? 0;
          const newTotalCost = previousTotalCost - equipmentCost;
          queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), newTotalCost);
        }
      }
      
      return { 
        previousEquipment, 
        previousTotalCost,
        previousGang,
        equipmentToDelete
      };
    },
    onError: (error, variables, context) => {
      // Comprehensive rollback of all optimistic updates on error
      console.error('Equipment delete failed, rolling back optimistic updates:', error);
      
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }
      if (context?.previousGang) {
        queryClient.setQueryData(queryKeys.gangs.detail(gangId), context.previousGang);
      }
    },
    onSuccess: (result) => {
      // Server confirmed deletion - now safe to invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // If the server returned an updated fighter total cost, use it
      if (result.success && result.data?.updatedFighterTotalCost !== null) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), result.data.updatedFighterTotalCost);
      }
    }
  });
};

// Fighter Stats Update Mutation
export const useUpdateFighterStats = (fighterId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fighter_id, stats }: { fighter_id: string; stats: Record<string, number> }) => {
      const response = await fetch('/api/fighters/effects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fighter_id,
          stats
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save stat changes');
      }

      return response.json();
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches for fighter effects
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      
      // Snapshot the previous effects
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      
      // Optimistically update the user effects
      queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
        if (!old) return old;
        
        // Create new user effects based on the stats changes
        const newUserEffects = Object.entries(variables.stats).map(([statName, value]) => ({
          id: `temp-${statName}-${Date.now()}`, // Temporary ID
          effect_name: 'User Adjustment',
          effect_type: 'user',
          fighter_effect_modifiers: [{
            stat_name: statName,
            numeric_value: value
          }]
        }));
        
        return {
          ...old,
          user: newUserEffects
        };
      });
      
      return { previousEffects };
    },
    onError: (_error, _variables, context) => {
      // Rollback optimistic update
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
    },
    onSettled: () => {
      // Invalidate effects to get fresh data from server
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
    }
  });
};