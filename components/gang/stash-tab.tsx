'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { FighterProps, Vehicle } from '@/types/fighter';
import { StashItem } from '@/types/gang';
import { Session } from '@supabase/supabase-js';
import { VehicleProps } from '@/types/vehicle';
import { vehicleExclusiveCategories, vehicleCompatibleCategories } from '@/utils/vehicleEquipmentCategories';
import ChemAlchemyCreator from './chem-alchemy';
import { createChemAlchemy } from '@/app/actions/chem-alchemy';
import ItemModal from '@/components/equipment';
import Modal from '@/components/ui/modal';
import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';
import { moveEquipmentFromStash } from '@/app/actions/move-from-stash';
import { deleteEquipmentFromStash } from '@/app/actions/equipment';
import { sellEquipmentFromStash } from '@/app/actions/sell-equipment';
import { MdCurrencyExchange } from 'react-icons/md';
import { LuTrash2 } from 'react-icons/lu';
import { rollD6 } from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import FighterEffectSelection from '@/components/fighter-effect-selection';
import { applyWeaponModifiers } from '@/utils/effect-modifiers';

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
  userPermissions?: UserPermissions;
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
  userPermissions
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
  const [sellManualCost, setSellManualCost] = useState<number>(0);
  const [sellLastRoll, setSellLastRoll] = useState<number | null>(null);
  const [deleteModalIdx, setDeleteModalIdx] = useState<number | null>(null);
  const { toast } = useToast();
  
  // Effect selection modal state
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [effectModalTypes, setEffectModalTypes] = useState<any[]>([]);
  const [effectModalStashIdx, setEffectModalStashIdx] = useState<number | null>(null);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean } | null>(null);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const effectResolveRef = useRef<((ids: string[] | null) => void) | null>(null);

  // Target weapon selection modal state (for equipment upgrades)
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetModalEffectTypeId, setTargetModalEffectTypeId] = useState<string | null>(null);
  const [targetModalEffectName, setTargetModalEffectName] = useState<string | null>(null);
  const [targetModalStashIdx, setTargetModalStashIdx] = useState<number | null>(null);
  const targetSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean } | null>(null);
  const [isTargetSelectionValid, setIsTargetSelectionValid] = useState(false);
  const targetResolveRef = useRef<((targetId: string | null) => void) | null>(null);
  
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

  const getSelectableFighters = () => {
    if (selectedItems.length === 0) return fighters;
    
    // Check if any selected item is a vehicle
    const hasVehicle = selectedItems.some(index => isVehicle(stash[index]));
    
    // If any selected item is a vehicle, only show Crew fighters
    if (hasVehicle) {
      return fighters.filter(isCrew);
    }
    return fighters;
  };

  const findFighter = (id: string): FighterProps | undefined => 
    fighters.find(f => f.id === id);

  // Prompt user to select effects; returns selected IDs or null on cancel
  const promptEffectSelection = (equipmentId: string, effectTypes: any[], stashIdx: number) => {
    setEffectModalTypes(effectTypes);
    setEffectModalStashIdx(stashIdx);
    setIsEffectSelectionValid(false);
    setEffectModalOpen(true);
    return new Promise<string[] | null>((resolve) => {
      effectResolveRef.current = resolve;
    });
  };

  // Prompt user to select target weapon; returns target equipment ID or null on cancel
  const promptTargetSelection = (effectTypeId: string, effectName: string | undefined, stashIdx: number) => {
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
    try {
      const isVehicleTarget = selectedFighter.startsWith('vehicle-');
      const targetId = isVehicleTarget ? selectedFighter.replace('vehicle-', '') : selectedFighter;
      
      let successCount = 0;
      let errorCount = 0;
      let cancelledCount = 0;

      // Track fighter updates for optimistic updates
      let updatedFighter: FighterProps | null = null;
      let updatedVehicles: VehicleProps[] = vehicles;

      // Track which items were successfully moved (by index)
      const successfullyMovedIndices: number[] = [];

      // Move items one by one
      for (const itemIndex of selectedItems) {
        const stashItem = stash[itemIndex];
        
        // Check for all effect types (both equipment upgrades and fighter effects)
        let selectedEffectIds: string[] | undefined = undefined;
        let equipmentTarget: { target_equipment_id: string; effect_type_id: string } | undefined = undefined;

        if (stashItem.type === 'equipment' && stashItem.equipment_id && !stashItem.custom_equipment_id) {
          try {
            const resp = await fetch(`/api/fighter-effects?equipmentId=${stashItem.equipment_id}`);
            if (resp.ok) {
              const effectTypes = await resp.json();

              // Separate equipment upgrades from fighter effects
              const equipmentUpgrade = effectTypes?.find((e: any) =>
                e?.type_specific_data?.applies_to === 'equipment'
              );

              const fighterEffects = effectTypes?.filter((e: any) =>
                e?.type_specific_data?.applies_to !== 'equipment'
              );

              // Priority 1: Handle equipment upgrade (applies_to=equipment)
              if (equipmentUpgrade && !isVehicleTarget) {
                const targetId = await promptTargetSelection(equipmentUpgrade.id, equipmentUpgrade.effect_name, itemIndex);
                if (targetId) {
                  equipmentTarget = {
                    target_equipment_id: targetId,
                    effect_type_id: equipmentUpgrade.id
                  };
                } else {
                  // User cancelled; skip this item
                  cancelledCount++;
                  continue;
                }
              }

              // Priority 2: Handle selectable fighter effects
              const hasSelectableFighterEffects = fighterEffects?.some((e: any) =>
                e?.type_specific_data?.effect_selection === 'single_select' ||
                e?.type_specific_data?.effect_selection === 'multiple_select'
              );

              if (hasSelectableFighterEffects) {
                const chosen = await promptEffectSelection(stashItem.equipment_id, fighterEffects, itemIndex);
                if (chosen && chosen.length > 0) {
                  selectedEffectIds = chosen;
                } else {
                  // User cancelled; skip this item
                  cancelledCount++;
                  continue;
                }
              }
            }
          } catch (e) {
            // If effect fetch fails, proceed without selection (fixed effects still apply)
          }
        }
        
        // Use server action instead of direct API call
        const result = await moveEquipmentFromStash({
          stash_id: stashItem.id,
          ...(isVehicleTarget
            ? { vehicle_id: targetId }
            : { fighter_id: targetId }
          ),
          ...(selectedEffectIds ? { selected_effect_ids: selectedEffectIds } : {}),
          ...(equipmentTarget ? { equipment_target: equipmentTarget } : {})
        });

        if (!result.success) {
          console.error(`Failed to move item ${stashItem.equipment_name || stashItem.vehicle_name}: ${result.error}`);
          errorCount++;
          continue;
        }

        successCount++;
        successfullyMovedIndices.push(itemIndex);

        // Get the response data
        const responseData = result.data;
        
        // Update gang rating if provided
        if (responseData?.updated_gang_rating !== undefined && onGangRatingUpdate) {
          onGangRatingUpdate(responseData.updated_gang_rating);
        }
        
        if (isVehicleTarget) {
          // Handle vehicle equipment update
          const targetVehicle = getAllVehicles().find(v => v.id === targetId);
          if (targetVehicle) {
            // Create new equipment item for the vehicle with proper typing
            const newEquipment: Equipment & Partial<VehicleEquipment> = {
              fighter_equipment_id: responseData?.equipment_id || stashItem.id,
              equipment_id: stashItem.equipment_id || '',
              equipment_name: stashItem.equipment_name || '',
              equipment_type: (stashItem.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade') || 'vehicle_upgrade',
              cost: stashItem.cost || 0,
              core_equipment: false,
              is_master_crafted: false,
              master_crafted: false,
              // Vehicle-specific fields
              vehicle_id: targetId,
              vehicle_equipment_id: responseData?.equipment_id || stashItem.id,
              vehicle_weapon_id: stashItem.equipment_type === 'weapon' ? responseData?.equipment_id || stashItem.id : undefined,
              // Add weapon profiles if this is a weapon
              weapon_profiles: responseData?.weapon_profiles || undefined
            };

            // Apply equipment effects to vehicle effects structure
            let vehicleEffectsUpdates: any = {};
            if (responseData?.applied_effects && responseData.applied_effects.length > 0) {
              // Add effects to the vehicle's effects structure (for fighter-card calculations)
              vehicleEffectsUpdates = responseData.applied_effects;
            }

            // Update the target vehicle's equipment
            const updatedVehicle: VehicleProps = {
              ...targetVehicle,
              equipment: [...(targetVehicle.equipment || []), newEquipment]
            };

            // Find if this vehicle belongs to a crew member and update that fighter
            const crewFighter = fighters.find(f => 
              f.vehicles?.some(v => v.id === targetId)
            );

            if (crewFighter) {
              // Update the crew fighter's vehicle with equipment and effects
              const updatedCrewFighter: FighterProps = {
                ...crewFighter,
                vehicles: crewFighter.vehicles?.map(v => {
                  if (v.id === targetId) {
                    // Get existing vehicle upgrades effects
                    const existingVehicleUpgrades = v.effects?.["vehicle upgrades"] || [];
                    
                    return {
                      ...v, 
                      equipment: updatedVehicle.equipment,
                      // Update effects with new vehicle upgrades
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

              if (onFighterUpdate) {
                onFighterUpdate(updatedCrewFighter);
              }
            }

            // Update vehicles array if this vehicle is in the main vehicles list
            updatedVehicles = updatedVehicles.map(v => 
              v.id === targetId ? updatedVehicle : v
            );
          }
        } else {
          // Handle fighter equipment update
          const currentFighter: FighterProps | undefined = updatedFighter || fighters.find(f => f.id === targetId);
          if (currentFighter) {
            // Check if any weapon profile has master-crafted flag
            const hasMasterCrafted = (responseData?.weapon_profiles || []).some(
              (profile: any) => profile.is_master_crafted
            );
            
            // Apply equipment→equipment effect modifiers to existing weapons
            let modifiedWeapons: typeof currentFighter.weapons = currentFighter.weapons || [];
            if (responseData?.applied_effects && responseData.applied_effects.length > 0) {
              const equipmentEffects = responseData.applied_effects.filter((e: any) => e.target_equipment_id);

              if (equipmentEffects.length > 0) {
                modifiedWeapons = modifiedWeapons.map((weapon: any) => {
                  // Find effects targeting this weapon
                  const targetingEffects = equipmentEffects.filter(
                    (e: any) => e.target_equipment_id === weapon.fighter_weapon_id
                  );

                  if (targetingEffects.length > 0 && weapon.weapon_profiles) {
                    // Apply modifiers to weapon profiles
                    return {
                      ...weapon,
                      weapon_profiles: applyWeaponModifiers(weapon.weapon_profiles, targetingEffects)
                    };
                  }
                  return weapon;
                });
              }
            }

            // Update the fighter with the new equipment
            updatedFighter = {
              ...currentFighter,
              credits: currentFighter.credits + (stashItem.cost || 0),
              weapons: stashItem.equipment_type === 'weapon'
                ? [
                    ...modifiedWeapons,
                    {
                      weapon_name: stashItem.equipment_name || '',
                      weapon_id: stashItem.equipment_id || stashItem.id,
                      cost: stashItem.cost || 0,
                      fighter_weapon_id: responseData?.equipment_id || stashItem.id,
                      weapon_profiles: responseData?.weapon_profiles || [],
                      is_master_crafted: hasMasterCrafted
                    }
                  ]
                : modifiedWeapons,
              wargear: stashItem.equipment_type === 'wargear'
                ? [
                    ...(currentFighter.wargear || []),
                    {
                      wargear_name: stashItem.equipment_name || '',
                      wargear_id: stashItem.equipment_id || stashItem.id,
                      cost: stashItem.cost || 0,
                      fighter_weapon_id: responseData?.equipment_id || stashItem.id,
                      is_master_crafted: hasMasterCrafted
                    }
                  ]
                : currentFighter.wargear || [],
              // Add applied effects to fighter's effects object
              effects: responseData?.applied_effects && responseData.applied_effects.length > 0
                ? {
                    ...currentFighter.effects,
                    equipment: [
                      ...(currentFighter.effects?.equipment || []),
                      ...responseData.applied_effects
                    ]
                  }
                : currentFighter.effects
            };
          }
        }

        // Handle complete fighter updates from server (for reactivated beasts)
        if (responseData?.updated_fighters && responseData.updated_fighters.length > 0) {
          // Update parent component with complete fighter data
          if (onFighterUpdate) {
            responseData.updated_fighters.forEach((completeFighter: any) => {
              onFighterUpdate(completeFighter, true); // Skip rating update
            });
          }
        }
        // Handle affected beast visibility updates (fallback for cases without complete data)
        else if (responseData?.affected_beast_ids && responseData.affected_beast_ids.length > 0) {
          // Update beast visibility - these beasts are no longer stashed since equipment was moved
          const updatedBeasts: FighterProps[] = [];
          
          setFighters(prev => prev.map(f => {
            if (responseData.affected_beast_ids!.includes(f.id) && f.fighter_class === 'exotic beast') {
              const updatedBeast = { ...f, beast_equipment_stashed: false };
              updatedBeasts.push(updatedBeast);
              return updatedBeast;
            }
            return f;
          }));

          // Update parent component for each affected beast (outside of render cycle)
          if (onFighterUpdate && updatedBeasts.length > 0) {
            updatedBeasts.forEach(updatedBeast => {
              onFighterUpdate(updatedBeast, true); // Skip rating update
            });
          }
        }

        // Note: Beast creation is handled during equipment purchase, not during moves from stash
        // Existing beasts are just made visible/hidden based on equipment location
      }

      // Apply all fighter updates at once
      if (updatedFighter) {
        setFighters(prev => 
          prev.map(f => f.id === targetId ? updatedFighter! : f)
        );

        // Call the parent update function if provided
        if (onFighterUpdate) {
          onFighterUpdate(updatedFighter, true); // Skip rating update since server provided correct rating
        }
      }

      // Apply vehicle updates if any
      if (onVehicleUpdate && updatedVehicles !== vehicles) {
        onVehicleUpdate(updatedVehicles);
      }

      // Update local stash state by removing only successfully moved items
      const newStash = stash.filter((_, index) => !successfullyMovedIndices.includes(index));
      setStash(newStash);

      // Reset selection states - clear only successfully moved items from selection
      setSelectedItems(prev => prev.filter(index => !successfullyMovedIndices.includes(index)));

      // Only clear fighter selection if all items were processed (moved or cancelled)
      if (errorCount === 0 && cancelledCount === 0) {
        setSelectedFighter('');
      }

      // Update parent component state
      if (onStashUpdate) {
        onStashUpdate(newStash);
      }

      // Show appropriate toast message (only for successes and actual errors, not cancellations)
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Success",
          description: `${successCount} item${successCount > 1 ? 's' : ''} moved to ${isVehicleTarget ? 'vehicle' : 'fighter'}`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Partial Success",
          description: `${successCount} item${successCount > 1 ? 's' : ''} moved, ${errorCount} failed`,
          variant: "destructive",
        });
      } else if (errorCount > 0) {
        // Only show error if there were actual errors (not just cancellations)
        toast({
          title: "Error",
          description: `Failed to move ${errorCount} item${errorCount > 1 ? 's' : ''}`,
          variant: "destructive",
        });
      }
      // Note: No toast shown if user only cancelled (successCount === 0 && errorCount === 0)

      // Beast visibility is now handled entirely through the affected_beast_ids mechanism above
      // No need to create or manage beast fighters locally - the cache invalidation will
      // trigger a refresh of the gang data with complete beast information
    } catch (error) {
      console.error('Error moving items from stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move items from stash",
        variant: "destructive",
      });
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

  const getSelectedStashItems = (): StashItem[] => 
    selectedItems.map(index => stash[index]);

  const handleFighterSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter(e.target.value);
  };

  // Check if any selected item is a vehicle
  const hasSelectedVehicle = selectedItems.some(index => isVehicle(stash[index]));
  
  // Check if any selected item is vehicle-exclusive
  const hasVehicleExclusiveItem = selectedItems.some(index => 
    isVehicleExclusive(stash[index])
  );

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
                  <div className="flex-grow">Name</div>
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
                      <span className="flex-grow overflow-hidden text-ellipsis">{getItemName(item)}</span>
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
                            setSellLastRoll(null);
                            setSellManualCost(stash[index].cost || 0);
                          }}
                          disabled={!userPermissions?.canEdit}
                          title="Sell"
                          type="button"
                        >
                          <MdCurrencyExchange className="h-4 w-4" />
                        </Button>
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
                      </div>
                      <span className="w-20 text-right">{item.cost}</span>
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
                  <label htmlFor="fighter-select" className="block text-sm font-medium text-muted-foreground mb-2">
                    Select Fighter or Vehicle
                    {hasSelectedVehicle && (
                      <span className="text-sm text-muted-foreground ml-2">(Only Crew fighters can receive vehicles)</span>
                    )}
                  </label>
                  <select
                    id="fighter-select"
                    value={selectedFighter}
                    onChange={handleFighterSelect}
                    className={`w-full p-2 border rounded-md border-border focus:outline-none focus:ring-2 focus:ring-black mb-4 
                      ${selectedItems.length === 0 ? 'bg-muted cursor-not-allowed' : ''}`}
                    disabled={selectedItems.length === 0}
                  >
                    <option value="">
                      {selectedItems.length > 0 && 
                        (hasVehicleExclusiveItem
                          ? "Select a vehicle"
                          : hasSelectedVehicle || selectedItems.some(index => isVehicleCompatible(stash[index]))
                            ? "Select a fighter or vehicle"
                            : "Select a fighter"
                        )}
                    </option>
                    {selectedItems.length > 0 && (
                      <>
                        {!hasVehicleExclusiveItem && (
                          <optgroup label="Fighters">
                            {fighters.map((fighter) => {
                              const isDisabled = hasSelectedVehicle && !isCrew(fighter);

                              return (
                                <option
                                  key={fighter.id}
                                  value={fighter.id}
                                  disabled={isDisabled}
                                  className={isDisabled ? 'text-gray-400' : ''}
                                >
                                  {fighter.fighter_name} ({fighter.fighter_class}) - {fighter.credits} credits
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {(hasSelectedVehicle || selectedItems.some(index => isVehicleCompatible(stash[index]))) && (
                          <optgroup label="Vehicles">
                            {getAllVehicles().map((vehicle) => (
                              <option 
                                key={`vehicle-${vehicle.id}`}
                                value={`vehicle-${vehicle.id}`}
                              >
                                {vehicle.vehicle_name || 'Unknown Vehicle'}
                                {vehicle.vehicle_type ? ` (${vehicle.vehicle_type})` : ''}
                                {vehicle.cost ? ` - ${vehicle.cost} credits` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    )}
                  </select>

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
                      (hasVehicleExclusiveItem && !selectedFighter.startsWith('vehicle-')) ||
                      (!selectedFighter.startsWith('vehicle-') && hasVehicleExclusiveItem)
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
        onCreateChem={async (chem) => {
          try {
            const result = await createChemAlchemy({
              name: chem.name,
              type: chem.type,
              effects: chem.effects,
              totalCost: chem.totalCost,
              gangId: gangId,
              useBaseCostForRating: chem.useBaseCostForRating,
              baseCost: chem.baseCost
            });

            if (result.success) {
              // Create new stash item from the created chem-alchemy
              const newStashItem: StashItem = {
                id: result.data?.stashItem?.id || `temp-${Date.now()}`,
                cost: chem.totalCost,
                type: 'equipment',
                equipment_id: result.data?.customEquipment?.id,
                equipment_name: chem.name,
                equipment_type: 'wargear',
                equipment_category: 'Chem-Alchemy',
                custom_equipment_id: result.data?.customEquipment?.id
              };

              // Update the stash state optimistically
              const newStash = [...stash, newStashItem];
              setStash(newStash);

              // Call parent update function if provided
              if (onStashUpdate) {
                onStashUpdate(newStash);
              }

              // Update gang credits in parent component if provided
              if (onGangCreditsUpdate) {
                onGangCreditsUpdate(gangCredits - chem.totalCost);
              }

              toast({
                title: "Elixir Created",
                description: `${chem.name} created with ${chem.effects.length} effects for ${chem.totalCost} credits`,
              });
            } else {
              toast({
                title: "Error",
                description: result.error || "Failed to create elixir",
                variant: "destructive",
              });
            }
          } catch (error) {
            console.error('Error creating chem-alchemy:', error);
            toast({
              title: "Error",
              description: "Failed to create elixir",
              variant: "destructive",
            });
          }
        }}
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
          onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => {
            // Handle equipment bought for stash - perform optimistic updates
            
            // Create new stash item from the purchased equipment
            const newStashItem: StashItem = {
              id: boughtEquipment.fighter_equipment_id, // This will be the gang_stash ID from the API response
              cost: boughtEquipment.cost,
              type: 'equipment',
              equipment_id: boughtEquipment.equipment_id,
              equipment_name: boughtEquipment.equipment_name,
              equipment_type: boughtEquipment.equipment_type,
              equipment_category: boughtEquipment.equipment_category,
              custom_equipment_id: boughtEquipment.is_custom ? boughtEquipment.equipment_id : undefined
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

            toast({
              title: "Equipment Purchased",
              description: `${boughtEquipment.equipment_name} added to gang stash for ${boughtEquipment.cost} credits`,
            });
          }}
        />
      )}

      {/* Target weapon selection modal (for equipment upgrades) */}
      {targetModalOpen && targetModalStashIdx !== null && targetModalEffectTypeId && (() => {
        // Get the selected fighter and extract weapons
        const selectedFighterObj = selectedFighter && !selectedFighter.startsWith('vehicle-') 
          ? fighters.find(f => f.id === selectedFighter)
          : null;
        
        const fighterWeapons = selectedFighterObj?.weapons?.map(weapon => ({
          id: weapon.fighter_weapon_id,
          name: weapon.weapon_name,
          equipment_category: weapon.equipment_category,
          effect_names: weapon.effect_names
        })) || [];

        return (
          <Modal
            title="Select Weapon"
            content={
              <FighterEffectSelection
                equipmentId=""
                effectTypes={[]}
                targetSelectionOnly
                fighterId={selectedFighter?.startsWith('vehicle-') ? undefined : selectedFighter}
                modifierEquipmentId=""
                effectTypeId={targetModalEffectTypeId}
                effectName={targetModalEffectName || undefined}
                fighterWeapons={fighterWeapons}
                onApplyToTarget={async (targetEquipmentId) => {
                  // Resolve promise with target ID
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
        );
      })()}

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
      {sellModalItemIdx !== null && (
        <Modal
          title="Sell Stash Item"
          content={
            <div className="space-y-4">
              <p>
                Are you sure you want to sell <strong>{getItemName(stash[sellModalItemIdx])}</strong>?
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const r = rollD6();
                    setSellLastRoll(r);
                    const cost = stash[sellModalItemIdx!].cost || 0;
                    const final = Math.max(5, cost - r * 10);
                    setSellManualCost(final);
                    toast({ description: `Roll ${r}: -${r * 10} → ${final} credits` });
                  }}
                  className="px-3 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800"
                >
                  Roll D6
                </button>
                {sellLastRoll !== null && (
                  <div className="text-sm">Roll {sellLastRoll}: -{sellLastRoll * 10} → {Math.max(5, (stash[sellModalItemIdx!].cost || 0) - sellLastRoll * 10)} credits</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sale Price</label>
                <input
                  type="number"
                  min={0}
                  value={sellManualCost}
                  onChange={(e) => setSellManualCost(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum 5 credits</p>
              </div>
            </div>
          }
          onClose={() => { setSellModalItemIdx(null); setSellLastRoll(null); setSellManualCost(0); }}
          onConfirm={async () => {
            const idx = sellModalItemIdx!;
            const item = stash[idx];
            const res = await sellEquipmentFromStash({ stash_id: item.id, manual_cost: Math.max(5, sellManualCost || 0) });
            if (res.success) {
              const newStash = stash.filter((_, i) => i !== idx);
              setStash(newStash);
              onStashUpdate?.(newStash);
              toast({ description: `Sold ${getItemName(item)} for ${Math.max(5, sellManualCost || 0)} credits` });
              // Optimistically update gang credits using server-returned value
              if (res.data?.gang?.credits !== undefined) {
                onGangCreditsUpdate?.(res.data.gang.credits);
              }
            } else {
              toast({ description: res.error || 'Failed to sell item', variant: 'destructive' });
            }
            setSellModalItemIdx(null);
            setSellLastRoll(null);
          }}
          confirmText="Sell"
        />
      )}

      {/* Delete from stash modal */}
      {deleteModalIdx !== null && (
        <Modal
          title="Delete Equipment"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{getItemName(stash[deleteModalIdx])}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
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
              toast({ description: `Deleted ${getItemName(item)} from stash` });
            } else {
              toast({ description: res.error || 'Failed to delete item', variant: 'destructive' });
            }
            setDeleteModalIdx(null);
          }}
          confirmText="Delete"
        />
      )}
    </>
  );
}