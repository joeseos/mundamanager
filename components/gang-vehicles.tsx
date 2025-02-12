'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { FighterProps } from '@/types/fighter';
import { VehicleProps } from '@/types/vehicle';
import { useToast } from "@/components/ui/use-toast";
import { createClient } from '@/utils/supabase/client';
import Modal from "@/components/modal";
import { Input } from "@/components/ui/input";

interface GangVehiclesProps {
  vehicles: VehicleProps[];
  fighters: FighterProps[];
  gangId: string;
  title?: string;
  onVehicleUpdate?: (updatedVehicles: VehicleProps[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps) => void;
}

// Update the type to match VehicleProps
type CombinedVehicleProps = VehicleProps & {
  assigned_to?: string;
  // Remove fighter_id since it's already in VehicleProps with the correct type
};

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
  const [editingVehicle, setEditingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [editedVehicleName, setEditedVehicleName] = useState('');

  // Filter for only Crew fighters
  const crewFighters = fighters.filter(fighter => fighter.fighter_class === 'Crew');

  // Get all vehicles, including those assigned to fighters
  const allVehicles = useMemo<CombinedVehicleProps[]>(() => {
    const fighterVehicles = fighters
      .flatMap(fighter => (fighter.vehicles || [])
        .map(vehicle => ({
          ...vehicle,
          assigned_to: fighter.fighter_name,
          gang_id: gangId,
          cost: 0,
          body_slots: 0,
          body_slots_occupied: 0,
          drive_slots: 0,
          drive_slots_occupied: 0,
          engine_slots: 0,
          engine_slots_occupied: 0,
          special_rules: vehicle.special_rules || [],
          equipment: vehicle.equipment || []
        } as CombinedVehicleProps)));
    
    return [...vehicles, ...fighterVehicles];
  }, [vehicles, fighters, gangId]);

  const handleMoveToFighter = async () => {
    if (selectedVehicle === null || !selectedFighter) return;
    
    setIsLoading(true);
    try {
      const vehicle = allVehicles[selectedVehicle];
      
      // Get the session
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No authenticated session found');
      }
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/assign_crew_to_vehicle`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            p_vehicle_id: vehicle.id,
            p_fighter_id: selectedFighter,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to move vehicle to fighter');
      }

      const data = await response.json();

      // Update local state by removing the assigned vehicle
      const updatedVehicles = allVehicles.filter((_, index) => index !== selectedVehicle);

      // If there was a vehicle swap, add the old vehicle back to the list
      if (data.removed_from) {
        updatedVehicles.push({
          ...data.removed_from,
          gang_id: gangId,
          equipment: []
        });
      }

      if (onVehicleUpdate) {
        onVehicleUpdate(updatedVehicles);
      }

      // Update the fighter with the new vehicle
      const selectedFighterData = fighters.find(f => f.id === selectedFighter);
      if (selectedFighterData && onFighterUpdate) {
        const updatedVehicle = {
          ...vehicle,
          fighter_id: selectedFighter,
          equipment: vehicle.equipment || []
        };
        
        const updatedFighter = {
          ...selectedFighterData,
          vehicles: [updatedVehicle] // Replace any existing vehicles
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

  const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>, vehicle: CombinedVehicleProps) => {
    e.preventDefault();
    setEditingVehicle(vehicle);
    setEditedVehicleName(vehicle.vehicle_name);
  };

  const handleSaveVehicleName = async () => {
    if (!editingVehicle) return true;
    
    try {
      const response = await fetch(`/api/gangs/${gangId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleId: editingVehicle.id,
          vehicle_name: editedVehicleName,
          operation: 'update_vehicle_name'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update vehicle name');
      }

      // Update local state
      if (onVehicleUpdate) {
        const updatedVehicles = allVehicles.map(v => 
          v.id === editingVehicle.id 
            ? { ...v, vehicle_name: editedVehicleName }
            : v
        );
        onVehicleUpdate(updatedVehicles);
      }

      toast({
        title: "Success",
        description: "Vehicle name updated successfully",
      });
      
      return true;
    } catch (error) {
      console.error('Error updating vehicle name:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update vehicle name",
        variant: "destructive",
      });
      return false;
    }
  };

  const VehicleListItem = ({
    vehicle,
    index,
    isSelected,
    onSelect,
    onEdit
  }: {
    vehicle: CombinedVehicleProps;
    index: number;
    isSelected: boolean;
    onSelect: (index: number) => void;
    onEdit: (e: React.MouseEvent<HTMLButtonElement>, vehicle: CombinedVehicleProps) => void;
  }) => (
    <label className="flex items-center p-2 bg-gray-50 rounded-md">
      <input
        type="radio"
        name="vehicle-item"
        checked={isSelected}
        onChange={() => onSelect(index)}
        className="h-4 w-4 border-gray-300 text-black focus:ring-black mr-3"
      />
      <span className="flex w-64 overflow-hidden text-ellipsis">
        {vehicle.vehicle_name || vehicle.vehicle_type}
      </span>
      <span className="w-64 overflow-hidden text-ellipsis">
        {vehicle.vehicle_type}
      </span>
      <span className="w-64 overflow-hidden text-ellipsis text-gray-600">
        {vehicle.assigned_to || '-'}
      </span>
      <div className="flex-1" />
      <div className="w-32 flex justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs py-0"
          onClick={(e) => onEdit(e, vehicle)}
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Edit'}
        </Button>
      </div>
      <span className="w-20 text-right">{vehicle.cost}</span>
    </label>
  );

  return (
    <div className="container max-w-5xl w-full space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        
        {allVehicles.length === 0 ? (
          <p className="text-gray-500 italic">No vehicles available.</p>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center text-sm font-medium text-gray-700 px-0 py-2">
                <div className="w-4 mr-5" />
                <div className="flex w-64">Name</div>
                <div className="w-64">Type</div>
                <div className="w-64">Assigned To</div>
                <div className="flex-1" />
                <div className="w-32 text-right">Actions</div>
                <div className="w-20 text-right">Value</div>
              </div>
              
              <div className="space-y-2 px-0">
                {allVehicles.map((vehicle, index) => (
                  <VehicleListItem
                    key={vehicle.id}
                    vehicle={vehicle}
                    index={index}
                    isSelected={selectedVehicle === index}
                    onSelect={setSelectedVehicle}
                    onEdit={handleEditClick}
                  />
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
      {editingVehicle && (
        <Modal
          title="Edit Vehicle Name"
          onClose={() => setEditingVehicle(null)}
          onConfirm={handleSaveVehicleName}
          confirmText="Save"
        >
          <div>
            <label htmlFor="vehicleName" className="block text-sm font-medium text-gray-700">
              Vehicle Name
            </label>
            <Input
              type="text"
              id="vehicleName"
              value={editedVehicleName}
              onChange={(e) => setEditedVehicleName(e.target.value)}
              className="mt-1 w-full"
              placeholder="Enter vehicle name"
            />
          </div>
        </Modal>
      )}
    </div>
  );
} 