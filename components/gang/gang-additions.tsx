'use client';

import React from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterType } from "@/types/fighter-type";

interface GangAdditionsProps {
  isOpen: boolean;
  gangCredits: number | null;
  fighterName: string;
  setFighterName: (name: string) => void;
  selectedGangAdditionTypeId: string;
  handleGangAdditionTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  gangAdditionCost: string;
  setGangAdditionCost: (cost: string) => void;
  selectedGangAdditionClass: string;
  handleGangAdditionClassChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  gangAdditionTypes: FighterType[];
  fetchError: string | null;
  renderEquipmentSelection: () => React.ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}

export default function GangAdditions({
  isOpen,
  gangCredits,
  fighterName,
  setFighterName,
  selectedGangAdditionTypeId,
  handleGangAdditionTypeChange,
  gangAdditionCost,
  setGangAdditionCost,
  selectedGangAdditionClass,
  handleGangAdditionClassChange,
  gangAdditionTypes,
  fetchError,
  renderEquipmentSelection,
  onClose,
  onConfirm
}: GangAdditionsProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title="Gang Additions"
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
              Fighter Name
            </label>
            <Input
              type="text"
              placeholder="Fighter name"
              value={fighterName}
              onChange={(e) => setFighterName(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Fighter Class
            </label>
            <select
              value={selectedGangAdditionClass}
              onChange={handleGangAdditionClassChange}
              className="w-full p-2 border rounded"
            >
              <option value="">Select Fighter Class</option>
              <option value="Equipment">Equipment</option>
              <option value="Structure">Structure</option>
              <option value="Specialist">Specialist</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Fighter Type
            </label>
            <select
              value={selectedGangAdditionTypeId}
              onChange={handleGangAdditionTypeChange}
              className="w-full p-2 border rounded"
            >
              <option value="">Select fighter type</option>
              {Object.entries(
                gangAdditionTypes.reduce((acc, type) => {
                  const className = (type.fighter_class || 'other').toLowerCase();
                  if (!selectedGangAdditionClass || className === selectedGangAdditionClass.toLowerCase()) {
                    if (!acc[className]) {
                      acc[className] = [];
                    }
                    acc[className].push(type);
                  }
                  return acc;
                }, {} as Record<string, FighterType[]>)
              ).map(([groupLabel, fighterList]) => (
                <optgroup key={groupLabel} label={groupLabel.replace(/\b\w/g, c => c.toUpperCase())}>
                  {fighterList.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.limitation && type.limitation > 0 ? `0-${type.limitation} ` : ''}{type.fighter_type} ({type.total_cost} credits)
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
              value={gangAdditionCost}
              onChange={(e) => setGangAdditionCost(e.target.value)}
              className="w-full"
              min={0}
            />
            {selectedGangAdditionTypeId && (
              <p className="text-sm text-gray-500">
                Base cost: {gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId)?.total_cost} credits
              </p>
            )}
          </div>

          {renderEquipmentSelection()}

          {fetchError && <p className="text-red-500">{fetchError}</p>}
        </div>
      }
      onClose={onClose}
      onConfirm={onConfirm}
      confirmText="Add Fighter"
      confirmDisabled={!selectedGangAdditionTypeId || !gangAdditionCost || !selectedGangAdditionClass}
    />
  );
} 