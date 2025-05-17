'use client';

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2 } from "lucide-react";
import { Equipment } from '@/types/equipment';
import { Button } from "@/components/ui/button";

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

export interface SelectionCategory {
  id: string;
  select_type: 'optional' | 'single' | 'multiple';
  default?: Array<{ id: string; quantity: number }>;
  options?: EquipmentOption[];
  name?: string;
}

export interface EquipmentSelection {
  [key: string]: SelectionCategory;
}

interface AdminFighterEquipmentSelectionProps {
  equipment: EquipmentWithId[];
  equipmentSelection: EquipmentSelection;
  setEquipmentSelection: React.Dispatch<React.SetStateAction<EquipmentSelection>>;
  disabled: boolean;
}

// Predefined selection types with their display names
const SELECTION_TYPES = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'wargear', name: 'Wargear' },
  { id: 'armor', name: 'Armor' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'rangedWeapons', name: 'Ranged Weapons' },
  { id: 'meleeWeapons', name: 'Melee Weapons' },
  { id: 'specialEquipment', name: 'Special Equipment' },
];

// Selection modes
const SELECTION_MODES = [
  { value: 'optional', label: 'Optional (Replace Default)' },
  { value: 'single', label: 'Single Selection' },
  { value: 'multiple', label: 'Multiple Selection' },
];

export function AdminFighterEquipmentSelection({
  equipment,
  equipmentSelection,
  setEquipmentSelection,
  disabled
}: AdminFighterEquipmentSelectionProps) {
  const [selectedMode, setSelectedMode] = useState<'optional' | 'single' | 'multiple'>('optional');

  // Generate a unique ID for a new category
  const generateCategoryId = (typeId: string) => {
    return `${typeId}_${Date.now()}`;
  };
  
  // Remove a category
  const removeCategory = (categoryId: string) => {
    console.log('⚠️ REMOVING CATEGORY:', categoryId);
    console.log('Current equipment selection state:', equipmentSelection);
    console.log('Number of categories before removal:', Object.keys(equipmentSelection).length);
    
    setEquipmentSelection(prev => {
      const newSelection = { ...prev };
      delete newSelection[categoryId];
      
      console.log('New selection after removal:', newSelection);
      console.log('Number of categories after removal:', Object.keys(newSelection).length);
      
      return newSelection;
    });
  };
  
  // Check if a type is already added
  const isTypeAlreadyAdded = (typeId: string) => {
    const typeName = SELECTION_TYPES.find(type => type.id === typeId)?.name;
    return Object.values(equipmentSelection).some(
      category => category.name === typeName
    );
  };
  
  // Get available selection types (those that haven't been added yet)
  const getAvailableSelectionTypes = () => {
    return SELECTION_TYPES.filter(type => !isTypeAlreadyAdded(type.id));
  };

  return (
    <div className="space-y-6 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as 'optional' | 'single' | 'multiple')}
            className="w-full p-2 border rounded-md"
            disabled={disabled}
          >
            {SELECTION_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              const availableTypes = getAvailableSelectionTypes();
              console.log('Available types for adding:', availableTypes);
              
              if (availableTypes.length > 0) {
                // Directly create a new category using the first available type
                const typeDetails = availableTypes[0];
                const id = generateCategoryId(typeDetails.id);
                
                console.log('Adding new category in single click:', {
                  name: typeDetails.name,
                  id: id,
                  selectionType: selectedMode
                });
                
                setEquipmentSelection(prev => {
                  const newState = {
                    ...prev,
                    [id]: {
                      id,
                      name: typeDetails.name,
                      select_type: selectedMode,
                      default: selectedMode === 'optional' ? [] : undefined,
                      options: []
                    }
                  };
                  console.log('New equipment selection state:', newState);
                  return newState;
                });
              }
            }}
            disabled={disabled || getAvailableSelectionTypes().length === 0}
            variant="outline"
            className="whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {Object.keys(equipmentSelection).length === 0 ? (
        <div className="text-center py-6 text-gray-500 border border-dashed rounded-lg">
          <p className="mb-2">No equipment categories.</p> 
          <p>Select a selection type and click "Add Category" to get started.</p>
        </div>
      ) : (
        Object.entries(equipmentSelection).map(([categoryId, category]) => (
          <div key={categoryId} className="border rounded-lg p-4 mb-6 bg-gray-50">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-700">{category.name || 'New Category'}</h3>
                <Input
                  type="text"
                  value={category.name || ''}
                  onChange={(e) => {
                    setEquipmentSelection(prev => ({
                      ...prev,
                      [categoryId]: {
                        ...prev[categoryId],
                        name: e.target.value
                      }
                    }));
                  }}
                  placeholder="Category name"
                  className="w-[200px] h-8"
                  disabled={disabled}
                />
              </div>
              <Button
                onClick={() => removeCategory(categoryId)}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            </div>

            <div className="space-y-4 bg-white p-3 rounded-lg">
              <div>
                <div className="block text-sm font-medium text-gray-700 mb-1">
                  <span>Selection Type:</span>{' '}
                  <span className="font-normal">
                    {SELECTION_MODES.find(mode => mode.value === category.select_type)?.label || 'Optional (Replace Default)'}
                  </span>
                </div>
              </div>

              {category.select_type === 'optional' && (
                <div className="mt-4 border-t pt-4">
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
                          ...prev,
                          [categoryId]: {
                            ...prev[categoryId],
                            default: [
                              ...(prev[categoryId].default || []),
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
                        .filter(item => !category.default?.some(d => d.id === item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.equipment_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {category.default && category.default.length > 0 ? (
                      category.default?.map((item, index) => {
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
                                      ...prev,
                                      [categoryId]: {
                                        ...prev[categoryId],
                                        default: prev[categoryId].default?.map((d, i) =>
                                          i === index ? { ...d, quantity } : d
                                        )
                                      }
                                    }));
                                  }}
                                  min="1"
                                  className="w-16 p-1 border rounded"
                                />
                              </div>
                              <span>x {equip?.equipment_name || 'Unknown Equipment'}</span>
                            </div>
                            <button
                              onClick={() => {
                                setEquipmentSelection(prev => ({
                                  ...prev,
                                  [categoryId]: {
                                    ...prev[categoryId],
                                    default: prev[categoryId].default?.filter((_, i) => i !== index)
                                  }
                                }));
                              }}
                              className="ml-auto hover:bg-gray-100 p-1 rounded"
                              disabled={disabled}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-500 italic py-2">
                        No default equipment added yet
                      </div>
                    )}
                  </div>
                </div>
              )}

              {category.select_type && (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {category.select_type === 'optional' ? 'Optional Equipment' : 'Available Equipment'}
                  </label>
                  <div className="flex gap-2 mb-2">
                    <select
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;

                        setEquipmentSelection(prev => ({
                          ...prev,
                          [categoryId]: {
                            ...prev[categoryId],
                            options: [
                              ...(prev[categoryId].options || []),
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
                        .filter(item => !category.options?.some(o => o.id === item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.equipment_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {category.options && category.options.length > 0 ? (
                      category.options?.map((item, index) => {
                        const equip = equipment.find(e => e.id === item.id);
                        return (
                          <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                            <span>{equip?.equipment_name || 'Unknown Equipment'}</span>
                            <div className="ml-auto flex items-center gap-4">
                              <div>
                                <label className="block text-xs text-gray-500">Cost</label>
                                <input
                                  type="number"
                                  value={item.cost}
                                  onChange={(e) => {
                                    const cost = parseInt(e.target.value) || 0;
                                    setEquipmentSelection(prev => ({
                                      ...prev,
                                      [categoryId]: {
                                        ...prev[categoryId],
                                        options: prev[categoryId].options?.map((o, i) =>
                                          i === index ? { ...o, cost } : o
                                        )
                                      }
                                    }));
                                  }}
                                  placeholder="Cost"
                                  className="w-20 p-1 border rounded"
                                  disabled={disabled}
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
                                      ...prev,
                                      [categoryId]: {
                                        ...prev[categoryId],
                                        options: prev[categoryId].options?.map((o, i) =>
                                          i === index ? { ...o, max_quantity } : o
                                        )
                                      }
                                    }));
                                  }}
                                  placeholder="Max"
                                  min="1"
                                  className="w-16 p-1 border rounded"
                                  disabled={disabled}
                                />
                              </div>
                              <button
                                onClick={() => {
                                  setEquipmentSelection(prev => ({
                                    ...prev,
                                    [categoryId]: {
                                      ...prev[categoryId],
                                      options: prev[categoryId].options?.filter((_, i) => i !== index)
                                    }
                                  }));
                                }}
                                className="hover:bg-gray-100 p-1 rounded self-end"
                                disabled={disabled}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-500 italic py-2">
                        No equipment options added yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
} 