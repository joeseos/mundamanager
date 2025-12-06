'use client';

import React, { useState, memo } from 'react';
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import { Equipment } from '@/types/equipment';
import { Button } from "@/components/ui/button";

interface EquipmentWithId extends Equipment {
  id: string;
}

export interface EquipmentReplacement {
  id: string;
  cost: number;
  max_quantity: number;
}

export interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity?: number;
  equipment_name?: string;
  replaces?: string[];
  max_replace?: number;
  is_default?: boolean;
  can_be_replaced?: boolean;
  replacement?: {
    id: string;
    cost: number;
    max_quantity: number;
  };
  quantity?: number;
  replacements?: EquipmentReplacement[];
}

export interface SelectionCategory {
  id: string;
  select_type: 'optional' | 'optional_single' | 'single' | 'multiple';
  default?: EquipmentOption[];
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

const SELECTION_TYPES = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'wargear', name: 'Wargear' },
  { id: 'armor', name: 'Armor' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'rangedWeapons', name: 'Ranged Weapons' },
  { id: 'meleeWeapons', name: 'Melee Weapons' },
  { id: 'specialEquipment', name: 'Special Equipment' },
];

const SELECTION_MODES = [
  { value: 'optional', label: 'Optional (Replace Default)' },
  { value: 'optional_single', label: 'Optional Single (Choose One Replacement)' },
  { value: 'single', label: 'Single Selection' },
  { value: 'multiple', label: 'Multiple Selection' },
];

const EquipmentOptionRow = memo(function EquipmentOptionRow({
  equip,
  item,
  index,
  categoryId,
  disabled,
  setEquipmentSelection
}: {
  equip: EquipmentWithId | undefined,
  item: EquipmentOption,
  index: number,
  categoryId: string,
  disabled: boolean,
  setEquipmentSelection: AdminFighterEquipmentSelectionProps['setEquipmentSelection']
}) {
  return (
    <div className="flex items-center gap-2 bg-muted p-2 rounded">
      <span>{equip?.equipment_name || 'Unknown Equipment'}</span>
      <div className="ml-auto flex items-center gap-4">
        <div>
          <label className="block text-xs text-muted-foreground">Cost</label>
          <input
            type="number"
            defaultValue={item.cost}
            onBlur={(e) => {
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
          <label className="block text-xs text-muted-foreground">Max Number</label>
          <input
            type="number"
            defaultValue={item.max_quantity}
            onBlur={(e) => {
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
          className="hover:bg-muted p-1 rounded self-end"
          disabled={disabled}
        >
                              <HiX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

export function AdminFighterEquipmentSelection({
  equipment,
  equipmentSelection,
  setEquipmentSelection,
  disabled
}: AdminFighterEquipmentSelectionProps) {
  const [selectedMode, setSelectedMode] = useState<'optional' | 'optional_single' | 'single' | 'multiple'>('optional');

  // Generate a unique ID for a new category
  const generateCategoryId = (typeId: string) => {
    return `${typeId}_${Date.now()}`;
  };
  
  // Remove a category
  const removeCategory = (categoryId: string) => {
    setEquipmentSelection(prev => {
      const newSelection = { ...prev };
      delete newSelection[categoryId];
      return newSelection;
    });
  };

  return (
    <div className="space-y-6 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as 'optional' | 'optional_single' | 'single' | 'multiple')}
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
              // Always allow adding both types
              const typeDetails = SELECTION_TYPES[0]; // Default to first type, but let user pick
              const id = generateCategoryId(typeDetails.id);
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
                return newState;
              });
            }}
            disabled={disabled}
            variant="outline"
            className="whitespace-nowrap"
          >
            <LuPlus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {Object.keys(equipmentSelection).length === 0 ? (
        <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
          <p className="mb-2">No equipment categories.</p> 
          <p>Select a selection type and click "Add Category" to get started.</p>
        </div>
      ) : (
        Object.entries(equipmentSelection).map(([categoryId, category]) => (
          <div key={categoryId} className="border rounded-lg p-4 mb-6 bg-muted">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-muted-foreground">{category.name || 'New Category'}</h3>
                <select
                  value={category.name || ''}
                  onChange={(e) => {
                    const newName = e.target.value;
                    // Only update if the name actually changes
                    if (newName === category.name) return;
                    // Generate a new key based on the new name
                    const newKey = `${newName.toLowerCase()}_${Date.now()}`;
                    setEquipmentSelection(prev => {
                      const current = prev[categoryId];
                      const updated = {
                        ...prev,
                        [newKey]: {
                          ...current,
                          name: newName,
                          id: newKey
                        }
                      };
                      delete updated[categoryId];
                      return updated;
                    });
                  }}
                  className="w-[200px] h-8 border rounded p-1"
                  disabled={disabled}
                >
                  <option value="">Select category</option>
                  <option value="Weapons">Weapons</option>
                  <option value="Wargear">Wargear</option>
                </select>
              </div>
              <Button
                onClick={() => removeCategory(categoryId)}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={disabled}
              >
                <LuTrash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            </div>

            <div className="space-y-4 bg-card p-3 rounded-lg">
              <div>
                <div className="block text-sm font-medium text-muted-foreground mb-1">
                  <span>Selection Type:</span>{' '}
                  <span className="font-normal">
                    {SELECTION_MODES.find(mode => mode.value === category.select_type)?.label || 'Optional (Replace Default)'}
                  </span>
                </div>
              </div>

              {(category.select_type === 'optional' || category.select_type === 'optional_single') && (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                              { id: value, quantity: 1, cost: 0, max_quantity: 1 }
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
                          <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded">
                            <div className="flex items-center gap-2">
                              <div>
                                <label className="block text-xs text-muted-foreground">Number</label>
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
                              className="ml-auto hover:bg-muted p-1 rounded"
                              disabled={disabled}
                            >
                              <HiX className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground italic py-2">
                        No default equipment added yet
                      </div>
                    )}
                  </div>
                </div>
              )}

              {category.select_type && (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    {category.select_type === 'optional' ? 'Optional Equipment' : 'Available Equipment'}
                  </label>
                  <div className="flex gap-2 mb-2">
                    <select
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;

                        if (category.select_type === 'optional' || category.select_type === 'optional_single') {
                          // For optional type, add to replacements of first default
                          setEquipmentSelection(prev => {
                            const defaults = prev[categoryId].default || [];
                            if (defaults.length === 0) return prev;
                            // Attach to the first default
                            const updatedDefaults = defaults.map((d, i) =>
                              i === 0
                                ? {
                                    ...d,
                                    replacements: [
                                      ...(d.replacements || []),
                                      { id: value, cost: 0, max_quantity: 1 }
                                    ]
                                  }
                                : d
                            );
                            return {
                              ...prev,
                              [categoryId]: {
                                ...prev[categoryId],
                                default: updatedDefaults
                              }
                            };
                          });
                        } else {
                          // For single and multiple types, add to options array
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
                        }
                        e.target.value = "";
                      }}
                      className="w-full p-2 border rounded-md"
                      disabled={disabled}
                    >
                      <option value="">Add equipment option</option>
                      {equipment
                        .filter(item => {
                          if (category.select_type === 'optional' || category.select_type === 'optional_single') {
                            return !category.default?.[0]?.replacements?.some((r: any) => r.id === item.id);
                          } else {
                            return !category.options?.some(o => o.id === item.id);
                          }
                        })
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.equipment_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {/* Render optional equipment (replacements) for optional type */}
                    {(category.select_type === 'optional' || category.select_type === 'optional_single') && category.default && category.default.length > 0 && category.default[0].replacements && category.default[0].replacements.length > 0 && (
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-muted-foreground">
                          {category.select_type === 'optional_single' ? 'Optional Equipment (Choose One)' : 'Optional Equipment'}
                        </label>
                        <div className="space-y-2">
                          {category.default[0].replacements.map((item, index) => {
                            const equipmentItem = equipment.find(e => e.id === item.id);
                        return (
                              <div key={item.id} className="flex items-center gap-2 bg-muted p-2 rounded">
                                <span>{equipmentItem?.equipment_name || 'Unknown Equipment'}</span>
                                <div className="ml-auto flex items-center gap-4">
                                  <div>
                                    <label className="block text-xs text-muted-foreground">Cost</label>
                                    <input
                                      type="number"
                                      value={item.cost}
                                      onChange={e => {
                                        const cost = parseInt(e.target.value) || 0;
                                        setEquipmentSelection(prev => {
                                          const defaults = prev[categoryId].default || [];
                                          if (defaults.length === 0) return prev;
                                          const updatedDefaults = defaults.map((d, i) =>
                                            i === 0
                                              ? {
                                                  ...d,
                                                  replacements: d.replacements?.map((r, ri) =>
                                                    ri === index ? { ...r, cost } : r
                                                  )
                                                }
                                              : d
                                          );
                                          return {
                                            ...prev,
                                            [categoryId]: {
                                              ...prev[categoryId],
                                              default: updatedDefaults
                                            }
                                          };
                                        });
                                      }}
                                      className="w-20 p-1 border rounded"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-muted-foreground">Max Number</label>
                                    <input
                                      type="number"
                                      value={item.max_quantity}
                                      onChange={e => {
                                        const max_quantity = parseInt(e.target.value) || 1;
                                        setEquipmentSelection(prev => {
                                          const defaults = prev[categoryId].default || [];
                                          if (defaults.length === 0) return prev;
                                          const updatedDefaults = defaults.map((d, i) =>
                                            i === 0
                                              ? {
                                                  ...d,
                                                  replacements: d.replacements?.map((r, ri) =>
                                                    ri === index ? { ...r, max_quantity } : r
                                                  )
                                                }
                                              : d
                                          );
                                          return {
                                            ...prev,
                                            [categoryId]: {
                                              ...prev[categoryId],
                                              default: updatedDefaults
                                            }
                                          };
                                        });
                                      }}
                                      className="w-16 p-1 border rounded"
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      setEquipmentSelection(prev => {
                                        const defaults = prev[categoryId].default || [];
                                        if (defaults.length === 0) return prev;
                                        const updatedDefaults = defaults.map((d, i) =>
                                          i === 0
                                            ? {
                                                ...d,
                                                replacements: (d.replacements || []).filter((_, ri) => ri !== index)
                                              }
                                            : d
                                        );
                                        return {
                                          ...prev,
                                          [categoryId]: {
                                            ...prev[categoryId],
                                            default: updatedDefaults
                                          }
                                        };
                                      });
                                    }}
                                    className="hover:bg-muted p-1 rounded self-end"
                            disabled={disabled}
                                  >
                                    <HiX className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Render available equipment options for single and multiple types */}
                    {(category.select_type === 'single' || category.select_type === 'multiple') && category.options && category.options.length > 0 && (
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-muted-foreground">
                          Available Equipment
                        </label>
                        <div className="space-y-2">
                          {category.options.map((item, index) => {
                            const equipmentItem = equipment.find(e => e.id === item.id);
                            return (
                              <div key={item.id} className="flex items-center gap-2 bg-muted p-2 rounded">
                                <span>{equipmentItem?.equipment_name || 'Unknown Equipment'}</span>
                                <div className="ml-auto flex items-center gap-4">
                                  <div>
                                    <label className="block text-xs text-muted-foreground">Cost</label>
                                    <input
                                      type="number"
                                      value={item.cost}
                                      onChange={e => {
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
                                      className="w-20 p-1 border rounded"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-muted-foreground">Max Number</label>
                                    <input
                                      type="number"
                                      value={item.max_quantity}
                                      onChange={e => {
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
                                      className="w-16 p-1 border rounded"
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
                                    className="hover:bg-muted p-1 rounded self-end"
                                    disabled={disabled}
                                  >
                                    <HiX className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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

// --- Conversion helpers for new data model ---

// New backend data model type - updated to support grouped selections
export interface EquipmentSelectionDataModel {
  optional: {
    weapons: EquipmentOption[][];
    wargear: EquipmentOption[][];
  };
  optional_single: {
    weapons: EquipmentOption[][];
    wargear: EquipmentOption[][];
  };
  single: {
    weapons: EquipmentOption[][];
    wargear: EquipmentOption[][];
  };
  multiple: {
    weapons: EquipmentOption[][];
    wargear: EquipmentOption[][];
  };
}

// Convert GUI state to new backend data model
export function guiToDataModel(gui: EquipmentSelection): EquipmentSelectionDataModel {
  const result: EquipmentSelectionDataModel = {
    optional: { weapons: [], wargear: [] },
    optional_single: { weapons: [], wargear: [] },
    single: { weapons: [], wargear: [] },
    multiple: { weapons: [], wargear: [] },
  };
  
  Object.values(gui).forEach(category => {
    const type = category.select_type;
    const name = (category.name || '').toLowerCase();
    
    if ((type === 'optional' || type === 'optional_single' || type === 'single' || type === 'multiple') && (name === 'weapons' || name === 'wargear')) {
      if (type === 'optional' || type === 'optional_single') {
        // For optional types, each default with its replacements becomes a group
        const optionalGroup = (category.default || []).map(def => ({
          id: def.id,
          cost: 0,
          quantity: def.quantity,
          is_default: true,
          replacements: def.replacements || []
        }));
        
        if (optionalGroup.length > 0) {
          result[type][name].push(optionalGroup);
        }
      } else {
        // For single and multiple types, all options become one group
        const optionsGroup = category.options || [];
        if (optionsGroup.length > 0) {
          result[type][name].push(optionsGroup);
        }
      }
    }
  });
  
  return result;
}

// Convert new backend data model to GUI state
export function dataModelToGui(data: EquipmentSelectionDataModel): EquipmentSelection {
  const gui: EquipmentSelection = {};
  let idCounter = 0;
  
  (['optional', 'optional_single', 'single', 'multiple'] as const).forEach(type => {
    (['weapons', 'wargear'] as const).forEach(name => {
      const groups = data?.[type]?.[name] || [];
      
      // Each group becomes a separate GUI category
      groups.forEach((group, groupIndex) => {
        if (group.length > 0) {
          const id = `${name}_${type}_${idCounter++}`;
          
          if (type === 'optional' || type === 'optional_single') {
            // For optional types, we need to handle defaults with replacements
            const defaults = group.filter(opt => opt.is_default);
            
            gui[id] = {
              id,
              name: name.charAt(0).toUpperCase() + name.slice(1),
              select_type: type,
              default: defaults.map(opt => ({
                id: opt.id,
                cost: opt.cost || 0,
                quantity: opt.quantity || 1,
                replacements: opt.replacements || []
              })),
              options: [] // Keep empty for optional type since replacements are in default
            };
          } else {
            // For single and multiple types, use group as options
            gui[id] = {
              id,
              name: name.charAt(0).toUpperCase() + name.slice(1),
              select_type: type,
              options: group,
            };
          }
        }
      });
    });
  });
  
  return gui;
}

// Usage:
// When loading: setEquipmentSelection(dataModelToGui(loadedDataFromBackend))
// When saving:  send guiToDataModel(equipmentSelection) to backend 