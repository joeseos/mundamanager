'use client';

import React, { useState, useEffect } from 'react';
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
import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';
import { moveEquipmentFromStash } from '@/app/actions/move-from-stash';
import { UserPermissions } from '@/types/user-permissions';

interface GangInventoryProps {
  stash: StashItem[];
  fighters: FighterProps[];
  title?: string;
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps) => void;
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
  const { toast } = useToast();
  
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

      // Track fighter updates for optimistic updates
      let updatedFighter: FighterProps | null = null;
      let updatedVehicles: VehicleProps[] = vehicles;
      let allCreatedBeasts: any[] = []; // Collect all created beasts from all operations

      // Move items one by one
      for (const itemIndex of selectedItems) {
        const stashItem = stash[itemIndex];
        
        // Use server action instead of direct API call
        const result = await moveEquipmentFromStash({
          stash_id: stashItem.id,
          ...(isVehicleTarget 
            ? { vehicle_id: targetId }
            : { fighter_id: targetId }
          )
        });

        if (!result.success) {
          console.error(`Failed to move item ${stashItem.equipment_name || stashItem.vehicle_name}: ${result.error}`);
          errorCount++;
          continue;
        }

        successCount++;
        
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
              // Update the crew fighter's vehicle
              const updatedCrewFighter: FighterProps = {
                ...crewFighter,
                vehicles: crewFighter.vehicles?.map(v => 
                  v.id === targetId ? { ...v, equipment: updatedVehicle.equipment } as Vehicle : v
                )
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
            
            // Update the fighter with the new equipment
            updatedFighter = {
              ...currentFighter,
              credits: currentFighter.credits + (stashItem.cost || 0),
              weapons: stashItem.equipment_type === 'weapon' 
                ? [
                    ...(currentFighter.weapons || []),
                    {
                      weapon_name: stashItem.equipment_name || '',
                      weapon_id: stashItem.equipment_id || stashItem.id,
                      cost: stashItem.cost || 0,
                      fighter_weapon_id: responseData?.equipment_id || stashItem.id,
                      weapon_profiles: responseData?.weapon_profiles || [],
                      is_master_crafted: hasMasterCrafted
                    }
                  ]
                : currentFighter.weapons || [],
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
                : currentFighter.wargear || []
            };
          }
        }

        // Collect any created beasts from this operation
        if (responseData?.created_beasts && responseData.created_beasts.length > 0) {
          allCreatedBeasts.push(...responseData.created_beasts);
        }
      }

      // Apply all fighter updates at once
      if (updatedFighter) {
        setFighters(prev => 
          prev.map(f => f.id === targetId ? updatedFighter! : f)
        );

        // Call the parent update function if provided
        if (onFighterUpdate) {
          onFighterUpdate(updatedFighter);
        }
      }

      // Apply vehicle updates if any
      if (onVehicleUpdate && updatedVehicles !== vehicles) {
        onVehicleUpdate(updatedVehicles);
      }

      // Update local stash state by removing all moved items
      const newStash = stash.filter((_, index) => !selectedItems.includes(index));
      setStash(newStash);
      
      // Reset selection states
      setSelectedItems([]);
      setSelectedFighter('');
      
      // Update parent component state
      if (onStashUpdate) {
        onStashUpdate(newStash);
      }

      // Show appropriate toast message
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
      } else {
        toast({
          title: "Error",
          description: `Failed to move ${errorCount} item${errorCount > 1 ? 's' : ''}`,
          variant: "destructive",
        });
      }

      // Handle exotic beast creation (after all moves are complete)
      if (allCreatedBeasts.length > 0) {

        
        // Add new beast fighters to the fighters list
        const newBeastFighters: FighterProps[] = allCreatedBeasts.map((beast: any) => ({
          id: beast.id,
          fighter_name: beast.fighter_name,
          fighter_type: beast.fighter_type,
          fighter_class: beast.fighter_class,
          credits: beast.credits,
          // Add other required fighter properties with default values
          movement: 0,
          weapon_skill: 0,
          ballistic_skill: 0,
          strength: 0,
          toughness: 0,
          wounds: 0,
          initiative: 0,
          attacks: 0,
          leadership: 0,
          cool: 0,
          willpower: 0,
          intelligence: 0,
          xp: 0,
          kills: 0, // Add missing kills property
          weapons: [],
          wargear: [],
          advancements: { characteristics: {}, skills: {} },
          effects: { 
            injuries: [], 
            advancements: [], 
            bionics: [], 
            cyberteknika: [], 
            'gene-smithing': [], 
            'rig-glitches': [], 
            augmentations: [], 
            equipment: [], 
            user: [] 
          },
          // Add missing base_stats
          base_stats: {
            movement: 0,
            weapon_skill: 0,
            ballistic_skill: 0,
            strength: 0,
            toughness: 0,
            wounds: 0,
            initiative: 0,
            attacks: 0,
            leadership: 0,
            cool: 0,
            willpower: 0,
            intelligence: 0,
          },
          // Add missing current_stats
          current_stats: {
            movement: 0,
            weapon_skill: 0,
            ballistic_skill: 0,
            strength: 0,
            toughness: 0,
            wounds: 0,
            initiative: 0,
            attacks: 0,
            leadership: 0,
            cool: 0,
            willpower: 0,
            intelligence: 0,
          },
          skills: {},
          special_rules: [],
          killed: false,
          retired: false,
          enslaved: false,
          starved: false,
          free_skill: false,
        }));

        // Update the fighters list to include the new beasts
        setFighters(prev => [...prev, ...newBeastFighters]);

        // If there's a parent update function, call it for each new beast
        if (onFighterUpdate) {
          newBeastFighters.forEach((beast: FighterProps) => {
            onFighterUpdate(beast);
          });
        }
      }
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
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex justify-between items-center mb-6">
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
            <p className="text-gray-500 italic text-center">No items in stash.</p>
          ) : (
            <>
              <div className="mb-2">
                <div className="flex items-center text-sm font-medium text-gray-700 px-0 py-2">
                  <div className="w-4 mr-5" />
                  <div className="flex-grow">Name</div>
                  <div className="w-32 text-right">Category</div>
                  <div className="w-20 text-right mr-2">Value</div>
                </div>
                <div className="space-y-2 px-0">
                  {stash.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center p-2 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100"
                    >
                      <Checkbox
                        checked={selectedItems.includes(index)}
                        onCheckedChange={(checked) => handleItemToggle(index, checked as boolean)}
                        className="mr-3"
                      />
                      <span className="flex-grow">{getItemName(item)}</span>
                      <span className="w-32 text-right text-sm text-gray-600 whitespace-nowrap">
                        {item.type === 'vehicle' 
                          ? 'Vehicle' 
                          : item.equipment_category || 'Equipment'
                        }
                      </span>
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
                  <label htmlFor="fighter-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Fighter or Vehicle
                    {hasSelectedVehicle && (
                      <span className="text-sm text-gray-500 ml-2">(Only Crew fighters can receive vehicles)</span>
                    )}
                  </label>
                  <select
                    id="fighter-select"
                    value={selectedFighter}
                    onChange={handleFighterSelect}
                    className={`w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black mb-4 
                      ${selectedItems.length === 0 ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
    </>
  );
}