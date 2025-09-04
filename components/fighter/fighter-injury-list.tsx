import React, { useState, useCallback } from 'react';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  addFighterInjury, 
  deleteFighterInjury
} from '@/app/lib/server-functions/fighter-injuries';
import { queryKeys } from '@/app/lib/queries/keys';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66, resolveInjuryFromUtil, resolveInjuryFromUtilCrew } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  onInjuryUpdate?: (updatedInjuries: FighterEffect[], recoveryStatus?: boolean) => void;
  fighterId: string;
  gangId: string;
  fighterRecovery?: boolean;
  userPermissions: UserPermissions;
  fighter_class?: string;
}

export function InjuriesList({ 
  injuries = [],
  onInjuryUpdate,
  fighterId,
  gangId,
  fighterRecovery = false,
  userPermissions,
  fighter_class
}: InjuriesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isCapturedModalOpen, setIsCapturedModalOpen] = useState(false);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for available injuries using the API route (includes complete modifier data)
  const { data: availableInjuries = [], isLoading: isLoadingInjuries } = useQuery({
    queryKey: ['injuries', 'available'],
    queryFn: async () => {
      const response = await fetch('/api/fighters/injuries');
      if (!response.ok) {
        throw new Error('Failed to fetch injuries');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: isAddModalOpen, // Only fetch when modal is open
  });

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedInjuryId('');
    setSelectedInjury(null);
  }, []);

  // Mutation for adding injuries
  const addInjuryMutation = useMutation({
    mutationFn: addFighterInjury,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot the previous values
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Find the injury being added for optimistic update
      const injuryToAdd = availableInjuries.find(inj => inj.id === variables.injury_type_id);
      
      if (injuryToAdd) {
        // Optimistically add the injury (with temporary ID)
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          const optimisticInjury = {
            ...injuryToAdd,
            id: `temp-injury-${Date.now()}`, // Temporary ID for optimistic update
            created_at: new Date().toISOString(),
          };
          
          return {
            ...old,
            injuries: [...(old.injuries || []), optimisticInjury]
          };
        });
        
        // Check if this injury grants any skills and optimistically add them
        // First check if injury has skill_name in type_specific_data (most common case)
        const directSkillName = (injuryToAdd as any)?.type_specific_data?.skill_name;
        
        if (directSkillName) {
          queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (oldSkills: any) => {
            if (!oldSkills) return oldSkills;
            
            const newSkills = { ...oldSkills };
            
            if (!newSkills[directSkillName]) {
              newSkills[directSkillName] = {
                id: `temp-skill-${Date.now()}`,
                credits_increase: 0,
                xp_cost: 0,
                is_advance: false,
                fighter_effect_skill_id: `temp-effect-skill-${Date.now()}`,
                fighter_injury_id: `temp-injury-${Date.now()}`, // Mark as injury-granted skill
                created_at: new Date().toISOString(),
                skill: { name: directSkillName },
                fighter_effect_skills: {
                  fighter_effects: {
                    effect_name: injuryToAdd.effect_name
                  }
                },
                injury_name: injuryToAdd.effect_name, // This shows in the Source column
                source: `Granted by ${injuryToAdd.effect_name}`,
                source_type: 'injury'
              };
            }
            
            return newSkills;
          });
        }
        
        // Also check modifiers for any additional skills
        const injurySkills = (injuryToAdd as any)?.fighter_effect_type_modifiers?.filter(
          (mod: any) => mod.stat_name?.includes('skill_') || 
                       mod.skill_name || 
                       (mod.type_specific_data && typeof mod.type_specific_data === 'object' && mod.type_specific_data.skill_name)
        ) || [];
        
        if (injurySkills.length > 0) {
          queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (oldSkills: any) => {
            if (!oldSkills) return oldSkills;
            
            const newSkills = { ...oldSkills };
            
            injurySkills.forEach((skillMod: any, index: number) => {
              // Extract skill name from various possible locations
              let skillName = skillMod.skill_name;
              if (!skillName && skillMod.stat_name?.includes('skill_')) {
                skillName = skillMod.stat_name.replace('skill_', '').replace(/_/g, ' ');
              }
              if (!skillName && skillMod.type_specific_data?.skill_name) {
                skillName = skillMod.type_specific_data.skill_name;
              }
              
              if (skillName && !newSkills[skillName]) {
                newSkills[skillName] = {
                  id: `temp-skill-${Date.now()}-${index}`,
                  credits_increase: 0,
                  xp_cost: 0,
                  is_advance: false,
                  fighter_effect_skill_id: `temp-effect-skill-${Date.now()}-${index}`,
                  fighter_injury_id: `temp-injury-${Date.now()}-${index}`, // Mark as injury-granted skill
                  created_at: new Date().toISOString(),
                  skill: { name: skillName },
                  fighter_effect_skills: {
                    fighter_effects: {
                      effect_name: injuryToAdd.effect_name
                    }
                  },
                  injury_name: injuryToAdd.effect_name, // This shows in the Source column
                  source: `Granted by ${injuryToAdd.effect_name}`,
                  source_type: 'injury'
                };
              }
            });
            
            return newSkills;
          });
        }
        
        // Check if this injury has stat modifiers and update fighter characteristics
        const statModifiers = injuryToAdd.fighter_effect_type_modifiers || [];
        const hasStatModifiers = statModifiers.some((mod: any) => 
          mod.stat_name && mod.default_numeric_value !== undefined
        );
        
        // Check if this injury affects fighter status and update accordingly
        const injuryData = injuryToAdd.type_specific_data || {};
        const requiresRecovery = injuryData.recovery === "true" || variables.send_to_recovery;
        const requiresCaptured = injuryData.captured === "true" || variables.set_captured;
        
        if (requiresRecovery || requiresCaptured || hasStatModifiers) {
          queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => {
            if (!oldFighter) return oldFighter;
            
            let updatedFighter = { ...oldFighter };
            
            // Update status flags
            if (requiresRecovery) updatedFighter.recovery = true;
            if (requiresCaptured) updatedFighter.captured = true;
            
            // Apply stat modifications
            statModifiers.forEach((modifier: any) => {
              if (modifier.stat_name && modifier.default_numeric_value !== undefined) {
                const currentValue = updatedFighter[modifier.stat_name] || 0;
                // Note: For injuries, modifiers are typically negative (reducing stats)
                // The server handles the actual logic, but for optimistic updates we apply the modifier
                updatedFighter[modifier.stat_name] = Math.max(0, currentValue + modifier.default_numeric_value);
              }
            });
            
            return updatedFighter;
          });
        }
      }
      
      // Return a context object with the snapshotted values
      return { previousEffects, previousSkills, previousFighter };
    },
    onSuccess: (result, variables) => {
      const statusMessage = [];
      if (variables.send_to_recovery) statusMessage.push('fighter sent to Recovery');
      if (variables.set_captured) statusMessage.push('fighter marked as Captured');
      
      toast({
        description: `Lasting injury added successfully${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`,
        variant: "default"
      });

      // Invalidate queries to ensure we have fresh data with real IDs
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // Clear modal state
      setSelectedInjuryId('');
      setSelectedInjury(null);
      setIsAddModalOpen(false);
      setIsRecoveryModalOpen(false);
      setIsCapturedModalOpen(false);
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      
      toast({
        description: `Failed to add lasting injury: ${error.message}`,
        variant: "destructive"
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    },
  });

  const handleAddInjury = async () => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select a lasting injury",
        variant: "destructive"
      });
      return false;
    }

    // Find the selected injury object
    const injury = availableInjuries.find(injury => injury.id === selectedInjuryId);
    if (!injury) {
      toast({
        description: "Selected lasting injury not found",
        variant: "destructive"
      });
      return false;
    }
    
    setSelectedInjury(injury);

    // Check if the injury requires Recovery or Captured status
    const typeSpecificData = injury.type_specific_data && typeof injury.type_specific_data === 'object' ? injury.type_specific_data : {};
    const requiresRecovery = typeSpecificData.recovery === "true";
    const requiresCaptured = typeSpecificData.captured === "true";

    // If fighter is already in Recovery, don't show the Recovery modal again
    if (requiresRecovery && !fighterRecovery) {
      // Close the injury selection modal and open the Recovery confirmation modal
      setIsAddModalOpen(false);
      setIsRecoveryModalOpen(true);
      return false;
    } else if (requiresCaptured) {
      // Close the injury selection modal and open the Captured confirmation modal
      setIsAddModalOpen(false);
      setIsCapturedModalOpen(true);
      return false;
    } else {
      // Directly add the injury without asking for status changes
      addInjuryMutation.mutate({
        fighter_id: fighterId,
        injury_type_id: selectedInjuryId,
        send_to_recovery: false,
        set_captured: false
      });
      return true;
    }
  };

  const proceedWithAddingInjury = (sendToRecovery: boolean = false, setCaptured: boolean = false) => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select a lasting injury",
        variant: "destructive"
      });
      return;
    }

    // Close the modals immediately for better UX
    setIsRecoveryModalOpen(false);
    setIsCapturedModalOpen(false);

    addInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: selectedInjuryId,
      send_to_recovery: sendToRecovery,
      set_captured: setCaptured
    });
  };

  // Mutation for deleting injuries
  const deleteInjuryMutation = useMutation({
    mutationFn: deleteFighterInjury,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot the previous values
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Find the injury being deleted to get its name
      const injuryToDelete = (previousEffects as any)?.injuries?.find(
        (injury: any) => injury.id === variables.injury_id
      );
      
      // Optimistically update to remove the injury
      queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
        if (!old) return old;
        
        return {
          ...old,
          injuries: old.injuries?.filter((injury: any) => injury.id !== variables.injury_id) || []
        };
      });
      
      // Remove any skills that were granted by this injury and reverse stat modifiers
      if (injuryToDelete) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (oldSkills: any) => {
          if (!oldSkills) return oldSkills;
          
          const newSkills = { ...oldSkills };
          
          // Remove skills that have this injury as their source
          Object.keys(newSkills).forEach(skillName => {
            const skill = newSkills[skillName];
            if (skill.injury_name === injuryToDelete.effect_name || 
                skill.fighter_effect_skills?.fighter_effects?.effect_name === injuryToDelete.effect_name) {
              delete newSkills[skillName];
            }
          });
          
          return newSkills;
        });
        
        // Check if the injury being deleted has stat modifiers and reverse them
        // We need to find the original injury data to get the modifiers
        const originalInjury = availableInjuries.find(inj => 
          inj.effect_name === injuryToDelete.effect_name
        );
        
        if (originalInjury?.fighter_effect_type_modifiers) {
          const statModifiers = originalInjury.fighter_effect_type_modifiers.filter((mod: any) => 
            mod.stat_name && mod.default_numeric_value !== undefined
          );
          
          if (statModifiers.length > 0) {
            queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => {
              if (!oldFighter) return oldFighter;
              
              let updatedFighter = { ...oldFighter };
              
              // Reverse stat modifications by subtracting the modifier values
              statModifiers.forEach((modifier: any) => {
                if (modifier.stat_name && modifier.default_numeric_value !== undefined) {
                  const currentValue = updatedFighter[modifier.stat_name] || 0;
                  // Reverse the modifier by subtracting it (opposite of adding)
                  updatedFighter[modifier.stat_name] = Math.max(0, currentValue - modifier.default_numeric_value);
                }
              });
              
              return updatedFighter;
            });
          }
        }
      }
      
      // Return a context object with the snapshotted values
      return { previousEffects, previousSkills, previousFighter };
    },
    onSuccess: (result, variables) => {
      const injuryName = deleteModalData?.name || 'Lasting injury';
      toast({
        description: `${injuryName} removed successfully`,
        variant: "default"
      });
      
      // Invalidate queries to ensure we have fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      setDeleteModalData(null);
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      
      toast({
        description: `Failed to delete lasting injury: ${error.message}`,
        variant: "destructive"
      });
      setDeleteModalData(null);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    },
  });

  const handleDeleteInjury = (injuryId: string, injuryName: string) => {
    deleteInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_id: injuryId
    });
  };

  const handleInjuryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedInjuryId(id);
    
    if (id) {
      const selectedInjury = availableInjuries.find(injury => injury.id === id);
      setSelectedInjury(selectedInjury || null);
    } else {
      setSelectedInjury(null);
    }
  };

  return (
    <>
      <List
        title="Lasting Injuries"
        items={injuries
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateA - dateB;
          })
          .map((injury) => ({
            id: injury.id,
            name: injury.effect_name,
            injury_id: injury.id
          }))
        }
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '75%'
          }
        ]}
        actions={[
          {
            icon: <LuTrash2 className="h-4 w-4" />,
            title: "Delete",
            variant: 'destructive',
            onClick: (item) => setDeleteModalData({
              id: item.injury_id,
              name: item.name
            }),
            disabled: (item) => deleteInjuryMutation.isPending || !userPermissions.canEdit
          }
        ]}
        onAdd={handleOpenModal}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No lasting injuries yet."
      />

      {isAddModalOpen && (
        <Modal
          title="Lasting Injuries"
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                   items={availableInjuries}
                   ensureItems={undefined}
                   getRange={(i: FighterEffect) => {
                     const d: any = (i as any)?.type_specific_data || {};
                     if (typeof d.d66_min === 'number' && typeof d.d66_max === 'number') {
                       return { min: d.d66_min, max: d.d66_max };
                     }
                     return null; // let component fall back to util mapping
                   }}
                   getName={(i: FighterEffect) => (i as any).effect_name}
                   inline
                   rollFn={rollD66}
                   resolveNameForRoll={(r) => {
                     const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                     return resolver(r)?.name;
                   }}
                   onRolled={(rolled) => {
                     if (rolled.length > 0) {
                       const roll = rolled[0].roll;
                       // Prefer DB ranges; if not available, fallback to util by name
                       const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                       const util = resolver(roll);
                       let match: any = null;
                       if (util) {
                         match = availableInjuries.find(i => (i as any).effect_name === util.name);
                       }
                       if (!match) {
                         match = rolled[0].item as any;
                       }
                       if (match) {
                         setSelectedInjuryId(match.id);
                         setSelectedInjury(match);
                         toast({ description: `Roll ${roll}: ${match.effect_name}` });
                       }
                     }
                   }}
                   onRoll={(roll) => {
                     const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                     const util = resolver(roll);
                     if (!util) return;
                     const match = availableInjuries.find(i => (i as any).effect_name === util.name) as any;
                     if (match) {
                       setSelectedInjuryId(match.id);
                       setSelectedInjury(match);
                       toast({ description: `Roll ${roll}: ${match.effect_name}` });
                     }
                   }}
                   buttonText="Roll D66"
                   disabled={!userPermissions.canEdit || isLoadingInjuries}
                 />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="injurySelect" className="text-sm font-medium">
                  Lasting Injuries
                </label>
                <select
                  id="injurySelect"
                  value={selectedInjuryId}
                  onChange={handleInjuryChange}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoadingInjuries}
                >
                  <option value="">
                    {isLoadingInjuries
                      ? "Loading injuries..."
                      : "Select a Lasting Injury"
                    }
                  </option>
                
                  {Object.entries(
                    availableInjuries
                      .slice()
                      .filter(injury => {
                        // If fighter is Crew, only show injuries in lastingInjuryCrewRank
                        if (fighter_class === 'Crew') {
                          return lastingInjuryCrewRank.hasOwnProperty(injury.effect_name);
                        }
                        // Otherwise show all injuries
                        return true;
                      })
                      .sort((a, b) => {
                        const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                        const rankA = rankMap[a.effect_name] ?? Infinity;
                        const rankB = rankMap[b.effect_name] ?? Infinity;
                        return rankA - rankB;
                      })
                      .reduce((groups, injury) => {
                        const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                        const rank = rankMap[injury.effect_name] ?? Infinity;
                        let groupLabel = "Other Injuries";
                
                        if (rank <= 29) groupLabel = "Lasting Injuries";
                        else if (rank >= 30) groupLabel = "Mutations / Festering Injuries";
                
                        if (!groups[groupLabel]) groups[groupLabel] = [];
                        groups[groupLabel].push(injury);
                        return groups;
                      }, {} as Record<string, typeof availableInjuries>)
                  ).map(([groupLabel, injuries]) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {injuries.map((injury) => (
                        <option key={injury.id} value={injury.id}>
                          {injury.effect_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleAddInjury}
          confirmText="Add Lasting Injury"
          confirmDisabled={!selectedInjuryId || addInjuryMutation.isPending}
        />
      )}

      {isRecoveryModalOpen && (
        <div 
          className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsRecoveryModalOpen(false);
              setSelectedInjuryId('');
              setSelectedInjury(null);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900">Send ganger into Recovery?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsRecoveryModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="px-[10px] py-4">
              <p>You will need to remove the Recovery flag yourself when you update the gang next.</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsRecoveryModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, false)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
                disabled={addInjuryMutation.isPending}
              >
                No
              </button>
              <button
                onClick={() => proceedWithAddingInjury(true, false)}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
                disabled={addInjuryMutation.isPending}
              >
                {addInjuryMutation.isPending ? 'Adding...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCapturedModalOpen && (
        <div 
          className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsCapturedModalOpen(false);
              setSelectedInjuryId('');
              setSelectedInjury(null);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900">Mark fighter as Captured?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsCapturedModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="px-[10px] py-4">
              <p>This injury results in the fighter being captured. Do you want to mark the fighter as Captured?</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsCapturedModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, false)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
                disabled={addInjuryMutation.isPending}
              >
                No
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, true)}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
                disabled={addInjuryMutation.isPending}
              >
                {addInjuryMutation.isPending ? 'Adding...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalData && (
        <Modal
          title="Delete Lasting Injury"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteInjury(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </>
  );
} 