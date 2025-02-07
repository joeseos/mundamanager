'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FighterProps } from '@/types/fighter';
import { VehicleProps } from '@/types/vehicle';
import { useToast } from "@/components/ui/use-toast";

interface GangVehiclesProps {
  vehicles: VehicleProps[];
  fighters: FighterProps[];
  gangId: string;
  title?: string;
  onVehicleUpdate?: (updatedVehicles: VehicleProps[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps) => void;
}

export default function GangVehicles({ 
  vehicles, 
  fighters,
  gangId,
  title = 'Vehicles',
  onVehicleUpdate,
  onFighterUpdate
}: GangVehiclesProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Filter for only Crew fighters
  const crewFighters = fighters.filter(fighter => fighter.fighter_class === 'Crew');

  const handleMoveToFighter = async () => {
    if (selectedVehicle === null || !selectedFighter) return;
    
    setIsLoading(true);
    try {
      const vehicle = vehicles[selectedVehicle];
      
      const response = await fetch(`/api/gangs/${gangId}/vehicles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          fighterId: selectedFighter,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to move vehicle to fighter');
      }

      // Update local state by removing the assigned vehicle
      const updatedVehicles = vehicles.filter((_, index) => index !== selectedVehicle);
      if (onVehicleUpdate) {
        onVehicleUpdate(updatedVehicles);
      }

      // Update the fighter with the new vehicle
      const selectedFighterData = fighters.find(f => f.id === selectedFighter);
      if (selectedFighterData && onFighterUpdate) {
        // Transform the equipment to match the expected structure
        const transformedEquipment = vehicle.equipment?.map(equip => ({
          id: equip.fighter_equipment_id, // or equip.id
          fighter_equipment_id: equip.fighter_equipment_id,
          equipment_id: equip.equipment_id,
          equipment_name: equip.equipment_name,
          equipment_type: equip.equipment_type,
          purchase_cost: equip.cost || 0,
          original_cost: equip.base_cost || 0,
          weapon_profiles: equip.weapon_profiles,
          vehicle_equipment_profiles: equip.vehicle_equipment_profiles
        })) || [];

        const updatedVehicle: Vehicle = {
          ...vehicle,
          fighter_id: selectedFighter,
          equipment: transformedEquipment
        };
        
        const updatedFighter = {
          ...selectedFighterData,
          vehicles: [...(selectedFighterData.vehicles || []), updatedVehicle]
        };
        onFighterUpdate(updatedFighter);
      }

      toast({
        title: "Success",
        description: `Vehicle assigned to fighter successfully`,
      });

      // Reset selection
      setSelectedVehicle(null);
      setSelectedFighter('');

    } catch (error) {
      console.error('Error moving vehicle:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move vehicle to fighter",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-5xl w-full space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        
        {vehicles.length === 0 ? (
          <p className="text-gray-500 italic">No vehicles available.</p>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center text-sm font-medium text-gray-700 px-0 py-2">
                <div className="w-4 mr-5" />
                <div className="flex w-64">Name</div>
                <div className="w-64">Type</div>
                <div className="ml-auto w-20 text-right">Value</div>
              </div>
              
              <div className="space-y-2 px-0">
                {vehicles.map((vehicle, index) => (
                  <label
                    key={vehicle.id}
                    className="flex items-center p-2 bg-gray-50 rounded-md"
                  >
                    <input
                      type="radio"
                      name="vehicle-item"
                      checked={selectedVehicle === index}
                      onChange={() => setSelectedVehicle(index)}
                      className="h-4 w-4 border-gray-300 text-black focus:ring-black mr-3"
                    />
                    <span className="flex w-64 overflow-hidden text-ellipsis">{vehicle.vehicle_name}</span>
                    <span className="w-64">{vehicle.vehicle_type}</span>
                    <span className="ml-auto w-20 text-right">{vehicle.cost}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-0">
              <div className="border-t pt-4">
                <label htmlFor="fighter-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Select a Crew
                </label>
                <select
                  id="fighter-select"
                  value={selectedFighter}
                  onChange={(e) => setSelectedFighter(e.target.value)}
                  className="w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black mb-4"
                >
                  <option value="">Select a fighter</option>
                  {crewFighters.map((fighter) => (
                    <option 
                      key={fighter.id} 
                      value={fighter.id}
                    >
                      {fighter.fighter_name}
                    </option>
                  ))}
                </select>

                <Button
                  onClick={handleMoveToFighter}
                  disabled={selectedVehicle === null || !selectedFighter || isLoading}
                  className="w-full"
                >
                  Move to Fighter
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 