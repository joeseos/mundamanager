'use client';

import { useState } from 'react';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { VehicleProps } from '@/types/vehicle';

interface VehicleEditModalProps {
  vehicle: VehicleProps & { assigned_to?: string };
  isOpen: boolean;
  onClose: () => void;
  onSave: (vehicleName: string, specialRules: string[]) => Promise<boolean>;
}

export default function VehicleEditModal({
  vehicle,
  isOpen,
  onClose,
  onSave
}: VehicleEditModalProps) {
  const [editedVehicleName, setEditedVehicleName] = useState(vehicle.vehicle_name);
  const [vehicleSpecialRules, setVehicleSpecialRules] = useState<string[]>(vehicle.special_rules || []);
  const [newSpecialRule, setNewSpecialRule] = useState('');

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
    const success = await onSave(editedVehicleName, vehicleSpecialRules);
    return success;
  };

  if (!isOpen) return null;

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
