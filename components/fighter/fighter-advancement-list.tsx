'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/modal";
import { Skill, FighterEffect, FighterSkills } from '@/types/fighter';
import { FighterEffect as FighterEffectType } from '@/types/fighter';
import { createClient } from '@/utils/supabase/client';
import { skillSetRank } from "@/utils/skillSetRank";
import { characteristicRank } from "@/utils/characteristicRank";

// AdvancementModal Interfaces
interface AdvancementModalProps {
  fighterId: string;
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
}

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
  onAdvancementDeleted?: () => void;
  advancements: Array<FighterEffectType>;
  skills: FighterSkills;
  onDeleteAdvancement: (advancementId: string) => Promise<void>;
  onAdvancementAdded: () => void;
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

// AdvancementModal Component
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
          ? 'fighter_effect_types?fighter_effect_category_id=eq.789b2065-c26d-453b-a4d5-81c04c5d4419'
          : 'skill_types';

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
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

  // Additional AdvancementModal logic here...
  const handleAdvancementPurchase = async () => {
    if (!selectedAdvancement) return;
    
    setIsSubmitting(true);
    try {
      // Logic for purchasing advancement
      // This would need to be implemented based on your application's requirements

      // Example implementation:
      // const response = await fetch('your-api-endpoint', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     fighterId,
      //     advancementId: selectedAdvancement.id,
      //     xpCost: editableXpCost,
      //     creditsIncrease: editableCreditsIncrease
      //   })
      // });
      
      // if (!response.ok) throw new Error('Failed to purchase advancement');
      
      // Call onAdvancementAdded callback
      if (onAdvancementAdded) {
        onAdvancementAdded(currentXp - editableXpCost, editableCreditsIncrease);
      }
      
      toast({
        description: "Advancement purchased successfully",
        variant: "default"
      });
      
      onClose();
    } catch (error) {
      console.error('Error purchasing advancement:', error);
      toast({
        description: "Failed to purchase advancement",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render the AdvancementModal component
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Add Advancement</h2>
        
        {/* Selection UI for advancement type, category, etc. */}
        <div className="space-y-4">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Advancement Type</label>
            <select 
              className="w-full p-2 border rounded"
              value={advancementType}
              onChange={(e) => setAdvancementType(e.target.value as 'characteristic' | 'skill' | '')}
            >
              <option value="">Select type</option>
              <option value="characteristic">Characteristic</option>
              <option value="skill">Skill</option>
            </select>
          </div>
          
          {/* Category Selection */}
          {advancementType && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {advancementType === 'characteristic' ? 'Characteristic' : 'Skill Set'}
              </label>
              <select 
                className="w-full p-2 border rounded"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={loading}
              >
                <option value="">Select {advancementType === 'characteristic' ? 'characteristic' : 'skill set'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {isStatChangeCategory(category) ? category.effect_name : category.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Cost inputs */}
          {selectedAdvancement && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">XP Cost</label>
                <input 
                  type="number" 
                  className="w-full p-2 border rounded" 
                  value={editableXpCost}
                  onChange={(e) => setEditableXpCost(Number(e.target.value))}
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Credits Increase</label>
                <input 
                  type="number" 
                  className="w-full p-2 border rounded" 
                  value={editableCreditsIncrease}
                  onChange={(e) => setEditableCreditsIncrease(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
          )}
          
          {error && <div className="text-red-500">{error}</div>}
        </div>
        
        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdvancementPurchase} 
            disabled={!selectedAdvancement || isSubmitting}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isSubmitting ? 'Purchasing...' : 'Purchase'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// AdvancementsList Component
export const AdvancementsList = React.memo(function AdvancementsList({ 
  fighterXp,
  fighterChanges = { advancement: [], characteristics: [], skills: [] },
  fighterId,
  onAdvancementDeleted,
  advancements = [],
  skills = {},
  onDeleteAdvancement,
  onAdvancementAdded,
}: AdvancementsListProps) {
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

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
      .filter(([_, skill]) => skill && skill.is_advance)
      .map(([name, skill]) => ({
        id: skill.id,
        effect_name: `Skill - ${name}`,
        created_at: skill.acquired_at,
        type_specific_data: {
          xp_cost: skill.xp_cost || 0,
          credits_increase: skill.credits_increase
        }
      }));
  }, [skills]);

  // Combine regular advancements with skill advancements
  const allAdvancements = useMemo(() => {
    return [...advancements, ...advancementSkills];
  }, [advancements, advancementSkills]);

  const handleDeleteAdvancement = async (advancementId: string, advancementName: string) => {
    try {
      setIsDeleting(advancementId);
      
      // Use the RPC endpoint for deleting effects
      const rpcEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_skill_or_effect`;
      
      // Create a Supabase client and get session directly
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token || '';
      
      const response = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          input_fighter_id: fighterId,
          fighter_effect_id: advancementId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to delete advancement (${response.status})`);
      }

      // Call the callback to update parent component state
      await onDeleteAdvancement(advancementId);
      
      toast({
        description: `${advancementName} removed successfully`,
        variant: "default"
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting advancement:', error);
      toast({
        description: 'Failed to delete advancement',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsDeleting(null);
      setDeleteModalData(null);
    }
  };

  const handleAdvancementAdded = (remainingXp: number, creditsIncrease: number) => {
    // Call the parent component's callback
    onAdvancementAdded();
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Advancements</h2>
        <Button 
          onClick={() => setIsAdvancementModalOpen(true)}
          className="bg-black hover:bg-gray-800 text-white"
        >
          Add
        </Button>
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(allAdvancements.length > 0) && (
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-1 py-1 text-left">Name</th>
                  <th className="px-1 py-1 text-right">XP</th>
                  <th className="px-1 py-1 text-right">Cost</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {allAdvancements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-gray-500 italic text-center">
                    No advancements yet.
                  </td>
                </tr>
              ) : (
                allAdvancements
                  .sort((a, b) => {
                    // Make sure both objects have created_at before comparing them
                    const dateA = a.created_at || ''; 
                    const dateB = b.created_at || '';
                    return new Date(dateB).getTime() - new Date(dateA).getTime();
                  })
                  .map((advancement) => {
                    const specificData = typeof advancement.type_specific_data === 'string'
                      ? JSON.parse(advancement.type_specific_data || '{}')
                      : (advancement.type_specific_data || {});
                      
                    return (
                      <tr key={advancement.id || `temp-${Math.random()}`} className="border-t">
                        <td className="px-1 py-1">
                          <span>
                            {advancement.effect_name.startsWith('Skill') ? advancement.effect_name : 
                             advancement.effect_name.startsWith('Characteristic') ? advancement.effect_name : 
                             `Characteristic - ${advancement.effect_name}`}
                          </span>
                        </td>
                        <td className="px-1 py-1 text-right">
                          {specificData.xp_cost || '0'}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {specificData.credits_increase || '0'}
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex justify-end">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => advancement.id ? setDeleteModalData({
                                id: advancement.id,
                                name: advancement.effect_name
                              }) : null}
                              disabled={isDeleting === advancement.id || !advancement.id}
                              className="text-xs px-1.5 h-6"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {isAdvancementModalOpen && (
        <AdvancementModal
          fighterId={fighterId}
          currentXp={fighterXp}
          onClose={() => setIsAdvancementModalOpen(false)}
          onAdvancementAdded={handleAdvancementAdded}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Advancement"
          content={
            <div>
              <p>Are you sure you want to delete "{deleteModalData.name}"?</p>
              <br />
              <p>This action cannot be undone.</p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteAdvancement(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </div>
  );
}); 