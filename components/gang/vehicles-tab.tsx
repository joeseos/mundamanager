'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { FighterProps } from '@/types/fighter';
import { VehicleProps } from '@/types/vehicle';
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { assignVehicleToFighter } from '@/app/actions/assign-vehicle-to-fighter';
import { updateVehicle } from '@/app/actions/update-vehicle';
import { deleteVehicle } from '@/app/actions/delete-vehicle';
import { sellVehicle } from '@/app/actions/sell-vehicle';
import { UserPermissions } from '@/types/user-permissions';
import { LuSquarePen } from 'react-icons/lu';
import { MdCurrencyExchange } from 'react-icons/md';
import { unassignVehicle } from '@/app/actions/unassign-vehicle';
import { HiUserRemove } from "react-icons/hi";
import VehicleEdit from '@/components/gang/vehicle-edit';

interface GangVehiclesProps {
  vehicles: VehicleProps[];
  fighters: FighterProps[];
  gangId: string;
  title?: string;
  onVehicleUpdate?: (updatedVehicles: VehicleProps[]) => void;
  onFighterUpdate?: (updatedFighter: FighterProps, skipRatingUpdate?: boolean) => void;
  userPermissions?: UserPermissions;
  onGangCreditsUpdate?: (newCredits: number) => void;
  onGangRatingUpdate?: (newRating: number) => void;
  onGangWealthUpdate?: (newWealth: number) => void;
  currentRating?: number;
  currentWealth?: number;
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
  onFighterUpdate,
  userPermissions,
  onGangCreditsUpdate,
  onGangRatingUpdate,
  onGangWealthUpdate,
  currentRating,
  currentWealth
}: GangVehiclesProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [isSellLoading, setIsSellLoading] = useState(false);
  const [isUnassignLoading, setIsUnassignLoading] = useState(false);
  const { toast } = useToast();
  const [editingVehicle, setEditingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [sellingVehicle, setSellingVehicle] = useState<CombinedVehicleProps | null>(null);
  const [sellAmount, setSellAmount] = useState<number>(0);

  // Calculate total vehicle value including equipment
  const calculateVehicleTotalValue = (vehicle: CombinedVehicleProps): number => {
    const baseCost = vehicle.cost || 0;
    
    // Equipment cost using the correct property name
    const equipmentCost = (vehicle.equipment || []).reduce((sum, eq) => {
      // Use purchase_cost if available (for vehicle equipment), fallback to cost
      return sum + ((eq as any).purchase_cost || eq.cost || 0);
    }, 0);
    
    return baseCost + equipmentCost;
  };

  const handleUnassignVehicle = async (e: React.MouseEvent<HTMLButtonElement>, vehicle: CombinedVehicleProps) => {
    e.preventDefault();
    if (!vehicle.assigned_to) return;

    setIsUnassignLoading(true);

    // Store original state for potential rollback
    const originalVehicles = [...vehicles];
    const originalFighters = [...fighters];
    const originalRating = currentRating || 0;

    try {
      // Calculate vehicle cost for rating update
      const vehicleCost = calculateVehicleTotalValue(vehicle);

      // Optimistic updates
      // 1) Remove from fighter and adjust fighter credits
      const assignedFighter = fighters.find(f => f.fighter_name === vehicle.assigned_to);
      if (assignedFighter && onFighterUpdate) {
        const fighterWithoutVehicle = {
          ...assignedFighter,
          vehicles: [],
          credits: Math.max(0, (assignedFighter.credits || 0) - vehicleCost)
        };
        onFighterUpdate(fighterWithoutVehicle, true);
      }

      // 2) Add to unassigned vehicles list
      if (onVehicleUpdate) {
        // Create a clean unassigned vehicle without assigned_to property
        const { assigned_to, ...unassignedVehicle } = vehicle;
        const cleanVehicle: VehicleProps = {
          ...unassignedVehicle,
          fighter_id: undefined as any,
          equipment: vehicle.equipment || [],
          special_rules: vehicle.special_rules || [],
        } as VehicleProps;

        // Add to existing unassigned vehicles and deduplicate
        const updatedVehicles = [...originalVehicles, cleanVehicle];
        const deduped = Array.from(new Map(updatedVehicles.map(v => [v.id, v])).values());
        onVehicleUpdate(deduped);
      }

      // 3) Update gang rating optimistically (subtract vehicle cost)
      if (onGangRatingUpdate && vehicleCost > 0) {
        const newRating = Math.max(0, originalRating - vehicleCost);
        onGangRatingUpdate(newRating);
      }

      // Server call
      const result = await unassignVehicle({ vehicleId: vehicle.id, gangId });
      if (!result.success) {
        throw new Error(result.error || 'Failed to unassign vehicle');
      }

      toast({ title: 'Success', description: `${vehicle.vehicle_name || vehicle.vehicle_type} unassigned` });
    } catch (error) {
      console.error('Error unassigning vehicle:', error);

      // Rollback
      if (onVehicleUpdate) {
        onVehicleUpdate(originalVehicles);
      }
      if (onFighterUpdate && vehicle.assigned_to) {
        const originalFighter = originalFighters.find(f => f.fighter_name === vehicle.assigned_to);
        if (originalFighter) onFighterUpdate(originalFighter, true);
      }
      // Rollback gang rating
      if (onGangRatingUpdate) {
        onGangRatingUpdate(originalRating);
      }

      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to unassign vehicle', variant: 'destructive' });
    } finally {
      setIsUnassignLoading(false);
    }
  };

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

      // NOW make the API call using server action
      const result = await assignVehicleToFighter({
        vehicleId: vehicle.id,
        fighterId: selectedFighter,
        gangId: gangId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to move vehicle to fighter');
      }

      const data = result.data;

      // Handle any additional updates from the server response
      // If there was a vehicle swap, we need to add the old vehicle back to the list
      if (data?.removed_from) {
        const vehiclesWithSwapped = [...updatedUnassignedVehicles, {
          ...data.removed_from,
          gang_id: gangId,
          equipment: []
        }];
        // Keep only unassigned and deduplicate by id before pushing to parent
        const unassignedOnly = vehiclesWithSwapped.filter(v => !(v as any).assigned_to && !v.fighter_id);
        const deduped = Array.from(new Map(unassignedOnly.map(v => [v.id, v])).values());
        if (onVehicleUpdate) {
          onVehicleUpdate(deduped);
        }
      }

      // Update fighter's cost with the actual vehicle cost from server
      if (data?.vehicle_cost && onFighterUpdate) {
        const selectedFighterData = fighters.find(f => f.id === selectedFighter);
        if (selectedFighterData) {
          const baseCost = updatedVehicle.cost || 0;
          const delta = (data.vehicle_cost || 0) - baseCost;
          if (delta !== 0) {
            const correctedCredits = (selectedFighterData.credits || 0) + baseCost + delta;
            const fighterWithUpdatedCost = {
              ...selectedFighterData,
              vehicles: [updatedVehicle],
              credits: correctedCredits
            };
            onFighterUpdate(fighterWithUpdatedCost);
          }
        }
      }

    } catch (error) {
      console.error('Error moving vehicle:', error);
      
      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        // Only rollback unassigned vehicles to prevent double-counting
        const unassignedOnly = originalVehicles.filter(v => !(v as any).assigned_to && !v.fighter_id);
        onVehicleUpdate(unassignedOnly);
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
  };

  const handleSellClick = (e: React.MouseEvent<HTMLButtonElement>, vehicle: CombinedVehicleProps) => {
    e.preventDefault();
    setSellingVehicle(vehicle);
    setSellAmount(calculateVehicleTotalValue(vehicle));
  };

  const handleSaveVehicle = async (vehicleId: string, vehicleName: string, specialRules: string[], statAdjustments?: Record<string, number>) => {
    if (!editingVehicle) return true;

    setIsEditLoading(true);

    // Store original state for potential rollback
    const originalVehicles = [...allVehicles];
    const originalFighters = [...fighters];

    try {
      // OPTIMISTIC UPDATES - Update UI immediately

      // Create synthetic user effects from stat adjustments for optimistic update
      const createOptimisticEffects = (adjustments?: Record<string, number>) => {
        if (!adjustments || Object.keys(adjustments).length === 0) return undefined;

        const userEffects = Object.entries(adjustments).map(([statName, value]) => ({
          id: `optimistic-${statName}`,
          effect_name: statName.charAt(0).toUpperCase() + statName.slice(1),
          fighter_effect_modifiers: [{
            id: `optimistic-modifier-${statName}`,
            fighter_effect_id: `optimistic-${statName}`,
            stat_name: statName,
            numeric_value: value
          }]
        }));

        return userEffects;
      };

      const optimisticUserEffects = createOptimisticEffects(statAdjustments);

      // Update both the vehicles list and any fighter that has this vehicle
      if (onVehicleUpdate) {
        const updatedVehicles = allVehicles.map(v => {
          if (v.id === vehicleId) {
            const updated = { ...v, vehicle_name: vehicleName, special_rules: specialRules };
            // Add optimistic user effects if stat adjustments exist
            if (optimisticUserEffects) {
              updated.effects = {
                ...updated.effects,
                user: [...(updated.effects?.user || []), ...optimisticUserEffects]
              };
            }
            return updated;
          }
          return v;
        });
        // Only pass unassigned vehicles to parent - assigned vehicles are handled via fighter updates
        const unassignedOnly = updatedVehicles.filter(v => !(v as any).assigned_to && !v.fighter_id);
        onVehicleUpdate(unassignedOnly);
      }

      // Update fighter's vehicle if assigned
      if (editingVehicle.assigned_to && onFighterUpdate) {
        const fighter = fighters.find(f => f.fighter_name === editingVehicle.assigned_to);
        if (fighter && fighter.vehicles?.[0]) {
          const updatedVehicle = {
            ...fighter.vehicles[0],
            vehicle_name: vehicleName,
            special_rules: specialRules
          };

          // Add optimistic user effects if stat adjustments exist
          if (optimisticUserEffects) {
            updatedVehicle.effects = {
              ...updatedVehicle.effects,
              user: [...(updatedVehicle.effects?.user || []), ...optimisticUserEffects]
            };
          }

          const updatedFighter = {
            ...fighter,
            vehicles: [updatedVehicle]
          };
          onFighterUpdate(updatedFighter);
        }
      }

      // Show optimistic success message
      toast({
        title: "Success",
        description: "Vehicle updated successfully",
      });

      // NOW make the API call using server action
      const assignedFighter = editingVehicle.assigned_to ?
        fighters.find(f => f.fighter_name === editingVehicle.assigned_to) : undefined;

      const result = await updateVehicle({
        vehicleId: vehicleId,
        vehicleName: vehicleName,
        specialRules: specialRules,
        gangId: gangId,
        assignedFighterId: assignedFighter?.id,
        statAdjustments: statAdjustments
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update vehicle');
      }


      // Cache invalidation is handled in the server action

      return true;
    } catch (error) {
      console.error('Error updating vehicle:', error);

      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        // Only rollback unassigned vehicles to prevent double-counting
        const unassignedOnly = originalVehicles.filter(v => !(v as any).assigned_to && !v.fighter_id);
        onVehicleUpdate(unassignedOnly);
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

  const handleConfirmSellVehicle = async () => {
    if (!sellingVehicle) return false;

    setIsSellLoading(true);

    // Store original state for potential rollback
    const originalVehicles = [...vehicles];
    const originalFighters = [...fighters];
    const originalWealth = currentWealth || 0;

    try {
      const isAssigned = !!sellingVehicle.assigned_to;
      const vehicleCost = calculateVehicleTotalValue(sellingVehicle);

      // OPTIMISTIC UPDATES
      if (!isAssigned && onVehicleUpdate) {
        const updatedVehicles = vehicles.filter(v => v.id !== sellingVehicle.id);
        onVehicleUpdate(updatedVehicles);
      }

      if (isAssigned && onFighterUpdate) {
        const fighter = fighters.find(f => f.fighter_name === sellingVehicle.assigned_to);
        if (fighter) {
          const updatedFighter = {
            ...fighter,
            vehicles: [],
            credits: Math.max(0, (fighter.credits || 0) - vehicleCost)
          };
          onFighterUpdate(updatedFighter, true);
        }
      }

      // Update wealth optimistically
      // Wealth = rating + credits + stash_value + unassigned_vehicles_value
      // If assigned: rating decreases by vehicle cost, credits increase by sell value
      //              wealthDelta = -vehicleCost + sellAmount
      // If unassigned: rating unchanged, credits increase by sell value, unassigned vehicles value decreases by vehicle cost
      //                wealthDelta = -vehicleCost + sellAmount
      if (onGangWealthUpdate) {
        const wealthDelta = -vehicleCost + sellAmount;
        onGangWealthUpdate(Math.max(0, originalWealth + wealthDelta));
      }

      // Server call
      const result = await sellVehicle({
        vehicleId: sellingVehicle.id,
        gangId,
        manual_cost: sellAmount
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to sell vehicle');
      }

      // Update gang credits immediately if provided
      if (typeof result.data?.gang?.credits === 'number' && onGangCreditsUpdate) {
        onGangCreditsUpdate(result.data.gang.credits);
      }
      // Update gang rating and wealth immediately if provided
      if (typeof result.data?.updated_gang_rating === 'number' && onGangRatingUpdate) {
        onGangRatingUpdate(result.data.updated_gang_rating);
      }
      if (typeof result.data?.gang?.wealth === 'number' && onGangWealthUpdate) {
        onGangWealthUpdate(result.data.gang.wealth);
      }

      toast({
        title: 'Success',
        description: `${sellingVehicle.vehicle_name || sellingVehicle.vehicle_type} sold for ${sellAmount} credits`,
      });

      setSellingVehicle(null);
      setSelectedVehicle(null);
      return true;
    } catch (error) {
      console.error('Error selling vehicle:', error);

      // ROLLBACK optimistic updates on error
      if (onVehicleUpdate) {
        onVehicleUpdate(originalVehicles);
      }
      if (onFighterUpdate && sellingVehicle?.assigned_to) {
        const originalFighter = originalFighters.find(f => f.fighter_name === sellingVehicle.assigned_to);
        if (originalFighter) {
          onFighterUpdate(originalFighter, true);
        }
      }
      if (onGangWealthUpdate) {
        onGangWealthUpdate(originalWealth);
      }

      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to sell vehicle',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSellLoading(false);
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
    const originalWealth = currentWealth || 0;

    try {
      // Check if this is an unassigned vehicle (for logging purposes)
      const isUnassigned = !deletingVehicle.assigned_to;

      // Calculate vehicle total value for wealth update
      const vehicleTotalValue = calculateVehicleTotalValue(deletingVehicle);

      // OPTIMISTIC UPDATES - Update UI immediately
      // Wealth decreases by vehicle total value (whether assigned or unassigned)
      if (onGangWealthUpdate) {
        onGangWealthUpdate(Math.max(0, originalWealth - vehicleTotalValue));
      }

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
      
      // NOW make the API call using server action
      const assignedFighter = deletingVehicle.assigned_to ? 
        fighters.find(f => f.fighter_name === deletingVehicle.assigned_to) : undefined;
      
      const result = await deleteVehicle({
        vehicleId: deletingVehicle.id,
        gangId: gangId,
        assignedFighterId: assignedFighter?.id
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete vehicle');
      }

      // Cache invalidation is handled in the server action

      return true;
    } catch (error) {
      console.error('Error deleting vehicle:', error);

      // ROLLBACK optimistic updates on error
      if (onGangWealthUpdate) {
        onGangWealthUpdate(originalWealth);
      }

      if (onVehicleUpdate) {
        // Only rollback unassigned vehicles to prevent double-counting
        const unassignedOnly = originalVehicles.filter(v => !(v as any).assigned_to && !v.fighter_id);
        onVehicleUpdate(unassignedOnly);
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
    <>
      <div className="container max-w-5xl w-full space-y-4 mx-auto">
        <div className="bg-card rounded-lg shadow-md p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-6">{title}</h2>

          {allVehicles.length === 0 ? (
            <p className="text-muted-foreground italic text-center">No vehicles available.</p>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center text-sm font-medium text-muted-foreground px-0 py-2">
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
                      className="flex items-center p-2 bg-muted rounded-md cursor-pointer"
                      onClick={() => setSelectedVehicle(index)}
                    >
                      <input
                        type="radio"
                        name="vehicle-item"
                        checked={selectedVehicle === index}
                        onChange={() => setSelectedVehicle(index)}
                        className="h-3 w-3 max-w-3 min-w-3 border-border text-foreground focus:ring-black mr-3"
                      />
                      <span className="flex w-64 overflow-hidden text-ellipsis">
                        {vehicle.vehicle_name || vehicle.vehicle_type}
                      </span>
                      <span className="w-64 overflow-hidden text-ellipsis text-nowrap">
                        {vehicle.vehicle_type}
                      </span>
                      <span className="w-64 overflow-hidden text-ellipsis text-muted-foreground">
                        {vehicle.assigned_to || '-'}
                      </span>
                      <div className="flex-1" />
                      <div className="w-48 flex justify-end gap-1">
                        {vehicle.assigned_to && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs py-0"
                            onClick={(e) => handleUnassignVehicle(e, vehicle)}
                            disabled={isLoading || isUnassignLoading || !userPermissions?.canEdit}
                            title="Unassign Vehicle"
                          >
                            <HiUserRemove className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs py-0"
                          onClick={(e) => handleEditClick(e, vehicle)}
                          disabled={isLoading || isEditLoading || !userPermissions?.canEdit}
                          title="Edit"
                        >
                          <LuSquarePen className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs py-0"
                          onClick={(e) => handleSellClick(e, vehicle)}
                          disabled={isLoading || isSellLoading || !userPermissions?.canEdit}
                          title="Sell"
                        >
                          <MdCurrencyExchange className="h-4 w-4" />
                        </Button>
                        {/* <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-xs py-0"
                          onClick={(e) => handleDeleteClick(e, vehicle)}
                          disabled={isLoading || isDeleteLoading || !userPermissions?.canEdit}
                          title="Delete"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button> */}
                      </div>
                      <span className="w-20 text-right">{calculateVehicleTotalValue(vehicle)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="px-0">
                <div className="border-t pt-4">
                  <label htmlFor="fighter-select" className="block text-sm font-medium text-muted-foreground mb-2">
                    Assign Vehicle to a Crew
                  </label>
                  <select
                    id="fighter-select"
                    value={selectedFighter}
                    onChange={(e) => setSelectedFighter(e.target.value)}
                    className="w-full p-2 border rounded-md border-border focus:outline-none focus:ring-2 focus:ring-black mb-4"
                  >
                    <option value="">Select a Crew</option>
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
                    disabled={selectedVehicle === null || !selectedFighter || isLoading || !userPermissions?.canEdit}
                    className="w-full"
                  >
                    Assign to Crew
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <VehicleEdit
        vehicle={editingVehicle}
        onClose={() => setEditingVehicle(null)}
        onSave={handleSaveVehicle}
        isLoading={isEditLoading}
      />
      {sellingVehicle && (
        <Modal
          title="Sell Vehicle"
          onClose={() => setSellingVehicle(null)}
          onConfirm={handleConfirmSellVehicle}
          confirmText={isSellLoading ? 'Selling...' : 'Sell'}
        >
          <div className="space-y-4">
            <p>
              Are you sure you want to sell <strong>{sellingVehicle.vehicle_name || sellingVehicle.vehicle_type}</strong>?
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Sell Value
                </label>
                <Input
                  type="number"
                  value={sellAmount}
                  min={0}
                  onChange={(e) => setSellAmount(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Credits will be returned to the gang. If the vehicle is assigned to a Crew, the gang rating will decrease accordingly.
            </p>
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
              Are you sure you want to delete the vehicle <strong>{deletingVehicle.vehicle_name || deletingVehicle.vehicle_type}</strong>?
            </p>
            <p className="text-sm text-red-600">
              This will permanently delete the vehicle and all its equipment.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}