'use client';

import { useState } from 'react';
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import { Equipment } from '@/types/equipment';
import { EquipmentSelectionDataModel, EquipmentSelectionItem } from '@/types/fighter-type';
import { Button } from "@/components/ui/button";

interface EquipmentWithId extends Equipment {
  id: string;
}

type SelectType = keyof EquipmentSelectionDataModel;
type SelectionCategory = keyof EquipmentSelectionDataModel[SelectType];

export const EMPTY_EQUIPMENT_SELECTION: EquipmentSelectionDataModel = {
  optional: { weapons: [], wargear: [] },
  optional_single: { weapons: [], wargear: [] },
  single: { weapons: [], wargear: [] },
  multiple: { weapons: [], wargear: [] },
};

interface AdminFighterEquipmentSelectionProps {
  equipment: EquipmentWithId[];
  equipmentSelection: EquipmentSelectionDataModel;
  setEquipmentSelection: React.Dispatch<React.SetStateAction<EquipmentSelectionDataModel>>;
  disabled: boolean;
}

const SELECTION_CATEGORIES: { value: SelectionCategory; label: string }[] = [
  { value: 'weapons', label: 'Weapons' },
  { value: 'wargear', label: 'Wargear' },
];

const SELECTION_MODES: { value: SelectType; label: string }[] = [
  { value: 'optional', label: 'Optional (Replace Default)' },
  { value: 'optional_single', label: 'Optional Single (Choose One Replacement)' },
  { value: 'single', label: 'Single Selection' },
  { value: 'multiple', label: 'Multiple Selection' },
];

export function AdminFighterEquipmentSelection({
  equipment,
  equipmentSelection,
  setEquipmentSelection,
  disabled
}: AdminFighterEquipmentSelectionProps) {
  const [selectedMode, setSelectedMode] = useState<SelectType>('optional');

  const setGroups = (
    type: SelectType,
    category: SelectionCategory,
    update: (groups: EquipmentSelectionItem[][]) => EquipmentSelectionItem[][]
  ) => {
    setEquipmentSelection(prev => ({
      ...prev,
      [type]: { ...prev[type], [category]: update(prev[type][category]) }
    }));
  };

  const updateGroup = (
    type: SelectType,
    category: SelectionCategory,
    index: number,
    update: (group: EquipmentSelectionItem[]) => EquipmentSelectionItem[]
  ) => {
    setGroups(type, category, groups => groups.map((group, i) => i === index ? update(group) : group));
  };

  // Optional groups keep their replacements on the first default
  const updateReplacements = (
    type: SelectType,
    category: SelectionCategory,
    index: number,
    update: (replacements: EquipmentSelectionItem[]) => EquipmentSelectionItem[]
  ) => {
    updateGroup(type, category, index, group =>
      group.map((item, i) => i === 0 ? { ...item, replacements: update(item.replacements || []) } : item)
    );
  };

  const groups = SELECTION_MODES.flatMap(({ value: type }) =>
    SELECTION_CATEGORIES.flatMap(({ value: category }) =>
      equipmentSelection[type][category].map((group, index) => ({ type, category, index, group }))
    )
  );

  return (
    <div className="space-y-6 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as SelectType)}
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
            onClick={() => setGroups(selectedMode, 'weapons', groups => [...groups, []])}
            disabled={disabled}
            variant="outline"
            className="whitespace-nowrap"
          >
            <LuPlus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
          <p className="mb-2">No equipment categories.</p> 
          <p>Select a selection type and click &quot;Add Category&quot; to get started.</p>
        </div>
      ) : (
        groups.map(({ type, category, index, group }) => {
          const isOptional = type === 'optional' || type === 'optional_single';
          const replacements = isOptional ? group[0]?.replacements || [] : [];
          const replacementMode = group.find(item => item.replacement_mode)?.replacement_mode;

          return (
          <div key={`${type}-${category}-${index}`} className="border rounded-lg p-4 mb-6 bg-muted">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-muted-foreground">
                  {SELECTION_CATEGORIES.find(c => c.value === category)?.label}
                </h3>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCategory = e.target.value as SelectionCategory;
                    setEquipmentSelection(prev => ({
                      ...prev,
                      [type]: {
                        ...prev[type],
                        [category]: prev[type][category].filter((_, i) => i !== index),
                        [newCategory]: [...prev[type][newCategory], group]
                      }
                    }));
                  }}
                  className="w-[200px] h-8 border rounded-sm p-1"
                  disabled={disabled}
                >
                  {SELECTION_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => setGroups(type, category, groups => groups.filter((_, i) => i !== index))}
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
                    {SELECTION_MODES.find(mode => mode.value === type)?.label}
                  </span>
                </div>
              </div>

              {type === 'optional' && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Replacement Mode
                  </label>
                  <select
                    value={replacementMode || 'flexible'}
                    onChange={(e) => {
                      const replacement_mode = e.target.value as 'flexible' | 'strict';
                      updateGroup(type, category, index, group => group.map(item => ({ ...item, replacement_mode })));
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={disabled}
                  >
                    <option value="flexible">Flexible (mix and match)</option>
                    <option value="strict">Strict (replace all as group)</option>
                  </select>
                </div>
              )}

              {isOptional && (
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

                        updateGroup(type, category, index, group => [
                          ...group,
                          {
                            id: value,
                            cost: 0,
                            quantity: 1,
                            is_default: true,
                            replacements: [],
                            ...(replacementMode ? { replacement_mode: replacementMode } : {})
                          }
                        ]);
                        e.target.value = "";
                      }}
                      className="w-full p-2 border rounded-md"
                      disabled={disabled}
                    >
                      <option value="">Add default equipment</option>
                      {equipment
                        .filter(item => !group.some(d => d.id === item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.equipment_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {group.length > 0 ? (
                      group.map((item, itemIndex) => {
                        const equip = equipment.find(e => e.id === item.id);
                        return (
                          <div key={itemIndex} className="flex items-center gap-2 bg-muted p-2 rounded-sm">
                            <div className="flex items-center gap-2">
                              <div>
                                <label className="block text-xs text-muted-foreground">Number</label>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const quantity = parseInt(e.target.value) || 1;
                                    updateGroup(type, category, index, group =>
                                      group.map((d, i) => i === itemIndex ? { ...d, quantity } : d)
                                    );
                                  }}
                                  min="1"
                                  className="w-16 p-1 border rounded-sm"
                                />
                              </div>
                              <span>x {equip?.equipment_name || 'Unknown Equipment'}</span>
                            </div>
                            <button
                              onClick={() => updateGroup(type, category, index, group => group.filter((_, i) => i !== itemIndex))}
                              className="ml-auto hover:bg-muted p-1 rounded-sm"
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

              <div className="mt-4 border-t pt-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {type === 'optional' ? 'Optional Equipment' : 'Available Equipment'}
                </label>
                <div className="flex gap-2 mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) return;

                      if (isOptional) {
                        // Auto-default max_quantity to the total default slots
                        const totalDefaultSlots = group.reduce((sum, d) => sum + (d.quantity || 1), 0);
                        updateReplacements(type, category, index, replacements => [
                          ...replacements,
                          { id: value, cost: 0, max_quantity: totalDefaultSlots }
                        ]);
                      } else {
                        updateGroup(type, category, index, group => [
                          ...group,
                          { id: value, cost: 0, max_quantity: 1 }
                        ]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={disabled}
                  >
                    <option value="">Add equipment option</option>
                    {equipment
                      .filter(item => !(isOptional ? replacements : group).some(o => o.id === item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.equipment_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  {(isOptional ? replacements : group).length > 0 && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-muted-foreground">
                        {type === 'optional_single'
                          ? 'Optional Equipment (Choose One)'
                          : type === 'optional'
                            ? (() => {
                                const totalSlots = group.reduce((sum, d) => sum + (d.quantity || 1), 0);
                                return totalSlots > 1 ? `Optional Equipment (${totalSlots} default slots)` : 'Optional Equipment';
                              })()
                            : 'Available Equipment'}
                      </label>
                      <div className="space-y-2">
                        {(isOptional ? replacements : group).map((item, itemIndex) => {
                          const equipmentItem = equipment.find(e => e.id === item.id);
                          const updateItems = isOptional ? updateReplacements : updateGroup;
                          return (
                            <div key={item.id} className="flex items-center gap-2 bg-muted p-2 rounded-sm">
                              <span>{equipmentItem?.equipment_name || 'Unknown Equipment'}</span>
                              <div className="ml-auto flex items-center gap-4">
                                <div>
                                  <label className="block text-xs text-muted-foreground">Cost</label>
                                  <input
                                    type="number"
                                    value={item.cost}
                                    onChange={e => {
                                      const cost = parseInt(e.target.value) || 0;
                                      updateItems(type, category, index, items =>
                                        items.map((o, i) => i === itemIndex ? { ...o, cost } : o)
                                      );
                                    }}
                                    className="w-20 p-1 border rounded-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-muted-foreground">Max Number</label>
                                  <input
                                    type="number"
                                    value={item.max_quantity}
                                    onChange={e => {
                                      const max_quantity = parseInt(e.target.value) || 1;
                                      updateItems(type, category, index, items =>
                                        items.map((o, i) => i === itemIndex ? { ...o, max_quantity } : o)
                                      );
                                    }}
                                    className="w-16 p-1 border rounded-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => updateItems(type, category, index, items => items.filter((_, i) => i !== itemIndex))}
                                  className="hover:bg-muted p-1 rounded-sm self-end"
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
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
