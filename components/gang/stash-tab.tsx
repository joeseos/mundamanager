'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { FighterProps, Vehicle } from '@/types/fighter';
import { StashItem } from '@/types/gang';
import { Session } from '@supabase/supabase-js';
import { VehicleProps } from '@/types/vehicle';
import { vehicleExclusiveCategories, vehicleCompatibleCategories } from '@/utils/vehicleEquipmentCategories';

interface GangInventoryProps {
  stash: StashItem[];
  fighters: FighterProps[];
  title?: string;
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps) => void;
  vehicles?: VehicleProps[];
}

export default function GangInventory({ 
  stash: initialStash, 
  fighters: initialFighters,
  title = 'Gang Stash',
  onStashUpdate,
  onFighterUpdate,
  vehicles = []
}: GangInventoryProps) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [stash, setStash] = useState<StashItem[]>(initialStash);
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
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
    
    // Special case for Enforcer boltgun - we know it should be master-crafted
    if (item.equipment_type === 'weapon' && 
        item.equipment_name && 
        item.equipment_name.toLowerCase() === 'enforcer boltgun') {
      return `${baseName} (Master-Crafted)`;
    }
    
    return baseName;
  };

  const isVehicle = (item: StashItem): boolean => item.type === 'vehicle';
  
  // Update isCrew to handle undefined
  const isCrew = (fighter: FighterProps | undefined): boolean => 
    fighter?.fighter_class === 'Crew';

  const getSelectableFighters = () => {
    if (!selectedItem) return fighters;
    const selectedStashItem = stash[selectedItem];
    
    // If it's a vehicle, only show Crew fighters
    if (isVehicle(selectedStashItem)) {
      return fighters.filter(isCrew);
    }
    return fighters;
  };

  const findFighter = (id: string): FighterProps | undefined => 
    fighters.find(f => f.id === id);

  const handleMoveToFighter = async () => {
    if (selectedItem === null || !selectedFighter || !session) return;

    setIsLoading(true);
    try {
      const stashItem = stash[selectedItem];
      const isVehicleTarget = selectedFighter.startsWith('vehicle-');
      const targetId = isVehicleTarget ? selectedFighter.replace('vehicle-', '') : selectedFighter;

      const requestBody = {
        p_stash_id: stashItem.id,
        ...(isVehicleTarget 
          ? { p_vehicle_id: targetId }
          : { p_fighter_id: targetId }
        )
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/move_from_stash`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to move item from stash: ${errorText}`);
      }

      // Update local stash state
      const newStash = stash.filter((_, index) => index !== selectedItem);
      setStash(newStash);
      
      // Update fighter/vehicle state optimistically
      const targetFighter = fighters.find(f => f.id === targetId);
      if (targetFighter && !isVehicleTarget) {
        const updatedFighter: FighterProps = {
          ...targetFighter,
          credits: targetFighter.credits + (stashItem.cost || 0),
          weapons: stashItem.equipment_type === 'weapon' 
            ? [
                ...(targetFighter.weapons || []),
                {
                  weapon_name: stashItem.equipment_name || '',
                  weapon_id: stashItem.id,
                  cost: stashItem.cost || 0,
                  fighter_weapon_id: stashItem.id,
                  weapon_profiles: [] // Initialize with empty profiles
                }
              ]
            : targetFighter.weapons || [],
          wargear: stashItem.equipment_type === 'wargear'
            ? [
                ...(targetFighter.wargear || []),
                {
                  wargear_name: stashItem.equipment_name || '',
                  wargear_id: stashItem.id,
                  cost: stashItem.cost || 0,
                  fighter_weapon_id: stashItem.id
                }
              ]
            : targetFighter.wargear || []
        };

        setFighters(prev => 
          prev.map(f => f.id === targetId ? updatedFighter : f)
        );

        // Call the parent update function if provided
        if (onFighterUpdate) {
          onFighterUpdate(updatedFighter);
        }
      }

      // Reset selection states
      setSelectedItem(null);
      setSelectedFighter('');
      
      // Update parent component state
      if (onStashUpdate) {
        onStashUpdate(newStash);
      }

      toast({
        title: "Success",
        description: `${getItemName(stashItem)} moved to ${isVehicleTarget ? 'vehicle' : 'fighter'}`,
      });
    } catch (error) {
      console.error('Error moving item from stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move item from stash",
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

  const getSelectedStashItem = (): StashItem | null => 
    selectedItem !== null ? stash[selectedItem] : null;

  const handleFighterSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter(e.target.value);
  };

  return (
    <div className="container max-w-5xl w-full space-y-4 mx-auto">
      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        
        {stash.length === 0 ? (
          <p className="text-gray-500 italic text-center">No items in stash.</p>
        ) : (
          <>
            <div className="mb-4">
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
                    className="flex items-center p-2 bg-gray-50 rounded-md cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="stash-item"
                      checked={selectedItem === index}
                      onChange={() => setSelectedItem(index)}
                      className="h-3 w-3 max-w-3 min-w-3 border-gray-300 text-black focus:ring-black mr-3"
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

            <div className="px-0">
              <div className="border-t pt-4">
                <label htmlFor="fighter-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Fighter or Vehicle
                  {selectedItem !== null && isVehicle(getSelectedStashItem()!) && (
                    <span className="text-sm text-gray-500 ml-2">(Only Crew fighters can receive vehicles)</span>
                  )}
                </label>
                <select
                  id="fighter-select"
                  value={selectedFighter}
                  onChange={handleFighterSelect}
                  className={`w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black mb-4 
                    ${selectedItem === null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={selectedItem === null}
                >
                  <option value="">
                    {selectedItem !== null && 
                      (isVehicleExclusive(getSelectedStashItem()!)
                        ? "Select a vehicle"
                        : isVehicleCompatible(getSelectedStashItem()!)
                          ? "Select a fighter or vehicle"
                          : "Select a fighter"
                      )}
                  </option>
                  {selectedItem !== null && (
                    <>
                      {!isVehicleExclusive(getSelectedStashItem()!) && (
                        <optgroup label="Fighters">
                          {fighters.map((fighter) => {
                            const isDisabled = selectedItem !== null &&
                                             isVehicle(getSelectedStashItem()!) &&
                                             !isCrew(fighter);

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
                      {isVehicleCompatible(getSelectedStashItem()!) && (
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
                  onClick={() => {
                    console.log('Move button clicked', {
                      selectedItem,
                      selectedFighter,
                      isLoading
                    });
                    handleMoveToFighter();
                  }}
                  disabled={
                    selectedItem === null || 
                    !selectedFighter || 
                    isLoading || 
                    (isVehicle(getSelectedStashItem()!) && 
                     !isCrew(findFighter(selectedFighter)) && 
                     !selectedFighter.startsWith('vehicle-')) ||
                    (isVehicleExclusive(getSelectedStashItem()!) && !selectedFighter.startsWith('vehicle-')) ||
                    (!selectedFighter.startsWith('vehicle-') && isVehicleExclusive(getSelectedStashItem()!))
                  }
                  className="w-full"
                >
                  Move to {selectedFighter?.startsWith('vehicle-') ? 'Vehicle' : 'Fighter'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}