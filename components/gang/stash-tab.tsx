'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { createClient } from "@/utils/supabase/client";
import { FighterProps, Vehicle } from '@/types/fighter';
import { StashItem } from '@/types/gang';
import { Session } from '@supabase/supabase-js';
import { VehicleProps } from '@/types/vehicle';
import { vehicleExclusiveCategories, vehicleCompatibleCategories } from '@/utils/vehicleEquipmentCategories';
import ChemAlchemyCreator from './chem-alchemy';
import { createChemAlchemy } from '@/app/actions/chem-alchemy';
import ItemModal from '@/components/equipment/equipment';
import type { GangCampaignResource } from '@/app/lib/shared/gang-data';
import Modal from '@/components/ui/modal';
import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';
import { moveEquipmentFromStash, type MoveFromStashItemResult } from '@/app/actions/move-from-stash';
import { deleteEquipmentFromStash } from '@/app/actions/equipment';
import { sellEquipmentFromStash } from '@/app/actions/sell-equipment';
import { MdCurrencyExchange, MdChair } from 'react-icons/md';
import { IoSkull } from 'react-icons/io5';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { TbMeatOff } from 'react-icons/tb';
import { FaMedkit } from 'react-icons/fa';
import { Combobox } from '@/components/ui/combobox';
import { SellConfirmModal } from '@/components/equipment/sell-confirm-modal';
import { Tooltip } from 'react-tooltip';
import { UserPermissions } from '@/types/user-permissions';
import FighterEffectSelection from '@/components/fighter-effect-selection';
import { applyWeaponModifiers } from '@/utils/effect-modifiers';
import { sortFightersByPositioning } from '@/utils/fighter-positioning';

interface GangInventoryProps {
  stash: StashItem[];
  fighters: FighterProps[];
  title?: string;
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps, skipRatingUpdate?: boolean) => void;
  onVehicleUpdate?: (updatedVehicles: VehicleProps[]) => void;
  vehicles?: VehicleProps[];
  gangTypeId?: string;
  gangId: string;
  gangCredits: number;
  onGangCreditsUpdate?: (newCredits: number) => void;
  onGangRatingUpdate?: (newRating: number) => void;
  onGangWealthUpdate?: (newWealth: number) => void;
  userPermissions?: UserPermissions;
  campaignTradingPostIds?: string[];
  campaignTradingPostNames?: string[];
  campaignCustomTradingPostIds?: string[];
  campaignCustomTradingPostNames?: string[];
  campaignGangId?: string;
  gangCampaignResources?: GangCampaignResource[];
  gangReputation?: number;
  positioning?: Record<number, string>;
}

export default function GangInventory({
  stash: initialStash,
  fighters: initialFighters,
  title = 'Gang Stash',
  onStashUpdate,
  onFighterUpdate,
  onVehicleUpdate,
  vehicles = [],
  gangTypeId,
  gangId,
  gangCredits,
  onGangCreditsUpdate,
  onGangRatingUpdate,
  onGangWealthUpdate,
  userPermissions,
  campaignTradingPostIds,
  campaignTradingPostNames,
  campaignCustomTradingPostIds,
  campaignCustomTradingPostNames,
  campaignGangId,
  gangCampaignResources,
  gangReputation,
  positioning
}: GangInventoryProps) {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [stash, setStash] = useState<StashItem[]>(initialStash);
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const [showChemAlchemy, setShowChemAlchemy] = useState(false);
  const [showTradingPost, setShowTradingPost] = useState(false);
  const [sellModalItemIdx, setSellModalItemIdx] = useState<number | null>(null);
  const [deleteModalIdx, setDeleteModalIdx] = useState<number | null>(null);
  
  
  // Effect selection modal state
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [effectModalTypes, setEffectModalTypes] = useState<any[]>([]);
  const [effectModalStashIdx, setEffectModalStashIdx] = useState<number | null>(null);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] } | null>(null);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const effectResolveRef = useRef<((ids: string[] | null) => void) | null>(null);

  // Target weapon selection modal state (for equipment upgrades)
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetModalEffectTypeId, setTargetModalEffectTypeId] = useState<string | null>(null);
  const [targetModalEffectName, setTargetModalEffectName] = useState<string | null>(null);
  const [targetModalStashIdx, setTargetModalStashIdx] = useState<number | null>(null);
  const targetSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] } | null>(null);
  const [isTargetSelectionValid, setIsTargetSelectionValid] = useState(false);
  const targetResolveRef = useRef<((targetId: string | null) => void) | null>(null);
  const [pendingBatchWeapons, setPendingBatchWeapons] = useState<{ id: string; name: string; equipment_category?: string }[]>([]);
  const stashRef = useRef<StashItem[]>(stash);
  useEffect(() => {
    stashRef.current = stash;
  });

  // TanStack Query mutation for chem-alchemy with optimistic update
  const createChemMutation = useMutation({
    mutationFn: async (chem: {
      type: 'stimm' | 'gaseous' | 'toxic';
      effects: { name: string; cost: number }[];
      totalCost: number;
      name: string;
      useBaseCostForRating: boolean;
      baseCost: number;
    }) => {
      const result = await createChemAlchemy({
        name: chem.name,
        type: chem.type,
        effects: chem.effects,
        totalCost: chem.totalCost,
        gangId,
        useBaseCostForRating: chem.useBaseCostForRating,
        baseCost: chem.baseCost
      });
      if (!result.success) throw new Error(result.error || 'Failed to create elixir');
      return result.data;
    },
    onMutate: async (chem) => {
      const previousStash = [...stash];
      const previousCredits = gangCredits;
      const tempId = `temp-${Date.now()}`;
      const newStashItem: StashItem = {
        id: tempId,
        cost: chem.totalCost,
        type: 'equipment',
        equipment_name: chem.name,
        equipment_type: 'wargear',
        equipment_category: 'Chem-Alchemy'
      };
      const newStash = [...stash, newStashItem];
      const newCredits = gangCredits - chem.totalCost;
      setStash(newStash);
      onStashUpdate?.(newStash);
      onGangCreditsUpdate?.(newCredits);
      return { previousStash, previousCredits, tempId };
    },
    onError: (error, _chem, context) => {
      if (context) {
        setStash(context.previousStash);
        onStashUpdate?.(context.previousStash);
        onGangCreditsUpdate?.(context.previousCredits);
      }
      toast.error('Error', { description: error instanceof Error ? error.message : 'Failed to create elixir' });
    },
    onSuccess: (data, chem, context) => {
      // Replace optimistic temp item with real server item so move/sell/delete work
      if (data?.stashItem?.id && context?.tempId) {
        const realStashItem: StashItem = {
          id: data.stashItem.id,
          cost: data.stashItem.purchase_cost ?? chem.totalCost,
          type: 'equipment',
          equipment_name: chem.name,
          equipment_type: 'wargear',
          equipment_category: 'Chem-Alchemy',
          custom_equipment_id: data.stashItem.custom_equipment_id
        };
        const prev = stashRef.current;
        const next = prev.map(item => item.id === context.tempId ? realStashItem : item);
        setStash(next);
        queueMicrotask(() => onStashUpdate?.(next));
      }
      toast.success('Elixir Created', { description: `${chem.name} created with ${chem.effects.length} effects for ${chem.totalCost} credits` });
    }
  });
  
  const isVehicleExclusive = (item: StashItem) => 
    vehicleExclusiveCategories.includes(item.equipment_category || '');
    
  const isVehicleCompatible = (item: StashItem) => 
    vehicleCompatibleCategories.includes(item.equipment_category || '');

  useEffect(() => {
    const getSession = async () => {
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    getSession();
  }, []);

  const getItemName = (item: StashItem): string => {
    const baseName = item.vehicle_name || item.equipment_name || 'Unknown Item';
    return baseName;
  };

  const isVehicle = (item: StashItem): boolean => item.type === 'vehicle';
  
  // Update isCrew to handle undefined
  const isCrew = (fighter: FighterProps | undefined): boolean => 
    fighter?.fighter_class === 'Crew';

  const findFighter = (id: string): FighterProps | undefined => 
    fighters.find(f => f.id === id);

  // Prompt user to select effects; returns selected IDs or null on cancel
  const promptEffectSelection = (_equipmentId: string, effectTypes: any[], stashIdx: number) => {
    setEffectModalTypes(effectTypes);
    setEffectModalStashIdx(stashIdx);
    setIsEffectSelectionValid(false);
    setEffectModalOpen(true);
    return new Promise<string[] | null>((resolve) => {
      effectResolveRef.current = resolve;
    });
  };

  // Prompt user to select target weapon; returns target equipment ID or null on cancel
  const promptTargetSelection = (
    effectTypeId: string,
    effectName: string | undefined,
    stashIdx: number,
    batchWeapons?: { id: string; name: string; equipment_category?: string }[]
  ) => {
    setPendingBatchWeapons(batchWeapons || []);
    setTargetModalEffectTypeId(effectTypeId);
    setTargetModalEffectName(effectName || null);
    setTargetModalStashIdx(stashIdx);
    setIsTargetSelectionValid(false);
    setTargetModalOpen(true);
    return new Promise<string | null>((resolve) => {
      targetResolveRef.current = resolve;
    });
  };

  const handleItemToggle = (index: number, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, index]);
    } else {
      setSelectedItems(prev => prev.filter(i => i !== index));
    }
  };

  const handleMoveToFighter = async () => {
    if (selectedItems.length === 0 || !selectedFighter || !session) return;

    setIsLoading(true);
    let rollbackStash: StashItem[] | null = null;
    let rollbackFighters: FighterProps[] | null = null;
    let rollbackVehicles: VehicleProps[] | null = null;
    let rollbackTargetId: string | null = null;
    try {
      const isVehicleTarget = selectedFighter.startsWith('vehicle-');
      const targetId = isVehicleTarget ? selectedFighter.replace('vehicle-', '') : selectedFighter;

      // Phase 1: Snapshot items by value and prefetch effects in parallel
      const items = selectedItems.map(i => ({ ...stash[i], originalIndex: i }));

      const effectsMap = new Map<string, any[]>();
      await Promise.all(
        items
          .filter(item => item.type === 'equipment' && item.equipment_id && !item.custom_equipment_id)
          .map(async (item) => {
            try {
              const resp = await fetch(`/api/fighter-effects?equipmentId=${item.equipment_id}`);
              if (resp.ok) {
                effectsMap.set(item.id, await resp.json());
              }
            } catch (e) {
              // If fetch fails, item proceeds without effects
            }
          })
      );

      // Phase 2: Collect user configurations via modals (no server writes)
      interface ItemConfig {
        stashItem: StashItem & { originalIndex: number };
        selectedEffectIds?: string[];
        equipmentTarget?: { target_equipment_id: string; effect_type_id: string };
      }

      const configurations: ItemConfig[] = [];
      const pendingBatchWeapons = items
        .filter(item => item.equipment_type === 'weapon')
        .map(item => ({
          id: item.id,
          name: item.equipment_name || '',
          equipment_category: item.equipment_category
        }));
      let cancelledByUser = false;

      for (const item of items) {
        const effectTypes = effectsMap.get(item.id);
        let selectedEffectIds: string[] | undefined;
        let equipmentTarget: { target_equipment_id: string; effect_type_id: string } | undefined;

        if (effectTypes && effectTypes.length > 0) {
          const equipmentUpgrade = effectTypes.find((e: any) =>
            e?.type_specific_data?.applies_to === 'equipment'
          );
          const fighterEffects = effectTypes.filter((e: any) =>
            e?.type_specific_data?.applies_to !== 'equipment'
          );

          if (equipmentUpgrade && !isVehicleTarget) {
            const targetWeaponId = await promptTargetSelection(
              equipmentUpgrade.id,
              equipmentUpgrade.effect_name,
              item.originalIndex,
              pendingBatchWeapons
            );
            if (targetWeaponId) {
              equipmentTarget = {
                target_equipment_id: targetWeaponId,
                effect_type_id: equipmentUpgrade.id
              };
            } else {
              cancelledByUser = true;
              break;
            }
          }

          const hasSelectableFighterEffects = fighterEffects?.some((e: any) =>
            e?.type_specific_data?.effect_selection === 'single_select' ||
            e?.type_specific_data?.effect_selection === 'multiple_select'
          );

          if (hasSelectableFighterEffects) {
            const chosen = await promptEffectSelection(item.equipment_id!, fighterEffects, item.originalIndex);
            if (chosen && chosen.length > 0) {
              selectedEffectIds = chosen;
            } else {
              cancelledByUser = true;
              break;
            }
          }
        }

        configurations.push({ stashItem: item, selectedEffectIds, equipmentTarget });
      }

      if (cancelledByUser) {
        return;
      }

      // Phase 3: Apply optimistic UI immediately, then fire server call
      rollbackStash = [...stash];
      rollbackFighters = [...fighters];
      rollbackVehicles = vehicles ? [...vehicles] : null;
      rollbackTargetId = targetId;

      // Optimistically remove items from stash and add to fighter/vehicle
      const movedIndices = configurations.map(c => c.stashItem.originalIndex);
      const newStash = stash.filter((_, index) => !movedIndices.includes(index));
      setStash(newStash);
      onStashUpdate?.(newStash);
      setSelectedItems([]);
      setSelectedFighter('');

      // Build optimistic fighter/vehicle update (using stash IDs as temp equipment IDs)
      if (!isVehicleTarget) {
        const currentFighter = fighters.find(f => f.id === targetId);
        if (currentFighter) {
          let optimisticFighter = { ...currentFighter };
          for (const config of configurations) {
            const item = config.stashItem;
            optimisticFighter = {
              ...optimisticFighter,
              credits: optimisticFighter.credits + (item.cost || 0),
              weapons: item.equipment_type === 'weapon'
                ? [
                    ...(optimisticFighter.weapons || []),
                    {
                      weapon_name: item.equipment_name || '',
                      weapon_id: item.equipment_id || item.id,
                      cost: item.cost || 0,
                      fighter_weapon_id: item.id,
                      weapon_profiles: [],
                      is_master_crafted: false
                    }
                  ]
                : optimisticFighter.weapons || [],
              wargear: item.equipment_type === 'wargear'
                ? [
                    ...(optimisticFighter.wargear || []),
                    {
                      wargear_name: item.equipment_name || '',
                      wargear_id: item.equipment_id || item.id,
                      cost: item.cost || 0,
                      fighter_weapon_id: item.id,
                      is_master_crafted: false
                    }
                  ]
                : optimisticFighter.wargear || []
            };
          }
          setFighters(prev => prev.map(f => f.id === targetId ? optimisticFighter : f));
          onFighterUpdate?.(optimisticFighter, true);
        }
      } else {
        const targetVehicle = getAllVehicles().find(v => v.id === targetId);
        if (targetVehicle) {
          let optimisticEquipment = [...(targetVehicle.equipment || [])];
          for (const config of configurations) {
            const item = config.stashItem;
            optimisticEquipment.push({
              fighter_equipment_id: item.id,
              equipment_id: item.equipment_id || '',
              equipment_name: item.equipment_name || '',
              equipment_type: (item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade') || 'vehicle_upgrade',
              cost: item.cost || 0,
              core_equipment: false,
              is_master_crafted: false,
              master_crafted: false,
              vehicle_id: targetId,
              vehicle_equipment_id: item.id,
              vehicle_weapon_id: item.equipment_type === 'weapon' ? item.id : undefined,
            } as Equipment & Partial<VehicleEquipment>);
          }

          const optimisticVehicle: VehicleProps = { ...targetVehicle, equipment: optimisticEquipment };

          const crewFighter = fighters.find(f => f.vehicles?.some(v => v.id === targetId));
          if (crewFighter) {
            const optimisticCrewFighter: FighterProps = {
              ...crewFighter,
              vehicles: crewFighter.vehicles?.map(v =>
                v.id === targetId ? { ...v, equipment: optimisticEquipment } as Vehicle : v
              )
            };
            setFighters(prev => prev.map(f => f.id === crewFighter.id ? optimisticCrewFighter : f));
            onFighterUpdate?.(optimisticCrewFighter, true);
          }

          if (onVehicleUpdate) {
            onVehicleUpdate(vehicles.map(v => v.id === targetId ? optimisticVehicle : v));
          }
        }
      }

      // Fire server call
      const result = await moveEquipmentFromStash({
        items: configurations.map(c => ({
          stash_id: c.stashItem.id,
          ...(c.selectedEffectIds ? { selected_effect_ids: c.selectedEffectIds } : {}),
          ...(c.equipmentTarget ? { equipment_target: c.equipmentTarget } : {})
        })),
        ...(isVehicleTarget ? { vehicle_id: targetId } : { fighter_id: targetId })
      });

      // Handle failure: roll back
      if (!result.success && result.item_results.length === 0) {
        setStash(rollbackStash!);
        onStashUpdate?.(rollbackStash!);
        setFighters(rollbackFighters!);
        const rolledBackFighter = rollbackFighters!.find(f => f.id === targetId);
        if (rolledBackFighter) onFighterUpdate?.(rolledBackFighter, true);
        if (rollbackVehicles && onVehicleUpdate) onVehicleUpdate(rollbackVehicles);
        toast.error("Error", { description: result.error || "Failed to move items from stash" });
        return;
      }

      // Handle partial failures: roll back failed items
      const resultMap = new Map<string, MoveFromStashItemResult>(
        result.item_results.map(r => [r.stash_id, r])
      );

      const failedConfigs = configurations.filter(c => !resultMap.get(c.stashItem.id)?.success);
      const successConfigs = configurations.filter(c => resultMap.get(c.stashItem.id)?.success);

      if (failedConfigs.length > 0) {
        // Re-add failed items to stash
        const failedItems = failedConfigs.map(c => c.stashItem as StashItem);
        const correctedStash = [...newStash, ...failedItems];
        setStash(correctedStash);
        onStashUpdate?.(correctedStash);
      }

      // Apply real data from server (replace temp IDs with real equipment IDs, add weapon profiles, effects)
      if (!isVehicleTarget) {
        const currentFighter = fighters.find(f => f.id === targetId);
        if (currentFighter) {
          let finalFighter = { ...currentFighter };

          for (const config of successConfigs) {
            const itemResult = resultMap.get(config.stashItem.id)!;
            const item = config.stashItem;

            const hasMasterCrafted = (itemResult.weapon_profiles || []).some(
              (profile: any) => profile.is_master_crafted
            );

            let modifiedWeapons: typeof finalFighter.weapons = finalFighter.weapons || [];
            if (itemResult.applied_effects && itemResult.applied_effects.length > 0) {
              const equipmentEffects = itemResult.applied_effects.filter((e: any) => e.target_equipment_id);
              if (equipmentEffects.length > 0) {
                modifiedWeapons = modifiedWeapons.map((weapon: any) => {
                  const targetingEffects = equipmentEffects.filter(
                    (e: any) => e.target_equipment_id === weapon.fighter_weapon_id
                  );
                  if (targetingEffects.length > 0 && weapon.weapon_profiles) {
                    return {
                      ...weapon,
                      weapon_profiles: applyWeaponModifiers(weapon.weapon_profiles, targetingEffects)
                    };
                  }
                  return weapon;
                });
              }
            }

            finalFighter = {
              ...finalFighter,
              credits: finalFighter.credits + (item.cost || 0),
              weapons: item.equipment_type === 'weapon'
                ? [
                    ...modifiedWeapons,
                    {
                      weapon_name: item.equipment_name || '',
                      weapon_id: item.equipment_id || item.id,
                      cost: item.cost || 0,
                      fighter_weapon_id: itemResult.equipment_id || item.id,
                      weapon_profiles: itemResult.weapon_profiles || [],
                      is_master_crafted: hasMasterCrafted
                    }
                  ]
                : modifiedWeapons,
              wargear: item.equipment_type === 'wargear'
                ? [
                    ...(finalFighter.wargear || []),
                    {
                      wargear_name: item.equipment_name || '',
                      wargear_id: item.equipment_id || item.id,
                      cost: item.cost || 0,
                      fighter_weapon_id: itemResult.equipment_id || item.id,
                      is_master_crafted: hasMasterCrafted
                    }
                  ]
                : finalFighter.wargear || [],
              effects: itemResult.applied_effects && itemResult.applied_effects.length > 0
                ? {
                    ...finalFighter.effects,
                    equipment: [
                      ...(finalFighter.effects?.equipment || []),
                      ...itemResult.applied_effects
                    ]
                  }
                : finalFighter.effects
            };
          }

          setFighters(prev => prev.map(f => f.id === targetId ? finalFighter : f));
          onFighterUpdate?.(finalFighter, true);
        }
      } else {
        // Vehicle target: apply real data
        let updatedVehicles: VehicleProps[] = vehicles;
        for (const config of successConfigs) {
          const itemResult = resultMap.get(config.stashItem.id)!;
          const item = config.stashItem;

          const targetVehicle = getAllVehicles().find(v => v.id === targetId);
          if (targetVehicle) {
            const newEquipment: Equipment & Partial<VehicleEquipment> = {
              fighter_equipment_id: itemResult.equipment_id || item.id,
              equipment_id: item.equipment_id || '',
              equipment_name: item.equipment_name || '',
              equipment_type: (item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade') || 'vehicle_upgrade',
              cost: item.cost || 0,
              core_equipment: false,
              is_master_crafted: false,
              master_crafted: false,
              vehicle_id: targetId,
              vehicle_equipment_id: itemResult.equipment_id || item.id,
              vehicle_weapon_id: item.equipment_type === 'weapon' ? itemResult.equipment_id || item.id : undefined,
              weapon_profiles: itemResult.weapon_profiles || undefined
            };

            let vehicleEffectsUpdates: any = {};
            if (itemResult.applied_effects && itemResult.applied_effects.length > 0) {
              vehicleEffectsUpdates = itemResult.applied_effects;
            }

            const updatedVehicle: VehicleProps = {
              ...targetVehicle,
              equipment: [...(targetVehicle.equipment || []), newEquipment]
            };

            const crewFighter = fighters.find(f =>
              f.vehicles?.some(v => v.id === targetId)
            );

            if (crewFighter) {
              const updatedCrewFighter: FighterProps = {
                ...crewFighter,
                vehicles: crewFighter.vehicles?.map(v => {
                  if (v.id === targetId) {
                    const existingVehicleUpgrades = v.effects?.["vehicle upgrades"] || [];
                    return {
                      ...v,
                      equipment: updatedVehicle.equipment,
                      effects: vehicleEffectsUpdates.length > 0
                        ? {
                            ...v.effects,
                            "vehicle upgrades": [
                              ...existingVehicleUpgrades,
                              ...vehicleEffectsUpdates
                            ]
                          }
                        : v.effects
                    } as Vehicle;
                  }
                  return v;
                })
              };

              setFighters(prev =>
                prev.map(f => f.id === crewFighter.id ? updatedCrewFighter : f)
              );
              onFighterUpdate?.(updatedCrewFighter);
            }

            updatedVehicles = updatedVehicles.map(v =>
              v.id === targetId ? updatedVehicle : v
            );
          }
        }
        if (onVehicleUpdate && updatedVehicles !== vehicles) {
          onVehicleUpdate(updatedVehicles);
        }
      }

      // Handle beast visibility updates
      if (result.affected_beast_ids && result.affected_beast_ids.length > 0) {
        const updatedBeasts: FighterProps[] = [];
        setFighters(prev => prev.map(f => {
          if (result.affected_beast_ids!.includes(f.id) && f.fighter_class?.toLowerCase().startsWith('exotic beast')) {
            const updatedBeast = { ...f, beast_equipment_stashed: false };
            updatedBeasts.push(updatedBeast);
            return updatedBeast;
          }
          return f;
        }));
        if (onFighterUpdate && updatedBeasts.length > 0) {
          updatedBeasts.forEach(updatedBeast => onFighterUpdate(updatedBeast, true));
        }
      }

      if (result.updated_gang_rating !== undefined) onGangRatingUpdate?.(result.updated_gang_rating);
      if (result.updated_gang_wealth !== undefined) onGangWealthUpdate?.(result.updated_gang_wealth);

      if (successConfigs.length > 0 && failedConfigs.length === 0) {
        toast.success("Success", { description: `${successConfigs.length} item${successConfigs.length > 1 ? 's' : ''} moved to ${isVehicleTarget ? 'vehicle' : 'fighter'}` });
      } else if (successConfigs.length > 0 && failedConfigs.length > 0) {
        toast.error("Partial Success", { description: `${successConfigs.length} item${successConfigs.length > 1 ? 's' : ''} moved, ${failedConfigs.length} failed` });
      } else if (failedConfigs.length > 0) {
        toast.error("Error", { description: `Failed to move ${failedConfigs.length} item${failedConfigs.length > 1 ? 's' : ''}` });
      }
    } catch (error) {
      console.error('Error moving items from stash:', error);
      if (rollbackStash) {
        setStash(rollbackStash);
        onStashUpdate?.(rollbackStash);
      }
      if (rollbackFighters) {
        setFighters(rollbackFighters);
        if (rollbackTargetId) {
          const rolledBackFighter = rollbackFighters.find(f => f.id === rollbackTargetId);
          if (rolledBackFighter) onFighterUpdate?.(rolledBackFighter, true);
        }
      }
      if (rollbackVehicles && onVehicleUpdate) {
        onVehicleUpdate(rollbackVehicles);
      }
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to move items from stash" });
    } finally {
      setIsLoading(false);
    }
  };

  // Add this helper function to get all vehicles
  const getAllVehicles = () => {
    const crewVehicles = fighters
      .filter(fighter => fighter.vehicles)
      .flatMap(fighter => (fighter.vehicles || []).map(vehicle => {
        // First get all the required VehicleProps fields
        const baseVehicle: VehicleProps = {
          id: vehicle.id,
          gang_id: '', // Default value since Vehicle type doesn't have gang_id
          vehicle_name: vehicle.vehicle_name,
          vehicle_type_id: vehicle.vehicle_type_id,
          vehicle_type: vehicle.vehicle_type,
          movement: vehicle.movement,
          front: vehicle.front,
          side: vehicle.side,
          rear: vehicle.rear,
          hull_points: vehicle.hull_points,
          handling: vehicle.handling,
          save: vehicle.save,
          body_slots: vehicle.body_slots ?? 0,
          body_slots_occupied: vehicle.body_slots_occupied ?? 0,
          drive_slots: vehicle.drive_slots ?? 0,
          drive_slots_occupied: vehicle.drive_slots_occupied ?? 0,
          engine_slots: vehicle.engine_slots ?? 0,
          engine_slots_occupied: vehicle.engine_slots_occupied ?? 0,
          special_rules: vehicle.special_rules,
          cost: 0, // Default cost since Vehicle type doesn't have cost
          created_at: vehicle.created_at,
          equipment: vehicle.equipment
        };

        return baseVehicle;
      }));
    
    return [...vehicles, ...crewVehicles];
  };

  // Check if any selected item is a vehicle
  const hasSelectedVehicle = selectedItems.some(index => isVehicle(stash[index]));
  
  // Check if any selected item is vehicle-exclusive
  const hasVehicleExclusiveItem = selectedItems.some(index =>
    isVehicleExclusive(stash[index])
  );

  const showVehicleOptions = hasSelectedVehicle || selectedItems.some(index => isVehicleCompatible(stash[index]));

  const fighterVehicleOptions = useMemo(() => {
    if (selectedItems.length === 0) return [];

    const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

    if (!hasVehicleExclusiveItem) {
      options.push({ value: '__fighters_header__', label: <span className="font-bold">Fighters</span>, displayValue: 'Fighters', disabled: true });

      const sorted = sortFightersByPositioning(fighters, positioning);

      for (const fighter of sorted) {
        const isDisabled = hasSelectedVehicle && !isCrew(fighter);
        const statusIcons = [];
        if (fighter.killed) statusIcons.push(<IoSkull className="text-gray-400 w-4 h-4" key="killed" />);
        if (fighter.retired) statusIcons.push(<MdChair className="text-muted-foreground w-4 h-4" key="retired" />);
        if (fighter.enslaved) statusIcons.push(<GiCrossedChains className="text-sky-200 w-4 h-4" key="enslaved" />);
        if (fighter.starved) statusIcons.push(<TbMeatOff className="text-red-500 w-4 h-4" key="starved" />);
        if (fighter.recovery) statusIcons.push(<FaMedkit className="text-blue-500 w-4 h-4" key="recovery" />);
        if (fighter.captured) statusIcons.push(<GiHandcuffs className="text-red-600 w-4 h-4" key="captured" />);
        const displayText = `${fighter.fighter_name} (${fighter.fighter_class}) - ${fighter.credits} credits`;
        options.push({
          value: fighter.id,
          displayValue: displayText,
          label: (
            <span className="flex items-center gap-1">
              <span>{displayText}</span>
              {statusIcons.length > 0 && <span className="flex items-center gap-0.5">{statusIcons}</span>}
            </span>
          ),
          disabled: isDisabled
        });
      }
    }

    if (showVehicleOptions) {
      options.push({ value: '__vehicles_header__', label: <span className="font-bold">Vehicles</span>, displayValue: 'Vehicles', disabled: true });
      for (const vehicle of getAllVehicles()) {
        const displayText = `${vehicle.vehicle_name || 'Unknown Vehicle'}${vehicle.vehicle_type ? ` (${vehicle.vehicle_type})` : ''}${vehicle.cost ? ` - ${vehicle.cost} credits` : ''}`;
        options.push({
          value: `vehicle-${vehicle.id}`,
          displayValue: displayText,
          label: displayText
        });
      }
    }

    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fighters, positioning, selectedItems, hasSelectedVehicle, hasVehicleExclusiveItem, showVehicleOptions, vehicles]);

  const targetModalFighterWeapons = useMemo(() => {
    if (!targetModalOpen || targetModalStashIdx === null || !targetModalEffectTypeId) return [];
    const selectedFighterObj = selectedFighter && !selectedFighter.startsWith('vehicle-')
      ? fighters.find(f => f.id === selectedFighter)
      : null;
    const existingWeapons = selectedFighterObj?.weapons?.map(weapon => ({
      id: weapon.fighter_weapon_id,
      name: weapon.weapon_name,
      equipment_category: weapon.equipment_category,
      effect_names: weapon.effect_names
    })) || [];
    const existingIds = new Set(existingWeapons.map(w => w.id));
    return [
      ...existingWeapons,
      ...pendingBatchWeapons.filter(w => !existingIds.has(w.id))
    ];
  }, [targetModalOpen, targetModalStashIdx, targetModalEffectTypeId, selectedFighter, fighters, pendingBatchWeapons]);

  return (
    <>
      <div className="container max-w-5xl w-full space-y-4 mx-auto">
        <div className="bg-card rounded-lg shadow-md p-4">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
            <div className="flex gap-2">
              {gangTypeId === 'cb9d7047-e7df-4196-a51f-a8f452c291ad' && (
                <Button
                  onClick={() => setShowChemAlchemy(true)}
                  disabled={!userPermissions?.canEdit}
                  variant="default"
                  size="sm"
                  className="font-medium"
                >
                  Chem-Alchemy
                </Button>
              )}
              <Button
                onClick={() => setShowTradingPost(true)}
                disabled={!userPermissions?.canEdit}
                variant="default"
                size="sm"
                className="font-medium"
              >
                Trading Post
              </Button>
            </div>
          </div>
          
          {stash.length === 0 ? (
            <p className="text-muted-foreground italic text-center">No items in stash.</p>
          ) : (
            <>
              <div className="mb-2">
                <div className="flex items-center text-sm font-medium text-muted-foreground px-0 py-2">
                  <div className="w-4 mr-5" />
                  <div className="grow">Name</div>
                  <div className="w-56 text-right">Category</div>
                  <div className="w-40 text-right">Actions</div>
                  <div className="w-20 text-right">Value</div>
                </div>
                <div className="space-y-2 px-0">
                  {stash.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center p-2 bg-muted rounded-md cursor-pointer hover:bg-muted"
                    >
                      <Checkbox
                        checked={selectedItems.includes(index)}
                        onCheckedChange={(checked) => handleItemToggle(index, checked as boolean)}
                        className="mr-3"
                      />
                      <span className="grow overflow-hidden text-ellipsis">{getItemName(item)}</span>
                      <span className="w-56 overflow-hidden text-ellipsis text-muted-foreground whitespace-nowrap text-right">
                        {item.type === 'vehicle' 
                          ? 'Vehicle' 
                          : item.equipment_category || 'Equipment'
                        }
                      </span>
                      <div className="w-40 flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs py-0"
                          onClick={() => {
                            setSellModalItemIdx(index);
                          }}
                          disabled={!userPermissions?.canEdit}
                          title="Sell"
                          type="button"
                        >
                          <MdCurrencyExchange className="h-4 w-4" />
                        </Button>
                        {/* Delete Action Removed - Not needed for now
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-xs py-0"
                          onClick={() => setDeleteModalIdx(index)}
                          disabled={!userPermissions?.canEdit}
                          title="Delete"
                          type="button"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button>
                        */}
                      </div>
                      <span className="w-20 flex items-center justify-end gap-1">
                        {item.cost_resource && (
                          <div
                            className="min-w-6 h-6 rounded-full flex items-center justify-center bg-amber-500 text-white px-1.5 cursor-help"
                            data-tooltip-id="stash-resource-cost-tooltip"
                            data-tooltip-content={item.cost_resource.name}
                          >
                            <span className="text-[10px] font-medium">{item.cost_resource.amount}</span>
                          </div>
                        )}
                        {item.cost}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Add the total value display for selected items */}
              {selectedItems.length > 0 && (
                <div className="flex justify-end mb-2 pr-2">
                  <span className="text-sm font-normal">
                    Selected Value: {selectedItems.reduce((sum, index) => sum + (stash[index].cost || 0), 0)}
                  </span>
                </div>
              )}

              {/* Add the total value display for all items */}
              <div className="flex justify-end mb-2 pr-2">
                <span className="text-sm font-normal">Total Value: {stash.reduce((sum, item) => sum + (item.cost || 0), 0)}</span>
              </div>

              <div className="px-0">
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Select Fighter or Vehicle
                    {hasSelectedVehicle && (
                      <span className="text-sm text-muted-foreground ml-2">(Only Crew fighters can receive vehicles)</span>
                    )}
                  </label>
                  <Combobox
                    options={fighterVehicleOptions}
                    value={selectedFighter}
                    onValueChange={setSelectedFighter}
                    placeholder={
                      selectedItems.length === 0
                        ? "Select items first..."
                        : hasVehicleExclusiveItem
                          ? "Select a vehicle..."
                          : showVehicleOptions
                            ? "Select a fighter or vehicle..."
                            : "Select a fighter..."
                    }
                    disabled={selectedItems.length === 0}
                    className="mb-4"
                    clearable
                    dropdownPlacement="down"
                  />

                  <Button
                    onClick={handleMoveToFighter}
                    disabled={
                      selectedItems.length === 0 || 
                      !selectedFighter || 
                      isLoading || 
                      !userPermissions?.canEdit ||
                      (hasSelectedVehicle && 
                       !isCrew(findFighter(selectedFighter)) && 
                       !selectedFighter.startsWith('vehicle-')) ||
                      (hasVehicleExclusiveItem && !selectedFighter.startsWith('vehicle-'))
                    }
                    className="w-full"
                  >
                    Move {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''} to {selectedFighter?.startsWith('vehicle-') ? 'Vehicle' : 'Fighter'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ChemAlchemyCreator
        isOpen={showChemAlchemy}
        onClose={() => setShowChemAlchemy(false)}
        gangCredits={gangCredits}
        hasApprenticeClanChymist={fighters.some(fighter => fighter.fighter_type === "Apprentice Clan Chymist")}
        onCreateChem={(chem) => createChemMutation.mutate(chem)}
      />

      {showTradingPost && (
        <ItemModal
          title="Trading Post"
          onClose={() => setShowTradingPost(false)}
          gangCredits={gangCredits}
          gangId={gangId}
          gangTypeId={gangTypeId || ''}
          fighterId=""
          fighterTypeId=""
          fighterCredits={0}
          isStashMode={true}
          campaignTradingPostIds={campaignTradingPostIds}
          campaignTradingPostNames={campaignTradingPostNames}
          campaignCustomTradingPostIds={campaignCustomTradingPostIds}
          campaignCustomTradingPostNames={campaignCustomTradingPostNames}
          campaignGangId={campaignGangId}
          gangCampaignResources={gangCampaignResources}
          gangReputation={gangReputation}
          onEquipmentBought={(_newFighterCredits, newGangCredits, boughtEquipment, newGangRating, newGangWealth) => {
            // Handle equipment bought for stash - perform optimistic updates

            // Create new stash item from the purchased equipment
            const newStashItem: StashItem = {
              id: boughtEquipment.fighter_equipment_id,
              cost: boughtEquipment.cost,
              type: 'equipment',
              equipment_id: boughtEquipment.equipment_id,
              equipment_name: boughtEquipment.equipment_name,
              equipment_type: boughtEquipment.equipment_type,
              equipment_category: boughtEquipment.equipment_category,
              custom_equipment_id: boughtEquipment.is_custom ? boughtEquipment.equipment_id : undefined,
              cost_resource: boughtEquipment.cost_resource_name ? {
                name: boughtEquipment.cost_resource_name,
                amount: boughtEquipment.cost_resource_amount ?? 0,
              } : undefined
            };

            // Update the stash state optimistically
            const newStash = [...stash, newStashItem];
            setStash(newStash);

            // Call parent update function if provided
            if (onStashUpdate) {
              onStashUpdate(newStash);
            }

            // Update gang credits in parent component if provided
            if (onGangCreditsUpdate && newGangCredits !== undefined) {
              onGangCreditsUpdate(newGangCredits);
            }

            // Update gang rating if provided
            if (onGangRatingUpdate && newGangRating !== undefined) {
              onGangRatingUpdate(newGangRating);
            }

            // Update gang wealth if provided
            if (onGangWealthUpdate && newGangWealth !== undefined) {
              onGangWealthUpdate(newGangWealth);
            }

            const costDescription = boughtEquipment.cost_resource_name
              ? `${boughtEquipment.cost_resource_amount} ${boughtEquipment.cost_resource_name}`
              : `${boughtEquipment.cost} credits`;
            toast.success("Equipment Purchased", { description: `${boughtEquipment.equipment_name} added to gang stash for ${costDescription}` });
          }}
        />
      )}

      {/* Target weapon selection modal (for equipment upgrades) */}
      {targetModalOpen && targetModalStashIdx !== null && targetModalEffectTypeId && (
          <Modal
            title="Select Weapon"
            hideCancel
            content={
              <FighterEffectSelection
                equipmentId=""
                effectTypes={[]}
                targetSelectionOnly
                fighterId={selectedFighter?.startsWith('vehicle-') ? undefined : selectedFighter}
                modifierEquipmentId=""
                effectTypeId={targetModalEffectTypeId}
                effectName={targetModalEffectName || undefined}
                fighterWeapons={targetModalFighterWeapons}
                onApplyToTarget={async (targetEquipmentId) => {
                  targetResolveRef.current?.(targetEquipmentId);
                  setTargetModalOpen(false);
                  setTargetModalEffectTypeId(null);
                  setTargetModalEffectName(null);
                  setTargetModalStashIdx(null);
                }}
                onSelectionComplete={() => {
                  // No-op; handled by onApplyToTarget
                }}
                onCancel={() => {
                  targetResolveRef.current?.(null);
                  setTargetModalOpen(false);
                  setTargetModalEffectTypeId(null);
                  setTargetModalEffectName(null);
                  setTargetModalStashIdx(null);
                }}
                onValidityChange={setIsTargetSelectionValid}
                ref={targetSelectionRef}
              />
            }
            onClose={() => {
              targetResolveRef.current?.(null);
              setTargetModalOpen(false);
              setTargetModalEffectTypeId(null);
              setTargetModalEffectName(null);
              setTargetModalStashIdx(null);
            }}
            onConfirm={async () => {
              return await targetSelectionRef.current?.handleConfirm() || false;
            }}
            confirmText="Confirm"
            confirmDisabled={!isTargetSelectionValid}
            width="lg"
          />
      )}

      {/* Fighter effect selection modal */}
      {effectModalOpen && effectModalStashIdx !== null && (
        <Modal
          title="Equipment Effects"
          content={
            <FighterEffectSelection
              equipmentId={stash[effectModalStashIdx].equipment_id!}
              effectTypes={effectModalTypes}
              onSelectionComplete={(ids) => {
                effectResolveRef.current?.(ids);
                setEffectModalOpen(false);
                setEffectModalTypes([]);
                setEffectModalStashIdx(null);
              }}
              onCancel={() => {
                effectResolveRef.current?.(null);
                setEffectModalOpen(false);
                setEffectModalTypes([]);
                setEffectModalStashIdx(null);
              }}
              onValidityChange={setIsEffectSelectionValid}
              ref={effectSelectionRef}
            />
          }
          onClose={() => {
            effectResolveRef.current?.(null);
            setEffectModalOpen(false);
            setEffectModalTypes([]);
            setEffectModalStashIdx(null);
          }}
          onConfirm={async () => {
            return await effectSelectionRef.current?.handleConfirm() || false;
          }}
          confirmText="Confirm Selection"
          confirmDisabled={!isEffectSelectionValid}
          width="lg"
        />
      )}
      {sellModalItemIdx !== null && (() => {
        const sellItem = stash[sellModalItemIdx];
        const isResourceItem = !!sellItem.cost_resource;
        return (
          <SellConfirmModal
            title="Sell Stash Item"
            itemName={getItemName(sellItem)}
            initialCost={isResourceItem ? (sellItem.cost_resource!.amount ?? 0) : (sellItem.cost || 0)}
            showD6Roll={!isResourceItem}
            costLabel={isResourceItem ? sellItem.cost_resource!.name : 'Sale Price'}
            confirmText="Sell"
            onClose={() => setSellModalItemIdx(null)}
            onConfirm={async (cost) => {
              const idx = sellModalItemIdx!;
              const item = stash[idx];
              const res = await sellEquipmentFromStash({ stash_id: item.id, manual_cost: isResourceItem ? 0 : (cost || 0) });
              if (res.success) {
                const newStash = stash.filter((_, i) => i !== idx);
                setStash(newStash);
                onStashUpdate?.(newStash);
                if (isResourceItem) {
                  toast.success(`Returned ${cost} ${item.cost_resource!.name}`);
                } else {
                  toast.success(`Sold ${getItemName(item)} for ${cost || 0} credits`);
                }
                if (res.data?.gang?.credits !== undefined) {
                  onGangCreditsUpdate?.(res.data.gang.credits);
                }
                if (res.data?.gang?.wealth !== undefined) {
                  onGangWealthUpdate?.(res.data.gang.wealth);
                }
              } else {
                toast.error(res.error || 'Failed to sell item');
              }
              setSellModalItemIdx(null);
            }}
          />
        );
      })()}

      {/* Delete from stash modal */}
      {deleteModalIdx !== null && (
        <Modal
          title="Delete Equipment"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{getItemName(stash[deleteModalIdx])}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                <strong>Warning:</strong> This does not refund the cost of the equipment and the removal is permanent.
              </p>
            </div>
          }
          onClose={() => setDeleteModalIdx(null)}
          onConfirm={async () => {
            const idx = deleteModalIdx!;
            const item = stash[idx];
            const res = await deleteEquipmentFromStash({ stash_id: item.id });
            if (res.success) {
              const newStash = stash.filter((_, i) => i !== idx);
              setStash(newStash);
              onStashUpdate?.(newStash);
              toast.success(`Deleted ${getItemName(item)} from stash`);
            } else {
              toast.error(res.error || 'Failed to delete item');
            }
            setDeleteModalIdx(null);
          }}
          confirmText="Delete"
        />
      )}
      <Tooltip
        id="stash-resource-cost-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '24rem'
        }}
      />
    </>
  );
}