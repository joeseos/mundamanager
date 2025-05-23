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
  initialCredits: number;
  onFighterAdded: (newFighter: FighterProps, cost: number) => void;
}

export default function GangAdditions({
  showModal,
  setShowModal,
  gangId,
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
    if (typeId) {
      const selectedType = gangAdditionTypes.find(t => t.id === typeId);
      setGangAdditionCost(selectedType?.total_cost.toString() || '');
      setFighterCost(selectedType?.total_cost.toString() || '');
      
      // Reset equipment selections when changing type
      setSelectedEquipmentIds([]);
    } else {
      setGangAdditionCost('');
      setFighterCost('');
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

    // Group equipment options by selection category
    const allCategories = Object.entries(selectedType.equipment_selection as EquipmentSelection);
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
                    {isOptional ? `Optional ${categoryName} (Replaces one default weapon)` : 
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
                            onChange={(e) => {
                              const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
                              const baseCost = selectedType?.total_cost || 0;
                              
                              // Get the option's cost
                              const optionCost = option.cost || 0;
                              
                              if (e.target.checked) {
                                // For single selection, replace previous selection in this category
                                const prevSelectedId = selectedEquipmentIds.find(id => {
                                  const prevOption = categoryData.options?.find((o: any) => o.id === id);
                                  return !!prevOption;
                                });
                                
                                let prevSelectedCost = 0;
                                
                                // Find cost of previously selected item if any
                                if (prevSelectedId) {
                                  const prevOption = categoryData.options?.find((o: any) => o.id === prevSelectedId);
                                  prevSelectedCost = prevOption?.cost || 0;
                                  
                                  // Remove previous selection
                                  setSelectedEquipmentIds(selectedEquipmentIds.filter(id => id !== prevSelectedId));
                                }
                                
                                // Add new selection
                                setSelectedEquipmentIds([...selectedEquipmentIds, option.id]);
                                setFighterCost(String(parseInt(fighterCost || '0') - prevSelectedCost + optionCost));
                              }
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
      const allCategories = Object.entries(selectedType.equipment_selection as EquipmentSelection);
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
      const allCategories = Object.entries(selectedType.equipment_selection as EquipmentSelection);
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
    if (!selectedGangAdditionTypeId || !fighterName || fighterCost === '') {
      setFetchError('Please fill in all fields');
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

      // Get the base fighter type cost
      const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
      const baseCost = selectedType?.cost || 0;
      const enteredCost = parseInt(fighterCost);
      
      const equipmentSelection = selectedType?.equipment_selection as EquipmentSelection;
      
      let equipmentIds: string[] = [];
      
      if (equipmentSelection) {
        // Process each category (weapons, wargear, etc.)
        Object.entries(equipmentSelection).forEach(([categoryId, categoryData]) => {
          const selectType = categoryData.select_type || 'optional';
          
          if (selectType === 'optional' && categoryData.default && categoryData.default.length > 0) {
            // For optional selection types, add all default equipment first
            categoryData.default.forEach((item: EquipmentDefaultItem) => {
              // Add the item multiple times based on quantity
              for (let i = 0; i < item.quantity; i++) {
                equipmentIds.push(item.id);
              }
            });
            
            // If the user selected an optional item from this category, replace ONE instance of the first default item
            const selectedFromThisCategory = selectedEquipmentIds.find(id => 
              categoryData.options?.some((opt: GangEquipmentOption) => opt.id === id)
            );
            
            if (selectedFromThisCategory) {
              // Remove only one instance of the first default item
              const firstDefaultId = categoryData.default[0].id;
              const indexToRemove = equipmentIds.indexOf(firstDefaultId);
              if (indexToRemove !== -1) {
                equipmentIds.splice(indexToRemove, 1);
              }
              
              // Add the optional equipment
              equipmentIds.push(selectedFromThisCategory);
            }
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
            p_fighter_type_id: selectedGangAdditionTypeId,
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
        fighter_type_id: selectedGangAdditionTypeId,
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
          cybernetics: [] as FighterEffect[],
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
      return false;
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFighterName('');
    setSelectedGangAdditionTypeId('');
    setSelectedGangAdditionClass('');
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

          {Object.entries(
            filteredGangAdditionTypes
              .slice() // Create a shallow copy to avoid mutating the original array
              .sort((a, b) => a.fighter_type.localeCompare(b.fighter_type)) // Alphabetical sorting within groups
              .reduce((groups, type) => {
                const groupLabel = type.alignment?.toLowerCase() ?? "unaligned"; // Default to "Unaligned" if null

                if (!groups[groupLabel]) groups[groupLabel] = [];
                groups[groupLabel].push(type);
                return groups;
              }, {} as Record<string, typeof filteredGangAdditionTypes>)
          )
            // Sort optgroup labels by predefined priority
            .sort(([groupA], [groupB]) => {
              const alignmentOrder: Record<string, number> = {
                "law abiding": 1,
                "outlaw": 2,
                "unaligned": 3,
              };

              return (alignmentOrder[groupA] ?? 4) - (alignmentOrder[groupB] ?? 4);
            })
            .map(([groupLabel, fighterList]) => (
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
        // Basic required fields
        !selectedGangAdditionTypeId || !fighterName || !fighterCost || 
        
        // Equipment selection required but not selected
        (() => {
          const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
          const equipmentSelection = selectedType?.equipment_selection as EquipmentSelection;
          
          // If no equipment selection feature, button should not be disabled
          if (!equipmentSelection) return false;
          
          // Check each category
          for (const [categoryId, categoryData] of Object.entries(equipmentSelection)) {
            const selectType = categoryData.select_type || 'optional';
            
            // If 'single' type selection is required and there's no default equipment
            // AND there are options available, require user to select one option
            if (selectType === 'single' && 
                (!categoryData.default || categoryData.default.length === 0) &&
                categoryData.options && categoryData.options.length > 0) {
              
              // Check if user selected an option from this category
              const selectedFromCategory = selectedEquipmentIds.some(id => 
                categoryData.options?.some((opt: GangEquipmentOption) => opt.id === id)
              );
              
              if (!selectedFromCategory) {
                return true; // Disable button if required selection is missing
              }
            }
          }
          
          return false;
        })()
      }
    />
  );
} 