'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { FighterProps } from '@/types/fighter';
import { VehicleProps } from '@/types/vehicle';
import { useToast } from "@/components/ui/use-toast";
import { createClient } from '@/utils/supabase/client';
import Modal from "@/components/modal";
import { Input } from "@/components/ui/input";
import { Plus, Minus, X } from "lucide-react";

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
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const { toast } = useToast();
  const [editingVehicle, setEditingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [editedVehicleName, setEditedVehicleName] = useState('');
  const [deletingVehicle, setDeletingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [vehicleSpecialRules, setVehicleSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Filter for only Crew fighters who don't have vehicles assigned
  const crewFighters = fighters.filter(fighter => 
    fighter.fighter_class === 'Crew' && 
    (!fighter.vehicles || fighter.vehicles.length === 0)
  );

  // Get all vehicles, including those assigned to fighters
  const allVehicles = useMemo<CombinedVehicleProps[]>(() => {
    // Create a map of vehicle IDs that are assigned to fighters
    const assignedVehicleIds = new Set(
      fighters.flatMap(fighter => 
        (fighter.vehicles || []).map(vehicle => vehicle.id)
      )
    );

    // Filter out vehicles that are already assigned to fighters
    const unassignedVehicles = vehicles.filter(
      vehicle => !assignedVehicleIds.has(vehicle.id)
    );

    const fighterVehicles = fighters
      .flatMap(fighter => (fighter.vehicles || [])
        .map(vehicle => ({
          ...vehicle,
          assigned_to: fighter.fighter_name,
          gang_id: gangId,
          body_slots: vehicle.body_slots || 0,
          body_slots_occupied: vehicle.body_slots_occupied || 0,
          drive_slots: vehicle.drive_slots || 0,
          drive_slots_occupied: vehicle.drive_slots_occupied || 0,
          engine_slots: vehicle.engine_slots || 0,
          engine_slots_occupied: vehicle.engine_slots_occupied || 0,
          special_rules: vehicle.special_rules || [],
          equipment: vehicle.equipment || []
        } as CombinedVehicleProps)));
    
    const allVehiclesCombined = [...unassignedVehicles, ...fighterVehicles];
    
    // Sort vehicles by name (vehicle_name or vehicle_type as fallback)
    return allVehiclesCombined.sort((a, b) => {
      const nameA = (a.vehicle_name || a.vehicle_type || '').toLowerCase();
      const nameB = (b.vehicle_name || b.vehicle_type || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [vehicles, fighters, gangId]);

  const handleMoveToFighter = async () => {
    if (selectedVehicle === null || !selectedFighter) return;
    
    setIsLoading(true);
    
    // Store original state for potential rollback
    const originalVehicles = [...vehicles];
    const originalFighters = [...fighters];
    
    try {
      const vehicle = allVehicles[selectedVehicle];
      const selectedFighterData = fighters.find(f => f.id === selectedFighter);
      
      if (!selectedFighterData) {
        throw new Error('Selected fighter not found');
      }

      // OPTIMISTIC UPDATES - Update UI immediately
      
      // 1. Remove the vehicle from the unassigned vehicles list (it will now be assigned to fighter)
      const updatedUnassignedVehicles = vehicles.filter(v => v.id !== vehicle.id);
      
      // 2. Remove the vehicle from any fighter who currently has it
      const oldFighter = fighters.find(f => (f.vehicles || []).some(v => v.id === vehicle.id));
      if (oldFighter && onFighterUpdate) {
        onFighterUpdate({ ...oldFighter, vehicles: [] });
      }
      
      // 3. Update the selected fighter with the new vehicle
      const updatedVehicle = {
        id: vehicle.id,
        created_at: vehicle.created_at,
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
        body_slots: vehicle.body_slots,
        body_slots_occupied: vehicle.body_slots_occupied,
        drive_slots: vehicle.drive_slots,
        drive_slots_occupied: vehicle.drive_slots_occupied,
        engine_slots: vehicle.engine_slots,
        engine_slots_occupied: vehicle.engine_slots_occupied,
        special_rules: vehicle.special_rules || [],
        equipment: vehicle.equipment || [],
        cost: vehicle.cost, // Include the cost property
        effects: {} // Initialize empty effects object
      };
      
      const updatedFighter = {
        ...selectedFighterData,
        vehicles: [updatedVehicle] // Replace any existing vehicles
      };

      // Apply optimistic updates
      if (onVehicleUpdate) {
        onVehicleUpdate(updatedUnassignedVehicles);
      }
      if (onFighterUpdate) {
        onFighterUpdate(updatedFighter);
      }

      // Reset selection immediately for better UX
      setSelectedVehicle(null);
      setSelectedFighter('');

      // Show optimistic success message
      toast({
        title: "Success",
        description: `Vehicle assigned to fighter successfully`,
      });

      // NOW make the API call
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

      // Handle any additional updates from the server response
      // If there was a vehicle swap, we need to add the old vehicle back to the list
      if (data.removed_from) {
        const vehiclesWithSwapped = [...updatedUnassignedVehicles, {
          ...data.removed_from,
          gang_id: gangId,
          equipment: []
        }];
        
        if (onVehicleUpdate) {
          onVehicleUpdate(vehiclesWithSwapped);
        }
      }

    } catch (error) {
      console.error('Error moving vehicle:', error);
      
      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        onVehicleUpdate(originalVehicles);
      }
      
      // Rollback fighter updates if there were any
      if (deletingVehicle && deletingVehicle.assigned_to && onFighterUpdate) {
        const originalFighter = originalFighters.find(f => f.fighter_name === deletingVehicle.assigned_to);
        if (originalFighter) {
          onFighterUpdate(originalFighter);
        }
      }

      // Reset selection state
      setSelectedVehicle(null);
      setSelectedFighter('');

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
    setVehicleSpecialRules(vehicle.special_rules || []);
  };

  const handleAddSpecialRule = () => {
    if (!newSpecialRule.trim()) return;
    
    if (vehicleSpecialRules.includes(newSpecialRule.trim())) {
      setNewSpecialRule('');
      return;
    }
    
    setVehicleSpecialRules(prev => [...prev, newSpecialRule.trim()]);
    setNewSpecialRule('');
  };

  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setVehicleSpecialRules(prev => prev.filter(rule => rule !== ruleToRemove));
  };

  const handleSaveVehicleName = async () => {
    if (!editingVehicle) return true;
    
    setIsEditLoading(true);
    
    // Store original state for potential rollback
    const originalVehicles = [...allVehicles];
    const originalFighters = [...fighters];
    
    try {
      // OPTIMISTIC UPDATES - Update UI immediately
      
      // Update both the vehicles list and any fighter that has this vehicle
      if (onVehicleUpdate) {
        const updatedVehicles = allVehicles.map(v => 
          v.id === editingVehicle.id 
            ? { ...v, vehicle_name: editedVehicleName, special_rules: vehicleSpecialRules }
            : v
        );
        onVehicleUpdate(updatedVehicles);
      }

      // Update fighter's vehicle if assigned
      if (editingVehicle.assigned_to && onFighterUpdate) {
        const fighter = fighters.find(f => f.fighter_name === editingVehicle.assigned_to);
        if (fighter && fighter.vehicles?.[0]) {
          const updatedFighter = {
            ...fighter,
            vehicles: [{
              ...fighter.vehicles[0],
              vehicle_name: editedVehicleName,
              special_rules: vehicleSpecialRules
            }]
          };
          onFighterUpdate(updatedFighter);
        }
      }

      // Show optimistic success message
      toast({
        title: "Success",
        description: "Vehicle updated successfully",
      });

      // NOW make the API call
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No authenticated session found');
      }
      
      const response = await fetch(`/api/gangs/${gangId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          vehicleId: editingVehicle.id,
          vehicle_name: editedVehicleName,
          special_rules: vehicleSpecialRules,
          operation: 'update_vehicle_name' // Use the existing operation name
        })
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update vehicle');
      }
      
      console.log('Response from server:', responseData);
      
      // Check if the special rules were actually updated
      if (!responseData.updatedSpecialRules && vehicleSpecialRules.length > 0) {
        // If we get success but no special rules update confirmation
        console.warn('Warning: Special rules may not have been updated on the server');
      }
      
      return true;
    } catch (error) {
      console.error('Error updating vehicle:', error);
      
      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        onVehicleUpdate(originalVehicles);
      }
      
      // Rollback fighter updates if there were any
      if (editingVehicle.assigned_to && onFighterUpdate) {
        const originalFighter = originalFighters.find(f => f.fighter_name === editingVehicle.assigned_to);
        if (originalFighter) {
          onFighterUpdate(originalFighter);
        }
      }

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update vehicle",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>, vehicle: CombinedVehicleProps) => {
    e.preventDefault();
    setDeletingVehicle(vehicle);
  };

  const handleDeleteVehicle = async () => {
    if (!deletingVehicle) return false;

    setIsDeleteLoading(true);
    
    // Store original state for potential rollback
    const originalVehicles = [...vehicles];
    const originalFighters = [...fighters];
    
    try {
      // Get session for auth headers
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No authenticated session found');
      }
      
      // Check if this is an unassigned vehicle (for logging purposes)
      const isUnassigned = !deletingVehicle.assigned_to;
      
      // OPTIMISTIC UPDATES - Update UI immediately
      // For unassigned vehicles, removing from the vehicles list will update the wealth
      // For assigned vehicles, updating the fighter will update the rating
      
      // First, update the local vehicles list
      const updatedVehicles = vehicles.filter(v => v.id !== deletingVehicle.id);
      if (onVehicleUpdate) {
        onVehicleUpdate(updatedVehicles);
      }
      
      // Then update the fighter if the vehicle was assigned
      let updatedFighter = null;
      if (!isUnassigned && onFighterUpdate) {
        updatedFighter = fighters.find(f => f.fighter_name === deletingVehicle.assigned_to);
        if (updatedFighter) {
          const fighterWithoutVehicle = {
            ...updatedFighter,
            vehicles: (updatedFighter.vehicles || []).filter(v => v.id !== deletingVehicle.id)
          };
          onFighterUpdate(fighterWithoutVehicle);
        }
      }

      // Show optimistic success message
      toast({
        description: `${deletingVehicle.vehicle_name || deletingVehicle.vehicle_type} has been deleted.`,
        variant: "default"
      });

      // Close the modal immediately for better UX
      setDeletingVehicle(null);
      
      // NOW make the API call to actually delete the vehicle
      const response = await fetch(`/api/gangs/${gangId}/vehicles`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          vehicleId: deletingVehicle.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete vehicle');
      }

      return true;
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      
      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        onVehicleUpdate(originalVehicles);
      }
      
      // Rollback fighter updates if there were any
      if (deletingVehicle && deletingVehicle.assigned_to && onFighterUpdate) {
        const originalFighter = originalFighters.find(f => f.fighter_name === deletingVehicle.assigned_to);
        if (originalFighter) {
          onFighterUpdate(originalFighter);
        }
      }

      // Show error message
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete vehicle',
        variant: "destructive"
      });
      
      // Reopen the modal since the deletion failed
      setDeletingVehicle(deletingVehicle);
      
      return false;
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <div className="container max-w-5xl w-full space-y-4 mx-auto">
      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-xl md:text-2xl font-bold mb-6">{title}</h2>
        
        {allVehicles.length === 0 ? (
          <p className="text-gray-500 italic text-center">No vehicles available.</p>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center text-sm font-medium text-gray-700 px-0 py-2">
                <div className="w-4 mr-5" />
                <div className="flex w-64">Name</div>
                <div className="w-64">Type</div>
                <div className="w-64">Crew</div>
                <div className="flex-1" />
                <div className="w-48 text-right">Actions</div>
                <div className="w-20 text-right mr-2">Value</div>
              </div>
              
              <div className="space-y-2 px-0">
                {allVehicles.map((vehicle, index) => (
                  <label
                    key={`${vehicle.id}-${vehicle.assigned_to || 'unassigned'}`}
                    className="flex items-center p-2 bg-gray-50 rounded-md cursor-pointer"
                    onClick={() => setSelectedVehicle(index)}
                  >
                    <input
                      type="radio"
                      name="vehicle-item"
                      checked={selectedVehicle === index}
                      onChange={() => setSelectedVehicle(index)}
                      className="h-3 w-3 max-w-3 min-w-3 border-gray-300 text-black focus:ring-black mr-3"
                    />
                    <span className="flex w-64 overflow-hidden text-ellipsis">
                      {vehicle.vehicle_name || vehicle.vehicle_type}
                    </span>
                    <span className="w-64 overflow-hidden text-ellipsis text-nowrap">
                      {vehicle.vehicle_type}
                    </span>
                    <span className="w-64 overflow-hidden text-ellipsis text-gray-600">
                      {vehicle.assigned_to || '-'}
                    </span>
                    <div className="flex-1" />
                    <div className="w-48 flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs py-0"
                        onClick={(e) => handleEditClick(e, vehicle)}
                        disabled={isLoading || isEditLoading}
                      >
                        {isEditLoading ? 'Saving...' : 'Edit'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-xs py-0"
                        onClick={(e) => handleDeleteClick(e, vehicle)}
                        disabled={isLoading || isDeleteLoading}
                      >
                        Delete
                      </Button>
                    </div>
                    <span className="w-20 text-right">{vehicle.cost}</span>
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
                  <option value="">Select a crew</option>
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
                  Move to Crew
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {editingVehicle && (
        <Modal
          title="Edit Vehicle"
          onClose={() => setEditingVehicle(null)}
          onConfirm={handleSaveVehicleName}
          confirmText="Save"
        >
          <div className="space-y-4">
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
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Rules
              </label>
              <div className="flex space-x-2 mb-2">
                <Input
                  type="text"
                  value={newSpecialRule}
                  onChange={(e) => setNewSpecialRule(e.target.value)}
                  placeholder="Add a special rule"
                  className="flex-grow"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSpecialRule();
                    }
                  }}
                />
                <Button
                  onClick={handleAddSpecialRule}
                  type="button"
                >
                  Add
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {vehicleSpecialRules.map((rule, index) => (
                  <div
                    key={index}
                    className="bg-gray-100 px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {deletingVehicle && (
        <Modal
          title="Delete Vehicle"
          onClose={() => setDeletingVehicle(null)}
          onConfirm={handleDeleteVehicle}
          confirmText="Delete"
        >
          <div className="space-y-4">
            <p>
              Are you sure you want to delete the vehicle &quot;{deletingVehicle.vehicle_name || deletingVehicle.vehicle_type}&quot;?
            </p>
            <p className="text-sm text-red-600">
              This will permanently delete the vehicle and all its equipment.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
} 