'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import Modal from '@/components/modal';
import { FighterType } from '@/types/fighter-type';
import { useToast } from "@/components/ui/use-toast";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { createClient } from '@/utils/supabase/client';
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";
import { addFighterToGang } from '@/app/actions/add-fighter';

interface AddFighterProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  fighterTypes: FighterType[];
  gangId: string;
  initialCredits: number;
  onFighterAdded: (newFighter: any, cost: number) => void;
}

interface GangEquipmentOption {
  id: string;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  cost: number;
  max_quantity: number;
  displayCategory?: string;
}

interface EquipmentDefaultItem {
  id: string;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  quantity: number;
}

interface EquipmentSelectionCategory {
  name?: string;
  select_type?: 'optional' | 'optional_single' | 'single' | 'multiple';
  default?: EquipmentDefaultItem[];
  options?: GangEquipmentOption[];
}

interface EquipmentSelection {
  [key: string]: EquipmentSelectionCategory;
}

// Helper to normalize equipment_selection to the old UI format
function normalizeEquipmentSelection(equipmentSelection: any): EquipmentSelection {
  // If already in old format (dynamic keys with select_type), return as is
  if (
    equipmentSelection &&
    Object.values(equipmentSelection).some(
      (cat: any) => cat && typeof cat === 'object' && 'select_type' in cat
    )
  ) {
    return equipmentSelection as EquipmentSelection;
  }

  // If in new nested array format (current SQL output), convert to old format
  if (
    equipmentSelection &&
    typeof equipmentSelection === 'object' &&
    ['optional', 'single', 'multiple'].some(k => k in equipmentSelection)
  ) {
    const result: EquipmentSelection = {};
    let idCounter = 0;
    
    (['optional', 'optional_single', 'single', 'multiple'] as const).forEach(selectType => {
      const typeGroup = equipmentSelection[selectType];
      if (typeGroup && typeof typeGroup === 'object') {
        (['weapons', 'wargear'] as const).forEach(categoryName => {
          const categoryData = typeGroup[categoryName];
          if (Array.isArray(categoryData) && categoryData.length > 0) {
            
            // Check if this is nested arrays (groups) or flat array
            const isNestedArrays = categoryData.length > 0 && Array.isArray(categoryData[0]);
            
            if (isNestedArrays) {
              // Handle nested arrays - each inner array is a separate group
              categoryData.forEach((group: any[], groupIndex: number) => {
                if (Array.isArray(group) && group.length > 0) {
                  const key = `${categoryName}_${selectType}_${idCounter++}`;
                  
                  if (selectType === 'optional' || selectType === 'optional_single') {
                    // For optional/optional_single type, separate defaults and replacements
                    const defaults = group.filter((item: any) => item.is_default);
                    const allReplacements: GangEquipmentOption[] = [];
                    
                    // Collect all replacements from all defaults
                    defaults.forEach((defaultItem: any) => {
                      if (defaultItem.replacements && Array.isArray(defaultItem.replacements)) {
                        defaultItem.replacements.forEach((replacement: any) => {
                          allReplacements.push({
                            id: replacement.id,
                            equipment_name: replacement.equipment_name,
                            equipment_type: replacement.equipment_type,
                            equipment_category: replacement.equipment_category,
                            cost: replacement.cost || 0,
                            max_quantity: replacement.max_quantity || 1
                          });
                        });
                      }
                    });
                    
                    result[key] = {
                      name: `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} ${groupIndex + 1}`,
                      select_type: selectType,
                      default: defaults.map((item: any) => ({
                        id: item.id,
                        equipment_name: item.equipment_name,
                        equipment_type: item.equipment_type,
                        equipment_category: item.equipment_category,
                        quantity: item.quantity || 1
                      })),
                      options: allReplacements
                    };
                  } else {
                    // For single and multiple types, use items as options
                    result[key] = {
                      name: `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} ${groupIndex + 1}`,
                      select_type: selectType,
                      default: [],
                      options: group.map((item: any) => ({
                        id: item.id,
                        equipment_name: item.equipment_name,
                        equipment_type: item.equipment_type,
                        equipment_category: item.equipment_category,
                        cost: item.cost || 0,
                        max_quantity: item.max_quantity || 1
                      }))
                    };
                  }
                }
              });
            } else {
              // Handle flat array (backward compatibility)
              const key = `${categoryName}_${selectType}_${idCounter++}`;
              
              if (selectType === 'optional' || selectType === 'optional_single') {
                // For optional/optional_single type, separate defaults and replacements
                const defaults = categoryData.filter((item: any) => item.is_default);
                const allReplacements: GangEquipmentOption[] = [];
                
                // Collect all replacements from all defaults
                defaults.forEach((defaultItem: any) => {
                  if (defaultItem.replacements && Array.isArray(defaultItem.replacements)) {
                    defaultItem.replacements.forEach((replacement: any) => {
                      allReplacements.push({
                        id: replacement.id,
                        equipment_name: replacement.equipment_name,
                        equipment_type: replacement.equipment_type,
                        equipment_category: replacement.equipment_category,
                        cost: replacement.cost || 0,
                        max_quantity: replacement.max_quantity || 1
                      });
                    });
                  }
                });
                
                result[key] = {
                  name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
                  select_type: selectType,
                  default: defaults.map((item: any) => ({
                    id: item.id,
                    equipment_name: item.equipment_name,
                    equipment_type: item.equipment_type,
                    equipment_category: item.equipment_category,
                    quantity: item.quantity || 1
                  })),
                  options: allReplacements
                };
              } else {
                // For single and multiple types, use items as options
                result[key] = {
                  name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
                  select_type: selectType,
                  default: [],
                  options: categoryData.map((item: any) => ({
                    id: item.id,
                    equipment_name: item.equipment_name,
                    equipment_type: item.equipment_type,
                    equipment_category: item.equipment_category,
                    cost: item.cost || 0,
                    max_quantity: item.max_quantity || 1
                  }))
                };
              }
            }
          }
        });
      }
    });
    return result;
  }

  // Fallback: return empty
  return {};
}

export default function AddFighter({
  showModal,
  setShowModal,
  fighterTypes,
  gangId,
  initialCredits,
  onFighterAdded,
}: AddFighterProps) {
  const { toast } = useToast();
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{id: string, sub_type_name: string}>>([]);
  const [fighterCost, setFighterCost] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState<boolean>(true);
  
  // Add state to track selected equipment with costs
  const [selectedEquipment, setSelectedEquipment] = useState<Array<{
    equipment_id: string;
    cost: number;
    quantity: number;
  }>>([]);

  // Automatically select NULL sub-type if available, otherwise select the cheapest one
  useEffect(() => {
    if (availableSubTypes.length > 0 && !selectedSubTypeId) {
      // Try to find a sub-type with NULL sub_type_name (Default)
      const defaultSubType = availableSubTypes.find(
        (sub) => !sub.sub_type_name || sub.sub_type_name === 'Default'
      );
      
      if (defaultSubType) {
        setSelectedSubTypeId(defaultSubType.id);
      } else {
        // Find the cheapest sub-type if no default is available
        const cheapestSubType = availableSubTypes.reduce(
          (lowest, current) => {
            const lowestCost = fighterTypes.find(ft => ft.id === lowest.id)?.total_cost ?? Infinity;
            const currentCost = fighterTypes.find(ft => ft.id === current.id)?.total_cost ?? Infinity;
            return currentCost < lowestCost ? current : lowest;
          },
          availableSubTypes[0]
        );
        
        setSelectedSubTypeId(cheapestSubType.id);
      }
    }
  }, [availableSubTypes, selectedSubTypeId, fighterTypes]);

  const handleFighterTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setSelectedFighterTypeId(typeId);
    setSelectedSubTypeId(''); // Reset sub-type selection
    setSelectedEquipmentIds([]); // Reset equipment selections when type changes
    setSelectedEquipment([]); // Reset equipment with costs
    
    if (typeId) {
      // Get all fighters with the same fighter_type name and fighter_class to check for sub-types
      const selectedType = fighterTypes.find(t => t.id === typeId);
      const fighterTypeGroup = fighterTypes.filter(t => 
        t.fighter_type === selectedType?.fighter_type &&
        t.fighter_class === selectedType?.fighter_class
      );
      
      // If we have multiple entries with the same fighter_type + class, they have sub-types
      if (fighterTypeGroup.length > 1) {
        const subTypes = fighterTypeGroup.map(ft => ({
          id: ft.id,
          sub_type_name: ft.sub_type?.sub_type_name || 'Default',
          cost: ft.total_cost
        }));
        
        setAvailableSubTypes(subTypes);
        
        // Set cost to the fighter with the ID we selected initially
        setFighterCost(selectedType?.total_cost.toString() || '');
        
        // Auto-selection will happen in the useEffect
      } else {
        // No sub-types, just set the cost directly
        setFighterCost(selectedType?.total_cost.toString() || '');
        setAvailableSubTypes([]);
      }
    } else {
      setFighterCost('');
      setAvailableSubTypes([]);
    }
  };

  const handleSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subTypeId = e.target.value;
    setSelectedSubTypeId(subTypeId);
    setSelectedEquipmentIds([]); // Reset equipment selections when sub-type changes
    setSelectedEquipment([]); // Reset equipment with costs
    
    if (subTypeId) {
      // Don't change the selectedFighterTypeId, just update the cost
      const selectedType = fighterTypes.find(t => t.id === subTypeId);
      if (selectedType) {
        setFighterCost(selectedType.total_cost.toString() || '');
      }
    } else {
      // If no sub-type is selected, revert to the main fighter type's cost
      const mainType = fighterTypes.find(t => t.id === selectedFighterTypeId);
      if (mainType) {
        setFighterCost(mainType.total_cost.toString() || '');
      }
    }
  };

  // Simple helper function to infer category from name when API doesn't provide it
  const inferCategoryFromEquipmentName = (name: string): string => {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('claw') || 
        lowerName.includes('baton') || 
        lowerName.includes('sword') || 
        lowerName.includes('hammer') ||
        lowerName.includes('fist') ||
        lowerName.includes('knife') ||
        lowerName.includes('blade')) {
      return 'Close Combat Weapons';
    }
    
    if (lowerName.includes('gun') || 
        lowerName.includes('pistol') || 
        lowerName.includes('shotgun') ||
        lowerName.includes('rifle') ||
        lowerName.includes('lasgun') ||
        lowerName.includes('blaster')) {
      return 'Special Weapons';
    }
    
    if (lowerName.includes('armour') || 
        lowerName.includes('armor') || 
        lowerName.includes('carapace')) {
      return 'Armour';
    }
    
    return 'Other Equipment';
  };

  const renderEquipmentSelection = () => {
    const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
    if (!selectedType?.equipment_selection) return null;

    console.log('Original equipment_selection:', selectedType.equipment_selection);

    // Normalize equipment_selection to UI format
    const normalizedSelection = normalizeEquipmentSelection(selectedType.equipment_selection);
    console.log('Normalized equipment_selection:', normalizedSelection);

    // Group equipment options by selection category
    const allCategories = Object.entries(normalizedSelection);
    if (allCategories.length === 0) return null;

    return (
      <div className="space-y-4">
        {allCategories.map(([categoryId, categoryData]) => {
          // Skip if no data
          if (!categoryData) return null;
          
          const categoryName = categoryData.name || 'Equipment';
          const selectType = categoryData.select_type || 'optional';
          const isOptional = selectType === 'optional';
          const isOptionalSingle = selectType === 'optional_single';
          const isSingle = selectType === 'single';
          const isMultiple = selectType === 'multiple';
          
          // Group equipment options by category
          const categorizedOptions: Record<string, GangEquipmentOption[]> = {};
          
          // Process options if they exist
          if (categoryData.options && Array.isArray(categoryData.options)) {
            categoryData.options.forEach((option: GangEquipmentOption) => {
              const optionAny = option as any;
              
              // Get category name, ensure it has a value or use a default
              const equipCategoryName = optionAny.equipment_category || inferCategoryFromEquipmentName(optionAny.equipment_name || categoryName);
              const categoryKey = equipCategoryName.toLowerCase();
              
              // Initialize category array if it doesn't exist
              if (!categorizedOptions[categoryKey]) {
                categorizedOptions[categoryKey] = [];
              }
              
              // Add option to the appropriate category
              categorizedOptions[categoryKey].push({
                ...option,
                displayCategory: equipCategoryName  // Keep original case for display
              } as any);
            });
          }

          // Sort categories according to equipmentCategoryRank
          const sortedCategories = Object.keys(categorizedOptions).sort((a, b) => {
            const rankA = equipmentCategoryRank[a] ?? Infinity;
            const rankB = equipmentCategoryRank[b] ?? Infinity;
            return rankA - rankB;
          });

          // Don't render anything if no options
          if ((!categoryData.default || categoryData.default.length === 0) && 
              (!categoryData.options || categoryData.options.length === 0)) {
            return null;
          }

          return (
            <div key={categoryId} className="space-y-3">
              {categoryData.default && categoryData.default.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Default {categoryName}
                  </label>
                  <div className="space-y-1">
                    {categoryData.default.map((item: EquipmentDefaultItem, index: number) => {
                      // Access equipment_name with type assertion for safety
                      const defaultItem = item as any;
                      const equipmentName = defaultItem.equipment_name || "Equipment";
                      
                      return (
                        <div key={`${item.id}-${index}`} className="flex items-center gap-2">
                          <div className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                            {item.quantity}x {equipmentName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {categoryData.options && categoryData.options.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {isOptional ? `Optional ${categoryName} (Replaces one default)` : 
                     isOptionalSingle ? `Optional ${categoryName} (Choose one replacement)` :
                     isSingle ? `Select ${categoryName} (Choose one)` : 
                     `Additional ${categoryName} (Select any)`}
                  </label>
                  
                  <div className="space-y-1">
                    {/* Add "Keep Default" option for optional_single selections */}
                    {isOptionalSingle && (
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`equipment-selection-${categoryId}`}
                          id={`${categoryId}-keep-default`}
                          checked={!categoryData.options?.some((o: any) => selectedEquipmentIds.includes(o.id))}
                          onChange={() => {
                            // Remove all selections for this category (keep default)
                            setSelectedEquipmentIds((prev) => {
                              const currentCategoryOptions = categoryData.options || [];
                              return prev.filter(id =>
                                !currentCategoryOptions.some((o: any) => o.id === id)
                              );
                            });

                            // Remove all equipment selections for this category and restore default if needed
                            setSelectedEquipment((prev) => {
                              const currentCategoryOptions = categoryData.options || [];
                              let filtered = prev.filter(item =>
                                !currentCategoryOptions.some((o: any) => o.id === item.equipment_id)
                              );
                              
                              // For optional_single, restore default equipment when "Keep Default" is selected
                              if (categoryData.select_type === 'optional_single' && categoryData.default && categoryData.default.length > 0) {
                                // Add back all default equipment for this category
                                categoryData.default.forEach((defaultItem: any) => {
                                  // Only add if not already present
                                  if (!filtered.some(item => item.equipment_id === defaultItem.id)) {
                                    filtered.push({
                                      equipment_id: defaultItem.id,
                                      cost: 0, // Default equipment has cost 0
                                      quantity: defaultItem.quantity || 1
                                    });
                                  }
                                });
                              }
                              
                              return filtered;
                            });

                            // Reset cost to remove any equipment costs from this category
                            setFighterCost((prevCost) => {
                              const currentCategoryOptions = categoryData.options || [];
                              const prevSelectedId = selectedEquipmentIds.find(id =>
                                currentCategoryOptions.some((o: any) => o.id === id)
                              );
                              const prevSelectedCost = prevSelectedId
                                ? currentCategoryOptions.find((o: any) => o.id === prevSelectedId)?.cost || 0
                                : 0;
                              return String(parseInt(prevCost || '0') - prevSelectedCost);
                            });
                          }}
                        />
                        <label htmlFor={`${categoryId}-keep-default`} className="text-sm font-medium">
                          Keep Default {categoryData.default?.[0]?.equipment_name ? `(${categoryData.default[0].equipment_name})` : 'Equipment'}
                        </label>
                      </div>
                    )}
                    
                    {/* Combine all options from all categories into a flat list, sorted alphabetically */}
                    {sortedCategories.flatMap(category => 
                      categorizedOptions[category]
                    )
                    .sort((a, b) => {
                      // Sort alphabetically
                      const nameA = a.equipment_name || '';
                      const nameB = b.equipment_name || '';
                      return nameA.localeCompare(nameB);
                    })
                    .map((option) => (
                      <div key={option.id} className="flex items-center gap-2">
                        {(isSingle || isOptionalSingle) ? (
                          <input
                            type="radio"
                            name={`equipment-selection-${categoryId}`}
                            id={option.id}
                            checked={selectedEquipmentIds.includes(option.id)}
                            onChange={() => {
                              // Only one can be selected in this category
                              setSelectedEquipmentIds((prev) => {
                                // Remove all previous selections for this category
                                const filtered = prev.filter(id =>
                                  !categoryData.options?.some((o: any) => o.id === id)
                                );
                                return [...filtered, option.id];
                              });

                              // Update equipment with costs - handle default replacement for optional_single
                              setSelectedEquipment((prev) => {
                                // Remove all previous selections for this category
                                let filtered = prev.filter(item =>
                                  !categoryData.options?.some((o: any) => o.id === item.equipment_id)
                                );
                                
                                // For optional_single selections, also remove default equipment when selecting a replacement
                                if (categoryData.select_type === 'optional_single' && categoryData.default && categoryData.default.length > 0) {
                                  // Remove all default equipment from this category
                                  categoryData.default.forEach((defaultItem: any) => {
                                    filtered = filtered.filter(item => item.equipment_id !== defaultItem.id);
                                  });
                                }
                                
                                return [...filtered, {
                                  equipment_id: option.id,
                                  cost: option.cost || 0,
                                  quantity: 1
                                }];
                              });

                              // Update cost using functional update
                              setFighterCost((prevCost) => {
                                // Find previous selection in this category
                                const prevSelectedId = selectedEquipmentIds.find(id =>
                                  categoryData.options?.some((o: any) => o.id === id)
                                );
                                const prevSelectedCost = prevSelectedId
                                  ? categoryData.options?.find((o: any) => o.id === prevSelectedId)?.cost || 0
                                  : 0;
                                const optionCost = option.cost || 0;
                                return String(parseInt(prevCost || '0') - prevSelectedCost + optionCost);
                              });
                            }}
                          />
                        ) : (
                          <Checkbox
                            id={option.id}
                            checked={selectedEquipmentIds.includes(option.id)}
                            onCheckedChange={(checked) => {
                              const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
                              const baseCost = selectedType?.total_cost || 0;
                              
                              // Get the option's cost
                              const optionCost = option.cost || 0;
                              
                              if (checked === true) {
                                // For optional/multiple selection, add to existing selections
                                setSelectedEquipmentIds([...selectedEquipmentIds, option.id]);
                                
                                // Check if this is replacing a default item
                                const isReplacement = categoryData.select_type === 'optional' || categoryData.select_type === 'optional_single';
                                if (isReplacement && categoryData.default && categoryData.default.length > 0) {
                                  // Remove the default item and add the replacement
                                  const defaultItem = categoryData.default[0] as any;
                                  setSelectedEquipment(prev => {
                                    const filtered = prev.filter(item => item.equipment_id !== defaultItem.id);
                                    return [...filtered, {
                                      equipment_id: option.id,
                                      cost: optionCost,
                                      quantity: 1
                                    }];
                                  });
                                } else {
                                  // Just add the new equipment
                                  setSelectedEquipment([...selectedEquipment, {
                                    equipment_id: option.id,
                                    cost: optionCost,
                                    quantity: 1
                                  }]);
                                }
                                
                                setFighterCost(String(parseInt(fighterCost || '0') + optionCost));
                              } else {
                                // Remove this option
                                setSelectedEquipmentIds(selectedEquipmentIds.filter(id => id !== option.id));
                                
                                // Check if this was replacing a default item
                                const isReplacement = categoryData.select_type === 'optional' || categoryData.select_type === 'optional_single';
                                if (isReplacement && categoryData.default && categoryData.default.length > 0) {
                                  // Add back the default item and remove the replacement
                                  const defaultItem = categoryData.default[0] as any;
                                  setSelectedEquipment(prev => {
                                    const filtered = prev.filter(item => item.equipment_id !== option.id);
                                    return [...filtered, {
                                      equipment_id: defaultItem.id,
                                      cost: 0, // Default items have cost 0
                                      quantity: defaultItem.quantity || 1
                                    }];
                                  });
                                } else {
                                  // Just remove the equipment
                                  setSelectedEquipment(selectedEquipment.filter(item => item.equipment_id !== option.id));
                                }
                                
                                setFighterCost(String(parseInt(fighterCost || '0') - optionCost));
                              }
                            }}
                          />
                        )}
                        <label htmlFor={option.id} className="text-sm">
                          {option.equipment_name || 'Loading...'}
                          {option.cost > 0 ? ` +${option.cost} credits` : ''}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper function to get default equipment from equipment selection
  const getDefaultEquipment = (equipmentSelection: any): Array<{equipment_id: string, cost: number, quantity: number}> => {
    const defaults: Array<{equipment_id: string, cost: number, quantity: number}> = [];
    
    if (!equipmentSelection) return defaults;
    
    // Normalize equipment_selection to UI format
    const normalizedSelection = normalizeEquipmentSelection(equipmentSelection);
    
    Object.entries(normalizedSelection).forEach(([categoryId, categoryData]) => {
      if (categoryData?.default && Array.isArray(categoryData.default)) {
        categoryData.default.forEach((item: EquipmentDefaultItem) => {
          const defaultItem = item as any;
          defaults.push({
            equipment_id: defaultItem.id,
            cost: 0, // Default equipment from equipment selections should have cost 0
            quantity: defaultItem.quantity || 1
          });
        });
      }
    });
    
    return defaults;
  };

  // Update equipment cost calculation when fighter type changes
  useEffect(() => {
    if (selectedFighterTypeId) {
      const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
      if (selectedType?.equipment_selection) {
        const defaultEquipment = getDefaultEquipment(selectedType.equipment_selection);
        setSelectedEquipment(defaultEquipment);
        
        // Calculate total cost of default equipment
        const defaultCost = defaultEquipment.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
        
        // Update fighter cost to include default equipment cost
        const baseCost = selectedType.total_cost || 0;
        setFighterCost(String(baseCost + defaultCost));
      }
    }
  }, [selectedFighterTypeId, fighterTypes]);

  // Update equipment cost calculation when sub-type changes
  useEffect(() => {
    if (selectedSubTypeId) {
      const selectedType = fighterTypes.find(t => t.id === selectedSubTypeId);
      if (selectedType?.equipment_selection) {
        const defaultEquipment = getDefaultEquipment(selectedType.equipment_selection);
        setSelectedEquipment(defaultEquipment);
        
        // Calculate total cost of default equipment
        const defaultCost = defaultEquipment.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
        
        // Update fighter cost to include default equipment cost
        const baseCost = selectedType.total_cost || 0;
        setFighterCost(String(baseCost + defaultCost));
      }
    }
  }, [selectedSubTypeId, fighterTypes]);

  const handleAddFighter = async () => {
    if (!fighterName || !fighterCost) {
      setFetchError('Please fill in all fields');
      return false;
    }

    // Determine which fighter type ID to use
    const fighterTypeIdToUse = selectedSubTypeId || selectedFighterTypeId;
    
    if (!fighterTypeIdToUse) {
      setFetchError('Please select a fighter type');
      return false;
    }

    try {
      // Get the current authenticated user's ID
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setFetchError('You must be logged in to add a fighter');
        return false;
      }

      // Parse the cost from the input
      const enteredCost = parseInt(fighterCost);
      
      // Get the base cost of the fighter for optimistic update
      const selectedType = fighterTypes.find(t => t.id === fighterTypeIdToUse);
      const actualBaseCost = selectedType?.total_cost || 0;
      
      // Determine the actual cost to use for gang credits deduction (always what user entered)
      const gangCreditsCost = enteredCost;
      
      // Determine the cost to use for fighter rating/display
      const fighterDisplayCost = useBaseCostForRating ? actualBaseCost : enteredCost;

      // Use the new server action instead of direct SQL function call
      const result = await addFighterToGang({
        fighter_name: fighterName,
        fighter_type_id: fighterTypeIdToUse,
        gang_id: gangId,
        cost: enteredCost,
        selected_equipment: selectedEquipment,
        user_id: user.id,
        use_base_cost_for_rating: useBaseCostForRating
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add fighter');
}

      const data = result.data!;

      // Use the rating_cost from the server - it correctly handles the use_base_cost_for_rating setting
      const displayCost = data.rating_cost || data.cost || enteredCost;

      const newFighter = {
        id: data.fighter_id,
        fighter_name: fighterName,
        fighter_type_id: fighterTypeIdToUse,
        fighter_type: data.fighter_type,
        fighter_class: data.fighter_class,
        fighter_sub_type: data.fighter_sub_type_id ? { 
          fighter_sub_type_id: data.fighter_sub_type_id,
          fighter_sub_type: selectedType?.sub_type?.sub_type_name || ''
        } : undefined,
        credits: displayCost,
        movement: data.stats.movement,
        weapon_skill: data.stats.weapon_skill,
        ballistic_skill: data.stats.ballistic_skill,
        strength: data.stats.strength,
        toughness: data.stats.toughness,
        wounds: data.stats.wounds,
        initiative: data.stats.initiative,
        attacks: data.stats.attacks,
        leadership: data.stats.leadership,
        cool: data.stats.cool,
        willpower: data.stats.willpower,
        intelligence: data.stats.intelligence,
        xp: data.stats.xp,
        kills: 0,
        weapons: data.equipment
          .filter((item: any) => item.equipment_type === 'weapon')
          .map((item: any) => ({
            weapon_name: item.equipment_name,
            weapon_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id,
            weapon_profiles: item.weapon_profiles || []
          })),
        wargear: data.equipment
          .filter((item: any) => item.equipment_type === 'wargear')
          .map((item: any) => ({
            wargear_name: item.equipment_name,
            wargear_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id
          })),
        special_rules: data.special_rules || [],
        skills: data.skills ? data.skills.reduce((acc: any, skill: any) => {
          acc[skill.skill_name] = {
            id: skill.skill_id,
            credits_increase: 0,
            xp_cost: 0,
            is_advance: false,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: null
          };
          return acc;
        }, {}) : {},
        advancements: {
          characteristics: {},
          skills: {}
        },
        injuries: [],
        free_skill: data.free_skill || false,
        effects: {
          injuries: [],
          advancements: [],
          bionics: [],
          cyberteknika: [],
          user: []
        },
        base_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        },
        current_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        }
      };

      onFighterAdded(newFighter, gangCreditsCost);
      closeModal();

      toast({
        description: `${fighterName} added successfully`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Error adding fighter:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to add fighter');
      return false;
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFighterName('');
    setSelectedFighterTypeId('');
    setSelectedSubTypeId('');
    setAvailableSubTypes([]);
    setFighterCost('');
    setSelectedEquipmentIds([]);
    setSelectedEquipment([]);  // Reset equipment with costs
    setUseBaseCostForRating(true);
    setFetchError(null);
  };

  const addFighterModalContent = (
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
          {(() => {
            // Create a map to group fighters by type+class and find default/cheapest for each
            const typeClassMap = new Map();
            
            fighterTypes.forEach(fighter => {
              const key = `${fighter.fighter_type}-${fighter.fighter_class}`;
              
              if (!typeClassMap.has(key)) {
                typeClassMap.set(key, {
                  fighter: fighter,
                  cost: fighter.total_cost
                });
              } else {
                const current = typeClassMap.get(key);
                
                // If this fighter has no sub-type, prefer it as default
                if (!fighter.sub_type && current.fighter.sub_type) {
                  typeClassMap.set(key, {
                    fighter: fighter,
                    cost: fighter.total_cost
                  });
                }
                // Otherwise, take the cheaper option
                else if (fighter.total_cost < current.cost) {
                  typeClassMap.set(key, {
                    fighter: fighter,
                    cost: fighter.total_cost
                  });
                }
              }
            });
            
            // Convert the map values to an array and sort
            return Array.from(typeClassMap.values())
              .sort((a, b) => {
                const classRankA = fighterClassRank[a.fighter.fighter_class.toLowerCase()] ?? Infinity;
                const classRankB = fighterClassRank[b.fighter.fighter_class.toLowerCase()] ?? Infinity;

                if (classRankA !== classRankB) {
                  return classRankA - classRankB;
                }

                return a.cost - b.cost;
              })
              .map(({ fighter, cost }) => {
                const displayName = `${fighter.fighter_type} (${fighter.fighter_class}) - ${cost} credits`;
                
                return (
                  <option key={fighter.id} value={fighter.id}>
                    {displayName}
                  </option>
                );
              });
          })()}
        </select>
      </div>

      {/* Conditionally show sub-type dropdown if there are available sub-types */}
      {availableSubTypes.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Fighter Sub-type
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

                // Always keep "Default" first
                if (aName === 'default') return -1;
                if (bName === 'default') return 1;

                // Otherwise sort by cost, then name
                const aCost = fighterTypes.find(ft => ft.id === a.id)?.total_cost ?? 0;
                const bCost = fighterTypes.find(ft => ft.id === b.id)?.total_cost ?? 0;
                if (aCost !== bCost) return aCost - bCost;

                return aName.localeCompare(bName);
              })
              .map((subType) => {
                const subTypeCost = fighterTypes.find(ft => ft.id === subType.id)?.total_cost ?? 0;
                const lowestSubTypeCost = Math.min(
                  ...availableSubTypes.map(sub =>
                    fighterTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity
                  )
                );
                const diff = subTypeCost - lowestSubTypeCost;
                const costLabel = diff === 0 ? "(+0 credits)" : (diff > 0 ? `(+${diff} credits)` : `(${diff} credits)`);

                // Display "Default" for the null/empty sub-type, otherwise use the actual sub-type name
                const displayName = subType.sub_type_name === 'Default' ? 'Default' : subType.sub_type_name;

                return (
                  <option key={subType.id} value={subType.id}>
                    {displayName} {costLabel}
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
      </div>

      <div className="flex items-center space-x-2 mb-4 mt-2">
        <Checkbox 
          id="use-base-cost-for-rating"
          checked={useBaseCostForRating}
          onCheckedChange={(checked) => setUseBaseCostForRating(checked as boolean)}
        />
        <label 
          htmlFor="use-base-cost-for-rating" 
          className="text-sm font-medium text-gray-700 cursor-pointer"
        >
          Use base cost for Fighter Rating
        </label>
        <div className="relative group">
          <ImInfo />
          <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
            When checked, the fighter will cost what you enter above, but its rating will be calculated using the base cost. When unchecked, the fighter's rating will be based on what you paid.
          </div>
        </div>
      </div>

      {/* Equipment selection */}
      {renderEquipmentSelection()}

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  return (
    <Modal
      title="Add Fighter"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {initialCredits}
          </span>
        </div>
      }
      content={addFighterModalContent}
      onClose={closeModal}
      onConfirm={handleAddFighter}
      confirmText="Add Fighter"
      confirmDisabled={!selectedFighterTypeId || !fighterName || !fighterCost || 
        (availableSubTypes.length > 0 && !selectedSubTypeId)}
    />
  );
} 
