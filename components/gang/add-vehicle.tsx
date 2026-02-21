import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import Modal from '@/components/ui/modal';
import { toast } from 'sonner';
import { VehicleProps } from '@/types/vehicle';
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { ImInfo } from "react-icons/im";
import { vehicleTypeRank } from "@/utils/vehicleTypeRank";
import { addGangVehicle } from '@/app/actions/add-gang-vehicle';

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
  onGangCreditsUpdate?: (newCredits: number) => void;
  onGangWealthUpdate?: (newWealth: number) => void;
}

export default function AddVehicle({ 
  showModal,
  setShowModal,
  gangId,
  initialCredits,
  onVehicleAdd,
  onGangCreditsUpdate,
  onGangWealthUpdate
}: AddVehicleProps) {
  
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
          const response = await fetch(`/api/gangs/${gangId}/vehicles`);
          if (!response.ok) throw new Error('Failed to fetch vehicle types');
          const data = await response.json();
          setVehicleTypes(data);
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
      throw new Error('Vehicle type not found');
    }

    // Get the entered cost or use the base cost if none entered
    const paymentCost = vehicleCost ? parseInt(vehicleCost) : selectedVehicleType.cost;
    const name = (vehicleName || selectedVehicleType.vehicle_type).trimEnd();

    // The cost for gang rating purposes
    const ratingCost = useBaseCost ? selectedVehicleType.cost : paymentCost;

    // Check if gang can afford this vehicle (only if cost > 0)
    if (paymentCost > 0 && initialCredits < paymentCost) {
      setVehicleError('Not enough credits to add this vehicle');
      return false;
    }

    try {
      const result = await addGangVehicle({
        gangId,
        vehicleTypeId: selectedVehicleTypeId,
        cost: paymentCost, // This is what the user pays in credits
        vehicleName: name,
        baseCost: ratingCost // The vehicle's base cost for display and when equipped
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add vehicle');
      }

      const data = result.vehicle;
      
      // Create the new vehicle object from the response
      const newVehicle: VehicleProps = {
        id: data.id,
        vehicle_name: name,
        // Use the actual cost determined above
        cost: ratingCost,
        vehicle_type_id: selectedVehicleTypeId,
        vehicle_type: selectedVehicleType.vehicle_type,
        gang_id: gangId,
        fighter_id: null,
        movement: selectedVehicleType.movement,
        front: selectedVehicleType.front,
        side: selectedVehicleType.side,
        rear: selectedVehicleType.rear,
        hull_points: selectedVehicleType.hull_points,
        handling: selectedVehicleType.handling,
        save: selectedVehicleType.save,
        body_slots: selectedVehicleType.body_slots,
        body_slots_occupied: 0,
        drive_slots: selectedVehicleType.drive_slots,
        drive_slots_occupied: 0,
        engine_slots: selectedVehicleType.engine_slots,
        engine_slots_occupied: 0,
        special_rules: selectedVehicleType.special_rules || [],
        created_at: new Date().toISOString(),
        equipment: [],
        payment_cost: paymentCost // Track what was actually paid
      };
      
      // Call the parent component's callback
      onVehicleAdd(newVehicle);

      // Also update credits from server authoritative value if provided
      if (typeof onGangCreditsUpdate === 'function' && typeof result.gangCredits === 'number') {
        onGangCreditsUpdate(result.gangCredits);
      }

      // Update wealth from server authoritative value if provided
      if (typeof onGangWealthUpdate === 'function' && typeof result.gangWealth === 'number') {
        onGangWealthUpdate(result.gangWealth);
      }

      // Create a more informative success message when base cost is different from payment
      let successMessage = `${name} added to gang successfully`;
      if (useBaseCost && paymentCost !== ratingCost) {
        successMessage = `${name} added for ${paymentCost} credits (base value: ${ratingCost} credits)`;
      }
      
      toast.success(successMessage);

      // Reset form and close modal
      handleClose();
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
          <span className="text-sm text-muted-foreground">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {initialCredits}
          </span>
        </div>
      }
      content={
        <div className="space-y-4">
          {/* Vehicle Type */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Vehicle Type *
            </label>
            <Combobox
              value={selectedVehicleTypeId}
              onValueChange={(value) => {
                setSelectedVehicleTypeId(value);
                const vehicle = vehicleTypes.find(v => v.id === value);
                if (vehicle) {
                  setVehicleCost(vehicle.cost.toString());
                }
              }}
              placeholder="Select vehicle type"
              options={(() => {
                const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];
                
                // Group vehicles by category
                const groupedVehicles = vehicleTypes
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
                  }, {} as Record<string, VehicleType[]>);

                // Define group order
                const groupOrder = ["Gang Vehicles", "Universal Vehicles", "Base Vehicle Templates", "Sump Sea Vehicles", "Misc."];

                // Build options with headers
                groupOrder.forEach(groupLabel => {
                  const types = groupedVehicles[groupLabel];
                  if (types && types.length > 0) {
                    // Add group header as disabled option
                    options.push({
                      value: `header-${groupLabel}`,
                      label: <span className="font-bold">{groupLabel}</span>,
                      displayValue: groupLabel,
                      disabled: true
                    });

                    // Add vehicles in this group
                    types.forEach(type => {
                      const displayName = `${type.vehicle_type} - ${type.cost} credits`;
                      options.push({
                        value: type.id,
                        label: <span className="ml-3">{displayName}</span>,
                        displayValue: displayName
                      });
                    });
                  }
                });

                return options;
              })()}
            />
          </div>

          {/* Vehicle Cost */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Cost (credits) *
            </label>
            <Input
              type="number"
              placeholder="Enter vehicle cost"
              value={vehicleCost}
              onChange={handleCostChange}
              className="w-full"
              min={0}
            />
            {selectedVehicleTypeId && (
              <p className="text-sm text-muted-foreground">
                Base cost: {vehicleTypes.find(v => v.id === selectedVehicleTypeId)?.cost} credits
              </p>
            )}

            {/* Checkbox:Use Listed Cost for Rating */}
            <div className="flex items-center space-x-2 mb-4 mt-2">
              <Checkbox 
                id="baseCostCheckbox" 
                checked={useBaseCost}
                onCheckedChange={(checked) => setUseBaseCost(checked as boolean)}
              />
              <label 
                htmlFor="baseCostCheckbox" 
                className="text-sm font-medium text-muted-foreground cursor-pointer"
              >
                Use Listed Cost for Rating
              </label>
              <div className="relative group">
                <ImInfo />
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded w-72 -left-36 z-50">
                  When enabled, the vehicle's rating is calculated using its listed cost (from the vehicle list), even if you paid a different amount. This listed cost will be used when the vehicle is assigned to a crew. Disable this if you want the rating to reflect the price actually paid.
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Vehicle Name *
            </label>
            <Input
              type="text"
              placeholder="Enter vehicle name"
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              className="w-full"
            />
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