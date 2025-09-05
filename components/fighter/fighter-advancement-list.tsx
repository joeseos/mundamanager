'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import { Skill, FighterSkills } from '@/types/fighter';
import { FighterEffect as FighterEffectType } from '@/types/fighter';
import { createClient } from '@/utils/supabase/client';
import { skillSetRank } from "@/utils/skillSetRank";
import { characteristicRank } from "@/utils/characteristicRank";
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { 
  addCharacteristicAdvancement, 
  addSkillAdvancement, 
  deleteAdvancement 
} from '@/app/lib/server-functions/fighter-advancements';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';
import { LuUndo2 } from 'react-icons/lu';

// AdvancementModal Interfaces
interface AdvancementModalProps {
  fighterId: string;
  gangId: string;
  currentXp: number;
  onClose: () => void;
  onAdvancementAdded?: (remainingXp: number, creditsIncrease: number) => void;
}

interface StatChangeCategory {
  id: string;
  effect_name: string;
  type: 'characteristic';
}

interface SkillType {
  id: string;
  name: string;
  type: 'skill';
  created_at: string;
  updated_at: string | null;
}

interface AvailableAdvancement {
  id: string;
  xp_cost: number;
  base_xp_cost?: number;
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
  characteristic_code?: string;
  modifier_value?: number;
}

interface SkillResponse {
  skills: {
    skill_id: string;
    skill_name: string;
    skill_type_id: string;
    available_acquisition_types: AcquisitionType[];
    available: boolean;
  }[];
  fighter_id: string;
  fighter_class: string;
}

interface SkillAcquisitionType {
  id: string;
  name: string;
  xpCost: number;
  creditCost: number;
}

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
  available: boolean;
}

// AdvancementsList Interfaces
interface StatChange {
  id: string;
  applied_at: string;
  stat_change_type_id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    [key: string]: number;
  };
}

interface FighterChanges {
  advancement?: StatChange[];
  characteristics?: Array<{
    id: string;
    created_at: string;
    updated_at: string;
    code: string;
    times_increased: number;
    characteristic_name: string;
    credits_increase: number;
    xp_cost: number;
    characteristic_value: number;
    acquired_at: string;
  }>;
  skills?: Skill[];
}

interface AdvancementTypeSpecificData {
  xp_cost?: number;
  times_increased?: number;
  credits_increase?: number;
  skill_id?: string;
}

interface AdvancementsListProps {
  fighterXp: number;
  fighterChanges?: FighterChanges;
  fighterId: string;
  gangId: string;
  onAdvancementDeleted?: () => void;
  advancements: Array<FighterEffectType>;
  skills: FighterSkills;
  onDeleteAdvancement: (advancementId: string) => Promise<void>;
  onAdvancementAdded: () => void;
  userPermissions: UserPermissions;
}

interface TransformedAdvancement {
  id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    credits: number;
    [key: string]: number;
  };
  acquired_at: string;
  type: 'characteristic' | 'skill';
}

// Type guard function
function isStatChangeCategory(category: StatChangeCategory | SkillType): category is StatChangeCategory {
  return category.type === 'characteristic';
}

// Add SkillAccess interface
interface SkillAccess {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed';
  skill_type_name: string;
}

// AdvancementModal Component
export function AdvancementModal({ fighterId, gangId, currentXp, onClose, onAdvancementAdded }: AdvancementModalProps) {
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
  const [skillAccess, setSkillAccess] = useState<SkillAccess[]>([]);

  // TanStack Query mutations
  const queryClient = useQueryClient();

  const addCharacteristicMutation = useMutation({
    mutationFn: addCharacteristicAdvancement,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });

      // Snapshot previous values
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));

      // Optimistically update fighter XP
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => ({
        ...old,
        xp: old.xp - variables.xp_cost
      }));

      // Optimistically add characteristic to effects using data from selectedAdvancement
      const selectedCategory = categories.find(cat => cat.id === variables.fighter_effect_type_id);
      const characteristicName = (selectedCategory as StatChangeCategory)?.effect_name || selectedAdvancement?.stat_change_name || 'Unknown Characteristic';
      const statName = selectedAdvancement?.characteristic_code || characteristicName.toLowerCase().replace(/ /g, '_');
      
      // Use the modifier_value from selectedAdvancement (now included in the SQL function response)
      const modifierValue = selectedAdvancement?.modifier_value || 1;

      queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
        if (!old) return old;
        
        const tempId = `temp-${Date.now()}`;
        const newCharacteristic = {
          id: tempId,
          effect_name: characteristicName,
          type_specific_data: {
            xp_cost: variables.xp_cost,
            credits_increase: variables.credits_increase,
            times_increased: 1
          },
          // Add the fighter_effect_modifiers array with correct modifier value from SQL response
          fighter_effect_modifiers: [{
            id: `temp-mod-${Date.now()}`,
            fighter_effect_id: tempId,
            stat_name: statName,
            numeric_value: modifierValue // Use the modifier value from get_fighter_available_advancements
          }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        return {
          ...old,
          advancements: [...(old.advancements || []), newCharacteristic]
        };
      });

      return { previousFighter, previousEffects };
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate gang rating since advancements affect gang rating
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });

        toast({
          title: "Success!",
          description: `Successfully added ${result.data.advancement?.name}`
        });

        // Use remaining XP from server response to update parent
        onAdvancementAdded?.(result.data.remaining_xp, result.data.advancement?.credits_increase || 0);
      }
    },
  });

  const addSkillMutation = useMutation({
    mutationFn: addSkillAdvancement,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });

      // Snapshot previous values
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));

      // Optimistically update fighter XP
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => ({
        ...old,
        xp: old.xp - variables.xp_cost,
        ...(!(variables.is_advance ?? true) && old.free_skill && { free_skill: false })
      }));

      // Find skill name from selectedAdvancement
      const skillName = selectedAdvancement?.stat_change_name || 'Unknown Skill';

      // Optimistically add skill
      queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (old: any) => {
        if (!old) return {};
        
        return {
          ...old,
          [skillName]: {
            id: `temp-${Date.now()}`,
            name: skillName,
            xp_cost: variables.xp_cost,
            credits_increase: variables.credits_increase,
            is_advance: variables.is_advance ?? true,
            acquired_at: new Date().toISOString()
          }
        };
      });

      return { previousFighter, previousSkills };
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate gang rating since advancements affect gang rating
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });

        toast({
          title: "Success!",
          description: `Successfully added ${result.data.advancement?.name}`
        });

        // Use remaining XP from server response to update parent
        onAdvancementAdded?.(result.data.remaining_xp, result.data.advancement?.credits_increase || 0);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdvancement,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });

      // Snapshot previous values for rollback
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));

      // Optimistically remove the advancement and refund XP
      if (variables.advancement_type === 'skill') {
        // Remove skill from skills cache and refund XP
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (old: any) => {
          if (!old) return old;
          const newSkills = { ...old };
          // Find and remove the skill by ID
          Object.keys(newSkills).forEach(skillName => {
            if (newSkills[skillName]?.id === variables.advancement_id) {
              // Optimistically refund XP 
              const xpCost = newSkills[skillName].xp_cost || 0;
              queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => ({
                ...oldFighter,
                xp: oldFighter.xp + xpCost
              }));
              delete newSkills[skillName];
            }
          });
          return newSkills;
        });
      } else {
        // Remove characteristic from effects and refund XP
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          const advancement = (old.advancements || []).find((adv: any) => adv.id === variables.advancement_id);
          if (advancement) {
            // Optimistically refund XP
            const xpCost = advancement.type_specific_data?.xp_cost || 0;
            queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => ({
              ...oldFighter,
              xp: oldFighter.xp + xpCost
            }));
          }
          
          return {
            ...old,
            advancements: (old.advancements || []).filter(
              (advancement: any) => advancement.id !== variables.advancement_id
            )
          };
        });
      }

      return { previousFighter, previousEffects, previousSkills };
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
    },
  });

  // Fetch stat change categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!advancementType) return;
      
      setLoading(true);
      try {
        // Get the current user's session
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const endpoint = advancementType === 'characteristic' 
          ? 'fighter_effect_types?fighter_effect_category_id=eq.789b2065-c26d-453b-a4d5-81c04c5d4419'
          : 'skill_types';

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session?.access_token || ''}`,
              'Content-Type': 'application/json',
            }
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
        console.log('Fetching advancements for type:', advancementType, 'category:', selectedCategory);

        if (advancementType === 'characteristic') {
          // Only fetch characteristics if a category is selected
          if (!selectedCategory) return;

          console.log('Fetching characteristics for fighter ID:', fighterId);
          
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
          console.log('Available characteristics data:', data.characteristics);

          // Find the category name from the selected category
          const selectedCategoryObj = categories.find(cat => cat.id === selectedCategory);
          if (!selectedCategoryObj || !isStatChangeCategory(selectedCategoryObj)) {
            console.error('Selected category not found or wrong type:', selectedCategory);
            return;
          }

          console.log('Selected category:', selectedCategoryObj);
          console.log('Looking for advancement details with key:', selectedCategoryObj.effect_name);
          console.log('Available characteristics:', data.characteristics);

          // Get the advancement details for the selected characteristic
          const advancementDetails = data.characteristics[selectedCategoryObj.effect_name];
          if (!advancementDetails) {
            console.error('No advancement details found for category:', selectedCategoryObj.effect_name);
            return;
          }

          // Format the characteristic advancement
          const formattedAdvancement: AvailableAdvancement = {
            id: advancementDetails.id,
            level: advancementDetails.times_increased || 0,
            xp_cost: advancementDetails.xp_cost,
            base_xp_cost: advancementDetails.base_xp_cost,
            stat_change: 1,
            can_purchase: advancementDetails.can_purchase,
            is_available: advancementDetails.is_available,
            has_enough_xp: advancementDetails.has_enough_xp,
            credits_increase: advancementDetails.credits_increase,
            stat_change_name: selectedCategoryObj.effect_name,
            characteristic_code: advancementDetails.characteristic_code,
            modifier_value: advancementDetails.modifier_value,
            available_acquisition_types: []
          };

          console.log('Formatted characteristic advancement:', formattedAdvancement);
          setAvailableAdvancements([formattedAdvancement]);
          setSelectedAdvancement(formattedAdvancement);
          setEditableXpCost(formattedAdvancement.xp_cost);
          setEditableCreditsIncrease(formattedAdvancement.credits_increase || 0);

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
            can_purchase: skill.available,
            stat_change_name: skill.skill_name,
            credits_increase: 0,
            has_enough_xp: true,
            available_acquisition_types: skill.available_acquisition_types,
            skill_type_id: skill.skill_type_id,
            is_available: skill.available
          }));

          console.log('Formatted skill advancements:', formattedAdvancements);
          setAvailableAdvancements(formattedAdvancements);
          // Remove auto-selection of first advancement - let user choose
          // if (formattedAdvancements.length > 0) {
          //   const initialAdvancement = formattedAdvancements[0];
          //   console.log('Setting initial skill advancement:', initialAdvancement);
          //   setSelectedAdvancement(initialAdvancement);
          //   setEditableXpCost(initialAdvancement.xp_cost);
          //   setEditableCreditsIncrease(initialAdvancement.credits_increase || 0);
          // }
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

  // Fetch skill access for fighter when advancementType is 'skill'
  useEffect(() => {
    if (advancementType !== 'skill') return;
    const fetchSkillAccess = async () => {
      try {
        const response = await fetch(`/api/fighters/skill-access?fighterId=${fighterId}`);
        if (response.ok) {
          const data = await response.json();
          setSkillAccess(data.skill_access || []);
        } else {
          setSkillAccess([]);
        }
      } catch {
        setSkillAccess([]);
      }
    };
    fetchSkillAccess();
  }, [advancementType, fighterId]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleAdvancementPurchase = () => {
    if (!selectedAdvancement) return;

    // Close modal immediately - optimistic updates handle the UI changes
    setIsSubmitting(false);
    onClose();

    if (advancementType === 'characteristic') {
      addCharacteristicMutation.mutate({
        fighter_id: fighterId,
        fighter_effect_type_id: selectedAdvancement.id,
        xp_cost: editableXpCost,
        credits_increase: editableCreditsIncrease
      }, {
        onError: (error) => {
          console.error('Error purchasing characteristic advancement:', error);
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to purchase advancement",
            variant: "destructive"
          });
        }
      });
    } else {
      addSkillMutation.mutate({
        fighter_id: fighterId,
        skill_id: selectedAdvancement.id,
        xp_cost: editableXpCost,
        credits_increase: editableCreditsIncrease,
        is_advance: true
      }, {
        onError: (error) => {
          console.error('Error purchasing skill advancement:', error);
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to purchase advancement",
            variant: "destructive"
          });
        }
      });
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

  // Render the AdvancementModal component
  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <h3 className="text-xl md:text-2xl font-bold text-gray-900">Advancements</h3>
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

        <div className="p-2 overflow-y-auto flex-grow">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              XP cost and rating increase are automatically calculated based on the type and number of advancements.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Gangers and Exotic Beasts have access to a restricted selection.
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
                    setSkillAcquisitionType('');
                    setEditableXpCost(0);
                    setEditableCreditsIncrease(0);
                  }}
                >
                  <option key="default" value="">
                    Select {advancementType === "characteristic" ? "a Characteristic" : "a Skill Set"}
                  </option>

                  {advancementType === "characteristic" ? (
                    // If selecting a Characteristic, sort dynamically by characteristicRank and group into categories
                    Object.entries(
                      categories
                        .filter(isStatChangeCategory)  // Filter to only StatChangeCategory types
                        .sort((a, b) => {
                          const rankA = characteristicRank[a.effect_name.toLowerCase()] ?? Infinity;
                          const rankB = characteristicRank[b.effect_name.toLowerCase()] ?? Infinity;
                          return rankA - rankB;
                        })
                        .reduce((groups, category) => {
                          const rank = characteristicRank[category.effect_name.toLowerCase()] ?? Infinity;
                          let groupLabel = "Misc."; // Default category for unlisted characteristics

                          if (rank <= 8) groupLabel = "Main Characteristics";
                          else if (rank <= 12) groupLabel = "Psychology Characteristics";

                          if (!groups[groupLabel]) groups[groupLabel] = [];
                          groups[groupLabel].push(category);
                          return groups;
                        }, {} as Record<string, StatChangeCategory[]>)
                    ).map(([groupLabel, categoryList]) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {categoryList.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.effect_name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    // Skill set rendering with access display
                    (() => {
                      // Map skill access by skill type ID
                      const skillAccessMap = new Map<string, SkillAccess>();
                      skillAccess.forEach(access => {
                        skillAccessMap.set(access.skill_type_id, access);
                      });
                      // Group categories by rank label
                      const groupByLabel: Record<string, SkillType[]> = {};
                      categories
                        .filter((cat): cat is SkillType => cat.type === 'skill')
                        .forEach(category => {
                          const rank = skillSetRank[category.name.toLowerCase()] ?? Infinity;
                          let groupLabel = 'Misc.';
                          if (rank <= 19) groupLabel = 'Universal Skills';
                          else if (rank <= 39) groupLabel = 'Gang-specific Skills';
                          else if (rank <= 59) groupLabel = 'Wyrd Powers';
                          else if (rank <= 69) groupLabel = 'Cult Wyrd Powers';
                          else if (rank <= 79) groupLabel = 'Psychoteric Whispers';
                          else if (rank <= 89) groupLabel = 'Legendary Names';
                          else if (rank <= 99) groupLabel = 'Ironhead Squat Mining Clans';
                          if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
                          groupByLabel[groupLabel].push(category);
                        });
                      // Sort group labels by their first rank
                      const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
                        const aRank = Math.min(...groupByLabel[a].map(cat => skillSetRank[cat.name.toLowerCase()] ?? Infinity));
                        const bRank = Math.min(...groupByLabel[b].map(cat => skillSetRank[cat.name.toLowerCase()] ?? Infinity));
                        return aRank - bRank;
                      });
                      // Render optgroups
                      return sortedGroupLabels.map(groupLabel => {
                        const groupCategories = groupByLabel[groupLabel].sort((a, b) => {
                          const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
                          const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
                          return rankA - rankB;
                        });
                        return (
                      <optgroup key={groupLabel} label={groupLabel}>
                            {groupCategories.map(category => {
                              const access = skillAccessMap.get(category.id);
                              let accessLabel = '';
                              let style: React.CSSProperties = { color: '#9CA3AF', fontStyle: 'italic' };
                              if (access) {
                                if (access.access_level === 'primary') {
                                  accessLabel = '(Primary)';
                                  style = {};
                                } else if (access.access_level === 'secondary') {
                                  accessLabel = '(Secondary)';
                                  style = {};
                                } else if (access.access_level === 'allowed') {
                                  accessLabel = '(-)';
                                  style = {};
                                }
                              }
                              return (
                                <option
                                  key={category.id}
                                  value={category.id}
                                  style={style}
                                >
                                  {category.name} {accessLabel}
                          </option>
                              );
                            })}
                      </optgroup>
                        );
                      });
                    })()
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
                      const isAvailable = advancement.is_available !== false; // Default to true if undefined
                      return (
                        <option 
                          key={uniqueKey} 
                          value={advancement.id}
                          disabled={!isAvailable}
                          style={{ 
                            color: !isAvailable ? '#9CA3AF' : 'inherit',
                            fontStyle: !isAvailable ? 'italic' : 'normal'
                          }}
                        >
                          {advancement.stat_change_name}{!isAvailable ? ' (already owned)' : ''}
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
                            console.log('Selected acquisition type:', selectedType);
                            setSelectedAdvancement({
                              ...selectedAdvancement,
                              xp_cost: selectedType.xp_cost,
                              credits_increase: selectedType.credit_cost,
                              has_enough_xp: currentXp >= selectedType.xp_cost
                            });
                            setEditableXpCost(selectedType.xp_cost);
                            setEditableCreditsIncrease(selectedType.credit_cost);
                            console.log('Updated XP cost to:', selectedType.xp_cost, 'and credits to:', selectedType.credit_cost);
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
                  Cost Increase in Credits
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
            <div className="border-t pt-2 flex justify-end gap-2">
            <button
                onClick={onClose}
                disabled={isSubmitting}
                className={`px-4 py-2 border rounded hover:bg-gray-100 ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Cancel
              </button>
              <Button
                onClick={handleAdvancementPurchase}
                className={`px-4 py-2 bg-black text-white rounded hover:bg-gray-800 ${
                (isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
                disabled={
                  !selectedAdvancement ||
                  (advancementType === 'skill' && !skillAcquisitionType) ||
                  !selectedAdvancement.has_enough_xp ||
                  editableXpCost < 0 // Changed from <= 0 to < 0 to allow 0 XP cost
                }
              >
                Buy Advancement
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// AdvancementsList Component
export function AdvancementsList({ 
  fighterXp,
  fighterChanges = { advancement: [], characteristics: [], skills: [] },
  fighterId,
  gangId,
  onAdvancementDeleted,
  advancements = [],
  skills = {},
  onDeleteAdvancement,
  onAdvancementAdded,
  userPermissions
}: AdvancementsListProps) {
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string; type: string } | null>(null);
  const { toast } = useToast();

  // TanStack Query mutation for deleting advancements
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deleteAdvancement,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.skills(fighterId) });

      // Snapshot previous values for rollback
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousSkills = queryClient.getQueryData(queryKeys.fighters.skills(fighterId));

      // Optimistically remove the advancement and refund XP
      if (variables.advancement_type === 'skill') {
        // Remove skill from skills cache and refund XP
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), (old: any) => {
          if (!old) return old;
          const newSkills = { ...old };
          // Find and remove the skill by ID
          Object.keys(newSkills).forEach(skillName => {
            if (newSkills[skillName]?.id === variables.advancement_id) {
              // Optimistically refund XP 
              const xpCost = newSkills[skillName].xp_cost || 0;
              queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => ({
                ...oldFighter,
                xp: oldFighter.xp + xpCost
              }));
              delete newSkills[skillName];
            }
          });
          return newSkills;
        });
      } else {
        // Remove characteristic from effects and refund XP
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          const advancement = (old.advancements || []).find((adv: any) => adv.id === variables.advancement_id);
          if (advancement) {
            // Optimistically refund XP
            const xpCost = advancement.type_specific_data?.xp_cost || 0;
            queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (oldFighter: any) => ({
              ...oldFighter,
              xp: oldFighter.xp + xpCost
            }));
          }
          
          return {
            ...old,
            advancements: (old.advancements || []).filter(
              (advancement: any) => advancement.id !== variables.advancement_id
            )
          };
        });
      }

      return { previousFighter, previousEffects, previousSkills };
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate gang rating since deleting advancements affects gang rating
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
        
        // Show success toast
        toast({
          description: `${result.data.advancement?.name || 'Advancement'} removed successfully`,
          variant: "default"
        });

        // Sync the actual XP refund from server (in case our optimistic estimate was wrong)
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => ({
          ...old,
          xp: result.data.remaining_xp,
          ...(result.data.fighter.free_skill !== undefined && { free_skill: result.data.fighter.free_skill })
        }));
      }
    },
    onError: (error, _variables, context) => {
      // Show error toast
      toast({
        description: 'Failed to delete advancement',
        variant: "destructive"
      });

      // Rollback optimistic changes on error
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.fighters.skills(fighterId), context.previousSkills);
      }
    },
  });

  // Memoize the entire data transformation
  const { characteristics, skills: transformedSkills } = useMemo(() => {
    const transformedCharacteristics: TransformedAdvancement[] = [];
    const transformedSkills: TransformedAdvancement[] = [];
    
    // Transform characteristics
    if (fighterChanges.characteristics && Array.isArray(fighterChanges.characteristics)) {
      fighterChanges.characteristics.forEach((data) => {
        transformedCharacteristics.push({
          id: data.id,
          stat_change_name: data.characteristic_name,
          xp_spent: data.xp_cost,
          changes: {
            credits: data.credits_increase,
            [data.code.toLowerCase()]: data.characteristic_value
          },
          acquired_at: data.acquired_at,
          type: 'characteristic'
        });
      });
    }

    // Transform skills
    if (Array.isArray(skills)) {
      skills.forEach((skill) => {
        transformedSkills.push({
          id: skill.id,
          stat_change_name: skill.name,
          xp_spent: skill.xp_cost || 0,
          changes: {
            credits: skill.credits_increase
          },
          acquired_at: skill.acquired_at,
          type: 'skill'
        });
      });
    }

    // Sort each array by acquired_at date
    const sortByDate = (a: TransformedAdvancement, b: TransformedAdvancement) => 
      new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime();

    return {
      characteristics: transformedCharacteristics.sort(sortByDate),
      skills: transformedSkills.sort(sortByDate)
    };
  }, [fighterChanges, skills]); // Only recompute when fighterChanges or skills updates

  // Use Object.entries to safely process the skills object
  const advancementSkills = useMemo(() => {
    return Object.entries(skills)
      .filter(([_, skill]) => skill && (skill as any).is_advance)
      .map(([name, skill]) => {
        const typedSkill = skill as any;
        return {
          id: typedSkill.id,
          effect_name: `Skill: ${name}`,
          created_at: typedSkill.acquired_at,
          type_specific_data: {
            xp_cost: typedSkill.xp_cost || 0,
            credits_increase: typedSkill.credits_increase
          }
        };
      });
  }, [skills]);

  // Combine regular advancements with skill advancements
  const allAdvancements = useMemo(() => {
    return [...advancements, ...advancementSkills];
  }, [advancements, advancementSkills]);

  const handleDeleteAdvancement = (advancementId: string, advancementName: string, advancementType?: string) => {
    // Close modal immediately - optimistic updates handle the UI changes
    setIsDeleting(null);
    setDeleteModalData(null);
    
    // Determine if this is a skill or characteristic based on the advancement type or name
    const isSkill = advancementType === 'skill' || advancementName.startsWith('Skill: ');
    
    deleteMutation.mutate({
      fighter_id: fighterId,
      advancement_id: advancementId,
      advancement_type: isSkill ? 'skill' : 'characteristic'
    }, {
      onSuccess: (result) => {
        if (result.success) {
          // Invalidate gang rating since deleting advancements affects gang rating
          queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });

          toast({
            description: `${advancementName} removed successfully`,
            variant: "default"
          });
          
          // Call the callback to notify parent component
          onDeleteAdvancement(advancementId);
        }
      },
      onError: (error) => {
        console.error('Error deleting advancement:', error);
        toast({
          description: 'Failed to delete advancement',
          variant: "destructive"
        });
      }
    });
  };

  const handleAdvancementAdded = (remainingXp: number, creditsIncrease: number) => {
    // Call the parent component's callback
    onAdvancementAdded();
  };

  // Transform advancements for the List component
  const transformedAdvancements = useMemo(() => {
    return allAdvancements
      .sort((a, b) => {
        const dateA = a.created_at || ''; 
        const dateB = b.created_at || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .map((advancement) => {
        const specificData = typeof advancement.type_specific_data === 'string'
          ? JSON.parse(advancement.type_specific_data || '{}')
          : (advancement.type_specific_data || {});
          
        // Determine if this is a skill or characteristic advancement
        const isSkill = advancement.effect_name.startsWith('Skill: ');
          
        return {
          id: advancement.id || `temp-${Math.random()}`,
          name: advancement.effect_name.startsWith('Skill') ? advancement.effect_name : 
                advancement.effect_name.startsWith('Characteristic') ? advancement.effect_name : 
                `Characteristic: ${advancement.effect_name}`,
          xp_cost: specificData.xp_cost || 0,
          credits_increase: specificData.credits_increase || 0,
          advancement_id: advancement.id,
          advancement_type: isSkill ? 'skill' : 'characteristic'
        };
      });
  }, [allAdvancements]);

  return (
    <>
      <List
        title="Advancements"
        items={transformedAdvancements}
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '50%'
          },
          {
            key: 'xp_cost',
            label: 'XP',
            align: 'right',
            width: '25%'
          },
          {
            key: 'credits_increase',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            icon: <LuUndo2 className="h-4 w-4" />,
            title: "Undo",
            variant: 'destructive',
            onClick: (item) => item.advancement_id ? setDeleteModalData({
              id: item.advancement_id,
              name: item.name,
              type: item.advancement_type
            }) : null,
            disabled: (item) => isDeleting === item.advancement_id || !item.advancement_id || !userPermissions.canEdit
          }
        ]}
        onAdd={() => setIsAdvancementModalOpen(true)}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No advancements yet."
      />

      {/* Modals */}
      {isAdvancementModalOpen && (
        <AdvancementModal
          fighterId={fighterId}
          gangId={gangId}
          currentXp={fighterXp}
          onClose={() => setIsAdvancementModalOpen(false)}
          onAdvancementAdded={handleAdvancementAdded}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Undo Advancement"
          content={
            <div>
              <p>Are you sure you want to undo <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p>XP spent will be refunded and the fighter's value will be adjusted accordingly.</p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteAdvancement(deleteModalData.id, deleteModalData.name, deleteModalData.type)}
        />
      )}
    </>
  );
} 