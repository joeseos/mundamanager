'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { FighterProps } from '@/types/fighter';
import { StashItem } from '@/types/gang';
import { Session } from '@supabase/supabase-js';
import { VehicleProps } from '@/types/vehicle';

interface GangInventoryProps {
  stash: StashItem[];
  fighters: FighterProps[];
  title?: string;
  onStashUpdate?: (newStash: StashItem[]) => void;
  vehicles?: VehicleProps[];
}

export default function GangInventory({ 
  stash: initialStash, 
  fighters: initialFighters,
  title = 'Gang Stash',
  onStashUpdate,
  vehicles = []
}: GangInventoryProps) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [stash, setStash] = useState<StashItem[]>(initialStash);
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const { toast } = useToast();

  const VEHICLE_EXCLUSIVE_CATEGORIES = ['Vehicle Upgrades', 'Vehicle Wargear'];
  const VEHICLE_COMPATIBLE_CATEGORIES = [
    ...VEHICLE_EXCLUSIVE_CATEGORIES, 
    'Basic Weapons', 
    'Special Weapons', 
    'Heavy Weapons',
    'Ammo'
  ];
  
  const isVehicleExclusive = (item: StashItem) => 
    VEHICLE_EXCLUSIVE_CATEGORIES.includes(item.equipment_category || '');
    
  const isVehicleCompatible = (item: StashItem) => 
    VEHICLE_COMPATIBLE_CATEGORIES.includes(item.equipment_category || '');

  useEffect(() => {
    const getSession = async () => {
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    getSession();
  }, []);

  const getItemName = (item: StashItem) => {
    return item.vehicle_name || item.equipment_name || 'Unknown Item';
  };

  const isVehicle = (item: StashItem) => item.type === 'vehicle';
  const isCrew = (fighter: FighterProps) => fighter.fighter_class === 'Crew';

  const getSelectableFighters = () => {
    if (!selectedItem) return fighters;
    const selectedStashItem = stash[selectedItem];
    
    // If it's a vehicle, only show Crew fighters
    if (isVehicle(selectedStashItem)) {
      return fighters.filter(isCrew);
    }
    return fighters;
  };

  const handleMoveToFighter = async () => {
    if (!selectedFighter || selectedItem === null) return false;
    if (!session) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      const stashItem = stash[selectedItem];
      
      const endpoint = stashItem.type === 'vehicle' 
        ? 'move_vehicle_from_stash' 
        : 'move_from_stash';

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            p_stash_id: stashItem.id,
            p_fighter_id: selectedFighter
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to move equipment from stash');
      }

      const updatedStash = stash.filter((_, index) => index !== selectedItem);
      setStash(updatedStash);

      const selectedFighterData = fighters.find(f => f.id === selectedFighter);
      if (selectedFighterData) {
        setFighters(fighters.map(fighter => 
          fighter.id === selectedFighter
            ? { ...fighter, credits: fighter.credits + stashItem.cost }
            : fighter
        ));
      }

      toast({
        title: "Success",
        description: `${getItemName(stashItem)} moved to fighter's ${stashItem.type === 'vehicle' ? 'vehicles' : 'equipment'}`,
      });

      setSelectedItem(null);
      setSelectedFighter('');
      return true;
    } catch (error) {
      console.error('Error moving item:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move item",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-5xl w-full space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        
        {stash.length === 0 ? (
          <p className="text-gray-500 italic">No items in stash</p>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center text-sm font-medium text-gray-700 px-4 py-2">
                <div className="w-4 mr-3" />
                <div className="flex-grow">Name</div>
                <div className="w-32 text-right">Type</div>
                <div className="w-20 text-right">Value</div>
              </div>
              <div className="space-y-2 px-4">
                {stash.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center p-2 bg-gray-50 rounded-md"
                  >
                    <input
                      type="radio"
                      name="stash-item"
                      checked={selectedItem === index}
                      onChange={() => setSelectedItem(index)}
                      className="h-4 w-4 border-gray-300 text-black focus:ring-black mr-3"
                    />
                    <span className="flex-grow">{getItemName(item)}</span>
                    <span className="w-32 text-right text-sm text-gray-600 whitespace-nowrap">
                      {item.type === 'vehicle' 
                        ? 'Vehicle' 
                        : item.equipment_category || 'Equipment'
                      }
                    </span>
                    <span className="w-20 text-right">{item.cost}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4">
              <div className="border-t pt-4">
                <label htmlFor="fighter-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Fighter or Vehicle
                  {selectedItem !== null && isVehicle(stash[selectedItem]) && (
                    <span className="text-sm text-gray-500 ml-2">(Only Crew fighters can receive vehicles)</span>
                  )}
                </label>
                <select
                  id="fighter-select"
                  value={selectedFighter}
                  onChange={(e) => setSelectedFighter(e.target.value)}
                  className={`w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black mb-4 
                    ${selectedItem === null ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={selectedItem === null}
                >
                  <option value="">
                    {selectedItem !== null && 
                      (isVehicleExclusive(stash[selectedItem])
                        ? "Select a vehicle"
                        : isVehicleCompatible(stash[selectedItem])
                          ? "Select a fighter or vehicle"
                          : "Select a fighter"
                      )}
                  </option>
                  {selectedItem !== null && (
                    <>
                      {isVehicleCompatible(stash[selectedItem]) && (
                        <optgroup label="Vehicles">
                          {vehicles.map((vehicle) => (
                            <option 
                              key={`vehicle-${vehicle.id}`}
                              value={`vehicle-${vehicle.id}`}
                            >
                              {vehicle.vehicle_name} ({vehicle.cost} credits)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      
                      {!isVehicleExclusive(stash[selectedItem]) && (
                        <optgroup label="Fighters">
                          {fighters.map((fighter) => {
                            const isDisabled = selectedItem !== null && 
                                             isVehicle(stash[selectedItem]) && 
                                             !isCrew(fighter);
                            
                            return (
                              <option 
                                key={fighter.id} 
                                value={fighter.id}
                                disabled={isDisabled}
                                className={isDisabled ? 'text-gray-400' : ''}
                              >
                                {fighter.fighter_name} ({fighter.credits} credits)
                                {fighter.fighter_class === 'Crew' ? ' - Crew' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </>
                  )}
                </select>

                <Button
                  onClick={handleMoveToFighter}
                  disabled={
                    selectedItem === null || 
                    !selectedFighter || 
                    isLoading || 
                    (isVehicle(stash[selectedItem]) && !isCrew(fighters.find(f => f.id === selectedFighter)!)) ||
                    (isVehicleExclusive(stash[selectedItem]) && !selectedFighter.startsWith('vehicle-')) ||
                    (!selectedFighter.startsWith('vehicle-') && isVehicleCompatible(stash[selectedItem]) && !isCrew(fighters.find(f => f.id === selectedFighter)!))
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