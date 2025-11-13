import React, { useState, useCallback } from 'react';
import { FighterEffect, FighterSkills } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import {
  addFighterInjury,
  deleteFighterInjury
} from '@/app/actions/fighter-injury';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66, resolveInjuryFromUtil, resolveInjuryFromUtilCrew, resolveInjuryRangeFromUtilByName, resolveInjuryRangeFromUtilByNameCrew, resolveRigGlitchFromUtil, resolveRigGlitchRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';
import { Combobox } from '@/components/ui/combobox';
import { useMutation } from '@tanstack/react-query';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  onInjuryUpdate?: (updatedInjuries: FighterEffect[], recoveryStatus?: boolean) => void;
  onSkillsUpdate?: (updatedSkills: FighterSkills) => void;
  skills?: FighterSkills;
  fighterId: string;
  fighterRecovery?: boolean;
  userPermissions: UserPermissions;
  fighter_class?: string;
  is_spyrer?: boolean;
}

export function InjuriesList({
  injuries = [],
  onInjuryUpdate,
  onSkillsUpdate,
  skills = {},
  fighterId,
  fighterRecovery = false,
  userPermissions,
  fighter_class,
  is_spyrer = false
}: InjuriesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isCapturedModalOpen, setIsCapturedModalOpen] = useState(false);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const { toast} = useToast();

  // TanStack Query mutation for adding injuries
  const addInjuryMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; injury_type_id: string; send_to_recovery?: boolean; set_captured?: boolean }) => {
      const result = await addFighterInjury(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add lasting injury');
      }
      return result;
    },
    onMutate: async (variables) => {
      if (!selectedInjury) return {};

      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousSkills = { ...skills };

      // Optimistically add injury
      const tempInjury: FighterEffect = {
        ...(selectedInjury as any),
        id: `optimistic-injury-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      if (onInjuryUpdate) {
        onInjuryUpdate([...injuries, tempInjury], variables.send_to_recovery ? true : undefined);
      }

      // Optimistically add skill if injury grants one
      const grantedSkill = (selectedInjury as any)?.granted_skill;
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
            injury_name: (selectedInjury as any)?.effect_name
          }
        };
        onSkillsUpdate(updatedSkills);
      }

      return {
        previousInjuries,
        previousSkills,
        grantedSkillName,
        injuryName: (selectedInjury as any)?.effect_name
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
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries);
      }
      if (context?.previousSkills && onSkillsUpdate) {
        onSkillsUpdate(context.previousSkills);
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

      // Optimistically remove injury
      if (onInjuryUpdate) {
        const updatedInjuries = injuries.filter(i => i.id !== variables.injury_id);
        onInjuryUpdate(updatedInjuries);
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
        injuryName
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

      const errorText = is_spyrer ? 'Failed to delete rig glitch' : 'Failed to delete lasting injury';
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
      // Close modal immediately and trigger mutation
      setIsAddModalOpen(false);
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

    // Close modals immediately
    setIsRecoveryModalOpen(false);
    setIsCapturedModalOpen(false);

    // Trigger mutation
    addInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: selectedInjuryId,
      send_to_recovery: sendToRecovery,
      set_captured: setCaptured
    });
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

  return (
    <>
      <List
        title={is_spyrer ? "Rig Glitches" : "Lasting Injuries"}
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
            disabled: () => deleteInjuryMutation.isPending || !userPermissions.canEdit
          }
        ]}
        onAdd={handleOpenModal}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage={is_spyrer ? "No rig glitches yet." : "No lasting injuries yet."}
      />

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
                         setSelectedInjuryId(match.id);
                         setSelectedInjury(match);
                         toast({ description: `Roll ${roll}: ${match.effect_name}` });
                       }
                     }
                   }}
                   onRoll={(roll) => {
                     const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
                     const util = resolver(roll);
                     if (!util) return;
                     const match = localAvailableInjuries.find(i => (i as any).effect_name === util.name) as any;
                     if (match) {
                       setSelectedInjuryId(match.id);
                       setSelectedInjury(match);
                       toast({ description: `Roll ${roll}: ${match.effect_name}` });
                     }
                   }}
                   buttonText="Roll D66"
                   disabled={!userPermissions.canEdit}
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
    </>
  );
} 