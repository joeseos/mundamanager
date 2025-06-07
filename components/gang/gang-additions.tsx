'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import Modal from '@/components/modal';
import { FighterType, EquipmentOption } from '@/types/fighter-type';
import { useToast } from "@/components/ui/use-toast";
import { gangAdditionRank } from "@/utils/gangAdditionRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { FighterProps, FighterEffect, FighterSkills } from '@/types/fighter';
import { createClient } from '@/utils/supabase/client';
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";

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
  select_type?: 'optional' | 'single' | 'multiple';
  default?: EquipmentDefaultItem[];
  options?: GangEquipmentOption[];
}

interface EquipmentSelection {
  [key: string]: EquipmentSelectionCategory;
}

interface GangAdditionsProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  gangId: string;
  gangTypeId: string;
  initialCredits: number;
  onFighterAdded: (newFighter: FighterProps, cost: number) => void;
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
    
    (['optional', 'single', 'multiple'] as const).forEach(selectType => {
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
                  
                  if (selectType === 'optional') {
                    // For optional type, separate defaults and replacements
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
              
              if (selectType === 'optional') {
                // For optional type, separate defaults and replacements
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

export default function GangAdditions({
  showModal,
  setShowModal,
  gangId,
  gangTypeId,
  initialCredits,
  onFighterAdded,
}: GangAdditionsProps) {
  const { toast } = useToast();
  const [selectedGangAdditionTypeId, setSelectedGangAdditionTypeId] = useState('');
  const [selectedGangAdditionClass, setSelectedGangAdditionClass] = useState<string>('');
  const [gangAdditionTypes, setGangAdditionTypes] = useState<FighterType[]>([]);
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [gangAdditionCost, setGangAdditionCost] = useState('');
  const [fighterCost, setFighterCost] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [defaultEquipmentNames, setDefaultEquipmentNames] = useState<Record<string, string>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState<boolean>(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{id: string, sub_type_name: string}>>([]);

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
            const lowestCost = gangAdditionTypes.find(ft => ft.id === lowest.id)?.total_cost ?? Infinity;
            const currentCost = gangAdditionTypes.find(ft => ft.id === current.id)?.total_cost ?? Infinity;
            return currentCost < lowestCost ? current : lowest;
          },
          availableSubTypes[0]
        );
        
        setSelectedSubTypeId(cheapestSubType.id);
      }
    }
  }, [availableSubTypes, selectedSubTypeId, gangAdditionTypes]);

  // Fetch gang addition types if needed when component mounts
  useEffect(() => {
    if (showModal && gangAdditionTypes.length === 0) {
      fetchGangAdditionTypes();
    }
  }, [showModal]);

  const fetchGangAdditionTypes = async () => {
    try {
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_fighter_types_with_cost',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            "p_gang_type_id": gangTypeId,
            "p_is_gang_addition": true
          })
        }
      );

      if (!response.ok) throw new Error('Failed to fetch gang addition types');
      const data = await response.json();
      
      setGangAdditionTypes(data);
    } catch (error) {
      console.error('Error fetching gang addition types:', error);
      toast({
        description: "Failed to load gang additions",
        variant: "destructive"
      });
    }
  };

  const handleGangAdditionClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGangAdditionClass(e.target.value);
    setSelectedGangAdditionTypeId(''); // Reset Gang Addition type when class changes
  };

  const handleGangAdditionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setSelectedGangAdditionTypeId(typeId);
    setSelectedFighterTypeId(typeId);
    setSelectedSubTypeId(''); // Reset sub-type selection
    setSelectedEquipmentIds([]); // Reset equipment selections when type changes
    
    if (typeId) {
      // Get all fighters with the same fighter_type name and fighter_class to check for sub-types
      const selectedType = gangAdditionTypes.find(t => t.id === typeId);
      const fighterTypeGroup = gangAdditionTypes.filter(t => 
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
        setGangAdditionCost(selectedType?.total_cost.toString() || '');
        setFighterCost(selectedType?.total_cost.toString() || '');
        
        // Auto-selection will happen in the useEffect
      } else {
        // No sub-types, just set the cost directly
        setGangAdditionCost(selectedType?.total_cost.toString() || '');
        setFighterCost(selectedType?.total_cost.toString() || '');
        setAvailableSubTypes([]);
      }
    } else {
      setGangAdditionCost('');
      setFighterCost('');
      setAvailableSubTypes([]);
    }
  };

  const handleSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subTypeId = e.target.value;
    setSelectedSubTypeId(subTypeId);
    setSelectedEquipmentIds([]); // Reset equipment selections when sub-type changes
    
    if (subTypeId) {
      // Don't change the selectedGangAdditionTypeId, just update the cost
      const selectedType = gangAdditionTypes.find(t => t.id === subTypeId);
      if (selectedType) {
        setGangAdditionCost(selectedType.total_cost.toString() || '');
        setFighterCost(selectedType.total_cost.toString() || '');
      }
    } else {
      // If no sub-type is selected, revert to the main fighter type's cost
      const mainType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
      if (mainType) {
        setGangAdditionCost(mainType.total_cost.toString() || '');
        setFighterCost(mainType.total_cost.toString() || '');
      }
    }
  };

  // Handle cost input changes
  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCost = e.target.value;
    setFighterCost(newCost);
    
    // If cost is 0, automatically set useBaseCostForRating to true
    if (newCost === '0') {
      setUseBaseCostForRating(true);
    }
  };

  const filteredGangAdditionTypes = selectedGangAdditionClass
    ? gangAdditionTypes.filter(type => type.fighter_class === selectedGangAdditionClass)
    : gangAdditionTypes;

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
    const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
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
                     isSingle ? `Select ${categoryName} (Choose one)` : 
                     `Additional ${categoryName} (Select any)`}
                  </label>
                  
                  <div className="space-y-1">
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
                        {isSingle ? (
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
                              const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
                              const baseCost = selectedType?.total_cost || 0;
                              
                              // Get the option's cost
                              const optionCost = option.cost || 0;
                              
                              if (checked === true) {
                                // For optional/multiple selection, add to existing selections
                                setSelectedEquipmentIds([...selectedEquipmentIds, option.id]);
                                setFighterCost(String(parseInt(fighterCost || '0') + optionCost));
                              } else {
                                // Remove this option
                                setSelectedEquipmentIds(selectedEquipmentIds.filter(id => id !== option.id));
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

  // Replace the calculateTotalCostWithEquipment function with a corrected version
  const calculateTotalCostWithEquipment = () => {
    // Get manually entered cost
    const manualCost = parseInt(fighterCost || '0');
    
    // Calculate equipment cost
    let equipmentCost = 0;
    const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
    
    if (selectedType?.equipment_selection) {
      // Use normalized structure
      const normalizedSelection = normalizeEquipmentSelection(selectedType.equipment_selection);
      const allCategories = Object.entries(normalizedSelection);
      allCategories.forEach(([categoryId, categoryData]) => {
        if (categoryData.options && Array.isArray(categoryData.options)) {
          categoryData.options.forEach((option: GangEquipmentOption) => {
            if (selectedEquipmentIds.includes(option.id)) {
              equipmentCost += (option.cost || 0);
            }
          });
        }
      });
    }
    
    return {
      manualCost,
      equipmentCost,
      totalCost: manualCost + equipmentCost
    };
  };

  // Function to calculate total selected equipment cost directly for display purposes
  const getSelectedEquipmentCost = () => {
    let total = 0;
    const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
    
    if (selectedType?.equipment_selection) {
      // Use normalized structure
      const normalizedSelection = normalizeEquipmentSelection(selectedType.equipment_selection);
      const allCategories = Object.entries(normalizedSelection);
      allCategories.forEach(([categoryId, categoryData]) => {
        if (categoryData.options && Array.isArray(categoryData.options)) {
          categoryData.options.forEach((option: GangEquipmentOption) => {
            if (selectedEquipmentIds.includes(option.id)) {
              total += (option.cost || 0);
            }
          });
        }
      });
    }
    
    return total;
  };

  // Add helper method to get the base cost
  const getBaseCost = () => {
    const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
    return selectedType?.cost || 0;
  };

  const handleAddFighter = async () => {
    if (isAdding) return;
    setIsAdding(true);

    if (!selectedGangAdditionTypeId || !fighterName || fighterCost === '') {
      setFetchError('Please fill in all fields');
      setIsAdding(false);
      return false;
    }

    // Determine which fighter type ID to use
    const fighterTypeIdToUse = selectedSubTypeId || selectedGangAdditionTypeId;
    
    if (!fighterTypeIdToUse) {
      setFetchError('Please select a fighter type');
      setIsAdding(false);
      return false;
    }

    try {
      // Get the current authenticated user's ID
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setFetchError('You must be logged in to add a fighter');
        setIsAdding(false);
        return false;
      }

      // Get the base fighter type cost
      const selectedType = gangAdditionTypes.find(t => t.id === fighterTypeIdToUse);
      const baseCost = selectedType?.cost || 0;
      const enteredCost = parseInt(fighterCost);
      
      const equipmentSelection = selectedType?.equipment_selection as EquipmentSelection;
      
      // Use normalized structure for equipment selection
      let equipmentIds: string[] = [];
      const normalizedSelection = equipmentSelection ? normalizeEquipmentSelection(equipmentSelection) : {};
      if (normalizedSelection) {
        Object.entries(normalizedSelection).forEach(([categoryId, categoryData]) => {
          const selectType = categoryData.select_type || 'optional';
          
          if (selectType === 'optional') {
            // Add all default equipment first
            if (categoryData.default && categoryData.default.length > 0) {
              categoryData.default.forEach((item: EquipmentDefaultItem) => {
                // Add the item multiple times based on quantity
                for (let i = 0; i < item.quantity; i++) {
                  equipmentIds.push(item.id);
                }
              });
            }
            
            // Handle replacements - each selected replacement replaces one default
            const selectedFromThisCategory = selectedEquipmentIds.filter(id => 
              categoryData.options?.some((opt: GangEquipmentOption) => opt.id === id)
            );
            
            selectedFromThisCategory.forEach(selectedId => {
              // Find the replacement option to get its max_quantity
              const replacementOption = categoryData.options?.find((opt: GangEquipmentOption) => opt.id === selectedId);
              const maxQuantity = replacementOption?.max_quantity || 1;
              
              // Replace up to max_quantity of the first default item
              for (let i = 0; i < maxQuantity; i++) {
                const firstDefaultId = categoryData.default?.[0]?.id;
                if (firstDefaultId) {
                  const indexToRemove = equipmentIds.indexOf(firstDefaultId);
                  if (indexToRemove !== -1) {
                    equipmentIds.splice(indexToRemove, 1);
                  }
                }
              }
              
              // Add the replacement equipment
              equipmentIds.push(selectedId);
            });
          } else if (selectType === 'single' || selectType === 'multiple') {
            // For single or multiple selection, just add the selected IDs
            selectedEquipmentIds.forEach(id => {
              // Only add if it belongs to this category
              if (categoryData.options?.some((opt: GangEquipmentOption) => opt.id === id)) {
                equipmentIds.push(id);
              }
            });
          }
        });
      }
      // Ensure equipmentIds includes user selections even if no proper structure is defined
      if (equipmentIds.length === 0 && selectedEquipmentIds.length > 0) {
        equipmentIds = [...selectedEquipmentIds];
      }

      // Parse the fighter cost, defaulting to 0 if it's empty or NaN
      const parsedCost = fighterCost === '' ? 0 : parseInt(fighterCost);
      
      // Get total costs for logging
      const { totalCost } = calculateTotalCostWithEquipment();
      
      // Debug log to verify equipment IDs and costs are being sent
      console.log('Sending equipment IDs:', equipmentIds);
      console.log('Entered cost:', parsedCost);
      console.log('Base cost:', baseCost);
      console.log('Total cost with equipment:', totalCost);
      console.log('Using base cost for rating:', useBaseCostForRating);

      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/new_add_fighter_to_gang',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            p_gang_id: gangId,
            p_fighter_type_id: fighterTypeIdToUse,
            p_fighter_name: fighterName,
            p_cost: parsedCost,
            p_selected_equipment_ids: equipmentIds,
            p_user_id: user.id,
            p_use_base_cost_for_rating: useBaseCostForRating
          })
        }
      );

      const data = await response.json();
      console.log('Server response:', data); // Keep this for debugging

      // Check for the specific "Not enough credits" error first
      if (data.error?.includes('Not enough credits')) {
        throw new Error('Not enough credits');
      }
      
      // For all other errors
      if (data.error || !data?.fighter_id) {
        throw new Error('Failed to add fighter');
      }

      const actualCost = parsedCost;

      const newFighter = {
        id: data.fighter_id,
        fighter_name: fighterName,
        fighter_type_id: fighterTypeIdToUse,
        fighter_type: data.fighter_type,
        fighter_class: data.fighter_class,
        fighter_sub_type: data.fighter_sub_type,
        credits: data.rating_cost || parseInt(fighterCost),
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
        skills: data.skills ? data.skills.reduce((acc: FighterSkills, skill: any) => {
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
          injuries: [] as FighterEffect[],
          advancements: [] as FighterEffect[],
          bionics: [] as FighterEffect[],
          cyberteknika: [] as FighterEffect[],
          user: [] as FighterEffect[]
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
      } as FighterProps;

      onFighterAdded(newFighter, actualCost);
      closeModal();

      toast({
        description: `${fighterName} added successfully`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Error adding fighter:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to add fighter');
      setIsAdding(false);
      return false;
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFighterName('');
    setSelectedGangAdditionTypeId('');
    setSelectedGangAdditionClass('');
    setSelectedSubTypeId('');
    setAvailableSubTypes([]);
    setFighterCost('');
    setSelectedEquipmentIds([]);
    setUseBaseCostForRating(true);
    setFetchError(null);
  };

  const gangAdditionsModalContent = (
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

          {Object.entries(
            Array.from(new Set(gangAdditionTypes.map(type => type.fighter_class)))
              .sort((a, b) => {
                const rankA = gangAdditionRank[a.toLowerCase()] ?? Infinity;
                const rankB = gangAdditionRank[b.toLowerCase()] ?? Infinity;
                return rankA - rankB;
              })
              .reduce((groups, classType) => {
                const rank = gangAdditionRank[classType.toLowerCase()] ?? Infinity;
                let groupLabel = "Misc."; // Default category for unlisted fighter classes

                if (rank <= 2) groupLabel = "Hangers-on & Brutes";
                else if (rank <= 10) groupLabel = "Vehicle Crews";
                else if (rank <= 29) groupLabel = "Hired Guns";
                else if (rank <= 39) groupLabel = "Equipment";
                else if (rank <= 49) groupLabel = "Alliances: Criminal Organisations";
                else if (rank <= 59) groupLabel = "Alliances: Merchant Guilds";
                else if (rank <= 69) groupLabel = "Alliances: Noble Houses";

                if (!groups[groupLabel]) groups[groupLabel] = [];
                groups[groupLabel].push(classType);
                return groups;
              }, {} as Record<string, string[]>)
          ).map(([groupLabel, classList]) => (
            <optgroup key={groupLabel} label={groupLabel}>
              {classList.map(classType => (
                <option key={classType} value={classType}>
                  {classType}
                </option>
              ))}
            </optgroup>
          ))}
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
          disabled={!selectedGangAdditionClass}
        >
          <option value="">Select Fighter Type</option>

          {(() => {
            // Create a map to group fighters by type+class and find default/cheapest for each
            const typeClassMap = new Map();
            
            filteredGangAdditionTypes.forEach(fighter => {
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
            
            // Convert the map values to an array and sort by alignment, then alphabetically
            return Array.from(typeClassMap.values())
              .sort((a, b) => {
                // First sort by alignment
                const alignmentOrder: Record<string, number> = {
                  "law abiding": 1,
                  "outlaw": 2,
                  "unaligned": 3,
                };
                
                const alignmentA = a.fighter.alignment?.toLowerCase() ?? "unaligned";
                const alignmentB = b.fighter.alignment?.toLowerCase() ?? "unaligned";
                
                const alignmentRankA = alignmentOrder[alignmentA] ?? 4;
                const alignmentRankB = alignmentOrder[alignmentB] ?? 4;
                
                if (alignmentRankA !== alignmentRankB) {
                  return alignmentRankA - alignmentRankB;
                }
                
                // Then sort alphabetically by fighter type
                return a.fighter.fighter_type.localeCompare(b.fighter.fighter_type);
              })
              .map(({ fighter, cost }) => {
                const displayName = `${fighter.limitation && fighter.limitation > 0 ? `0-${fighter.limitation} ` : ''}${fighter.fighter_type} (${cost} credits)`;
                
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
                const aCost = gangAdditionTypes.find(ft => ft.id === a.id)?.total_cost ?? 0;
                const bCost = gangAdditionTypes.find(ft => ft.id === b.id)?.total_cost ?? 0;
                if (aCost !== bCost) return aCost - bCost;

                return aName.localeCompare(bName);
              })
              .map((subType) => {
                const subTypeCost = gangAdditionTypes.find(ft => ft.id === subType.id)?.total_cost ?? 0;
                const lowestSubTypeCost = Math.min(
                  ...availableSubTypes.map(sub =>
                    gangAdditionTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity
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
          onChange={handleCostChange}
          className="w-full"
          min={0}
        />
        {selectedGangAdditionTypeId && (
          <p className="text-sm text-gray-500">
            Base cost: {getBaseCost()} credits
            {getSelectedEquipmentCost() > 0 && (
              <> | Equipment cost: {getSelectedEquipmentCost()} credits</>
            )}
          </p>
        )}
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
            When checked, the fighter will cost what you enter above, but its rating will be calculated using the base cost plus equipment cost. When unchecked, the fighter's rating will be based on what you paid.
          </div>
        </div>
      </div>

      {renderEquipmentSelection()}

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  return (
    <Modal
      title="Gang Additions"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {initialCredits}
          </span>
        </div>
      }
      content={gangAdditionsModalContent}
      onClose={closeModal}
      onConfirm={handleAddFighter}
      confirmText="Add Fighter"
      confirmDisabled={
        isAdding ||
        !selectedGangAdditionTypeId || !fighterName || !fighterCost || 
        (availableSubTypes.length > 0 && !selectedSubTypeId) ||
        // Equipment selection required but not selected
        (() => {
          const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
          const normalizedSelection = selectedType?.equipment_selection ? normalizeEquipmentSelection(selectedType.equipment_selection) : {};
          if (!normalizedSelection) return false;
          for (const [categoryId, categoryData] of Object.entries(normalizedSelection)) {
            const selectType = categoryData.select_type || 'optional';
            if (selectType === 'single' && 
                (!categoryData.default || categoryData.default.length === 0) &&
                categoryData.options && categoryData.options.length > 0) {
              const selectedFromCategory = selectedEquipmentIds.some(id => 
                categoryData.options?.some((opt: GangEquipmentOption) => opt.id === id)
              );
              if (!selectedFromCategory) {
                return true;
              }
            }
          }
          return false;
        })()
      }
    />
  );
} 