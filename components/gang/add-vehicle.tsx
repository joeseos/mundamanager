import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import Modal from '@/components/ui/modal';
import { useToast } from "@/components/ui/use-toast";
import { VehicleProps } from '@/types/vehicle';
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";
import { vehicleTypeRank } from "@/utils/vehicleTypeRank";
import { addGangVehicle, getGangVehicleTypes } from '@/app/lib/server-functions/add-gang-vehicle';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

interface VehicleType {
  id: string;
  vehicle_type: string;
  cost: number;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots: number;
  drive_slots: number;
  engine_slots: number;
  special_rules: string[];
}

interface AddVehicleProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  gangId: string;
  initialCredits: number;
  onVehicleAdd: (newVehicle: VehicleProps) => void;
  onGangCreditsUpdate?: (newCredits: number) => void; // NEW
}

export default function AddVehicle({ 
  showModal,
  setShowModal,
  gangId,
  initialCredits,
  onVehicleAdd,
  onGangCreditsUpdate
}: AddVehicleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TanStack Query mutation for adding vehicle
  const addVehicleMutation = useMutation({
    mutationFn: addGangVehicle,
    onMutate: async (variables) => {
      // Cancel outgoing refetches for gang data
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.vehicles(gangId) });
      
      // Snapshot previous values for rollback
      const previousCredits = queryClient.getQueryData(queryKeys.gangs.credits(gangId));
      
      // Optimistically update credits
      const vehicleCost = variables.cost || 0;
      queryClient.setQueryData(queryKeys.gangs.credits(gangId), (old: number) => {
        return Math.max(0, (old || 0) - vehicleCost);
      });
      
      return { previousCredits };
    },
    onError: (err, _variables, context) => {
      // Rollback optimistic updates
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousCredits);
      }
      
      console.error('Error adding vehicle:', err);
      setVehicleError(err instanceof Error ? err.message : 'Failed to add vehicle');
    },
    onSuccess: (result) => {
      if (result.success) {
        // Update credits with server authoritative value
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), result.data.gangCredits);
        
        // Invalidate related queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.vehicles(gangId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.detail(gangId) });
        
        const vehicle = result.data.vehicle;
        const paymentCost = result.data.paymentCost;
        const baseCost = result.data.baseCost;
        
        // Create the new vehicle object for the parent component
        const newVehicle: VehicleProps = {
          id: vehicle.id,
          vehicle_name: vehicle.vehicle_name,
          cost: vehicle.cost,
          vehicle_type_id: vehicle.vehicle_type_id,
          vehicle_type: vehicle.vehicle_type,
          gang_id: vehicle.gang_id,
          fighter_id: vehicle.fighter_id,
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
          created_at: vehicle.created_at,
          equipment: [],
          payment_cost: paymentCost
        };
        
        // Call the parent component's callback
        onVehicleAdd(newVehicle);

        // Also update credits callback if provided
        if (typeof onGangCreditsUpdate === 'function') {
          onGangCreditsUpdate(result.data.gangCredits);
        }

        // Create a more informative success message when base cost is different from payment
        let successMessage = `${vehicle.vehicle_name} added to gang successfully`;
        if (useBaseCost && paymentCost !== baseCost) {
          successMessage = `${vehicle.vehicle_name} added for ${paymentCost} credits (base value: ${baseCost} credits)`;
        }
        
        toast({
          description: successMessage,
          variant: "default"
        });

        // Reset form and close modal
        handleClose();
      } else {
        setVehicleError(result.error || 'Failed to add vehicle');
      }
    }
  });
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehicleCost, setVehicleCost] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [useBaseCost, setUseBaseCost] = useState<boolean>(true);
  
  // Fetch vehicle types when component mounts
  useEffect(() => {
    const fetchVehicleTypes = async () => {
      if (vehicleTypes.length === 0) {
        try {
          const result = await getGangVehicleTypes(gangId);
          if (result.success) {
            setVehicleTypes(result.data);
          } else {
            throw new Error(result.error);
          }
        } catch (error) {
          console.error('Error fetching vehicle types:', error);
          setVehicleError('Failed to load vehicle types');
          setShowModal(false); // Close modal if fetch failed
        }
      }
    };
    
    if (showModal) {
      fetchVehicleTypes();
    }
  }, [showModal, gangId, vehicleTypes.length, setShowModal]);

  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCost = e.target.value;
    setVehicleCost(newCost);
    
    // If cost is 0, automatically set useBaseCost to true
    if (newCost === '0') {
      setUseBaseCost(true);
    }
  };

  const getBaseCost = () => {
    const selectedVehicleType = vehicleTypes.find(v => v.id === selectedVehicleTypeId);
    return selectedVehicleType?.cost || 0;
  };

  const handleAddVehicle = async () => {
    if (!selectedVehicleTypeId) {
      setVehicleError('Please select a vehicle type');
      return false;
    }

    const selectedVehicleType = vehicleTypes.find(v => v.id === selectedVehicleTypeId);
    if (!selectedVehicleType) {
      setVehicleError('Vehicle type not found');
      return false;
    }

    // Get the entered cost or use the base cost if none entered
    const paymentCost = vehicleCost ? parseInt(vehicleCost) : selectedVehicleType.cost;
    const name = (vehicleName || selectedVehicleType.vehicle_type).trimEnd();
    
    // The cost for gang rating purposes
    const ratingCost = useBaseCost ? selectedVehicleType.cost : paymentCost;

    try {
      // Use TanStack mutation to add the vehicle
      addVehicleMutation.mutate({
        gangId,
        vehicleTypeId: selectedVehicleTypeId,
        cost: paymentCost, // This is what the user pays in credits
        vehicleName: name,
        baseCost: ratingCost // The vehicle's base cost for display and when equipped
      });
      
      return true;
    } catch (error) {
      console.error('Error details:', error);
      setVehicleError(error instanceof Error ? error.message : 'Failed to add vehicle');
      return false;
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setSelectedVehicleTypeId('');
    setVehicleCost('');
    setVehicleName('');
    setVehicleError(null);
    setUseBaseCost(true);
  };

  return (
    <Modal
      title="Add Vehicle"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {initialCredits}
          </span>
        </div>
      }
      content={
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Vehicle Name
            </label>
            <Input
              type="text"
              placeholder="Enter vehicle name"
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Vehicle Type
            </label>
            <select
              value={selectedVehicleTypeId}
              onChange={(e) => {
                setSelectedVehicleTypeId(e.target.value);
                const vehicle = vehicleTypes.find(v => v.id === e.target.value);
                if (vehicle) {
                  setVehicleCost(vehicle.cost.toString());
                }
              }}
              className="w-full p-2 border rounded"
            >
              <option value="">Select vehicle type</option>
              {Object.entries(
                vehicleTypes
                  .slice() // Shallow copy
                  .sort((a, b) => {
                    const rankA = vehicleTypeRank[a.vehicle_type.toLowerCase()] ?? Infinity;
                    const rankB = vehicleTypeRank[b.vehicle_type.toLowerCase()] ?? Infinity;
                    return rankA - rankB;
                  })
                  .reduce((groups, type) => {
                    const rank = vehicleTypeRank[type.vehicle_type.toLowerCase()] ?? Infinity;
                    let groupLabel = "Misc."; // Default category for unranked vehicles

                    if (rank <= 29) groupLabel = "Gang Vehicles";
                    else if (rank <= 49) groupLabel = "Universal Vehicles";
                    else if (rank <= 69) groupLabel = "Base Vehicle Templates";
                    else if (rank <= 89) groupLabel = "Sump Sea Vehicles";

                    if (!groups[groupLabel]) groups[groupLabel] = [];
                    groups[groupLabel].push(type);
                    return groups;
                  }, {} as Record<string, VehicleType[]>)
              ).map(([groupLabel, types]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {types.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.vehicle_type} - {type.cost} credits
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Cost (credits)
            </label>
            <Input
              type="number"
              value={vehicleCost}
              onChange={handleCostChange}
              className="w-full"
              min={0}
            />
            {selectedVehicleTypeId && (
              <p className="text-sm text-gray-500">
                Base cost: {vehicleTypes.find(v => v.id === selectedVehicleTypeId)?.cost} credits
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 mb-4 mt-2">
            <Checkbox 
              id="baseCostCheckbox" 
              checked={useBaseCost}
              onCheckedChange={(checked) => setUseBaseCost(checked as boolean)}
            />
            <label 
              htmlFor="baseCostCheckbox" 
              className="text-sm font-medium text-gray-700 cursor-pointer"
            >
              Use Listed Cost for Rating
            </label>
            <div className="relative group">
              <ImInfo />
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
                When enabled, the vehicle's rating is calculated using its listed cost (from the vehicle list), even if you paid a different amount. This listed cost will be used when the vehicle is assigned to a crew. Disable this if you want the rating to reflect the price actually paid.
              </div>
            </div>
          </div>

          {vehicleError && <p className="text-red-500">{vehicleError}</p>}
        </div>
      }
      onClose={handleClose}
      onConfirm={handleAddVehicle}
      confirmText="Add Vehicle"
      confirmDisabled={!selectedVehicleTypeId || !vehicleName || !vehicleCost}
    />
  );
} 