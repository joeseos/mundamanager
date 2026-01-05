'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { useMutation } from '@tanstack/react-query';
import Modal from '../ui/modal';
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';
import { moveEquipmentToStash } from '@/app/actions/move-to-stash';
import { deleteEquipmentFromFighter, buyEquipmentForFighter, deleteEquipmentEffect } from '@/app/actions/equipment';
import { Button } from "@/components/ui/button";
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2, LuSquarePen } from 'react-icons/lu';
import { TbCornerLeftUp } from 'react-icons/tb';
import { rollD6 } from '@/utils/dice';
import FighterEffectSelection from '@/components/fighter-effect-selection';
import { FighterEffectType, FighterEffect } from '@/types/fighter-effect';
import { applySelfUpgradesToEquipment } from '@/app/actions/equipment';

interface WeaponListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number, deletedEffects?: string[]) => void;
  equipment?: Equipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
  onRegisterPurchase?: (fn: (payload: { params: any; item: Equipment }) => void) => void;
  fighterEffects?: Record<string, FighterEffect[]>;
  onEffectsUpdate?: (updatedEffects: Record<string, FighterEffect[]>) => void;
}

interface SellModalProps {
  item: Equipment;
  onClose: () => void;
  onConfirm: (cost: number) => void;
}

function SellModal({ item, onClose, onConfirm }: SellModalProps) {
  const originalCost = item.cost ?? 0;
  const [manualCost, setManualCost] = useState(originalCost);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const { toast } = useToast();

  const handleRoll = () => {
    const r = rollD6();
    setLastRoll(r);
    const deduction = r * 10;
    const final = Math.max(0, originalCost - deduction);
    setManualCost(final);
    toast({ description: `Roll ${r}: -${deduction} → ${final} credits` });
  };

  return (
    <Modal
      title="Confirm Sale"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to sell {item.equipment_name}?</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRoll}
              className="px-3 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              Roll D6
            </button>
            {lastRoll !== null && (
              <div className="text-sm">
                {`Roll ${lastRoll}: -${lastRoll * 10} → ${Math.max(0, originalCost - lastRoll * 10)} credits`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Cost
              </label>
              <input
                type="number"
                value={manualCost}
                onChange={(e) => setManualCost(Number(e.target.value))}
                className="w-full p-2 border rounded-md"
                min={0}
              />
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={() => { onConfirm(Number(manualCost) || 0); return true; }}
    />
  );
}

export function WeaponList({
  fighterId,
  gangId,
  gangCredits,
  fighterCredits,
  onEquipmentUpdate,
  equipment = [],
  onAddEquipment,
  userPermissions,
  onRegisterPurchase,
  fighterEffects = {},
  onEffectsUpdate
}: WeaponListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<Equipment | null>(null);
  const [stashModalData, setStashModalData] = useState<Equipment | null>(null);
  const [upgradeModalData, setUpgradeModalData] = useState<Equipment | null>(null);
  const [upgradeEffectTypes, setUpgradeEffectTypes] = useState<FighterEffectType[]>([]);
  const [loadingEffects, setLoadingEffects] = useState(false);
  const [isUpgradeValid, setIsUpgradeValid] = useState(false);
  const [deleteEffectModalData, setDeleteEffectModalData] = useState<{ effectId: string; fighterEquipmentId: string; effectName: string } | null>(null);
  const effectSelectionRef = React.useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] }>(null);

  // Optimistic purchase mutation wired from here; modal delegates via onPurchaseRequest
  const purchaseMutation = {
    mutate: async ({ params, item }: { params: any; item: Equipment }) => {
      // Snapshot state for rollback
      const previousEquipment = [...equipment];
      const previousFighterCredits = fighterCredits;
      const previousGangCredits = gangCredits;

      // Compute optimistic rating cost guess
      const isWeapon = item.equipment_type === 'weapon';
      const isMaster = Boolean(params.master_crafted && isWeapon);
      const useBaseForRating = Boolean(params.use_base_cost_for_rating);
      const baseForRating = item.adjusted_cost ?? item.cost ?? 0;
      const appliedRatingCost = useBaseForRating ? baseForRating : (params.manual_cost || baseForRating);
      const ratingCostGuess = isMaster
        ? Math.ceil((appliedRatingCost * 1.25) / 5) * 5
        : appliedRatingCost;

      // Apply optimistic UI update: add temp item and adjust credits
      const tempId = `temp-${Date.now()}`;
      const optimisticEquipment: Equipment = {
        ...item,
        fighter_equipment_id: tempId,
        cost: ratingCostGuess,
        is_master_crafted: isMaster ? true : item.is_master_crafted,
        target_equipment_id: params?.equipment_target?.target_equipment_id || params?.target_equipment_id || item.target_equipment_id,
      } as Equipment;

      try {
        // Optimistically update UI
        onEquipmentUpdate(
          [...previousEquipment, optimisticEquipment],
          previousFighterCredits + ratingCostGuess,
          previousGangCredits - (params.manual_cost || 0)
        );

        // Execute server action (authoritative; triggers server cache-tags)
        const result = await buyEquipmentForFighter(params);
        if (!result.success) {
          throw new Error(result.error || 'Failed to buy equipment');
        }

        const data = result.data;
        const newGangCredits = data?.updategangsCollection?.records?.[0]?.credits ?? previousGangCredits;
        const serverRatingCost = data?.rating_cost ?? ratingCostGuess;
        const newEquipmentId = data?.insertIntofighter_equipmentCollection?.records?.[0]?.id;

        // Replace temp with real item and reconcile credits
        const updated = [...previousEquipment, {
          ...item,
          fighter_equipment_id: newEquipmentId || tempId,
          cost: serverRatingCost,
          is_master_crafted: Boolean(data?.insertIntofighter_equipmentCollection?.records?.[0]?.is_master_crafted) || isMaster,
          target_equipment_id: params?.equipment_target?.target_equipment_id || params?.target_equipment_id || item.target_equipment_id,
        } as Equipment];

        onEquipmentUpdate(updated, previousFighterCredits + serverRatingCost, newGangCredits);

        toast({
          title: 'Equipment purchased',
          description: `Successfully bought ${item.equipment_name} for ${params.manual_cost || serverRatingCost} credits`,
          variant: 'default'
        });

        // Target selection handled pre-purchase via the existing purchase modal flow
      } catch (err) {
        // Rollback
        onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
        toast({
          description: err instanceof Error ? err.message : 'Failed to buy equipment',
          variant: 'destructive'
        });
      }
    }
  };

  // Register purchase handler for parent (so ItemModal can delegate and close immediately)
  useEffect(() => {
    if (onRegisterPurchase) {
      onRegisterPurchase((payload) => purchaseMutation.mutate(payload));
    }
  }, [onRegisterPurchase, equipment, fighterCredits, gangCredits]);

  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      // Find the equipment before deleting
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToDelete) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits
      const optimisticEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      const optimisticFighterCredits = previousFighterCredits - (equipmentToDelete.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

      // Execute server action
      const result = await deleteEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        gang_id: gangId,
        fighter_id: fighterId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete equipment');
      }

      // Reconcile with server-provided fighter total cost if available
      const serverFighterTotal = result.data?.updatedFighterTotalCost as number | null | undefined;
      const finalFighterCredits = typeof serverFighterTotal === 'number' 
        ? serverFighterTotal 
        : optimisticFighterCredits;

      onEquipmentUpdate(optimisticEquipment, finalFighterCredits, previousGangCredits);

      toast({
        description: `Successfully deleted ${equipmentToDelete.equipment_name}`,
        variant: "default"
      });
      setDeleteModalData(null);
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error deleting equipment:', error);
      toast({
        description: 'Failed to delete equipment. Please try again.',
        variant: "destructive"
      });
    }
  };

  const handleSellEquipment = async (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      const equipmentToSell = equipment.find(
        item => item.fighter_equipment_id === fighterEquipmentId
      );
      if (!equipmentToSell) throw new Error('Equipment not found');

      // Optimistic UI: remove item, adjust fighter and gang credits
      const optimisticEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const optimisticFighterCredits = previousFighterCredits - (equipmentToSell.cost ?? 0);
      const optimisticGangCredits = previousGangCredits + (manualCost || 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, optimisticGangCredits);

      // Server action
      const result = await sellEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        manual_cost: manualCost
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to sell equipment');
      }

      const reconciledGangCredits = result.data?.gang?.credits ?? optimisticGangCredits;
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, reconciledGangCredits);
      
      toast({
        title: "Success",
        description: `Sold ${equipmentToSell.equipment_name} for ${manualCost || 0} credits`,
      });
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error selling equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sell equipment",
        variant: "destructive",
      });
    } finally {
      setSellModalData(null);
    }
  };

  const handleStashEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      // Find the equipment before moving to stash
      const equipmentToStash = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToStash) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits (gang credits unchanged)
      const optimisticEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const optimisticFighterCredits = previousFighterCredits - (equipmentToStash.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

      // Server action
      const result = await moveEquipmentToStash({
        fighter_equipment_id: fighterEquipmentId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to move equipment to stash');
      }

      toast({
        title: "Success",
        description: `${equipmentToStash.equipment_name} moved to gang stash`,
      });
    } catch (error) {
      // Rollback on error
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error moving equipment to stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    } finally {
      setStashModalData(null);
    }
  };

  // Separate equipment into parent items (equipment that targets fighters/vehicles) and child items (equipment targeting other equipment)
  const parentEquipment = equipment.filter(item => !item.target_equipment_id);
  const childEquipment = equipment.filter(item => item.target_equipment_id);

  // Sort parent equipment: core equipment first, then by name
  const sortedParentEquipment = [...parentEquipment].sort((a, b) => {
    if (a.core_equipment && !b.core_equipment) return -1;
    if (!a.core_equipment && b.core_equipment) return 1;
    return a.equipment_name.localeCompare(b.equipment_name);
  });

  // Build a tree structure: map parent equipment IDs to their child equipment
  const equipmentTree = new Map<string, Equipment[]>();
  childEquipment.forEach(child => {
    const parentId = child.target_equipment_id!;
    if (!equipmentTree.has(parentId)) {
      equipmentTree.set(parentId, []);
    }
    equipmentTree.get(parentId)!.push(child);
  });

  // Sort children within each parent group
  equipmentTree.forEach((children) => {
    children.sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
  });

  // Filter parent equipment by type
  const weapons = sortedParentEquipment.filter(item => item.equipment_type === 'weapon');
  const wargear = sortedParentEquipment.filter(item => item.equipment_type === 'wargear');
  const vehicleUpgrades = sortedParentEquipment.filter(item => item.equipment_type === 'vehicle_upgrade');

  // Handle opening upgrade modal and fetching effect types
  const handleOpenUpgradeModal = async (item: Equipment) => {
    setUpgradeModalData(item);
    setLoadingEffects(true);

    try {
      const response = await fetch(`/api/fighter-effects?equipmentId=${item.equipment_id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch effects');
      }
      const effectTypes = await response.json();
      // Filter to only show editable effects (is_editable: true in type_specific_data)
      const editableEffects = effectTypes.filter((et: any) =>
        et.type_specific_data?.is_editable === true
      );
      setUpgradeEffectTypes(editableEffects);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to load effect options',
        variant: 'destructive'
      });
      setUpgradeModalData(null);
    } finally {
      setLoadingEffects(false);
    }
  };

  // TanStack Query mutation for applying effects with optimistic updates
  const applyEffectMutation = useMutation({
    mutationFn: async (variables: {
      selectedEffectIds: string[];
      equipmentData: Equipment;
      effectTypesData: FighterEffectType[];
    }) => {
      // Apply all effects in a single batch call
      const result = await applySelfUpgradesToEquipment({
        fighter_equipment_id: variables.equipmentData.fighter_equipment_id,
        effect_type_ids: variables.selectedEffectIds,
        fighter_id: fighterId,
        gang_id: gangId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply effects');
      }

      return { success: true };
    },
    onMutate: async (variables) => {
      const { equipmentData, effectTypesData, selectedEffectIds } = variables;

      // Store previous state for rollback
      const previousEquipment = [...equipment];
      const previousFighterCredits = fighterCredits;
      const previousGangCredits = gangCredits;
      const previousFighterEffects = { ...fighterEffects };

      // Build optimistic effect data from selected effects
      const selectedEffects = effectTypesData.filter(et => selectedEffectIds.includes(et.id));

      // Apply optimistic update: add effect_names to equipment
      const optimisticEquipment = equipment.map(item => {
        if (item.fighter_equipment_id === equipmentData.fighter_equipment_id) {
          const existingEffectNames = item.effect_names || [];
          const newEffectNames = selectedEffects.map(e => e.effect_name);
          const combinedEffectNames = [...existingEffectNames, ...newEffectNames];

          return {
            ...item,
            effect_names: combinedEffectNames
          };
        }
        return item;
      });

      // Build optimistic FighterEffect objects and add to fighterEffects
      const newEffects: FighterEffect[] = selectedEffects.map((effect, index) => ({
        id: `temp-${Date.now()}-${index}`,
        effect_name: effect.effect_name,
        fighter_equipment_id: equipmentData.fighter_equipment_id,
        fighter_effect_type_id: effect.id,
        fighter_effect_modifiers: [],
        type_specific_data: effect.type_specific_data ?? undefined
      }));

      // Add new effects to 'equipment' category (or create it)
      const updatedFighterEffects = {
        ...fighterEffects,
        equipment: [...(fighterEffects.equipment || []), ...newEffects]
      };

      // Calculate total credits increase from selected effects
      const totalCreditsIncrease = selectedEffects.reduce((sum, effect) => {
        const creditsIncrease = effect.type_specific_data?.credits_increase;
        return sum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
      }, 0);

      // Apply optimistic updates
      onEquipmentUpdate(optimisticEquipment, previousFighterCredits + totalCreditsIncrease, previousGangCredits);
      if (onEffectsUpdate) {
        onEffectsUpdate(updatedFighterEffects);
      }

      // Return context for rollback
      return {
        previousEquipment,
        previousFighterCredits,
        previousGangCredits,
        previousFighterEffects
      };
    },
    onSuccess: (_data, variables) => {
      const selectedEffects = variables.effectTypesData.filter(et => variables.selectedEffectIds.includes(et.id));
      const effectName = selectedEffects[0]?.effect_name || 'Effect';
      toast({
        description: `${effectName} added successfully`
      });
    },
    onError: (error, _variables, context) => {
      // Rollback to previous state on error
      if (context) {
        onEquipmentUpdate(
          context.previousEquipment,
          context.previousFighterCredits,
          context.previousGangCredits
        );
        if (onEffectsUpdate && context.previousFighterEffects) {
          onEffectsUpdate(context.previousFighterEffects);
        }
      }

      toast({
        description: error instanceof Error ? error.message : 'Failed to apply effects',
        variant: 'destructive'
      });
    }
  });

  // Handle confirm - close modal and fire mutation directly (like skills pattern)
  const handleConfirmEffects = () => {
    if (!effectSelectionRef.current?.isValid() || !upgradeModalData) {
      return false;
    }

    // Get selected effects directly from ref
    const selectedEffectIds = effectSelectionRef.current.getSelectedEffects();
    if (selectedEffectIds.length === 0) return false;

    // Store data for mutation before clearing state
    const equipmentData = upgradeModalData;
    const effectTypesData = upgradeEffectTypes;

    // Close modal immediately for instant UX feedback
    setUpgradeModalData(null);
    setUpgradeEffectTypes([]);
    setIsUpgradeValid(false);

    // Fire mutation directly (like skills does) - onMutate runs synchronously
    applyEffectMutation.mutate({
      selectedEffectIds,
      equipmentData,
      effectTypesData
    });

    return true;
  };

  // Mutation for deleting equipment effects with optimistic update
  const deleteEffectMutation = useMutation({
    mutationFn: async (params: { effectId: string; fighterEquipmentId: string; effectName: string }) => {
      const result = await deleteEquipmentEffect({
        effect_id: params.effectId,
        fighter_id: fighterId,
        gang_id: gangId,
        fighter_equipment_id: params.fighterEquipmentId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete effect');
      }
      return result;
    },
    onMutate: async (params) => {
      // Snapshot previous state
      const previousEquipment = [...equipment];
      const previousFighterEffects = { ...fighterEffects };

      // Optimistically remove the effect_name from the equipment
      const updatedEquipment = equipment.map(item => {
        if (item.fighter_equipment_id === params.fighterEquipmentId) {
          return {
            ...item,
            effect_names: (item.effect_names || []).filter(name => name !== params.effectName)
          };
        }
        return item;
      });

      // Optimistically remove the effect from fighterEffects
      const updatedFighterEffects: Record<string, FighterEffect[]> = {};
      for (const [category, effects] of Object.entries(fighterEffects)) {
        updatedFighterEffects[category] = effects.filter(e => e.id !== params.effectId);
      }

      onEquipmentUpdate(updatedEquipment, fighterCredits, gangCredits);
      if (onEffectsUpdate) {
        onEffectsUpdate(updatedFighterEffects);
      }

      return { previousEquipment, previousFighterEffects };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousEquipment) {
        onEquipmentUpdate(context.previousEquipment, fighterCredits, gangCredits);
      }
      if (context?.previousFighterEffects && onEffectsUpdate) {
        onEffectsUpdate(context.previousFighterEffects);
      }
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete effect',
        variant: 'destructive'
      });
    },
    onSuccess: (_data, params) => {
      toast({
        description: `${params.effectName} removed successfully`
      });
    }
  });

  const handleConfirmDeleteEffect = () => {
    if (!deleteEffectModalData) return;

    // Close modal immediately for instant UX
    setDeleteEffectModalData(null);

    // Fire mutation
    deleteEffectMutation.mutate({
      effectId: deleteEffectModalData.effectId,
      fighterEquipmentId: deleteEffectModalData.fighterEquipmentId,
      effectName: deleteEffectModalData.effectName
    });
  };

  const renderRow = (item: Equipment, isChild: boolean = false) => (
    <tr
      key={item.fighter_equipment_id || `${item.equipment_id}-${item.equipment_name}`}
      className={isChild ? "border-b bg-muted/20" : "border-b"}
    >
      <td className="px-1 py-1">
        {isChild && <span className="text-muted-foreground mr-1" style={{ position: 'relative', top: '-4px' }}><TbCornerLeftUp className="inline" /></span>}
        <span className={isChild ? "text-sm" : ""}>{item.equipment_name}</span>
      </td>
      <td className="px-1 py-1 text-right">
        <span className={isChild ? "text-sm" : ""}>{item.cost ?? '-'}</span>
      </td>
      <td className="px-1 py-1">
        <div className="flex justify-end gap-1">
          {item.is_editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenUpgradeModal(item)}
              disabled={isLoading || !userPermissions.canEdit}
              className="text-xs px-1.5 h-6"
              title="Edit Equipment"
            >
              <LuSquarePen className="h-4 w-4" />
            </Button>
          )}
          {!item.core_equipment && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStashModalData(item);
                }}
                disabled={isLoading || !userPermissions.canEdit}
                className="text-xs px-1.5 h-6"
                title="Store in Stash"
              >
                <FaBox className="h-4 w-4" /> {/* Stash */}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSellModalData(item);
                }}
                disabled={isLoading || !userPermissions.canEdit}
                className="text-xs px-1.5 h-6"
                title="Sell"
              >
                <MdCurrencyExchange className="h-4 w-4" /> {/* Sell */}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  // Render equipment effects as pseudo-child rows (only if they target equipment, not fighter stats)
  const renderEffectRows = (item: Equipment) => {
    // Get all effects from fighterEffects and filter by fighter_equipment_id
    const allEffects = Object.values(fighterEffects).flat();
    const equipmentEffects = allEffects.filter(
      (e) => e.fighter_equipment_id === item.fighter_equipment_id
    );

    if (equipmentEffects.length === 0) return null;

    return equipmentEffects.map((effect) => {
      // Only show effect under equipment if it actually targets equipment (weapon profiles)
      const typeData = typeof effect.type_specific_data === 'string'
        ? null
        : effect.type_specific_data;
      const appliesToEquipment = typeof typeData === 'object' && typeData?.applies_to === 'equipment';

      if (!appliesToEquipment) return null;

      return (
        <tr
          key={`${item.fighter_equipment_id}-effect-${effect.id}`}
          className="border-b bg-muted/20"
        >
          <td className="px-1 py-1">
            <span className="text-muted-foreground mr-1" style={{ position: 'relative', top: '-4px' }}>
              <TbCornerLeftUp className="inline" />
            </span>
            <span className="text-sm">
              {effect.effect_name}
            </span>
          </td>
          <td className="px-1 py-1 text-right">
            <span className="text-sm">
              {typeof typeData === 'object' && typeData?.credits_increase != null
                ? typeData.credits_increase
                : '-'}
            </span>
          </td>
          <td className="px-1 py-1">
            <div className="flex justify-end gap-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteEffectModalData({
                    effectId: effect.id,
                    fighterEquipmentId: item.fighter_equipment_id,
                    effectName: effect.effect_name
                  });
                }}
                disabled={isLoading || !userPermissions.canEdit || deleteEffectMutation.isPending}
                className="text-xs px-1.5 h-6"
                title="Delete"
              >
                <LuTrash2 className="h-4 w-4" />
              </Button>
            </div>
          </td>
        </tr>
      );
    });
  };

  // Helper to render a parent item, its effects (if any), and its children
  const renderItemWithChildren = (item: Equipment) => {
    const children = equipmentTree.get(item.fighter_equipment_id) || [];
    return (
      <React.Fragment key={item.fighter_equipment_id}>
        {renderRow(item, false)}
        {renderEffectRows(item)}
        {children.map(child => renderRow(child, true))}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-secondary animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4">
        <div className="flex flex-wrap justify-between items-center mb-2">
          <h2 className="text-xl md:text-2xl font-bold">Equipment</h2>
          <Button 
            onClick={onAddEquipment}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
            disabled={isLoading || !userPermissions.canEdit}
          >
            Add
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(equipment?.length > 0) && (
              <thead>
                <tr className="bg-muted">
                  <th className="px-1 py-1 text-left w-[75%]">Name</th>
                  <th className="px-1 py-1 text-right">Cost</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {!equipment?.length ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground italic text-center py-4">
                    No equipment yet.
                  </td>
                </tr>
              ) : (
                <>
                  {weapons.map(renderItemWithChildren)}
                  {vehicleUpgrades.length > 0 && weapons.length > 0 && (
                    <tr>
                      <td colSpan={3} className="p-0 border-t-8 border-muted" />
                    </tr>
                  )}
                  {vehicleUpgrades.map(renderItemWithChildren)}
                  {wargear.length > 0 && (weapons.length > 0 || vehicleUpgrades.length > 0) && (
                    <tr>
                      <td colSpan={3} className="p-0 border-t-8 border-muted" />
                    </tr>
                  )}
                  {wargear.map(renderItemWithChildren)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteModalData && (
        <Modal
          title="Delete Equipment"
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
          onConfirm={() => { void handleDeleteEquipment(deleteModalData.id, deleteModalData.equipmentId); return true; }}
        />
      )}

      {sellModalData && (
        <SellModal
          item={sellModalData}
          onClose={() => setSellModalData(null)}
          onConfirm={(manualCost) => { void handleSellEquipment(
            sellModalData.fighter_equipment_id,
            sellModalData.equipment_id,
            manualCost
          ); }}
        />
      )}

      {stashModalData && (
        <Modal
          title="Move to Gang Stash"
          content={`Are you sure you want to move ${stashModalData.equipment_name} to the gang stash?`}
          onClose={() => setStashModalData(null)}
          onConfirm={() => { void handleStashEquipment(
            stashModalData.fighter_equipment_id,
            stashModalData.equipment_id
          ); return true; }}
        />
      )}

      {upgradeModalData && (
        <Modal
          title={`Edit: ${upgradeModalData.equipment_name}`}
          helper="Select effects to apply to this equipment"
          onClose={() => {
            setUpgradeModalData(null);
            setUpgradeEffectTypes([]);
            setIsUpgradeValid(false);
          }}
          onConfirm={handleConfirmEffects}
          confirmDisabled={!isUpgradeValid}
          width="lg"
        >
          {loadingEffects ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
          ) : upgradeEffectTypes.length === 0 ? (
            <div className="p-4">
              <p className="text-muted-foreground italic text-center py-8">
                No effects available for this equipment.
              </p>
            </div>
          ) : (
            <FighterEffectSelection
              ref={effectSelectionRef}
              equipmentId={upgradeModalData.equipment_id}
              effectTypes={upgradeEffectTypes}
              onSelectionComplete={() => {}}
              onCancel={() => {
                setUpgradeModalData(null);
                setUpgradeEffectTypes([]);
                setIsUpgradeValid(false);
              }}
              onValidityChange={setIsUpgradeValid}
            />
          )}
        </Modal>
      )}

      {deleteEffectModalData && (
        <Modal
          title="Delete Effect"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteEffectModalData.effectName}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteEffectModalData(null)}
          onConfirm={handleConfirmDeleteEffect}
        />
      )}
    </>
  );
}
