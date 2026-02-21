'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import Modal from '@/components/ui/modal';
import { FighterType } from '@/types/fighter-type';
import { FighterProps } from '@/types/fighter';
import { toast } from 'sonner';
import { fighterClassRank } from "@/utils/fighterClassRank";
import { fighterTypeRank } from "@/utils/fighterTypeRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { createClient } from '@/utils/supabase/client';
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { ImInfo } from "react-icons/im";
import { addFighterToGang } from '@/app/actions/add-fighter';
import { useMutation } from '@tanstack/react-query';
import {
  buildFighterFromServerData,
  buildBeastFromServerData,
  createEmptyEffects,
  createStats,
  type AddFighterServerData,
  type ExoticBeastServerData
} from '@/utils/fighter-builder';

interface AddFighterProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  gangId: string;
  gangTypeId: string;
  initialCredits: number;
  onFighterAdded: (newFighter: any, cost: number) => void;
  onFighterRollback?: (tempFighterId: string, cost: number, ratingCost: number) => void;
  onFighterReconcile?: (tempFighterId: string, realFighter: FighterProps) => void;
  gangVariants?: Array<{id: string, variant: string}>;
  gangAffiliationId?: string | null;
}

interface GangEquipmentOption {
  id: string;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  cost: number;
  max_quantity: number;
  displayCategory?: string;
  is_editable?: boolean;
}

interface EquipmentDefaultItem {
  id: string;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  quantity: number;
  is_editable?: boolean;
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
                            max_quantity: replacement.max_quantity || 1,
                            is_editable: replacement.is_editable || false
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
                        quantity: item.quantity || 1,
                        is_editable: item.is_editable || false
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
                        max_quantity: item.max_quantity || 1,
                        is_editable: item.is_editable || false
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
                        max_quantity: replacement.max_quantity || 1,
                        is_editable: replacement.is_editable || false
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
                        max_quantity: item.max_quantity || 1,
                        is_editable: item.is_editable || false
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
  gangId,
  gangTypeId,
  initialCredits,
  onFighterAdded,
  onFighterRollback,
  onFighterReconcile,
  gangVariants = [],
  gangAffiliationId,
}: AddFighterProps) {
  
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{id: string, sub_type_name: string}>>([]);
  const [fighterCost, setFighterCost] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState<boolean>(true);
  const [includeCustomFighters, setIncludeCustomFighters] = useState<boolean>(false);
  const [includeAllFighterTypes, setIncludeAllFighterTypes] = useState<boolean>(false);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [selectedLegacyId, setSelectedLegacyId] = useState<string>('');
  const [isLoadingFighterTypes, setIsLoadingFighterTypes] = useState<boolean>(false);
  
  // Add state to track selected equipment with costs
  const [selectedEquipment, setSelectedEquipment] = useState<Array<{
    equipment_id: string;
    cost: number;
    quantity: number;
    is_editable?: boolean;
  }>>([]);

  // Check if optimistic updates are enabled (both callbacks must be provided)
  const optimisticUpdatesEnabled = !!(onFighterRollback && onFighterReconcile);

  // Helper function to build an optimistic fighter from form state
  const buildOptimisticFighter = (tempId: string): FighterProps => {
    const fighterTypeIdToUse = selectedSubTypeId || selectedFighterTypeId;
    const selectedType = fighterTypes.find(t => t.id === fighterTypeIdToUse);
    const enteredCost = parseInt(fighterCost);
    const actualBaseCost = selectedType?.total_cost || 0;

    // Calculate equipment cost
    const totalEquipmentCost = selectedEquipment.reduce((sum, item) =>
      sum + (item.cost * (item.quantity || 1)), 0);

    // Calculate display cost based on useBaseCostForRating setting
    const displayCost = useBaseCostForRating ? (actualBaseCost + totalEquipmentCost) : enteredCost;

    // Build optimistic weapons from default_equipment
    const defaultEquipment = selectedType?.default_equipment || [];
    const optimisticWeapons = defaultEquipment
      .filter((item: any) => item.equipment_type === 'weapon')
      .map((item: any) => ({
        fighter_weapon_id: `temp-${item.id}`,
        weapon_id: item.id,
        weapon_name: item.equipment_name,
        cost: item.cost || 0,
        weapon_profiles: [], // Will be filled on reconcile
      }));

    // Build optimistic wargear from default_equipment
    const optimisticWargear = defaultEquipment
      .filter((item: any) => item.equipment_type === 'wargear')
      .map((item: any) => ({
        fighter_weapon_id: `temp-${item.id}`,
        wargear_id: item.id,
        wargear_name: item.equipment_name,
        cost: item.cost || 0,
      }));

    const stats = createStats({
      movement: selectedType?.movement || 0,
      weapon_skill: selectedType?.weapon_skill || 0,
      ballistic_skill: selectedType?.ballistic_skill || 0,
      strength: selectedType?.strength || 0,
      toughness: selectedType?.toughness || 0,
      wounds: selectedType?.wounds || 0,
      initiative: selectedType?.initiative || 0,
      attacks: selectedType?.attacks || 0,
      leadership: selectedType?.leadership || 0,
      cool: selectedType?.cool || 0,
      willpower: selectedType?.willpower || 0,
      intelligence: selectedType?.intelligence || 0
    });

    return {
      id: tempId,
      fighter_name: fighterName,
      fighter_type_id: fighterTypeIdToUse,
      fighter_type: selectedType?.fighter_type || '',
      fighter_class: selectedType?.fighter_class || '',
      fighter_sub_type: selectedType?.sub_type ? {
        fighter_sub_type_id: selectedType.sub_type.id || '',
        fighter_sub_type: selectedType.sub_type.sub_type_name || ''
      } : undefined,
      credits: displayCost,
      ...stats,
      xp: 0,
      kills: 0,
      weapons: optimisticWeapons,
      wargear: optimisticWargear,
      special_rules: selectedType?.special_rules || [],
      skills: {}, // Will be filled on reconcile
      advancements: {
        characteristics: {},
        skills: {}
      },
      free_skill: selectedType?.free_skill || false,
      effects: createEmptyEffects(),
      base_stats: stats,
      current_stats: stats
    };
  };

  // TanStack Query mutation for optimistic updates
  const addFighterMutation = useMutation({
    mutationFn: async (params: {
      fighter_name: string;
      fighter_type_id: string;
      gang_id: string;
      cost: number;
      selected_equipment: typeof selectedEquipment;
      default_equipment: Array<{ equipment_id: string; cost: number; quantity: number; is_editable?: boolean }>;
      use_base_cost_for_rating: boolean;
      fighter_gang_legacy_id?: string;
    }) => {
      const result = await addFighterToGang(params);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add fighter');
      }
      return result.data!;
    },
    onMutate: async (variables) => {
      // Close modal immediately regardless of optimistic updates
      closeModal();

      // Only do optimistic updates if both rollback and reconcile callbacks are provided
      if (!optimisticUpdatesEnabled) {
        return { tempFighterId: null, cost: variables.cost, ratingCost: 0 };
      }

      // Generate temp ID
      const tempFighterId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Build optimistic fighter
      const optimisticFighter = buildOptimisticFighter(tempFighterId);

      // Call onFighterAdded with optimistic fighter
      onFighterAdded(optimisticFighter, variables.cost);

      // Return context for rollback/reconcile
      const selectedType = fighterTypes.find(t => t.id === variables.fighter_type_id);
      const actualBaseCost = selectedType?.total_cost || 0;
      const totalEquipmentCost = variables.selected_equipment.reduce((sum, item) =>
        sum + (item.cost * (item.quantity || 1)), 0);
      const ratingCost = variables.use_base_cost_for_rating
        ? (actualBaseCost + totalEquipmentCost)
        : variables.cost;

      return { tempFighterId, cost: variables.cost, ratingCost };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update only if we did one
      if (context?.tempFighterId && onFighterRollback) {
        onFighterRollback(context.tempFighterId, context.cost, context.ratingCost);
      }

      toast.error(error instanceof Error ? error.message : 'Failed to add fighter');
    },
    onSuccess: (data, variables, context) => {
      if (!context) return;

      // Build real fighter from server response using utility
      const selectedType = fighterTypes.find(t => t.id === variables.fighter_type_id);
      const realFighter = buildFighterFromServerData(
        data as AddFighterServerData,
        variables.fighter_type_id,
        selectedType?.sub_type?.sub_type_name
      );

      // If we did an optimistic update, reconcile; otherwise add the fighter now
      if (context.tempFighterId && onFighterReconcile) {
        onFighterReconcile(context.tempFighterId, realFighter);
      } else if (!context.tempFighterId) {
        // Non-optimistic path: add the fighter after server confirms
        onFighterAdded(realFighter, variables.cost);
      }

      // Handle exotic beasts if created
      if (data.created_beasts && data.created_beasts.length > 0) {
        data.created_beasts.forEach((beast: ExoticBeastServerData) => {
          const beastFighter = buildBeastFromServerData(beast);
          onFighterAdded(beastFighter, 0); // 0 cost since already paid
        });
      }

      toast.success(`${data.fighter_name} added successfully${data.created_beasts?.length ? ` with ${data.created_beasts.length} exotic beast(s)` : ''}`);
    }
  });

  // Fetch fighter types when modal opens or includeCustomFighters changes
  useEffect(() => {
    if (showModal && !isLoadingFighterTypes) {
      fetchFighterTypes();
    }
  }, [showModal, includeCustomFighters, includeAllFighterTypes]);

  const fetchFighterTypes = async () => {
    if (isLoadingFighterTypes) return; // Prevent concurrent calls

    try {
      setIsLoadingFighterTypes(true);
      // Use the API route instead of server action
      const gangVariantsParam = gangVariants.length > 0 ? `&gang_variants=${encodeURIComponent(JSON.stringify(gangVariants))}` : '';
      const customFightersParam = includeCustomFighters ? '&include_custom_fighters=true' : '';
      const includeAllParam = includeCustomFighters ? '&include_all_gang_type=true' : '';
      const affiliationParam = gangAffiliationId ? `&gang_affiliation_id=${gangAffiliationId}` : '';
      const includeAllTypesParam = includeAllFighterTypes ? '&include_all_types=true' : '';
      const response = await fetch(`/api/fighter-types?gang_id=${gangId}&gang_type_id=${gangTypeId}&is_gang_addition=false${gangVariantsParam}${customFightersParam}${includeAllParam}${affiliationParam}${includeAllTypesParam}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform API response to match existing FighterType interface
      const transformedData = data.map((type: any) => ({
        id: type.id,
        fighter_type_id: type.id, // Map id to fighter_type_id for compatibility
        fighter_type: type.fighter_type,
        fighter_class: type.fighter_class,
        gang_type: type.gang_type,
        cost: type.cost,
        gang_type_id: type.gang_type_id,
        special_rules: type.special_rules || [],
        total_cost: type.total_cost,
        movement: type.movement,
        weapon_skill: type.weapon_skill,
        ballistic_skill: type.ballistic_skill,
        strength: type.strength,
        toughness: type.toughness,
        wounds: type.wounds,
        initiative: type.initiative,
        leadership: type.leadership,
        cool: type.cool,
        willpower: type.willpower,
        intelligence: type.intelligence,
        attacks: type.attacks,
        limitation: type.limitation,
        alignment: type.alignment,
        default_equipment: type.default_equipment || [],
        is_gang_addition: type.is_gang_addition || false,
        alliance_id: type.alliance_id || '',
        alliance_crew_name: type.alliance_crew_name || '',
        equipment_selection: type.equipment_selection,
        sub_type: type.sub_type,
        fighter_sub_type_id: type.sub_type?.id,
        available_legacies: type.available_legacies || [],
        is_custom_fighter: type.is_custom_fighter || false,
        free_skill: type.free_skill || false
      }));
      
      setFighterTypes(transformedData);
    } catch (error) {
      console.error('Error fetching fighter types:', error);
      toast.error("Failed to load fighter types");
    } finally {
      setIsLoadingFighterTypes(false);
    }
  };

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
                  <label className="block text-sm font-medium text-muted-foreground">
                    Default {categoryName}
                  </label>
                  <div className="space-y-1">
                    {categoryData.default.map((item: EquipmentDefaultItem, index: number) => {
                      // Access equipment_name with type assertion for safety
                      const defaultItem = item as any;
                      const equipmentName = defaultItem.equipment_name || "Equipment";
                      
                      return (
                        <div key={`${item.id}-${index}`} className="flex items-center gap-2">
                          <div className="bg-muted px-3 py-1 rounded-full text-sm">
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
                  <label className="block text-sm font-medium text-muted-foreground">
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
                          checked={!categoryData.options?.some((o: any) => selectedEquipmentIds.includes(`${categoryId}-${o.id}`))}
                          onChange={() => {
                            // Remove all selections for this category (keep default)
                            setSelectedEquipmentIds((prev) => {
                              const currentCategoryOptions = categoryData.options || [];
                              return prev.filter(id =>
                                !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
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
                                      quantity: defaultItem.quantity || 1,
                                      is_editable: defaultItem.is_editable || false
                                    });
                                  }
                                });
                              }
                              
                              return filtered;
                            });

                            // Reset cost to remove any equipment costs from this category
                            setFighterCost((prevCost) => {
                              const currentCategoryOptions = categoryData.options || [];
                              const prevSelectedUniqueId = selectedEquipmentIds.find(id =>
                                currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                              );
                              const prevSelectedCost = prevSelectedUniqueId
                                ? currentCategoryOptions.find((o: any) => `${categoryId}-${o.id}` === prevSelectedUniqueId)?.cost || 0
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
                    .map((option) => {
                      // Create unique identifier for this option in this category
                      const uniqueOptionId = `${categoryId}-${option.id}`;
                      
                      return (
                        <div key={uniqueOptionId} className="flex items-center gap-2">
                          {(isSingle || isOptionalSingle) ? (
                            <input
                              type="radio"
                              name={`equipment-selection-${categoryId}`}
                              id={uniqueOptionId}
                              checked={selectedEquipmentIds.includes(uniqueOptionId)}
                              onChange={() => {
                                // Only one can be selected in this category
                                setSelectedEquipmentIds((prev) => {
                                  // Remove all previous selections for this specific category only
                                  const currentCategoryOptions = categoryData.options || [];
                                  const filtered = prev.filter(id =>
                                    !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                  );
                                  return [...filtered, uniqueOptionId];
                                });

                              // Update equipment with costs - handle default replacement for optional_single
                              setSelectedEquipment((prev) => {
                                // Remove previous selections from this specific category only
                                // We need to track which category each equipment came from
                                const currentCategoryOptions = categoryData.options || [];
                                const previouslySelectedInThisCategory = selectedEquipmentIds.filter(id =>
                                  currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                );
                                
                                // Remove equipment that was previously selected in this category
                                let filtered = prev.filter(item => {
                                  // Check if this item was selected from the current category
                                  const wasSelectedFromThisCategory = previouslySelectedInThisCategory.some(selectedId => {
                                    const equipmentIdFromSelected = selectedId.split('-').pop();
                                    return equipmentIdFromSelected === item.equipment_id;
                                  });
                                  return !wasSelectedFromThisCategory;
                                });
                                
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
                                  quantity: 1,
                                  is_editable: option.is_editable || false
                                }];
                              });

                              // Update cost using functional update
                              setFighterCost((prevCost) => {
                                // Find previous selection in this specific category only
                                const currentCategoryOptions = categoryData.options || [];
                                const prevSelectedUniqueId = selectedEquipmentIds.find(id =>
                                  currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                );
                                const prevSelectedCost = prevSelectedUniqueId
                                  ? currentCategoryOptions.find((o: any) => `${categoryId}-${o.id}` === prevSelectedUniqueId)?.cost || 0
                                  : 0;
                                const optionCost = option.cost || 0;
                                return String(parseInt(prevCost || '0') - prevSelectedCost + optionCost);
                              });
                            }}
                          />
                        ) : (
                          <Checkbox
                            id={uniqueOptionId}
                            checked={selectedEquipmentIds.includes(uniqueOptionId)}
                            onCheckedChange={(checked) => {
                              const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
                              const baseCost = selectedType?.total_cost || 0;
                              
                              // Get the option's cost
                              const optionCost = option.cost || 0;
                              
                              if (checked === true) {
                                // For optional/multiple selection, add to existing selections
                                setSelectedEquipmentIds([...selectedEquipmentIds, uniqueOptionId]);
                                
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
                                      quantity: 1,
                                      is_editable: option.is_editable || false
                                    }];
                                  });
                                } else {
                                  // Just add the new equipment
                                  setSelectedEquipment([...selectedEquipment, {
                                    equipment_id: option.id,
                                    cost: optionCost,
                                    quantity: 1,
                                    is_editable: option.is_editable || false
                                  }]);
                                }
                                
                                setFighterCost(String(parseInt(fighterCost || '0') + optionCost));
                              } else {
                                // Remove this option
                                setSelectedEquipmentIds(selectedEquipmentIds.filter(id => id !== uniqueOptionId));
                                
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
                                      quantity: defaultItem.quantity || 1,
                                      is_editable: defaultItem.is_editable || false
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
                        <label htmlFor={uniqueOptionId} className="text-sm">
                          {option.equipment_name || 'Loading...'}
                          {` ${option.cost >= 0 ? '+' : ''}${option.cost} credits`}
                        </label>
                      </div>
                    );
                    })}
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
  const getDefaultEquipment = (equipmentSelection: any): Array<{equipment_id: string, cost: number, quantity: number, is_editable?: boolean}> => {
    const defaults: Array<{equipment_id: string, cost: number, quantity: number, is_editable?: boolean}> = [];

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
            quantity: defaultItem.quantity || 1,
            is_editable: defaultItem.is_editable || false
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
    // Validation before mutation fires
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

    // Parse the cost from the input
    const enteredCost = parseInt(fighterCost);

    // Check if gang can afford this fighter (only if cost > 0)
    if (enteredCost > 0 && initialCredits < enteredCost) {
      setFetchError('Not enough credits to add this fighter');
      return false;
    }

    // Prepare default equipment from the selected fighter type
    const fighterTypeForEquipment = fighterTypes.find(t => t.id === fighterTypeIdToUse);
    const defaultEquipment = fighterTypeForEquipment?.default_equipment?.map(item => ({
      equipment_id: item.id,
      cost: item.cost || 0,
      quantity: 1,
      is_editable: item.is_editable || false
    })) || [];

    // Trigger mutation (optimistic update happens in onMutate)
    addFighterMutation.mutate({
      fighter_name: fighterName,
      fighter_type_id: fighterTypeIdToUse,
      gang_id: gangId,
      cost: enteredCost,
      selected_equipment: selectedEquipment,
      default_equipment: defaultEquipment,
      use_base_cost_for_rating: useBaseCostForRating,
      fighter_gang_legacy_id: selectedLegacyId || undefined
    });

    return true;
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
    setSelectedLegacyId(''); // Reset legacy selection
    setUseBaseCostForRating(true);
    setIncludeCustomFighters(false); // Reset custom fighters checkbox
    setIncludeAllFighterTypes(false); // Reset all fighter types checkbox
    setFetchError(null);
    setFighterTypes([]); // Reset fighter types
    setIsLoadingFighterTypes(false); // Reset loading state
  };

  const addFighterModalContent = (
    <div className="space-y-4">
      {/* Fighter Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">
          Fighter Type *
        </label>
        <Combobox
          value={selectedFighterTypeId}
          onValueChange={(value) => {
            const typeId = value;
            setSelectedFighterTypeId(typeId);
            setSelectedSubTypeId(''); // Reset sub-type selection
            setSelectedLegacyId(''); // Reset legacy selection
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
              } else {
                // No sub-types, just set the cost directly
                setFighterCost(selectedType?.total_cost.toString() || '');
                setAvailableSubTypes([]);
              }
            } else {
              setFighterCost('');
              setAvailableSubTypes([]);
            }
          }}
          placeholder="Select fighter type"
          options={(() => {
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

            const sortFighters = (a: { fighter: any; cost: number }, b: { fighter: any; cost: number }) => {
              const classRankA = fighterClassRank[a.fighter.fighter_class.toLowerCase()] ?? Infinity;
              const classRankB = fighterClassRank[b.fighter.fighter_class.toLowerCase()] ?? Infinity;

              if (classRankA !== classRankB) {
                return classRankA - classRankB;
              }

              if (a.cost !== b.cost) {
                return a.cost - b.cost;
              }

              return a.fighter.fighter_type.localeCompare(b.fighter.fighter_type);
            };

            const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

            if (includeAllFighterTypes) {
              // Group by gang_type name when showing all fighter types
              const groupedByGangType = Array.from(typeClassMap.values()).reduce((groups, { fighter, cost }) => {
                const gangTypeName = fighter.gang_type || 'Unknown';
                if (!groups[gangTypeName]) {
                  groups[gangTypeName] = [];
                }
                groups[gangTypeName].push({ fighter, cost });
                return groups;
              }, {} as Record<string, Array<{ fighter: any; cost: number }>>);

              const sortedGangTypes = Object.keys(groupedByGangType).sort((a, b) => a.localeCompare(b));

              sortedGangTypes.forEach((gangTypeName) => {
                const fighters = groupedByGangType[gangTypeName].sort(sortFighters);

                // Add gang type header
                options.push({
                  value: `header-gang-${gangTypeName}`,
                  label: <span className="font-bold">{gangTypeName}</span>,
                  displayValue: gangTypeName,
                  disabled: true
                });

                // Add fighters indented
                fighters.forEach(({ fighter, cost }: { fighter: any; cost: number }) => {
                  const displayName = `${fighter.fighter_type} (${fighter.fighter_class}) - ${cost} credits`;
                  options.push({
                    value: fighter.id,
                    label: <span className="ml-3">{displayName}</span>,
                    displayValue: displayName
                  });
                });
              });

              return options;
            }

            // Default grouping: regular vs custom
            const groupedByType = Array.from(typeClassMap.values()).reduce((groups, { fighter, cost }) => {
              const isCustom = (fighter as any).is_custom_fighter;
              const groupKey = isCustom ? "custom" : "regular";

              if (!groups[groupKey]) {
                groups[groupKey] = [];
              }
              groups[groupKey].push({ fighter, cost });
              return groups;
            }, {} as Record<string, Array<{ fighter: any; cost: number }>>);

            // Define group display names
            const groupDisplayNames: Record<string, string> = {
              "regular": "Fighter Types",
              "custom": "Custom Fighter Types",
            };

            // Check if we have both regular and custom fighters
            const hasMultipleGroups = Object.keys(groupedByType).length > 1;

            // Sort groups by rank, then sort fighters within each group
            const sortedGroups = Object.keys(groupedByType)
              .sort((a, b) => {
                const rankA = fighterTypeRank[a] ?? 999;
                const rankB = fighterTypeRank[b] ?? 999;
                return rankA - rankB;
              });

            // If no groups, return empty array
            if (sortedGroups.length === 0) {
              return options;
            }

            if (!hasMultipleGroups) {
              // If only one group, don't use headers - just show options directly
              const groupKey = sortedGroups[0];
              const fighters = (groupedByType[groupKey] || []).sort(sortFighters);

              fighters.forEach(({ fighter, cost }: { fighter: any; cost: number }) => {
                const displayName = `${fighter.fighter_type} (${fighter.fighter_class}) - ${cost} credits`;
                options.push({
                  value: fighter.id,
                  label: displayName
                });
              });

              return options;
            }

            // If multiple groups, use headers
            sortedGroups.forEach((groupKey) => {
              const fighters = (groupedByType[groupKey] || []).sort(sortFighters);

              // Add group header as disabled option
              options.push({
                value: `header-${groupKey}`,
                label: <span className="font-bold">{groupDisplayNames[groupKey]}</span>,
                displayValue: groupDisplayNames[groupKey],
                disabled: true
              });

              // Add fighters in this group
              fighters.forEach(({ fighter, cost }: { fighter: any; cost: number }) => {
                const displayName = `${fighter.fighter_type} (${fighter.fighter_class}) - ${cost} credits`;
                options.push({
                  value: fighter.id,
                  label: <span className="ml-3">{displayName}</span>,
                  displayValue: displayName
                });
              });
            });

            return options;
          })()}
        />

        {/* Checkbox: Include Custom Fighter Types */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-custom-fighters"
            checked={includeCustomFighters}
            onCheckedChange={(checked) => setIncludeCustomFighters(checked as boolean)}
          />
          <label
            htmlFor="include-custom-fighters"
            className="text-sm font-medium text-muted-foreground cursor-pointer"
          >
            Include Custom Fighter Types
          </label>
          <div className="relative group">
            <ImInfo />
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
              When enabled, your custom fighter types will be included in the fighter type dropdown. Only custom fighters matching this gang type will be shown.
            </div>
          </div>
        </div>

        {/* Checkbox: Include All Fighter Types */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-all-fighter-types"
            checked={includeAllFighterTypes}
            onCheckedChange={(checked) => {
              setIncludeAllFighterTypes(checked as boolean);
              // Reset selections when toggling
              setSelectedFighterTypeId('');
              setSelectedSubTypeId('');
              setSelectedEquipmentIds([]);
              setSelectedEquipment([]);
              setFighterCost('');
            }}
          />
          <label
            htmlFor="include-all-fighter-types"
            className="text-sm font-medium text-muted-foreground cursor-pointer"
          >
            Include all fighter types
          </label>
          <div className="relative group">
            <ImInfo />
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
              When enabled, fighter types from all gangs will be shown. Gang additions are found in the "Gang Additions" menu.
            </div>
          </div>
        </div>
      </div>



      {/* Fighter sub-type: Conditionally show dropdown if there are available sub-types */}
      {availableSubTypes.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">
            Fighter Sub-type *
          </label>
          <Combobox
            value={selectedSubTypeId}
            onValueChange={(value) => {
              const subTypeId = value;
              setSelectedSubTypeId(subTypeId);
              setSelectedLegacyId(''); // Reset legacy selection
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
            }}
            placeholder="Select fighter sub-type"
            options={(() => {
              const lowestSubTypeCost = Math.min(
                ...availableSubTypes.map(sub =>
                  fighterTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity
                )
              );

              return [...availableSubTypes]
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
                  const diff = subTypeCost - lowestSubTypeCost;
                  const costLabel = diff === 0 ? "(+0 credits)" : (diff > 0 ? `(+${diff} credits)` : `(${diff} credits)`);

                  // Display "Default" for the null/empty sub-type, otherwise use the actual sub-type name
                  const displayName = subType.sub_type_name === 'Default' ? 'Default' : subType.sub_type_name;

                  return {
                    value: subType.id,
                    label: `${displayName} ${costLabel}`
                  };
                });
            })()}
          />
        </div>
      )}

      {/* Gang Legacy Selection */}
      {(() => {
        // Get the current fighter type (sub-type if selected, otherwise main type)
        const currentFighterTypeId = selectedSubTypeId || selectedFighterTypeId;
        const currentFighterType = fighterTypes.find(t => t.id === currentFighterTypeId);
        const availableLegacies = currentFighterType?.available_legacies || [];
        
        return availableLegacies.length > 0 ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Gang Legacy
            </label>
            <Combobox
              value={selectedLegacyId}
              onValueChange={(value) => setSelectedLegacyId(value)}
              placeholder="No Legacy"
              options={[
                { value: "", label: "No Legacy" },
                ...availableLegacies.map((legacy) => ({
                  value: legacy.id,
                  label: legacy.name
                }))
              ]}
            />
          </div>
        ) : null;
      })()}

      {/* Fighter Cost */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">
          Cost (credits) *
        </label>
        <Input
          type="number"
          placeholder="Enter fighter cost"
          value={fighterCost}
          onChange={(e) => setFighterCost(e.target.value)}
          className="w-full"
          min={0}
        />

        {/* Checkbox:Use Listed Cost for Rating */}
        <div className="flex items-center space-x-2 mb-4 mt-2">
          <Checkbox 
            id="use-base-cost-for-rating"
            checked={useBaseCostForRating}
            onCheckedChange={(checked) => setUseBaseCostForRating(checked as boolean)}
          />
          <label 
            htmlFor="use-base-cost-for-rating" 
            className="text-sm font-medium text-muted-foreground cursor-pointer"
          >
            Use Listed Cost for Rating
          </label>
          <div className="relative group">
            <ImInfo />
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded w-72 -left-36 z-50">
              When enabled, the fighter's rating is calculated using their listed cost, even if you paid a different amount. Disable this if you want the rating to reflect the price actually paid.
            </div>
          </div>
        </div>
      </div>



      {/* Equipment selection */}
      {renderEquipmentSelection()}

      {/* Fighter Name */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">
          Fighter Name *
        </label>
        <Input
          type="text"
          placeholder="Enter fighter name"
          value={fighterName}
          onChange={(e) => setFighterName(e.target.value)}
          className="w-full"
        />
      </div>

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  return (
    <Modal
      title="Add Fighter"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gang Credits</span>
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
