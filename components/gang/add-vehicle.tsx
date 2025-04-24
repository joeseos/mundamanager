'use client';

import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";

interface VehicleType {
  id: string;
  vehicle_type: string;
  cost: number;
  [key: string]: any;
}

interface AddVehicleProps {
  isOpen: boolean;
  gangCredits: number | null;
  vehicleName: string;
  setVehicleName: (name: string) => void;
  selectedVehicleTypeId: string;
  setSelectedVehicleTypeId: (id: string) => void;
  vehicleTypes: VehicleType[];
  vehicleCost: string;
  setVehicleCost: (cost: string) => void;
  vehicleError: string | null;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}

export default function AddVehicle({
  isOpen,
  gangCredits,
  vehicleName,
  setVehicleName,
  selectedVehicleTypeId,
  setSelectedVehicleTypeId,
  vehicleTypes,
  vehicleCost,
  setVehicleCost,
  vehicleError,
  onClose,
  onConfirm
}: AddVehicleProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title="Add Vehicle"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {gangCredits === null ? '0' : gangCredits}
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
                const id = e.target.value;
                const vehicle = vehicleTypes.find(v => v.id === id);
                if (vehicle) {
                  setVehicleCost(vehicle.cost.toString());
                  setVehicleName(vehicle.vehicle_type);
                }
                setSelectedVehicleTypeId(id);
              }}
              className="w-full p-2 border rounded"
            >
              <option value="">Select vehicle type</option>
              {vehicleTypes.map((type: VehicleType) => (
                <option key={type.id} value={type.id}>
                  {type.vehicle_type} - {type.cost} credits
                </option>
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
              onChange={(e) => setVehicleCost(e.target.value)}
              className="w-full"
              min={0}
            />
            {selectedVehicleTypeId && (
              <p className="text-sm text-gray-500">
                Base cost: {vehicleTypes.find(v => v.id === selectedVehicleTypeId)?.cost} credits
              </p>
            )}
          </div>

          {vehicleError && <p className="text-red-500">{vehicleError}</p>}
        </div>
      }
      onClose={onClose}
      onConfirm={onConfirm}
      confirmText="Add Vehicle"
      confirmDisabled={!selectedVehicleTypeId || !vehicleName || !vehicleCost}
    />
  );
} 