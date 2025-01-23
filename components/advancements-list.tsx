'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { AdvancementModal } from "@/components/ui/advancement-modal";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/modal";

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
  skills?: {
    [key: string]: {
      id: string;
      xp_cost: number;
      credits_increase: number;
      acquired_at: string;
      is_advance: boolean;
    }
  };
}

interface AdvancementsListProps {
  fighterXp: number;
  fighterChanges?: FighterChanges;
  fighterId: string;
  onAdvancementDeleted?: () => void;
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

export function AdvancementsList({ 
  fighterXp,
  fighterChanges = { advancement: [], characteristics: [], skills: {} },
  fighterId,
  onAdvancementDeleted
}: AdvancementsListProps) {
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string; type: string } | null>(null);
  const { toast } = useToast();

  const transformAdvancementsData = (fighterData: FighterChanges) => {
    const characteristics: TransformedAdvancement[] = [];
    const skills: TransformedAdvancement[] = [];
    
    // Transform characteristics
    if (fighterData.characteristics && Array.isArray(fighterData.characteristics)) {
      console.log('Raw characteristics data:', fighterData.characteristics);
      
      // Process each characteristic directly from the array
      fighterData.characteristics.forEach((data) => {
        console.log(`Processing characteristic:`, data);
        characteristics.push({
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

      console.log('Final characteristics array:', characteristics);
    }

    // Transform skills - now with is_advance filter
    if (fighterData.skills) {
      Object.entries(fighterData.skills)
        .filter(([_, data]) => data.is_advance) // Only include skills where is_advance is true
        .forEach(([name, data]) => {
          skills.push({
            id: data.id,
            stat_change_name: name,
            xp_spent: data.xp_cost,
            changes: {
              credits: data.credits_increase
            },
            acquired_at: data.acquired_at,
            type: 'skill'
          });
        });
    }

    // Sort each array by acquired_at date
    const sortByDate = (a: TransformedAdvancement, b: TransformedAdvancement) => {
      return new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime();
    };

    return {
      characteristics: characteristics.sort(sortByDate),
      skills: skills.sort(sortByDate)
    };
  };

  const { characteristics, skills } = transformAdvancementsData(fighterChanges);

  const handleDeleteAdvancement = async (advancementId: string, type: string) => {
    console.log(`Attempting to delete fighter ${type}:`, advancementId);
    setIsDeleting(advancementId);

    try {
      const endpoint = type === 'characteristic' 
        ? 'fighter_characteristics'
        : 'fighter_skills';

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}?id=eq.${advancementId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete response error:', errorText);
        throw new Error(`Failed to delete ${type}`);
      }

      console.log(`Successfully deleted fighter ${type}:`, advancementId);
      toast({
        description: `${type} successfully deleted`,
        variant: "default"
      });

      if (onAdvancementDeleted) {
        onAdvancementDeleted();
      }
    } catch (error) {
      console.error(`Error deleting fighter ${type}:`, error);
      toast({
        description: error instanceof Error ? error.message : `Failed to delete ${type}`,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(null);
      setDeleteModalData(null);
    }
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
            {([...characteristics, ...skills].length > 0) && (
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
              {[...characteristics, ...skills].length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-1 py-1 text-center text-gray-500">
                    No advancements yet
                  </td>
                </tr>
              ) : (
                [...characteristics, ...skills]
                  .sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime())
                  .map((advancement) => (
                    <tr key={advancement.id} className="border-t">
                      <td className="px-1 py-1">
                        {advancement.type === 'characteristic' 
                          ? `Characteristic - ${advancement.stat_change_name}`
                          : `Skill - ${advancement.stat_change_name}`
                        }
                      </td>
                      <td className="px-1 py-1 text-right">{Math.abs(advancement.xp_spent)}</td>
                      <td className="px-1 py-1 text-right">{Math.abs(advancement.changes.credits)}</td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteModalData({
                              id: advancement.id,
                              name: advancement.stat_change_name,
                              type: advancement.type
                            })}
                            disabled={isDeleting === advancement.id}
                            className="text-xs px-1.5 h-6"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
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
          onAdvancementAdded={onAdvancementDeleted}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Confirm Deletion"
          content={`Are you sure you want to delete the ${deleteModalData.name} advancement? This action cannot be undone.`}
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteAdvancement(deleteModalData.id, deleteModalData.type)}
        />
      )}
    </div>
  );
}
