'use client';

import { useState } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterType } from "@/types/fighter-type";

interface AddFighterProps {
  isOpen: boolean;
  gangCredits: number | null;
  fighterName: string;
  setFighterName: (name: string) => void;
  selectedFighterTypeId: string;
  handleFighterTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  availableSubTypes: any[];
  selectedSubTypeId: string;
  handleSubTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  fighterCost: string;
  setFighterCost: (cost: string) => void;
  fetchError: string | null;
  fighterTypes: FighterType[];
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}

export default function AddFighter({
  isOpen,
  gangCredits,
  fighterName,
  setFighterName,
  selectedFighterTypeId,
  handleFighterTypeChange,
  availableSubTypes,
  selectedSubTypeId,
  handleSubTypeChange,
  fighterCost,
  setFighterCost,
  fetchError,
  fighterTypes,
  onClose,
  onConfirm
}: AddFighterProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title="Add Fighter"
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
              Fighter Type
            </label>
            <select
              value={selectedFighterTypeId}
              onChange={handleFighterTypeChange}
              className="w-full p-2 border rounded"
            >
              <option value="">Select fighter type</option>
              {/* Modified dropdown options to properly handle sub-types */}
              {Array.from(new Set(fighterTypes.map(type => type.fighter_type))).map(uniqueType => {
                const matchingFighters = fighterTypes.filter(ft => ft.fighter_type === uniqueType);

                // Find the selected sub-type if it matches this fighter type
                const selectedSubType = selectedSubTypeId
                  ? matchingFighters.find(t => t.id === selectedSubTypeId)
                  : null;

                // Find the cheapest fighter for this type
                const lowestCostFighter = matchingFighters.reduce((lowest, current) =>
                  current.total_cost < lowest.total_cost ? current : lowest
                );

                // Show the selected sub-type if available; otherwise, fall back to the cheapest option for this fighter type
                if (selectedSubType) {
                  return (
                    <option key={selectedSubType.id} value={selectedSubType.id}>
                      {uniqueType} ({selectedSubType.fighter_class}) - {lowestCostFighter.total_cost} credits
                    </option>
                  );
                } else {
                  return (
                    <option key={lowestCostFighter.id} value={lowestCostFighter.id}>
                      {uniqueType} ({lowestCostFighter.fighter_class}) - {lowestCostFighter.total_cost} credits
                    </option>
                  );
                }
              })}
            </select>
          </div>

          {/* Conditionally show sub-type dropdown if there are available sub-types */}
          {availableSubTypes.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Fighter Sub-Type
              </label>
              <select
                value={selectedSubTypeId}
                onChange={handleSubTypeChange}
                className="w-full p-2 border rounded"
              >
                <option value="">Select fighter sub-type</option>
                {[...availableSubTypes]
                  .sort((a, b) => {
                    const aName = a.sub_type_name.toLowerCase();
                    const bName = b.sub_type_name.toLowerCase();

                    // Always keep "Default" or "Vatborn" first
                    const isAFirst = aName === 'default' || aName === 'vatborn';
                    const isBFirst = bName === 'default' || bName === 'vatborn';
                    if (isAFirst && !isBFirst) return -1;
                    if (!isAFirst && isBFirst) return 1;

                    // Otherwise sort by cost, then name
                    const aCost = fighterTypes.find(ft => ft.id === a.id)?.total_cost ?? 0;
                    const bCost = fighterTypes.find(ft => ft.id === b.id)?.total_cost ?? 0;
                    if (aCost !== bCost) return aCost - bCost;

                    return aName.localeCompare(bName);
                  })
                  .map(subType => {
                    const subTypeCost = fighterTypes.find(ft => ft.id === subType.id)?.total_cost ?? 0;
                    const lowestSubTypeCost = Math.min(
                      ...availableSubTypes.map(sub =>
                        fighterTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity
                      )
                    );
                    const diff = subTypeCost - lowestSubTypeCost;
                    const costLabel = diff === 0 ? "(+0 credits)" : (diff > 0 ? `(+${diff} credits)` : `(${diff} credits)`);

                    return (
                      <option key={subType.id} value={subType.id}>
                        {subType.sub_type_name} {costLabel}
                      </option>
                    );
                  })}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Cost (credits)
            </label>
            <Input
              type="number"
              value={fighterCost}
              onChange={(e) => setFighterCost(e.target.value)}
              className="w-full"
              min={0}
            />
            {selectedFighterTypeId && (
              <p className="text-sm text-gray-500">
                Base cost: {fighterTypes.find(t => t.id === selectedFighterTypeId)?.total_cost} credits
              </p>
            )}
          </div>

          {fetchError && <p className="text-red-500">{fetchError}</p>}
        </div>
      }
      onClose={onClose}
      onConfirm={onConfirm}
      confirmText="Add Fighter"
      confirmDisabled={!selectedFighterTypeId || !fighterName || !fighterCost || 
        (availableSubTypes.length > 0 && !selectedSubTypeId)}
    />
  );
} 