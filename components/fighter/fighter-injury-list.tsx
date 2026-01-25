'use client';

import React, { useState, useCallback, useRef } from 'react';
import { FighterEffect, FighterSkills } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPermissions } from '@/types/user-permissions';
import {
  addFighterInjury,
  deleteFighterInjury,
  verifyAndLogRolledFighterInjury
} from '@/app/actions/fighter-injury';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66, resolveInjuryFromUtil, resolveInjuryFromUtilCrew, resolveInjuryRangeFromUtilByName, resolveInjuryRangeFromUtilByNameCrew, resolveRigGlitchFromUtil, resolveRigGlitchRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';
import { Combobox } from '@/components/ui/combobox';
import { useMutation } from '@tanstack/react-query';
import FighterEffectSelection from '@/components/fighter-effect-selection';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  onInjuryUpdate?: (updatedInjuries: FighterEffect[], recoveryStatus?: boolean) => void;
  onSkillsUpdate?: (updatedSkills: FighterSkills) => void;
  onKillCountUpdate?: (newKillCount: number) => void;
  onEquipmentEffectUpdate?: (fighterEquipmentId: string | null, effectData: any | null) => void;
  skills?: FighterSkills;
  fighterId: string;
  fighterRecovery?: boolean;
  userPermissions: UserPermissions;
  fighter_class?: string;
  is_spyrer?: boolean;
  kill_count?: number;
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
}

export function InjuriesList({
  injuries = [],
  onInjuryUpdate,
  onSkillsUpdate,
  onKillCountUpdate,
  onEquipmentEffectUpdate,
  skills = {},
  fighterId,
  fighterRecovery = false,
  userPermissions,
  fighter_class,
  is_spyrer = false,
  kill_count = 0,
  fighterWeapons
}: InjuriesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isCapturedModalOpen, setIsCapturedModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [clearAllKillCost, setClearAllKillCost] = useState<number>(4);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const [showEquipmentSelection, setShowEquipmentSelection] = useState(false);
  const [targetEquipmentId, setTargetEquipmentId] = useState<string | null>(null);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const [injuryRollCooldown, setInjuryRollCooldown] = useState(false);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] }>(null);
  const { toast} = useToast();

  // TanStack Query mutation for adding injuries
  const addInjuryMutation = useMutation({
    mutationFn: async (variables: { 
      fighter_id: string; 
      injury_type_id: string; 
      send_to_recovery?: boolean; 
      set_captured?: boolean; 
      target_equipment_id?: string;
      injury_data: any; // Full injury data for optimistic updates
    }) => {
      const result = await addFighterInjury({
        fighter_id: variables.fighter_id,
        injury_type_id: variables.injury_type_id,
        send_to_recovery: variables.send_to_recovery,
        set_captured: variables.set_captured,
        target_equipment_id: variables.target_equipment_id
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to add lasting injury');
      }
      return result;
    },
    onMutate: async (variables) => {
      const injuryData = variables.injury_data;
      if (!injuryData) return {};

      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousSkills = { ...skills };

      // Optimistically add injury (data passed through variables)
      const tempInjury: FighterEffect = {
        ...injuryData,
        id: `optimistic-injury-${Date.now()}`,
        created_at: new Date().toISOString(),
        fighter_equipment_id: variables.target_equipment_id || undefined,
      };

      if (onInjuryUpdate) {
        onInjuryUpdate([...injuries, tempInjury], variables.send_to_recovery ? true : undefined);
      }

      // Optimistically add equipment effect if attached to equipment
      if (variables.target_equipment_id && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(variables.target_equipment_id, tempInjury as any);
      }

      // Optimistically add skill if injury grants one
      const grantedSkill = injuryData?.granted_skill;
      let grantedSkillName: string | undefined;

      if (onSkillsUpdate && grantedSkill) {
        grantedSkillName = grantedSkill.name;
        const updatedSkills = {
          ...skills,
          [grantedSkill.name]: {
            id: `optimistic-skill-${Date.now()}`,
            credits_increase: 0,
            xp_cost: 0,
            is_advance: false,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: tempInjury.id,
            injury_name: injuryData?.effect_name
          }
        };
        onSkillsUpdate(updatedSkills);
      }

      return {
        previousInjuries,
        previousSkills,
        grantedSkillName,
        injuryName: injuryData?.effect_name,
        targetEquipmentId: variables.target_equipment_id
      };
    },
    onSuccess: (result, variables, context) => {
      const statusMessage: string[] = [];
      if (variables.send_to_recovery) statusMessage.push('fighter sent to Recovery');
      if (variables.set_captured) statusMessage.push('fighter marked as Captured');

      const successText = is_spyrer ? 'Rig glitch added successfully' : 'Lasting injury added successfully';
      toast({
        description: `${successText}${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`,
        variant: "default"
      });

      // Reconcile equipment effect with server response (replace optimistic with real data)
      if (context?.targetEquipmentId && result.injury && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.targetEquipmentId, result.injury);
      }
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries);
      }
      if (context?.previousSkills && onSkillsUpdate) {
        onSkillsUpdate(context.previousSkills);
      }
      // Rollback equipment effect
      if (context?.targetEquipmentId && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.targetEquipmentId, null);
      }

      const errorText = is_spyrer ? 'Failed to add rig glitch' : 'Failed to add lasting injury';
      toast({
        description: `${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  });

  // TanStack Query mutation for deleting injuries
  const deleteInjuryMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; injury_id: string }) => {
      const result = await deleteFighterInjury(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete lasting injury');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the injury being deleted
      const injuryToDelete = injuries.find(i => i.id === variables.injury_id);
      if (!injuryToDelete) return {};

      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousSkills = { ...skills };
      const fighterEquipmentId = (injuryToDelete as any)?.fighter_equipment_id;

      // Optimistically remove injury
      if (onInjuryUpdate) {
        const updatedInjuries = injuries.filter(i => i.id !== variables.injury_id);
        onInjuryUpdate(updatedInjuries);
      }

      // Optimistically remove equipment effect if attached to equipment
      if (fighterEquipmentId && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(fighterEquipmentId, null);
      }

      // Optimistically remove skill if injury granted one
      const injuryName = injuryToDelete.effect_name;
      if (onSkillsUpdate) {
        const updatedSkills = { ...skills };
        Object.keys(updatedSkills).forEach(skillName => {
          const skill = updatedSkills[skillName];
          if (skill.injury_name === injuryName) {
            delete updatedSkills[skillName];
          }
        });
        onSkillsUpdate(updatedSkills);
      }

      return {
        previousInjuries,
        previousSkills,
        injuryName,
        fighterEquipmentId,
        previousEffect: injuryToDelete
      };
    },
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.injuryName || 'Injury'} removed successfully`,
        variant: "default"
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries);
      }
      if (context?.previousSkills && onSkillsUpdate) {
        onSkillsUpdate(context.previousSkills);
      }
      // Rollback equipment effect removal
      if (context?.fighterEquipmentId && context?.previousEffect && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.fighterEquipmentId, context.previousEffect as any);
      }

      const errorText = is_spyrer ? 'Failed to delete rig glitch' : 'Failed to delete lasting injury';
      toast({
        description: `${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  });

  // TanStack Query mutation for clearing all glitches
  const clearAllGlitchesMutation = useMutation({
    mutationFn: async (params: { currentKillCount: number; glitches: FighterEffect[]; costInKills: number }) => {
      // Check if fighter has enough kills
      if (params.currentKillCount < params.costInKills) {
        throw new Error(`Not enough kills. Required: ${params.costInKills}, Available: ${params.currentKillCount}`);
      }

      // Delete all glitches
      let deletedCount = 0;
      for (const injury of params.glitches) {
        const result = await deleteFighterInjury({
          fighter_id: fighterId,
          injury_id: injury.id
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete glitch');
        }
        deletedCount++;
      }

      // Deduct kills from kill_count
      const newKillCount = params.currentKillCount - params.costInKills;
      const updateResult = await updateFighterDetails({
        fighter_id: fighterId,
        kill_count: newKillCount
      });

      if (!updateResult.success) {
        throw new Error('Failed to update kill count');
      }

      return { clearedCount: deletedCount, newKillCount };
    },
    onMutate: async (params) => {
      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousKillCount = params.currentKillCount;

      // Optimistically clear all injuries
      if (onInjuryUpdate) {
        onInjuryUpdate([]);
      }

      // Optimistically update kill count
      if (onKillCountUpdate) {
        onKillCountUpdate(params.currentKillCount - params.costInKills);
      }

      return {
        previousInjuries,
        previousKillCount
      };
    },
    onSuccess: (result) => {
      toast({
        description: `Successfully cleared ${result.clearedCount} rig glitches. New kill count: ${result.newKillCount}`,
        variant: "default"
      });
      setIsClearAllModalOpen(false);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries);
      }
      if (context?.previousKillCount !== undefined && onKillCountUpdate) {
        onKillCountUpdate(context.previousKillCount);
      }

      toast({
        description: error instanceof Error ? error.message : 'Failed to clear rig glitches',
        variant: "destructive"
      });
    }
  });

  // TanStack Query mutation for logging rolled injury results
  const logInjuryRollMutation = useMutation({
    mutationFn: async (variables: { 
      fighter_id: string; 
      injury_type_id: string;
      injury_table: string;
      dice_data: any;
    }) => {
      const result = await verifyAndLogRolledFighterInjury({
        fighter_id: variables.fighter_id,
        injury_type_id: variables.injury_type_id,
        injury_table: variables.injury_table,
        dice_data: variables.dice_data
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to log lasting injury');
      }
      return result;
    },
    onSuccess: (result, variables, context) => {
      const statusMessage: string[] = [];
      
      const successText = is_spyrer ? 'Rig glitch logged successfully' : 'Lasting injury logged successfully';
      toast({
        description: `${successText}${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`,
        variant: "default"
      });
    },
    onError: (error, variables, context) => {
      const errorText = is_spyrer ? 'Failed to log rig glitch' : 'Failed to log lasting injury';
      toast({
        description: `${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  });

  // Helper function to format the range display
  const formatInjuryRange = (injuryName: string): string => {
    const range = is_spyrer
      ? resolveRigGlitchRangeFromUtilByName(injuryName)
      : (fighter_class === 'Crew'
        ? resolveInjuryRangeFromUtilByNameCrew(injuryName)
        : resolveInjuryRangeFromUtilByName(injuryName));

    if (!range) return '';

    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Coordinates applying a resolved dice roll:
  // - Guards against duplicate submissions
  // - Applies UI selection state
  // - Logs the roll to the server
  // - Enforces a short cooldown to prevent spam
  const logResolvedRollWithCooldown = (injury: FighterEffect, roll: number) => {  
    if (injuryRollCooldown || logInjuryRollMutation.isPending) {
      return false;
    }

    setInjuryRollCooldown(true);

    // Ensure the cooldown is always released once it has been set
    try {
      selectRolledInjury(injury);
      logRolledInjury(injury, roll);
      return true;      
    } finally {
      // Cooldown to prevent rapid re-rolling and excessive logging
      setTimeout(() => setInjuryRollCooldown(false), 2000);
    }
  };

  // Updates local UI state to reflect the injury produced by a dice roll.
  // This is purely a UI concern and does not trigger any persistence.
  const selectRolledInjury = (injury: FighterEffect) => {
    setSelectedInjuryId(injury.id);
    setSelectedInjury(injury);
  };
  
  // Persists a resolved dice roll to the backend for auditing / verification.
  // Fire-and-forget mutation; success and error handling are managed by the mutation.
  const logRolledInjury = (injury: FighterEffect, roll: number) => {
    const injuryTable = is_spyrer ? 'rig glitch' : (fighter_class === 'Crew' ? 'lasting injury crew' : 'lasting injury');
  
    logInjuryRollMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: injury.id,
      injury_table: injuryTable,
      dice_data: { result: roll }
    });
  };

  const fetchAvailableInjuries = useCallback(async () => {
    if (isLoadingInjuries) return;

    try {
      setIsLoadingInjuries(true);
      const response = await fetch(
        `/api/fighters/injuries?is_spyrer=${is_spyrer}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      if (!response.ok) throw new Error(is_spyrer ? 'Failed to fetch rig glitches' : 'Failed to fetch lasting injuries');
      const data: FighterEffect[] = await response.json();

      setLocalAvailableInjuries(data);
    } catch (error) {
      console.error(is_spyrer ? 'Error fetching rig glitches:' : 'Error fetching lasting injuries:', error);
      toast({
        description: is_spyrer ? 'Failed to load rig glitch types' : 'Failed to load lasting injury types',
        variant: "destructive"
      });
    } finally {
      setIsLoadingInjuries(false);
    }
  }, [isLoadingInjuries, is_spyrer, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
    if (localAvailableInjuries.length === 0) {
      fetchAvailableInjuries();
    }
  }, [localAvailableInjuries.length, fetchAvailableInjuries]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedInjuryId('');
    setSelectedInjury(null);
  }, []);

  const handleAddInjury = async () => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select a lasting injury",
        variant: "destructive"
      });
      return false;
    }

    // Find the selected injury object
    const injury = localAvailableInjuries.find(injury => injury.id === selectedInjuryId);
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
    const appliesToEquipment = typeSpecificData.applies_to === 'equipment';
    const requiresRecovery = typeSpecificData.recovery === "true";
    const requiresCaptured = typeSpecificData.captured === "true";

    // Check if glitch requires equipment selection FIRST
    // Only show equipment selection if there are weapons available to select
    if (appliesToEquipment) {
      const hasAvailableEquipment = fighterWeapons && fighterWeapons.length > 0;
      
      if (hasAvailableEquipment) {
        setIsAddModalOpen(false);
        setShowEquipmentSelection(true);
        return false;
      }
      // Show error instead of silently falling through
      toast({
        description: "This effect requires equipment but the fighter has no weapons",
        variant: "destructive"
      });
      return false;
    }

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
      // Close modal immediately and trigger mutation
      setIsAddModalOpen(false);  
      addInjuryMutation.mutate({
        fighter_id: fighterId,
        injury_type_id: selectedInjuryId,
        send_to_recovery: false,
        set_captured: false,
        injury_data: selectedInjury
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

    // Close modals immediately
    setIsRecoveryModalOpen(false);
    setIsCapturedModalOpen(false);

    // Trigger mutation
    addInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: selectedInjuryId,
      send_to_recovery: sendToRecovery,
      set_captured: setCaptured,
      target_equipment_id: targetEquipmentId || undefined,
      injury_data: selectedInjury
    });

    // Reset target after mutation
    setTargetEquipmentId(null);
  };

  const handleDeleteInjury = (injuryId: string, injuryName: string) => {
    // Close modal immediately
    setDeleteModalData(null);

    // Trigger mutation
    deleteInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_id: injuryId
    });
  };

  const glitchCount = is_spyrer
    ? injuries.filter(inj => {
        const typeData = inj.type_specific_data && typeof inj.type_specific_data === 'object'
          ? inj.type_specific_data
          : {};
        return typeData.adds_to_glitch_count === true;
      }).length
    : 0;
  const title = is_spyrer
    ? (
        <>
          Rig Glitches <span className="text-sm sm:hidden">({glitchCount})</span><span className="text-sm hidden sm:inline">(Glitch count: {glitchCount})</span>
        </>
      )
    : "Lasting Injuries";

  // Handler for clearing all glitches
  const handleClearAllGlitches = () => {
    clearAllGlitchesMutation.mutate({
      currentKillCount: kill_count,
      glitches: injuries,
      costInKills: clearAllKillCost
    });
    return true;
  };

  // Reset cost when modal opens
  const handleOpenClearAllModal = () => {
    setClearAllKillCost(4);
    setIsClearAllModalOpen(true);
  };

  return (
    <>
      {is_spyrer ? (
        <div className="mt-6">
          <div className="flex flex-wrap justify-between items-center mb-2">
            <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
            <div className="flex gap-2">
              <Button
                onClick={handleOpenClearAllModal}
                className="bg-card hover:bg-muted text-foreground border border-border"
                disabled={injuries.length === 0 || !userPermissions.canEdit || kill_count < 1 || clearAllGlitchesMutation.isPending}
              >
                Clear all
              </Button>
              <Button
                onClick={handleOpenModal}
                className="bg-neutral-900 hover:bg-gray-800 text-white"
                disabled={!userPermissions.canEdit}
              >
                Add
              </Button>
            </div>
          </div>

          <div>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                {injuries.length > 0 && (
                  <thead>
                    <tr className="bg-muted">
                      <th className="px-1 py-1 text-left" style={{ width: '75%' }}>Name</th>
                      <th className="px-1 py-1 text-right">Action</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {injuries.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="text-muted-foreground italic text-center py-4">
                        No rig glitches yet.
                      </td>
                    </tr>
                  ) : (
                    injuries
                      .sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return dateA - dateB;
                      })
                      .map((injury) => (
                        <tr key={injury.id} className="border-t">
                          <td className="px-1 py-1">{injury.effect_name}</td>
                          <td className="px-1 py-1">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline_remove"
                                size="sm"
                                onClick={() => setDeleteModalData({
                                  id: injury.id,
                                  name: injury.effect_name
                                })}
                                disabled={deleteInjuryMutation.isPending || !userPermissions.canEdit}
                                className="text-xs px-1.5 h-6"
                                title="Delete"
                              >
                                <LuTrash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <List
          title={title}
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
              variant: 'outline_remove',
              onClick: (item) => setDeleteModalData({
                id: item.injury_id,
                name: item.name
              }),
              disabled: () => deleteInjuryMutation.isPending || !userPermissions.canEdit
            }
          ]}
          onAdd={handleOpenModal}
          addButtonDisabled={!userPermissions.canEdit}
          addButtonText="Add"
          emptyMessage={is_spyrer ? "No rig glitches yet." : "No lasting injuries yet."}
        />
      )}

      {isAddModalOpen && (
        <Modal
          title={is_spyrer ? "Rig Glitches" : "Lasting Injuries"}
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                  items={localAvailableInjuries}
                  ensureItems={localAvailableInjuries.length === 0 ? fetchAvailableInjuries : undefined}
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
                    const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
                    return resolver(r)?.name;
                  }}
                  onRolled={(rolled) => {
                    if (rolled.length > 0) {
                      const roll = rolled[0].roll;
                      // Prefer DB ranges; if not available, fallback to util by name
                      const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
                      const util = resolver(roll);
                      let match: any = null;
                      if (util) {
                        match = localAvailableInjuries.find(i => (i as any).effect_name === util.name);
                      }
                      if (!match) {
                        match = rolled[0].item as any;
                      }

                      if (match) {
                        logResolvedRollWithCooldown(match, roll);
                      }
                    }
                  }}
                  onRoll={(roll) => {
                    const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
                    const util = resolver(roll);
                    
                    if (!util) return;
                    const match = localAvailableInjuries.find(i => (i as any).effect_name === util.name) as any;
                    
                    if (match) {
                      logResolvedRollWithCooldown(match, roll);
                    }
                  }}
                  buttonText="Roll D66"
                  disabled={
                    !userPermissions.canEdit || 
                    logInjuryRollMutation.isPending || 
                    injuryRollCooldown
                  }
                 />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="injurySelect" className="text-sm font-medium">
                  {is_spyrer ? "Rig Glitches" : "Lasting Injuries"}
                </label>
                <Combobox
                  value={selectedInjuryId}
                  onValueChange={(value) => {
                    setSelectedInjuryId(value);
                    if (value) {
                      const selectedInjury = localAvailableInjuries.find(injury => injury.id === value);
                      setSelectedInjury(selectedInjury || null);
                    } else {
                      setSelectedInjury(null);
                    }
                  }}
                  placeholder={isLoadingInjuries && localAvailableInjuries.length === 0
                    ? "Loading injuries..."
                    : is_spyrer ? "Select a Rig Glitch" : "Select a Lasting Injury"
                  }
                  disabled={isLoadingInjuries && localAvailableInjuries.length === 0}
                  options={Object.entries(
                    localAvailableInjuries
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
                        // Sort by dice range (minimum value of the range)
                        const rangeA = formatInjuryRange(a.effect_name);
                        const rangeB = formatInjuryRange(b.effect_name);
                        
                        if (!rangeA && !rangeB) return 0;
                        if (!rangeA) return 1;
                        if (!rangeB) return -1;
                        
                        // Extract the minimum value from the range
                        const minA = parseInt(rangeA.split('-')[0]);
                        const minB = parseInt(rangeB.split('-')[0]);
                        return minA - minB;
                      })
                      .reduce((groups, injury) => {
                        const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                        const rank = rankMap[injury.effect_name] ?? Infinity;
                        let groupLabel = "Other Injuries";

                        if (is_spyrer) {
                          groupLabel = "Rig Glitches";
                        } else if (rank <= 29) {
                          groupLabel = "Lasting Injuries";
                        } else if (rank >= 30) {
                          groupLabel = "Mutations / Festering Injuries";
                        }
                
                        if (!groups[groupLabel]) groups[groupLabel] = [];
                        groups[groupLabel].push(injury);
                        return groups;
                      }, {} as Record<string, typeof localAvailableInjuries>)
                  ).flatMap(([groupLabel, injuries]) => [
                    // Add a header option for the group
                    {
                      value: `__header_${groupLabel}`,
                      label: <span className="font-bold text-sm">{groupLabel}</span>,
                      displayValue: groupLabel,
                      disabled: true
                    },
                    // Add the injuries in this group
                    ...injuries.map((injury) => {
                      const range = formatInjuryRange(injury.effect_name);
                      const displayText = range ? `${range} ${injury.effect_name}` : injury.effect_name;
                      return {
                        value: injury.id,
                        label: range ? (
                          <>
                            <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{injury.effect_name}
                          </>
                        ) : injury.effect_name,
                        displayValue: displayText
                      };
                    })
                  ])}
                />
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleAddInjury}
          confirmText={is_spyrer ? "Add Rig Glitch" : "Add Lasting Injury"}
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
              setTargetEquipmentId(null);
            }
          }}
        >
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">Send ganger into Recovery?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsRecoveryModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                    setTargetEquipmentId(null);
                  }}
                  className="text-muted-foreground hover:text-muted-foreground text-xl"
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
                  setTargetEquipmentId(null);
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(false, false); }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(true, false); }}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Yes
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
              setTargetEquipmentId(null);
            }
          }}
        >
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">Mark fighter as Captured?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsCapturedModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                    setTargetEquipmentId(null);
                  }}
                  className="text-muted-foreground hover:text-muted-foreground text-xl"
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
                  setTargetEquipmentId(null);
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { setIsCapturedModalOpen(false); void proceedWithAddingInjury(false, false); }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => { setIsCapturedModalOpen(false); void proceedWithAddingInjury(false, true); }}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalData && (
        <Modal
          title={is_spyrer ? "Delete Rig Glitch" : "Delete Lasting Injury"}
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
          onConfirm={() => { void handleDeleteInjury(deleteModalData.id, deleteModalData.name); return true; }}
        />
      )}

      {showEquipmentSelection && selectedInjury && (
        <Modal
          title="Select Weapon"
          content={
            <FighterEffectSelection
              ref={effectSelectionRef}
              equipmentId=""
              effectTypes={[]}
              targetSelectionOnly
              fighterId={fighterId}
              modifierEquipmentId=""
              effectTypeId={selectedInjury.id}
              effectName={selectedInjury.effect_name}
              fighterWeapons={fighterWeapons}
              onApplyToTarget={async (equipmentId) => {
                setTargetEquipmentId(equipmentId);
                setShowEquipmentSelection(false);

                const typeSpecificData = (selectedInjury as any).type_specific_data || {};
                const requiresRecovery = typeSpecificData.recovery === "true";
                const requiresCaptured = typeSpecificData.captured === "true";

                // Check for recovery/captured modal or proceed directly
                if (requiresRecovery && !fighterRecovery) {
                  setIsRecoveryModalOpen(true);
                } else if (requiresCaptured) {
                  setIsCapturedModalOpen(true);
                } else {
                  addInjuryMutation.mutate({
                    fighter_id: fighterId,
                    injury_type_id: selectedInjuryId,
                    send_to_recovery: false,
                    set_captured: false,
                    target_equipment_id: equipmentId,
                    injury_data: selectedInjury
                  });
                  // Reset state
                  setTargetEquipmentId(null);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }
              }}
              onSelectionComplete={() => {}}
              onCancel={() => {
                setShowEquipmentSelection(false);
                setTargetEquipmentId(null);
                setSelectedInjuryId('');
                setSelectedInjury(null);
              }}
              onValidityChange={(isValid) => setIsEffectSelectionValid(isValid)}
            />
          }
          onClose={() => {
            setShowEquipmentSelection(false);
            setTargetEquipmentId(null);
            setSelectedInjuryId('');
            setSelectedInjury(null);
          }}
          onConfirm={async () => {
            return await effectSelectionRef.current?.handleConfirm() || false;
          }}
          confirmText="Select Weapon"
          confirmDisabled={!isEffectSelectionValid}
          width="lg"
        />
      )}

      {isClearAllModalOpen && (
        <Modal
          title="Clear Rig Glitches"
          content={
            <div className="space-y-4">
              <div>
                <p className="mb-4">The following rig glitches will be cleared:</p>
                <ul className="divide-y divide-gray-200 mb-4">
                  {injuries.map((injury: FighterEffect) => (
                    <li key={injury.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-base">{injury.effect_name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-3 border-t space-y-3">
                <div>
                  <label htmlFor="killCost" className="text-sm font-medium block mb-2">
                    Kill Cost
                  </label>
                  <Input
                    id="killCost"
                    type="number"
                    min="1"
                    max={kill_count}
                    value={clearAllKillCost}
                    onChange={(e) => setClearAllKillCost(Math.max(1, Math.min(kill_count, parseInt(e.target.value) || 4)))}
                    className="w-32"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Current kills: <strong>{kill_count}</strong> → New kills: <strong>{kill_count - clearAllKillCost}</strong>
                </p>
              </div>
            </div>
          }
          onClose={() => setIsClearAllModalOpen(false)}
          onConfirm={handleClearAllGlitches}
          confirmText="Clear All"
          confirmDisabled={injuries.length === 0 || clearAllGlitchesMutation.isPending || clearAllKillCost < 1 || clearAllKillCost > kill_count}
        />
      )}
    </>
  );
} 