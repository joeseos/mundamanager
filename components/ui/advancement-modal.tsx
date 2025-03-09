'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "./button";
import { useToast } from "./use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { characteristicRank } from "@/utils/characteristicRank";

interface AdvancementModalProps {
  fighterId: string;
  currentXp: number;
  onClose: () => void;
  onAdvancementAdded?: (remainingXp: number, creditsIncrease: number) => void;
}

interface StatChangeCategory {
  id: string;
  name: string;
  type: 'characteristic' | 'skill';
}

interface SkillType {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

interface AvailableAdvancement {
  id: string;
  xp_cost: number;
  stat_change: number;
  can_purchase: boolean;
  level?: number;
  credits_increase?: number;
  skill_id?: string;
  stat_change_name?: string;
  description?: string;
  is_available?: boolean;
  current_level?: number;
  has_enough_xp?: boolean;
  available_acquisition_types?: AcquisitionType[];
  skill_type_id?: string;
}

interface AdvancementsResponse {
  current_xp: number;
  fighter_id: string;
  characteristics: {
    [key: string]: {
      id: string;
      xp_cost: number;
      can_purchase: boolean;
      is_available: boolean;
      current_value: number;
      has_enough_xp: boolean;
      times_increased: number;
      characteristic_code: string;
      credits_increase: number;
    };
  };
}

interface AdvancementResponse {
  id: string;
  xp_cost: number;
  fighter_id: string;
  remaining_xp: number;
  current_value: number;
  times_increased: number;
  credits_increase: number;
  characteristic_code: string;
  characteristic_name: string;
}

// Add interface for skill response
interface SkillResponse {
  skills: {
    skill_id: string;
    skill_name: string;
    skill_type_id: string;
    available_acquisition_types: AcquisitionType[];
  }[];
  fighter_id: string;
  fighter_class: string;
}

// Add interface for skill acquisition type
interface SkillAcquisitionType {
  id: string;
  name: string;
  xpCost: number;
  creditCost: number;
}

// Add proper type for the acquisition types
type AcquisitionType = {
  name: string;
  type_id: string;
  xp_cost: number;
  credit_cost: number;
};

interface SkillData {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available_acquisition_types: AcquisitionType[];
}

export function AdvancementModal({ fighterId, currentXp, onClose, onAdvancementAdded }: AdvancementModalProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<(StatChangeCategory | SkillType)[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [availableAdvancements, setAvailableAdvancements] = useState<AvailableAdvancement[]>([]);
  const [selectedAdvancement, setSelectedAdvancement] = useState<AvailableAdvancement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancementType, setAdvancementType] = useState<'characteristic' | 'skill' | ''>('');
  const [skillAcquisitionType, setSkillAcquisitionType] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [editableXpCost, setEditableXpCost] = useState<number>(0);
  const [editableCreditsIncrease, setEditableCreditsIncrease] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch stat change categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!advancementType) return;
      
      setLoading(true);
      try {
        const endpoint = advancementType === 'characteristic' 
          ? 'characteristics'
          : 'skill_types';

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch ${advancementType}s`);
        }

        const data = await response.json();
        const categoriesWithType = data.map((cat: any) => ({
          ...cat,
          type: advancementType
        }));
        setCategories(categoriesWithType);
      } catch (err) {
        setError(`Failed to load ${advancementType} categories`);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [advancementType]);

  // Fetch available advancements when category is selected
  useEffect(() => {
    const fetchAvailableAdvancements = async () => {
      if (!advancementType || !selectedCategory) return;

      try {
        console.log('Fetching advancements for type:', advancementType);

        if (advancementType === 'characteristic') {
          // Only fetch characteristics if a category is selected
          if (!selectedCategory) return;

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_available_advancements`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              },
              body: JSON.stringify({
                fighter_id: fighterId
              })
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Response status:', response.status);
            console.error('Response text:', errorText);
            throw new Error('Failed to fetch available characteristics');
          }

          const data = await response.json();
          console.log('Available advancements response:', data);
          
          // Find the category name from the selected category
          const selectedCategoryObj = categories.find(cat => cat.id === selectedCategory);
          if (!selectedCategoryObj) {
            console.error('Selected category not found:', selectedCategory);
            return;
          }

          console.log('Selected category:', selectedCategoryObj);
          console.log('Looking for advancement details with key:', selectedCategoryObj.name);
          console.log('Available characteristics:', data.characteristics);

          // Get the advancement details for the selected characteristic
          const advancementDetails = data.characteristics[selectedCategoryObj.name];
          if (!advancementDetails) {
            console.error('No advancement details found for category:', selectedCategoryObj.name);
            return;
          }

          // Format the characteristic advancement
          const formattedAdvancement: AvailableAdvancement = {
            id: advancementDetails.id,
            level: advancementDetails.times_increased || 0,
            xp_cost: advancementDetails.xp_cost,
            stat_change: 1,
            can_purchase: advancementDetails.can_purchase,
            is_available: advancementDetails.is_available,
            current_level: advancementDetails.current_value || 0,
            has_enough_xp: advancementDetails.has_enough_xp,
            credits_increase: advancementDetails.credits_increase,
            stat_change_name: selectedCategoryObj.name,
            available_acquisition_types: []
          };

          setAvailableAdvancements([formattedAdvancement]);
          setSelectedAdvancement(formattedAdvancement);

        } else {
          // Handle skills - only fetch if we have selected a skill set
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_available_skills`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              },
              body: JSON.stringify({
                fighter_id: fighterId
              })
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch available skills');
          }

          const data = await response.json() as SkillResponse;
          console.log('Raw skills data:', data);
          setSkillsData(data);
          
          // Find the selected skill set name
          const selectedSkillType = categories.find(cat => cat.id === selectedCategory);
          if (!selectedSkillType) {
            console.error('Selected skill set not found:', selectedCategory);
            return;
          }

          // Filter skills by the selected type
          const skillsForType = data.skills.filter(
            (skill) => skill.skill_type_id === selectedSkillType.id
          );

          // Format the skills into advancements
          const formattedAdvancements: AvailableAdvancement[] = skillsForType.map((skill) => ({
            id: skill.skill_id,
            skill_id: skill.skill_id,
            xp_cost: 0,
            stat_change: 1,
            can_purchase: true,
            stat_change_name: skill.skill_name,
            credits_increase: 0,
            has_enough_xp: true,
            available_acquisition_types: skill.available_acquisition_types,
            skill_type_id: skill.skill_type_id
          }));

          setAvailableAdvancements(formattedAdvancements);
          if (formattedAdvancements.length > 0) {
            setSelectedAdvancement(formattedAdvancements[0]);
            setEditableXpCost(0);
            setEditableCreditsIncrease(0);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Full error details:', err);
        setError(`Failed to load ${advancementType} details: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    fetchAvailableAdvancements();
  }, [advancementType, selectedCategory, fighterId, currentXp, categories]);

  // Update useEffect to set initial values when an advancement/acquisition type is selected
  useEffect(() => {
    if (selectedAdvancement) {
      setEditableXpCost(selectedAdvancement.xp_cost);
      setEditableCreditsIncrease(selectedAdvancement.credits_increase || 0);
    }
  }, [selectedAdvancement]);

  // Add these console.logs to help debug
  useEffect(() => {
    console.log('Current state:', {
      advancementType,
      selectedCategory,
      availableAdvancements,
      selectedAdvancement,
      skillAcquisitionType
    });
  }, [advancementType, selectedCategory, availableAdvancements, selectedAdvancement, skillAcquisitionType]);

  // Add this useEffect to track state changes
  useEffect(() => {
    console.log('Advancement selection changed:', {
      selectedAdvancement,
      skillAcquisitionType,
      editableXpCost,
      editableCreditsIncrease
    });
  }, [selectedAdvancement, skillAcquisitionType, editableXpCost, editableCreditsIncrease]);

  // First, let's add some debug logging to see what's happening with the skill selection
  useEffect(() => {
    console.log('Available advancements:', availableAdvancements);
  }, [availableAdvancements]);

  // Add this to track the characteristic data
  useEffect(() => {
    if (selectedCategory && advancementType === 'characteristic') {
    }
  }, [selectedCategory, selectedAdvancement, advancementType]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleAdvancementPurchase = async () => {
    if (!selectedAdvancement) return;
    
    try {
      const endpoint = advancementType === 'characteristic'
        ? 'add_fighter_advancement'
        : 'add_fighter_skill';

      const body = advancementType === 'characteristic'
        ? {
            fighter_id: fighterId,
            characteristic_id: selectedAdvancement.id,
            xp_cost: editableXpCost,
            credits_increase: editableCreditsIncrease
          }
        : {
            fighter_id: fighterId,
            skill_id: selectedAdvancement.id,
            xp_cost: editableXpCost,
            credits_increase: editableCreditsIncrease,
            is_advance: true
          };

      console.log('Sending request to:', endpoint);
      console.log('Request body:', body);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to purchase ${selectedAdvancement.stat_change_name}`);
      }

      const data = await response.json();

      toast({
        title: "Success!",
        description: `Successfully added ${selectedAdvancement.stat_change_name}`
      });

      // Use the remaining XP from the API response
      onAdvancementAdded?.(data.remaining_xp, data.credits_increase);

      onClose();
    } catch (error) {
      console.error('Error purchasing advancement:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to purchase advancement",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCharacteristicAdvancement = (advancementDetails: any): AvailableAdvancement => {
    return {
      id: advancementDetails.id,
      level: advancementDetails.times_increased || 0,
      xp_cost: advancementDetails.xp_cost,
      stat_change: 1,
      can_purchase: advancementDetails.can_purchase,
      credits_increase: advancementDetails.credits_increase || 0,
      stat_change_name: advancementDetails.characteristic_name,
      description: advancementDetails.description
    };
  };

  const formatSkillAdvancement = (advancementDetails: any): AvailableAdvancement => {
    return {
      id: advancementDetails.skill_id,
      skill_id: advancementDetails.skill_id,
      xp_cost: advancementDetails.xp_cost || 0,
      stat_change: 1,
      can_purchase: true,
      credits_increase: advancementDetails.credits_increase || 0,
      stat_change_name: advancementDetails.skill_name,
      description: advancementDetails.description
    };
  };

  // Update the useEffect that handles XP cost changes
  const handleXpCostChange = (value: number) => {
    setEditableXpCost(value);
    // Update the advancement with new values
    if (selectedAdvancement) {
      setSelectedAdvancement({
        ...selectedAdvancement,
        xp_cost: value,
        has_enough_xp: currentXp >= value,
        can_purchase: true // Allow purchase if user manually sets XP cost
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <h3 className="text-2xl font-bold text-gray-900">Advancements</h3>
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-600">Current XP</span>
            <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">{currentXp}</span>
            <button
              onClick={onClose}
              className="ml-3 text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-grow">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              Cost and value are automatically calculated based on the type and number of advancements.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Gangers and custom fighters designated as Gangers have access to a restricted selection.
            </p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <select
                className="w-full p-2 border rounded-md"
                value={advancementType}
                onChange={(e) => {
                  setAdvancementType(e.target.value as 'characteristic' | 'skill');
                  setSelectedCategory('');
                  setSelectedAdvancement(null);
                  setAvailableAdvancements([]);
                }}
              >
                <option key="default" value="">Select Advancement Type</option>
                <option key="characteristic" value="characteristic">Characteristic</option>
                <option key="skill" value="skill">Skill</option>
              </select>
            </div>

            {advancementType && !loading && (
              <div className="relative">
                <select
                  className="w-full p-2 border rounded-md"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedAdvancement(null);
                  }}
                >
                  <option key="default" value="">
                    Select {advancementType === "characteristic" ? "a Characteristic" : "a Skill Set"}
                  </option>

                  {advancementType === "characteristic" ? (
                    // If selecting a Characteristic, sort dynamically by characteristicRank and group into categories
                    Object.entries(
                      categories
                        .sort((a, b) => {
                          const rankA = characteristicRank[a.name.toLowerCase()] ?? Infinity;
                          const rankB = characteristicRank[b.name.toLowerCase()] ?? Infinity;
                          return rankA - rankB;
                        })
                        .reduce((groups, category) => {
                          const rank = characteristicRank[category.name.toLowerCase()] ?? Infinity;
                          let groupLabel = "Misc."; // Default category for unlisted characteristics

                          if (rank <= 8) groupLabel = "Main Characteristics";
                          else if (rank <= 12) groupLabel = "Psychology Characteristics";

                          if (!groups[groupLabel]) groups[groupLabel] = [];
                          groups[groupLabel].push(category);
                          return groups;
                        }, {} as Record<string, typeof categories>)
                    ).map(([groupLabel, categoryList]) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {categoryList.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    // If selecting a Skill Set, sort and group dynamically
                    Object.entries(
                      categories
                        .sort((a, b) => {
                          const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
                          const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
                          return rankA - rankB;
                        })
                        .reduce((groups, category) => {
                          const rank = skillSetRank[category.name.toLowerCase()] ?? Infinity;
                          let groupLabel = "Misc."; // Default category for unlisted skills

                          if (rank <= 19) groupLabel = "Universal Skills";
                          else if (rank <= 39) groupLabel = "Gang-specific Skills";
                          else if (rank <= 59) groupLabel = "Wyrd Powers";
                          else if (rank <= 69) groupLabel = "Cult Wyrd Powers";
                          else if (rank <= 79) groupLabel = "Psychoteric Whispers";
                          else if (rank <= 89) groupLabel = "Legendary Names";

                          if (!groups[groupLabel]) groups[groupLabel] = [];
                          groups[groupLabel].push(category);
                          return groups;
                        }, {} as Record<string, typeof categories>)
                    ).map(([groupLabel, categoryList]) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {categoryList.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
              </div>
            )}

            {advancementType === 'skill' && selectedCategory && availableAdvancements.length > 0 && (
              <>
                <div className="relative">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={selectedAdvancement?.id || ''}
                    onChange={(e) => {
                      const selected = availableAdvancements.find(adv => adv.id === e.target.value);
                      
                      if (selected) {
                        setSelectedAdvancement({
                          ...selected,
                          xp_cost: 0,
                          credits_increase: 0,
                          has_enough_xp: true
                        });
                        setSkillAcquisitionType('');
                        setEditableXpCost(0);
                        setEditableCreditsIncrease(0);
                      }
                    }}
                  >
                    <option key="default" value="">Select Skill</option>
                    {availableAdvancements.map((advancement) => {
                      const uniqueKey = `${advancement.id}_${advancement.skill_type_id}`;
                      return (
                        <option key={uniqueKey} value={advancement.id}>
                          {advancement.stat_change_name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedAdvancement && (
                  <div className="relative">
                    <select
                      className="w-full p-2 border rounded-md"
                      value={skillAcquisitionType}
                      onChange={(e) => {
                        const acquisitionType = e.target.value;
                        setSkillAcquisitionType(acquisitionType);
                        
                        if (selectedAdvancement?.available_acquisition_types) {
                          const selectedType = selectedAdvancement.available_acquisition_types.find(
                            type => type.type_id === acquisitionType
                          );

                          if (selectedType) {
                            setSelectedAdvancement({
                              ...selectedAdvancement,
                              xp_cost: selectedType.xp_cost,
                              credits_increase: selectedType.credit_cost,
                              has_enough_xp: currentXp >= selectedType.xp_cost
                            });
                            setEditableXpCost(selectedType.xp_cost);
                            setEditableCreditsIncrease(selectedType.credit_cost);
                          }
                        }
                      }}
                    >
                      <option key="default" value="">Select Acquisition Type</option>
                      {selectedAdvancement?.available_acquisition_types
                        ?.sort((a, b) => a.xp_cost - b.xp_cost)
                        .map(type => {
                          const uniqueKey = `${selectedAdvancement.id}_${type.type_id}`;
                          return (
                            <option key={uniqueKey} value={type.type_id}>
                              {type.name} ({type.xp_cost} XP, {type.credit_cost} credits)
                            </option>
                          );
                        })}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  XP Cost
                </label>
                <input
                  type="number"
                  value={editableXpCost}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    handleXpCostChange(value);
                  }}
                  className="w-full p-2 border rounded-md"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fighter Value
                </label>
                <input
                  type="number"
                  value={editableCreditsIncrease}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setEditableCreditsIncrease(value);
                    // Update the advancement with new value
                    if (selectedAdvancement) {
                      setSelectedAdvancement({
                        ...selectedAdvancement,
                        credits_increase: value
                      });
                    }
                  }}
                  className="w-full p-2 border rounded-md"
                  min="0"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <Button
              onClick={handleAdvancementPurchase}
              className="w-full bg-black hover:bg-gray-800 text-white"
              disabled={
                !selectedAdvancement || 
                (advancementType === 'skill' && !skillAcquisitionType) ||
                !selectedAdvancement.has_enough_xp ||
                editableXpCost <= 0 // Add validation for positive XP cost
              }
            >
              Buy Advancement
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 