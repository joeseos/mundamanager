'use client';

import React from 'react';
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { Equipment } from '@/types/equipment';

interface EquipmentWithId extends Equipment {
  id: string;
}

export interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity: number;
  equipment_name?: string;
  replaces?: string[];
  max_replace?: number;
}

export interface EquipmentSelection {
  weapons?: {
    default?: Array<{ id: string; quantity: number }>;
    options?: EquipmentOption[];
    select_type: 'optional' | 'single' | 'multiple';
  };
}

interface AdminFighterEquipmentSelectionProps {
  equipment: EquipmentWithId[];
  equipmentSelection: EquipmentSelection;
  setEquipmentSelection: React.Dispatch<React.SetStateAction<EquipmentSelection>>;
  disabled: boolean;
}

export function AdminFighterEquipmentSelection({
  equipment,
  equipmentSelection,
  setEquipmentSelection,
  disabled
}: AdminFighterEquipmentSelectionProps) {
  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Selection Type
        </label>
        <select
          value={equipmentSelection?.weapons?.select_type || ''}
          onChange={(e) => {
            const value = e.target.value as 'optional' | 'single' | 'multiple';
            setEquipmentSelection(prev => ({
              weapons: {
                select_type: value,
                default: value === 'optional' ? [] : undefined,
                options: []
              }
            }));
          }}
          className="w-full p-2 border rounded-md"
          disabled={disabled}
        >
          <option value="">Select type</option>
          <option value="optional">Optional (Replace Default)</option>
          <option value="single">Single Selection</option>
          <option value="multiple">Multiple Selection</option>
        </select>
      </div>

      {equipmentSelection?.weapons?.select_type === 'optional' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default Equipment
          </label>
          <div className="flex gap-2 mb-2">
            <select
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;

                setEquipmentSelection(prev => ({
                  weapons: {
                    ...prev.weapons!,
                    default: [
                      ...(prev.weapons?.default || []),
                      { id: value, quantity: 1 }
                    ]
                  }
                }));
                e.target.value = "";
              }}
              className="w-full p-2 border rounded-md"
              disabled={disabled}
            >
              <option value="">Add default equipment</option>
              {equipment
                .filter(item => !equipmentSelection?.weapons?.default?.some(d => d.id === item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.equipment_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            {equipmentSelection?.weapons?.default?.map((item, index) => {
              const equip = equipment.find(e => e.id === item.id);
              return (
                <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="block text-xs text-gray-500">Number</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const quantity = parseInt(e.target.value) || 1;
                          setEquipmentSelection(prev => ({
                            weapons: {
                              ...prev.weapons!,
                              default: prev.weapons?.default?.map((d, i) =>
                                i === index ? { ...d, quantity } : d
                              )
                            }
                          }));
                        }}
                        min="1"
                        className="w-16 p-1 border rounded"
                      />
                    </div>
                    <span>x {equip?.equipment_name}</span>
                  </div>
                  <button
                    onClick={() => {
                      setEquipmentSelection(prev => ({
                        weapons: {
                          ...prev.weapons!,
                          default: prev.weapons?.default?.filter((_, i) => i !== index)
                        }
                      }));
                    }}
                    className="ml-auto hover:bg-gray-100 p-1 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {equipmentSelection?.weapons?.select_type && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {equipmentSelection.weapons.select_type === 'optional' ? 'Optional Equipment' : 'Available Equipment'}
          </label>
          <div className="flex gap-2 mb-2">
            <select
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;

                setEquipmentSelection(prev => ({
                  weapons: {
                    ...prev.weapons!,
                    options: [
                      ...(prev?.weapons?.options || []),
                      { id: value, cost: 0, max_quantity: 1 }
                    ]
                  }
                }));
                e.target.value = "";
              }}
              className="w-full p-2 border rounded-md"
              disabled={disabled}
            >
              <option value="">Add equipment option</option>
              {equipment
                .filter(item => !equipmentSelection?.weapons?.options?.some(o => o.id === item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.equipment_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            {equipmentSelection?.weapons?.options?.map((item, index) => {
              const equip = equipment.find(e => e.id === item.id);
              return (
                <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                  <span>{equip?.equipment_name}</span>
                  <div className="ml-auto flex items-center gap-4">
                    <div>
                      <label className="block text-xs text-gray-500">Cost</label>
                      <input
                        type="number"
                        value={item.cost}
                        onChange={(e) => {
                          const cost = parseInt(e.target.value) || 0;
                          setEquipmentSelection(prev => ({
                            weapons: {
                              ...prev.weapons!,
                              options: prev?.weapons?.options?.map((o, i) =>
                                i === index ? { ...o, cost } : o
                              )
                            }
                          }));
                        }}
                        placeholder="Cost"
                        className="w-20 p-1 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500">Max Number</label>
                      <input
                        type="number"
                        value={item.max_quantity}
                        onChange={(e) => {
                          const max_quantity = parseInt(e.target.value) || 1;
                          setEquipmentSelection(prev => ({
                            weapons: {
                              ...prev.weapons!,
                              options: prev?.weapons?.options?.map((o, i) =>
                                i === index ? { ...o, max_quantity } : o
                              )
                            }
                          }));
                        }}
                        placeholder="Max"
                        min="1"
                        className="w-16 p-1 border rounded"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setEquipmentSelection(prev => ({
                          weapons: {
                            ...prev.weapons!,
                            options: prev?.weapons?.options?.filter((_, i) => i !== index)
                          }
                        }));
                      }}
                      className="hover:bg-gray-100 p-1 rounded self-end"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
} 