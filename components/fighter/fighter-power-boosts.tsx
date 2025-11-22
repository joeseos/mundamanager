'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import { FighterEffect as FighterEffectType } from '@/types/fighter';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useMutation } from '@tanstack/react-query';
import { LuUndo2 } from 'react-icons/lu';
import { Combobox } from '@/components/ui/combobox';
import DiceRoller from '@/components/dice-roller';
import { resolvePowerBoostFromUtil, resolvePowerBoostRangeFromUtilByName, rollD6 } from '@/utils/dice';
import { addPowerBoost, deletePowerBoost } from '@/app/actions/fighter-advancement';
import FighterEffectSelection from '@/components/fighter-effect-selection';

// Utility function to parse type_specific_data safely
function parseTypeSpecificData(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
}

// Power boost ranking for sorting
const powerBoostRank: { [key: string]: number } = {
  "Combat Neuroware": 1,
  "Heightened Reactions": 2,
  "Improved Motive Power": 3,
  "Thickened Armour": 4,
  "Hunting Rig Augmentation": 5,
};

interface PowerBoostsListProps {
  fighterId: string;
  powerBoosts: Array<FighterEffectType>;
  userPermissions: UserPermissions;
  onPowerBoostUpdate: (updatedPowerBoosts: Array<FighterEffectType>) => void;
  onKillsCreditsUpdate?: (killsChange: number, creditsChange: number) => void;
  currentKillCount: number;
}

export function PowerBoostsList({
  fighterId,
  powerBoosts = [],
  userPermissions,
  onPowerBoostUpdate,
  onKillsCreditsUpdate,
  currentKillCount
}: PowerBoostsListProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [selectedPowerBoostId, setSelectedPowerBoostId] = useState<string>('');
  const [availablePowerBoosts, setAvailablePowerBoosts] = useState<FighterEffectType[]>([]);
  const [isLoadingPowerBoosts, setIsLoadingPowerBoosts] = useState(false);
  const [editableKillCost, setEditableKillCost] = useState<number>(4);
  const [editableCreditsIncrease, setEditableCreditsIncrease] = useState<number>(0);
  const [showEffectSelection, setShowEffectSelection] = useState(false);
  const [effectTypes, setEffectTypes] = useState<any[]>([]);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean } | null>(null);
  const { toast } = useToast();

  // TanStack Query mutation for adding power boosts
  const addPowerBoostMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; power_boost_type_id: string; kill_cost: number; boost_name: string; credits_increase: number; selected_effect_ids?: string[]; selected_modifier_ids?: string[] }) => {
      const result = await addPowerBoost(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add power boost');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Snapshot the previous values for rollback
      const previousPowerBoosts = [...powerBoosts];
      const previousKillCount = currentKillCount;

      // Create optimistic power boost using variables directly
      const optimisticId = `optimistic-boost-${Date.now()}`;
      const optimisticPowerBoost: FighterEffectType = {
        id: optimisticId,
        effect_name: variables.boost_name,
        created_at: new Date().toISOString(),
        fighter_effect_modifiers: [],
        type_specific_data: {
          kill_cost: variables.kill_cost,
          credits_increase: variables.credits_increase
        }
      };

      // Optimistically update the power boosts list
      const updatedPowerBoosts = [...powerBoosts, optimisticPowerBoost];
      onPowerBoostUpdate(updatedPowerBoosts);

      // Update kill_count and credits immediately
      if (onKillsCreditsUpdate) {
        onKillsCreditsUpdate(-variables.kill_cost, variables.credits_increase);
      }

      return {
        previousPowerBoosts,
        previousKillCount,
        killCost: variables.kill_cost,
        creditsIncrease: variables.credits_increase,
        boostName: variables.boost_name
      };
    },
    onSuccess: (result, variables, context) => {
      toast({
        title: "Success!",
        description: `Successfully added ${context?.boostName || 'power boost'}`
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic power boost update
      if (context?.previousPowerBoosts) {
        onPowerBoostUpdate(context.previousPowerBoosts);
      }

      // Rollback kill_count and credits
      if (context?.killCost || context?.creditsIncrease) {
        if (onKillsCreditsUpdate) {
          onKillsCreditsUpdate(context.killCost || 0, -(context.creditsIncrease || 0));
        }
      }

      toast({
        description: error instanceof Error ? error.message : 'Failed to add power boost',
        variant: "destructive"
      });
    }
  });

  // TanStack Query mutation for deleting power boosts
  const deletePowerBoostMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; power_boost_id: string }) => {
      const result = await deletePowerBoost(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete power boost');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the power boost being deleted
      const boostToDelete = powerBoosts.find(b => b.id === variables.power_boost_id);
      if (!boostToDelete) return {};

      // Extract kill cost and credits from type_specific_data
      const specificData = parseTypeSpecificData(boostToDelete.type_specific_data);
      const killCost = (specificData.kill_cost as number) || 0;
      const creditsIncrease = (specificData.credits_increase as number) || 0;

      // Snapshot the previous values for rollback
      const previousPowerBoosts = [...powerBoosts];
      const previousKillCount = currentKillCount;

      // Optimistically remove the power boost
      const updatedPowerBoosts = powerBoosts.filter(b => b.id !== variables.power_boost_id);
      onPowerBoostUpdate(updatedPowerBoosts);

      // Refund kill_count and deduct credits
      if (onKillsCreditsUpdate) {
        onKillsCreditsUpdate(killCost, -creditsIncrease);
      }

      return {
        previousPowerBoosts,
        previousKillCount,
        boostName: boostToDelete.effect_name,
        killCost,
        creditsIncrease
      };
    },
    onSuccess: (result, variables, context) => {
      toast({
        title: "Success!",
        description: `Successfully removed ${context?.boostName}. Refunded ${context?.killCost} kills.`
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic power boost update
      if (context?.previousPowerBoosts) {
        onPowerBoostUpdate(context.previousPowerBoosts);
      }

      // Rollback kill_count and credits
      if (context?.killCost || context?.creditsIncrease) {
        if (onKillsCreditsUpdate) {
          onKillsCreditsUpdate(-context.killCost, context.creditsIncrease);
        }
      }

      toast({
        description: error instanceof Error ? error.message : 'Failed to delete power boost',
        variant: "destructive"
      });
    }
  });

  // Fetch available power boosts from database
  const fetchAvailablePowerBoosts = useCallback(async () => {
    if (isLoadingPowerBoosts) return;

    try {
      setIsLoadingPowerBoosts(true);
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      const { data, error } = await supabase
        .from('fighter_effect_types')
        .select(`
          *,
          fighter_effect_type_modifiers(*)
        `)
        .eq('fighter_effect_category_id', '047d6547-ab52-485e-afaa-b570d8a7d8b8')
        .order('effect_name', { ascending: true });

      if (error) throw error;

      setAvailablePowerBoosts(data || []);
    } catch (error) {
      console.error('Error fetching power boosts:', error);
      toast({
        description: 'Failed to load power boost types',
        variant: "destructive"
      });
    } finally {
      setIsLoadingPowerBoosts(false);
    }
  }, [isLoadingPowerBoosts, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
    setEditableKillCost(4); // Reset to default
    setEditableCreditsIncrease(0); // Reset to default
    if (availablePowerBoosts.length === 0) {
      fetchAvailablePowerBoosts();
    }
  }, [availablePowerBoosts.length, fetchAvailablePowerBoosts]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedPowerBoostId('');
    setEditableKillCost(4);
    setEditableCreditsIncrease(0);
    setShowEffectSelection(false);
    setEffectTypes([]);
    setSelectedEffectIds([]);
    setIsEffectSelectionValid(false);
  }, []);

  // Helper function to format the range display
  const formatPowerBoostRange = (boostName: string): string => {
    const range = resolvePowerBoostRangeFromUtilByName(boostName);
    if (!range) return '';
    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Transform power boosts for the List component
  const transformedPowerBoosts = useMemo(() => {
    return powerBoosts
      .sort((a, b) => {
        const dateA = a.created_at || '';
        const dateB = b.created_at || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .map((boost) => {
        const specificData = parseTypeSpecificData(boost.type_specific_data);

        return {
          id: boost.id || `temp-${Math.random()}`,
          name: boost.effect_name,
          kill_cost: (specificData.kill_cost as number) || 0,
          credits_increase: (specificData.credits_increase as number) || 0,
          boost_id: boost.id
        };
      });
  }, [powerBoosts]);

  const handleAddPowerBoost = async () => {
    if (!selectedPowerBoostId) {
      toast({
        description: "Please select a power boost",
        variant: "destructive"
      });
      return false;
    }

    const boost = availablePowerBoosts.find(b => b.id === selectedPowerBoostId);
    if (!boost) {
      toast({
        description: "Selected power boost not found",
        variant: "destructive"
      });
      return false;
    }

    // Check kill cost before proceeding
    if (currentKillCount < editableKillCost) {
      toast({
        description: `Not enough kills. This power boost costs ${editableKillCost} kills but you only have ${currentKillCount}.`,
        variant: "destructive"
      });
      return false;
    }

    // Check if this power boost has effect_selection (modifier selection on parent)
    const specificData = parseTypeSpecificData(boost.type_specific_data);
    const hasModifierSelection = specificData.effect_selection === 'single_select' || specificData.effect_selection === 'multiple_select';

    // If parent has modifier selection, use the already-fetched modifiers and show selection UI
    if (hasModifierSelection && effectTypes.length === 0 && !showEffectSelection) {
      const modifiers = (boost as any).fighter_effect_type_modifiers || [];

      if (modifiers.length > 1) {
        // Convert modifiers to effect type format for FighterEffectSelection
        const modifierAsEffectTypes = modifiers.map((mod: any) => ({
          id: mod.id,
          effect_name: `${mod.stat_name.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}: ${mod.default_numeric_value > 0 ? '+' : ''}${mod.default_numeric_value}`,
          type_specific_data: {
            effect_selection: specificData.effect_selection,
            selection_group: 'modifiers'
          },
          modifiers: [mod]
        }));

        setEffectTypes(modifierAsEffectTypes);
        setShowEffectSelection(true);
        setIsEffectSelectionValid(false);
        return false; // Keep modal open, show selection
      }
    }

    // Pre-check: fetch child effect types for this power boost (if any)
    if (!hasModifierSelection && !showEffectSelection && effectTypes.length === 0) {
      try {
        const response = await fetch(`/api/fighter-effects?powerBoostTypeId=${selectedPowerBoostId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch fighter effects');
        }

        const fetchedEffectTypes = await response.json();

        // Check if there are any selectable effects
        const hasSelectableEffects = fetchedEffectTypes?.some((effect: any) =>
          effect.type_specific_data?.effect_selection === 'single_select' ||
          effect.type_specific_data?.effect_selection === 'multiple_select'
        );

        if (hasSelectableEffects) {
          setEffectTypes(fetchedEffectTypes);
          setShowEffectSelection(true);
          setIsEffectSelectionValid(false);
          return false; // Keep modal open, show effect selection
        } else {
          // All effects are fixed, collect them and proceed directly
          const fixedEffects = fetchedEffectTypes
            ?.filter((effect: any) =>
              effect.type_specific_data?.effect_selection === 'fixed' ||
              !effect.type_specific_data?.effect_selection
            )
            .map((effect: any) => effect.id) || [];

          setSelectedEffectIds(fixedEffects);
        }
      } catch (error) {
        console.error('Error checking effects:', error);
        // On error, proceed with power boost to avoid blocking the user
      }
    }

    // Close modal
    handleCloseModal();

    // Trigger mutation with all data passed directly through variables
    addPowerBoostMutation.mutate({
      fighter_id: fighterId,
      power_boost_type_id: selectedPowerBoostId,
      kill_cost: editableKillCost,
      boost_name: boost.effect_name,
      credits_increase: editableCreditsIncrease,
      selected_effect_ids: selectedEffectIds.length > 0 ? selectedEffectIds : undefined
    });

    return true;
  };

  const handleKillCostChange = (value: number) => {
    setEditableKillCost(value);
  };

  const handleCreditsIncreaseChange = (value: number) => {
    setEditableCreditsIncrease(value);
  };

  const handleEffectSelectionComplete = (effectIds: string[]) => {
    setSelectedEffectIds(effectIds);
    setShowEffectSelection(false);
    setEffectTypes([]);

    // Proceed with adding power boost with selected effects
    const boost = availablePowerBoosts.find(b => b.id === selectedPowerBoostId);
    if (boost) {
      // Check if these are modifier IDs or effect type IDs
      const specificData = parseTypeSpecificData(boost.type_specific_data);
      const hasModifierSelection = specificData.effect_selection === 'single_select' || specificData.effect_selection === 'multiple_select';

      // Close the add power boost modal
      handleCloseModal();

      addPowerBoostMutation.mutate({
        fighter_id: fighterId,
        power_boost_type_id: selectedPowerBoostId,
        kill_cost: editableKillCost,
        boost_name: boost.effect_name,
        credits_increase: editableCreditsIncrease,
        // Pass as selected_modifier_ids if parent has modifier selection, otherwise as selected_effect_ids
        ...(hasModifierSelection
          ? { selected_modifier_ids: effectIds }
          : { selected_effect_ids: effectIds }
        )
      });
    }
  };

  const handleEffectSelectionCancel = () => {
    setShowEffectSelection(false);
    setSelectedEffectIds([]);
    setIsEffectSelectionValid(false);
    setEffectTypes([]);
  };

  const handleDeletePowerBoost = (boostId: string, boostName: string) => {
    setDeleteModalData(null);

    // Trigger delete mutation
    deletePowerBoostMutation.mutate({
      fighter_id: fighterId,
      power_boost_id: boostId
    });
  };

  return (
    <>
      <List
        title="Power Boosts"
        items={transformedPowerBoosts}
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '50%'
          },
          {
            key: 'kill_cost',
            label: 'Kills',
            align: 'right',
            width: '25%'
          },
          {
            key: 'credits_increase',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            icon: <LuUndo2 className="h-4 w-4" />,
            title: "Undo",
            variant: 'destructive',
            onClick: (item) => item.boost_id ? setDeleteModalData({
              id: item.boost_id,
              name: item.name
            }) : null,
            disabled: (item) => !item.boost_id || !userPermissions.canEdit
          }
        ]}
        onAdd={handleOpenModal}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No power boosts yet."
      />

      {/* Add Modal */}
      {isAddModalOpen && (
        <Modal
          title="Add Power Boost"
          headerContent={
            <div className="flex items-center">
              <span className="mr-2 text-sm text-muted-foreground">Current Kills</span>
              <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">{currentKillCount}</span>
            </div>
          }
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                  items={availablePowerBoosts}
                  ensureItems={availablePowerBoosts.length === 0 ? fetchAvailablePowerBoosts : undefined}
                  getRange={(boost: FighterEffectType) => {
                    const range = resolvePowerBoostRangeFromUtilByName(boost.effect_name);
                    return range ? { min: range[0], max: range[1] } : null;
                  }}
                  getName={(boost: FighterEffectType) => boost.effect_name}
                  inline
                  rollFn={rollD6}
                  resolveNameForRoll={(roll) => resolvePowerBoostFromUtil(roll)?.name}
                  onRolled={(rolled) => {
                    if (rolled.length > 0) {
                      const match = rolled[0].item;
                      if (match?.id) {
                        setSelectedPowerBoostId(match.id);
                        toast({ description: `Roll ${rolled[0].roll}: ${match.effect_name}` });
                      }
                    }
                  }}
                  onRoll={(roll) => {
                    const result = resolvePowerBoostFromUtil(roll);
                    if (result) {
                      const boost = availablePowerBoosts.find(b => b.effect_name === result.name);
                      if (boost?.id) {
                        setSelectedPowerBoostId(boost.id);
                      }
                    }
                  }}
                />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="powerBoostSelect" className="text-sm font-medium">
                  Power Boosts
                </label>
                <Combobox
                  placeholder="Select power boost"
                  options={availablePowerBoosts
                  .sort((a, b) => {
                    const rankA = powerBoostRank[a.effect_name] ?? 999;
                    const rankB = powerBoostRank[b.effect_name] ?? 999;
                    return rankA - rankB;
                  })
                  .map(boost => {
                    const range = formatPowerBoostRange(boost.effect_name);
                    const displayText = range ? `${range} ${boost.effect_name}` : boost.effect_name;

                    return {
                      value: boost.id || '',
                      label: range ? (
                        <>
                          <span className="text-gray-400 inline-block w-8 text-center mr-1">{range}</span>{boost.effect_name}
                        </>
                      ) : boost.effect_name,
                      displayValue: displayText
                    };
                  })}
                  value={selectedPowerBoostId}
                  onValueChange={(value) => {
                    setSelectedPowerBoostId(value);
                    if (value) {
                      const boost = availablePowerBoosts.find(b => b.id === value);
                      if (boost) {
                        // Set default values from type_specific_data
                        const specificData = parseTypeSpecificData(boost.type_specific_data);
                        setEditableKillCost((specificData.kill_cost as number) || 4);
                        setEditableCreditsIncrease((specificData.credits_increase as number) || 0);
                      }
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Kill Cost
                  </label>
                  <input
                    type="number"
                    value={editableKillCost}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      handleKillCostChange(value);
                    }}
                    className="w-full p-2 border rounded-md"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Credits Increase
                  </label>
                  <input
                    type="number"
                    value={editableCreditsIncrease}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      handleCreditsIncreaseChange(value);
                    }}
                    className="w-full p-2 border rounded-md"
                    min="0"
                  />
                </div>
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleAddPowerBoost}
          confirmText="Add Power Boost"
          confirmDisabled={!selectedPowerBoostId || addPowerBoostMutation.isPending}
        />
      )}

      {/* Effect Selection Modal */}
      {showEffectSelection && (
        <Modal
          title="Power Boost Effects"
          content={
            <FighterEffectSelection
              equipmentId={selectedPowerBoostId}
              effectTypes={effectTypes}
              onSelectionComplete={handleEffectSelectionComplete}
              onCancel={handleEffectSelectionCancel}
              onValidityChange={setIsEffectSelectionValid}
              ref={effectSelectionRef}
            />
          }
          onClose={handleEffectSelectionCancel}
          onConfirm={async () => {
            return await effectSelectionRef.current?.handleConfirm() || false;
          }}
          confirmText="Confirm Selection"
          confirmDisabled={!isEffectSelectionValid}
          width="lg"
        />
      )}

      {/* Delete Modal */}
      {deleteModalData && (
        <Modal
          title="Undo Power Boost"
          content={
            <div>
              <p>Are you sure you want to undo <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p>Kills spent will be refunded.</p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeletePowerBoost(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </>
  );
}
