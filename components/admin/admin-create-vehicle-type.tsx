'use client';

import { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";

interface AdminCreateVehicleTypeModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const numericInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const regularInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2";

export function AdminCreateVehicleTypeModal({ onClose, onSubmit }: AdminCreateVehicleTypeModalProps) {
  const { toast } = useToast();
  const [gangTypes, setGangTypes] = useState<{ gang_type_id: number; gang_type: string }[]>([]);

  const [vehicleForm, setVehicleForm] = useState({
    cost: '',
    movement: '',
    front: '',
    side: '',
    rear: '',
    hull_points: '',
    handling: '',
    save: '',
    body_slots: '',
    drive_slots: '',
    engine_slots: '',
    special_rules: '',
    vehicle_type: '',
    gang_type_id: ''
  });

  const handleVehicleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setVehicleForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const fetchGangTypes = async () => {
    try {
      const response = await fetch('/api/admin/vehicles');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      const data = await response.json();
      setGangTypes(data);
    } catch (error) {
      console.error('Error fetching gang types:', error);
    }
  };

  const resetVehicleForm = () => {
    setVehicleForm({
      cost: '',
      movement: '',
      front: '',
      side: '',
      rear: '',
      hull_points: '',
      handling: '',
      save: '',
      body_slots: '',
      drive_slots: '',
      engine_slots: '',
      special_rules: '',
      vehicle_type: '',
      gang_type_id: ''
    });
  };

  useEffect(() => {
    fetchGangTypes();
  }, []);

  const handleSubmit = async () => {
    try {
      const response = await fetch('/api/admin/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...vehicleForm,
          gang_type_id: vehicleForm.gang_type_id === "0" ? null : parseInt(vehicleForm.gang_type_id),
          cost: parseInt(vehicleForm.cost),
          movement: parseInt(vehicleForm.movement),
          front: parseInt(vehicleForm.front),
          side: parseInt(vehicleForm.side),
          rear: parseInt(vehicleForm.rear),
          hull_points: parseInt(vehicleForm.hull_points),
          body_slots: parseInt(vehicleForm.body_slots),
          drive_slots: parseInt(vehicleForm.drive_slots),
          engine_slots: parseInt(vehicleForm.engine_slots),
          special_rules: vehicleForm.special_rules
            .split(',')
            .map(rule => rule.trim())
            .filter(rule => rule.length > 0),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create vehicle type');
      }

      toast({
        title: "Success",
        description: "Vehicle type has been created successfully",
      });

      resetVehicleForm();
      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true; // Close modal
    } catch (error) {
      console.error('Error submitting vehicle type:', error);
      toast({
        title: "Error",
        description: "Failed to create vehicle type",
        variant: "destructive",
      });
      return false; // Keep modal open
    }
  };

  const handleClose = () => {
    resetVehicleForm();
    onClose();
  };

  return (
    <Modal
      title="Add New Vehicle Type"
      content={
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Vehicle Type - regular input */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Vehicle Type <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="vehicle_type"
                value={vehicleForm.vehicle_type}
                onChange={handleVehicleFormChange}
                className={regularInputClass}
                placeholder="e.g. Buggy, Truck"
                required
              />
            </div>

            {/* Gang Type */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Gang Type <span className="text-muted-foreground">*</span>
              </label>
              <select
                name="gang_type_id"
                value={vehicleForm.gang_type_id}
                onChange={handleVehicleFormChange}
                className={regularInputClass}
                required
              >
                <option value="">Select a gang type</option>
                <option value="0">Generic</option>
                {gangTypes.map((gangType) => (
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>

            {/* Numeric inputs */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Cost <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="cost"
                value={vehicleForm.cost}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
                min="0"
              />
            </div>

            {/* Movement */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Movement <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="movement"
                value={vehicleForm.movement}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
                min="0"
              />
            </div>

            {/* Armor Values */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Front Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="front"
                value={vehicleForm.front}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Side Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="side"
                value={vehicleForm.side}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Rear Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="rear"
                value={vehicleForm.rear}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            {/* Vehicle Stats */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Hull Points <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="hull_points"
                value={vehicleForm.hull_points}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Handling <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="handling"
                value={vehicleForm.handling}
                onChange={handleVehicleFormChange}
                className={regularInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Save <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="save"
                value={vehicleForm.save}
                onChange={handleVehicleFormChange}
                className={regularInputClass}
                required
              />
            </div>

            {/* Slots */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Body Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="body_slots"
                value={vehicleForm.body_slots}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Drive Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="drive_slots"
                value={vehicleForm.drive_slots}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Engine Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="engine_slots"
                value={vehicleForm.engine_slots}
                onChange={handleVehicleFormChange}
                className={numericInputClass}
                required
              />
            </div>

            {/* Special Rules - Input component */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Special Rules <span className="text-muted-foreground">*</span>
              </label>
              <Input
                type="text"
                name="special_rules"
                value={vehicleForm.special_rules}
                onChange={handleVehicleFormChange}
                className="bg-card"
                placeholder="Enter special rules, separated by commas (e.g. Agile, Wheeled)"
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                Separate multiple rules with commas
              </p>
            </div>
          </div>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleSubmit}
      confirmText="Add Vehicle Type"
    />
  );
}