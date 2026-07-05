import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '../ui/input';
import Modal from '@/components/ui/modal';
import { toast } from 'sonner';
import { VehicleProps } from '@/types/vehicle';
import { FighterProps } from '@/types/fighter';
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { ImInfo } from "react-icons/im";
import { vehicleTypeRank } from "@/utils/vehicleTypeRank";
import { addGangVehicle } from '@/app/actions/add-gang-vehicle';
import { assignVehicleToFighter } from '@/app/actions/assign-vehicle-to-fighter';
import { getAllowedLocomotionOptions } from '@/utils/vehicle-locomotion';
import { UserPermissions } from '@/types/user-permissions';
import { IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { TbMeatOff } from 'react-icons/tb';
import { FaMedkit } from 'react-icons/fa';

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
  fighters?: FighterProps[];
  positioning?: Record<number, string>;
  onFighterUpdate?: (updatedFighter: FighterProps) => void;
  userPermissions?: UserPermissions;
}

export default function AddVehicle({ 
  showModal,
  setShowModal,
  gangId,
  initialCredits,
  onVehicleAdd,
  onGangCreditsUpdate,
  onGangWealthUpdate,
  fighters = [],
  positioning,
  onFighterUpdate,
  userPermissions,
}: AddVehicleProps) {
  
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehicleCost, setVehicleCost] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [useBaseCost, setUseBaseCost] = useState<boolean>(true);
  const [locomotionChoice, setLocomotionChoice] = useState('');
  const [selectedCrewId, setSelectedCrewId] = useState('');

  const selectedVehicleType = vehicleTypes.find(v => v.id === selectedVehicleTypeId) ?? null;
  const locomotionRequired = selectedVehicleType?.special_rules?.includes('Locomotion') ?? false;
  const allowedLocomotionOptions = selectedVehicleType
    ? getAllowedLocomotionOptions(selectedVehicleType.vehicle_type)
    : [];

  const crewFighters = fighters.filter(fighter =>
    fighter.fighter_class === 'Crew' &&
    (!fighter.vehicles || fighter.vehicles.length === 0)
  );

  const crewFighterOptions = useMemo(() => {
    return [...crewFighters]
      .sort((a, b) => {
        if (!positioning) return 0;
        const indexA = Object.entries(positioning).find(([, id]) => id === a.id)?.[0];
        const indexB = Object.entries(positioning).find(([, id]) => id === b.id)?.[0];
        const posA = indexA !== undefined ? parseInt(indexA) : Infinity;
        const posB = indexB !== undefined ? parseInt(indexB) : Infinity;
        return posA - posB;
      })
      .map((f) => {
        const statusIcons = [];
        if (f.killed) statusIcons.push(<IoSkull className="text-gray-400 w-4 h-4" key="killed" />);
        if (f.retired) statusIcons.push(<MdChair className="text-muted-foreground w-4 h-4" key="retired" />);
        if (f.enslaved) statusIcons.push(<GiCrossedChains className="text-sky-200 w-4 h-4" key="enslaved" />);
        if (f.starved) statusIcons.push(<TbMeatOff className="text-red-500 w-4 h-4" key="starved" />);
        if (f.recovery) statusIcons.push(<FaMedkit className="text-blue-500 w-4 h-4" key="recovery" />);
        if (f.captured) statusIcons.push(<GiHandcuffs className="text-red-600 w-4 h-4" key="captured" />);

        const displayText = `${f.fighter_name} - ${f.fighter_type}${f.xp !== undefined ? ` (${f.xp} XP)` : ''}`;

        return {
          value: f.id,
          displayValue: displayText,
          label: (
            <span className="flex items-center gap-1">
              <span>{displayText}</span>
              {statusIcons.length > 0 && <span className="flex items-center gap-0.5">{statusIcons}</span>}
            </span>
          ),
        };
      });
  }, [crewFighters, positioning]);

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
        baseCost: ratingCost, // The vehicle's base cost for display and when equipped
        locomotionChoice: locomotionRequired ? locomotionChoice : undefined,
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
        special_rules: locomotionRequired && locomotionChoice
          ? (selectedVehicleType.special_rules || []).map((r: string) => r === 'Locomotion' ? locomotionChoice : r)
          : (selectedVehicleType.special_rules || []),
        created_at: new Date().toISOString(),
        equipment: [],
        payment_cost: paymentCost // Track what was actually paid
      };
      
      // Update credits from server authoritative value
      if (typeof onGangCreditsUpdate === 'function' && typeof result.gangCredits === 'number') {
        onGangCreditsUpdate(result.gangCredits);
      }

      // Update wealth from server authoritative value
      if (typeof onGangWealthUpdate === 'function' && typeof result.gangWealth === 'number') {
        onGangWealthUpdate(result.gangWealth);
      }

      // Create a more informative success message when base cost is different from payment
      let successMessage = `${name} added to gang successfully`;
      if (useBaseCost && paymentCost !== ratingCost) {
        successMessage = `${name} added for ${paymentCost} credits (base value: ${ratingCost} credits)`;
      }

      if (selectedCrewId) {
        const assignResult = await assignVehicleToFighter({
          vehicleId: data.id,
          fighterId: selectedCrewId,
          gangId,
        });

        if (assignResult.success) {
          const crewFighter = fighters.find(f => f.id === selectedCrewId);
          if (crewFighter && onFighterUpdate) {
            const assignedVehicle = {
              id: newVehicle.id,
              created_at: newVehicle.created_at,
              vehicle_name: newVehicle.vehicle_name,
              vehicle_type_id: newVehicle.vehicle_type_id,
              vehicle_type: newVehicle.vehicle_type,
              cost: newVehicle.cost,
              movement: newVehicle.movement,
              front: newVehicle.front,
              side: newVehicle.side,
              rear: newVehicle.rear,
              hull_points: newVehicle.hull_points,
              handling: newVehicle.handling,
              save: newVehicle.save,
              body_slots: newVehicle.body_slots,
              body_slots_occupied: newVehicle.body_slots_occupied,
              drive_slots: newVehicle.drive_slots,
              drive_slots_occupied: newVehicle.drive_slots_occupied,
              engine_slots: newVehicle.engine_slots,
              engine_slots_occupied: newVehicle.engine_slots_occupied,
              special_rules: newVehicle.special_rules || [],
              equipment: newVehicle.equipment || [],
              effects: {},
            };
            onFighterUpdate({
              ...crewFighter,
              vehicles: [assignedVehicle],
            });
          }
          toast.success(`${successMessage} and assigned to ${crewFighter?.fighter_name ?? 'crew'}`);
        } else {
          toast.error(`Vehicle created but crew assignment failed: ${assignResult.error ?? 'unknown error'}`);
          onVehicleAdd(newVehicle);
        }
      } else {
        onVehicleAdd(newVehicle);
        toast.success(successMessage);
      }

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
    setLocomotionChoice('');
    setSelectedCrewId('');
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
                setLocomotionChoice('');
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

          {/* Locomotion selection — only shown for vehicle types with the Locomotion special rule */}
          {locomotionRequired && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                Locomotion *
              </label>
              <Combobox
                value={locomotionChoice}
                onValueChange={setLocomotionChoice}
                placeholder="Locomotion"
                options={allowedLocomotionOptions.map(opt => ({ value: opt, label: opt }))}
              />

            </div>
          )}

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
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded-sm w-72 -left-36 z-50">
                  When enabled, the vehicle&apos;s rating is calculated using its listed cost (from the vehicle list), even if you paid a different amount. This listed cost will be used when the vehicle is assigned to a crew. Disable this if you want the rating to reflect the price actually paid.
                </div>
              </div>
            </div>
          </div>

          {/* Assign Vehicle to a Crew */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Assign Vehicle to a Crew
            </label>
            <Combobox
              value={selectedCrewId}
              onValueChange={setSelectedCrewId}
              options={crewFighterOptions}
              placeholder="Select a Crew"
              noResultsText="No Crew available without a vehicle"
              clearable
              dropdownPlacement="down"
              disabled={!userPermissions?.canEdit}
            />
            {!selectedCrewId && (
              <p className="text-amber-500 text-xs">
                This vehicle can later be assigned or reassigned to a crew on the Gang page in the Vehicles tab.
              </p>
            )}
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
      confirmDisabled={!selectedVehicleTypeId || !vehicleName || !vehicleCost || (locomotionRequired && !locomotionChoice)}
    />
  );
}
