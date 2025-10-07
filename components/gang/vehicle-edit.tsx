'use client';

import { useState, useEffect } from 'react';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type CombinedVehicleProps = {
  id: string;
  vehicle_name: string;
  vehicle_type: string;
  special_rules?: string[];
  assigned_to?: string;
};

interface VehicleEditProps {
  vehicle: CombinedVehicleProps | null;
  onClose: () => void;
  onSave: (vehicleId: string, vehicleName: string, specialRules: string[]) => Promise<boolean>;
  isLoading?: boolean;
}

export default function VehicleEdit({
  vehicle,
  onClose,
  onSave,
  isLoading = false
}: VehicleEditProps) {
  const [editedVehicleName, setEditedVehicleName] = useState('');
  const [vehicleSpecialRules, setVehicleSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Initialize state when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setEditedVehicleName(vehicle.vehicle_name);
      setVehicleSpecialRules(vehicle.special_rules || []);
      setNewSpecialRule('');
    }
  }, [vehicle]);

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

  const handleConfirm = async () => {
    if (!vehicle) return false;

    const success = await onSave(vehicle.id, editedVehicleName, vehicleSpecialRules);

    if (success) {
      onClose();
    }

    return success;
  };

  if (!vehicle) return null;

  return (
    <Modal
      title="Edit Vehicle"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Save"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="vehicleName" className="block text-sm font-medium text-muted-foreground">
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
          <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
              >
                <span>{rule}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSpecialRule(rule)}
                  className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-none"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
