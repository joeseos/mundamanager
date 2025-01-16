'use client';

import { createClient } from "@/utils/supabase/client";
import { FighterDetailsCard } from "@/components/fighter-details-card";
import { WeaponList } from "@/components/weapon-list";
import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/ui/item-modal";
import { AdvancementsList } from "@/components/advancements-list";
import { Equipment, WeaponProfile } from '@/types/equipment';
import dynamic from 'next/dynamic';
import { AdvancementModal } from "@/components/ui/advancement-modal";
import { SkillsList } from "@/components/skills-list";
import { InjuriesList } from "@/components/injuries-list";
import { NotesList } from "@/components/notes-list";
import { Input } from "@/components/ui/input";

// Dynamically import heavy components
const WeaponTable = dynamic(() => import('@/components/weapon-table'), {
  loading: () => <p>Loading weapons...</p>,
  ssr: false
});

// Add StatChange interface
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

interface Weapon {
  cost: number;
  weapon_id: string;
  weapon_name: string;
  fighter_weapon_id: string;
  weapon_profiles?: WeaponProfile[];
}

interface Wargear {
  cost: number | null;
  wargear_id: string;
  wargear_name: string;
  fighter_weapon_id: string;
}

interface CharacteristicData {
  id: string;
  current_value: number;
  times_increased: number;
  xp_cost: number;
  cost: number;
  credits_increase: number;
  characteristic_value: number;
  acquired_at: string;
}

interface Injury {
  id: string;
  injury_name: string;
  acquired_at: string;
  code_1?: string;
  characteristic_1?: number;
  code_2?: string;
  characteristic_2?: number;
}

interface Fighter {
  id: string;
  fighter_name: string;
  label?: string;
  fighter_type: {
    fighter_type: string;
    fighter_type_id: string;
    fighter_class?: string;
  };
  gang_type_id: string;
  credits: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  xp: number | null;
  total_xp: number | null;
  fighter_changes?: {
    advancement?: StatChange[];
  };
  weapons: Weapon[];
  wargear: Wargear[];
  gang_id: string;
  advancement_credits: number;
  advancements: {
    characteristics: {
      [key: string]: CharacteristicData;
    };
    skills: {
      [key: string]: {
        id: string;
        credits_increase: number;
        xp_cost: number;
        acquired_at: string;
      };
    };
  };
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  starved: boolean;
  free_skill: boolean;
  characteristics: Array<{
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
  skills: {
    [key: string]: {
      id: string;
      credits_increase: number;
      xp_cost: number;
      acquired_at: string;
    }
  };
  injuries: Array<{
    id: string;
    injury_name: string;
    acquired_at: string;
    code_1?: string;
    characteristic_1?: number;
    code_2?: string;
    characteristic_2?: number;
  }>;
  note?: string;
  kills: number;
  cost_adjustment: number;
  base_credits: number;
}

interface Gang {
  id: string;
  credits: number;
}

interface Advancement {
  id: string;
  advancement_name: string;
  description: string;
  cost: number;
  created_at: string;
}

// First, define our consolidated state interfaces
interface FighterPageState {
  fighter: Fighter | null;
  equipment: Equipment[];
  advancements: Advancement[];
  gang: Gang | null;
  gangFighters: {
    id: string;
    fighter_name: string;
    fighter_type: string;
    xp: number | null;
  }[];
}

interface UIState {
  isLoading: boolean;
  error: string | null;
  modals: {
    delete: boolean;
    addWeapon: boolean;
    addXp: boolean;
    advancement: boolean;
    kill: boolean;
    retire: boolean;
    enslave: boolean;
    starve: boolean;
    editFighter: boolean;
  };
}

interface EditState {
  name: string;
  label: string;
  kills: number;
  costAdjustment: string;
  xpAmount: string;
  xpError: string;
}

const calculateInjuryModifications = (injuries: Array<{
  code_1?: string;
  characteristic_1?: number;
  code_2?: string;
  characteristic_2?: number;
}>) => {
  const modifications: { [key: string]: number } = {
    'M': 0,  // Movement
    'WS': 0, // Weapon Skill
    'BS': 0, // Ballistic Skill
    'S': 0,  // Strength
    'T': 0,  // Toughness
    'W': 0,  // Wounds
    'I': 0,  // Initiative
    'A': 0,  // Attacks
    'Ld': 0, // Leadership
    'Cl': 0, // Cool
    'Wp': 0, // Willpower
    'Int': 0 // Intelligence
  };

  injuries.forEach(injury => {
    if (injury.code_1 && injury.characteristic_1) {
      modifications[injury.code_1] += injury.characteristic_1;
    }
    if (injury.code_2 && injury.characteristic_2) {
      modifications[injury.code_2] += injury.characteristic_2;
    }
  });

  return modifications;
};

const transformFighterData = (fighter: Fighter | null) => {
  if (!fighter) {
    return {
      characteristics: [],
      skills: {},
      advancements: [],
      note: ''
    };
  }

  const transformedSkills = Object.entries(fighter.skills || {}).reduce((acc, [key, value]) => {
    acc[key] = {
      ...value,
      is_advance: true
    };
    return acc;
  }, {} as Record<string, { 
    id: string; 
    xp_cost: number; 
    credits_increase: number; 
    acquired_at: string;
    is_advance: boolean;
  }>);

  return {
    characteristics: fighter.characteristics || [],
    skills: transformedSkills,
    advancements: fighter.advancements || [],
    note: fighter.note || ''
  };
};

export default function FighterPage({ params }: { params: { id: string } }) {
  // Replace multiple state declarations with consolidated state
  const [fighterData, setFighterData] = useState<FighterPageState>({
    fighter: null,
    equipment: [],
    advancements: [],
    gang: null,
    gangFighters: []
  });

  const [uiState, setUiState] = useState<UIState>({
    isLoading: true,
    error: null,
    modals: {
      delete: false,
      addWeapon: false,
      addXp: false,
      advancement: false,
      kill: false,
      retire: false,
      enslave: false,
      starve: false,
      editFighter: false
    }
  });

  const [editState, setEditState] = useState<EditState>({
    name: '',
    label: '',
    kills: 0,
    costAdjustment: '0',
    xpAmount: '',
    xpError: ''
  });

  const router = useRouter();
  const { toast } = useToast();

  // Update the fetchFighterData callback
  const fetchFighterData = useCallback(async () => {
    if (!params.id) {
      console.error('No fighter ID provided');
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_details`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            "input_fighter_id": params.id
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Failed to fetch fighter details');
      }

      const [{ result }] = await response.json();

      // Transform equipment data
      const transformedEquipment = (result.equipment || []).map((item: any) => ({
        fighter_equipment_id: item.fighter_equipment_id,
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name,
        equipment_type: item.equipment_type,
        cost: item.purchase_cost,
        base_cost: item.original_cost,
        weapon_profiles: item.weapon_profiles,
        core_equipment: item.core_equipment
      }));

      // Update state in a single operation
      setFighterData(prev => ({
        ...prev,
        fighter: {
          ...result.fighter,
          base_credits: result.fighter.credits - (result.fighter.cost_adjustment || 0),
          gang_id: result.gang.id,
          gang_type_id: result.gang.gang_type_id,
          characteristics: result.fighter.characteristics || [],
          skills: result.fighter.skills || {}
        },
        equipment: transformedEquipment,
        gang: {
          id: result.gang.id,
          credits: result.gang.credits
        }
      }));

      setEditState(prev => ({
        ...prev,
        costAdjustment: String(result.fighter.cost_adjustment || 0)
      }));

      setUiState(prev => ({
        ...prev,
        isLoading: false,
        error: null
      }));

    } catch (err) {
      console.error('Error fetching fighter details:', err);
      setUiState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load fighter details'
      }));
    }
  }, [params.id]);

  useEffect(() => {
    fetchFighterData();
  }, [fetchFighterData]);

  const handleDeleteFighter = useCallback(async () => {
    if (!fighterData.fighter || !fighterData.gang) return;

    try {
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/delete_fighter_and_equipment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            fighter_id: fighterData.fighter.id,
            operations: [
              {
                path: "fighter_equipment",  // Changed from fighter_weapons
                params: {
                  fighter_id: `eq.${fighterData.fighter.id}`  // Added eq. prefix
                }
              },
              {
                path: "fighters",
                params: {
                  id: `eq.${fighterData.fighter.id}`  // Added eq. prefix
                }
              }
            ]
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete fighter');
      }

      toast({
        description: `${fighterData.fighter.fighter_name} has been successfully deleted.`,
        variant: "default"
      });

      router.push(`/gang/${fighterData.gang.id}`);
    } catch (error) {
      console.error('Error deleting fighter:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          delete: false
        }
      }));
    }
  }, [fighterData.fighter, fighterData.gang, toast, router]);

  const handleFighterCreditsUpdate = useCallback((newCredits: number) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? { ...prev.fighter, credits: newCredits } : null
    }));
  }, []);

  const handleGangCreditsUpdate = useCallback((newCredits: number) => {
    setFighterData(prev => ({
      ...prev,
      gang: prev.gang ? { ...prev.gang, credits: newCredits } : null
    }));
  }, []);

  const handleEquipmentUpdate = useCallback((updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number) => {
    setFighterData(prev => ({
      ...prev,
      equipment: updatedEquipment,
      fighter: prev.fighter ? { ...prev.fighter, credits: newFighterCredits } : null,
      gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null
    }));
  }, []);

  const handleEquipmentBought = useCallback((newFighterCredits: number, newGangCredits: number, boughtEquipment: Equipment) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? { ...prev.fighter, credits: newFighterCredits } : null,
      gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null
    }));
    setFighterData(prev => ({
      ...prev,
      equipment: [...prev.equipment, {
        ...boughtEquipment,
        cost: boughtEquipment.cost
      }]
    }));
  }, []);

  const fetchGangFighters = useCallback(async (gangId: string) => {
    try {
      const response = await fetch(
        `https://iojoritxhpijprgkjfre.supabase.co/rest/v1/fighters?gang_id=eq.${gangId}&select=id,fighter_name,fighter_type,xp`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch fighters');
      const data = await response.json();
      setFighterData(prev => ({
        ...prev,
        gangFighters: data
      }));
    } catch (error) {
      console.error('Error fetching gang fighters:', error);
    }
  }, []);

  useEffect(() => {
    if (fighterData.fighter?.gang_id) {
      fetchGangFighters(fighterData.fighter.gang_id);
    }
  }, [fighterData.fighter?.gang_id, fetchGangFighters]);

  const handleFighterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`/fighter/${e.target.value}`);
  };

  const handleNameUpdate = useCallback((newName: string) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? { ...prev.fighter, fighter_name: newName } : null
    }));
  }, []);

  const handleAddXp = async () => {
    const amount = parseInt(editState.xpAmount);
    
    if (isNaN(amount) || amount <= 0) {
      setEditState(prev => ({
        ...prev,
        xpError: 'Please enter a valid positive number'
      }));
      return false;
    }

    setEditState(prev => ({
      ...prev,
      xpError: ''
    }));
    
    try {
      const response = await fetch(`/api/fighters/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp_to_add: amount,
          operation: 'add'
        }),
      });

      if (!response.ok) throw new Error('Failed to add XP');
      
      const updatedFighter = await response.json();
      
      // Update local state
      setFighterData(prev => ({
        ...prev,
        fighter: prev.fighter ? {
          ...prev.fighter,
          xp: updatedFighter.xp,
          total_xp: updatedFighter.total_xp
        } : null
      }));
      
      toast({
        description: `Successfully added ${amount} XP`,
        variant: "default"
      });
      
      return true;
    } catch (error) {
      console.error('Error adding XP:', error);
      setEditState(prev => ({
        ...prev,
        xpError: 'Failed to add XP. Please try again.'
      }));
      toast({
        description: 'Failed to add XP',
        variant: "destructive"
      });
      return false;
    }
  };

  const handleAdvancementAdded = async (remainingXp: number, creditsIncrease: number) => {
    await fetchFighterData();
  };

  const handleKillFighter = useCallback(async () => {
    if (!fighterData.fighter) return;

    const newKilledState = !fighterData.fighter.killed;

    try {
      const response = await fetch(`/api/fighters/${fighterData.fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          killed: newKilledState
        }),
      });

      if (!response.ok) {
        throw new Error(fighterData.fighter.killed ? 'Failed to resurrect fighter' : 'Failed to kill fighter');
      }

      toast({
        description: fighterData.fighter.killed 
          ? `${fighterData.fighter.fighter_name} has been resurrected.`
          : `${fighterData.fighter.fighter_name} has been killed in action.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter status:', error);
      toast({
        description: fighterData.fighter.killed 
          ? 'Failed to resurrect fighter. Please try again.'
          : 'Failed to kill fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          kill: false
        }
      }));
    }
  }, [fighterData.fighter, toast, fetchFighterData]);

  const handleRetireFighter = useCallback(async () => {
    if (!fighterData.fighter) return;

    const newRetiredState = !fighterData.fighter.retired;

    try {
      const response = await fetch(`/api/fighters/${fighterData.fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retired: newRetiredState
        }),
      });

      if (!response.ok) {
        throw new Error(fighterData.fighter.retired ? 'Failed to unretire fighter' : 'Failed to retire fighter');
      }

      toast({
        description: fighterData.fighter.retired 
          ? `${fighterData.fighter.fighter_name} has come out of retirement.`
          : `${fighterData.fighter.fighter_name} has retired from fighting.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter retirement status:', error);
      toast({
        description: fighterData.fighter.retired 
          ? 'Failed to unretire fighter. Please try again.'
          : 'Failed to retire fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          retire: false
        }
      }));
    }
  }, [fighterData.fighter, toast, fetchFighterData]);

  const handleEnslaveFighter = useCallback(async () => {
    if (!fighterData.fighter) return;

    const newEnslavedState = !fighterData.fighter.enslaved;

    try {
      const response = await fetch(`/api/fighters/${fighterData.fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enslaved: newEnslavedState
        }),
      });

      if (!response.ok) {
        throw new Error(fighterData.fighter.enslaved ? 'Failed to rescue fighter' : 'Failed to sell fighter');
      }

      toast({
        description: fighterData.fighter.enslaved 
          ? `${fighterData.fighter.fighter_name} has been rescued from the Guilders.`
          : `${fighterData.fighter.fighter_name} has been sold to the Guilders.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter enslavement status:', error);
      toast({
        description: fighterData.fighter.enslaved 
          ? 'Failed to rescue fighter. Please try again.'
          : 'Failed to sell fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          enslave: false
        }
      }));
    }
  }, [fighterData.fighter, toast, fetchFighterData]);

  const handleStarveFighter = useCallback(async () => {
    if (!fighterData.fighter) return;

    const newStarvedState = !fighterData.fighter.starved;

    try {
      if (fighterData.fighter.starved) {
        // If currently starved, use the feed_fighter RPC
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/feed_fighter`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              fighter_id: fighterData.fighter.id
            }),
          }
        );

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || 'Failed to feed fighter');
        }

        if (!data.success) {
          throw new Error(data.message || 'Not enough meat to feed fighter');
        }

      } else {
        // If not starved, use the regular PATCH endpoint
        const response = await fetch(`/api/fighters/${fighterData.fighter.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            starved: true
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to starve fighter');
        }
      }

      toast({
        description: fighterData.fighter.starved 
          ? `${fighterData.fighter.fighter_name} has been fed.`
          : `${fighterData.fighter.fighter_name} is starving.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter starvation status:', error);
      toast({
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          starve: false
        }
      }));
    }
  }, [fighterData.fighter, toast, fetchFighterData]);

  const handleDeleteSkill = async (skillId: string) => {
    if (!fighterData.fighter) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_fighter_skill`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            fighter_skill_id: skillId
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete skill');
      }

      toast({
        description: "Skill successfully deleted.",
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error deleting skill:', error);
      toast({
        description: 'Failed to delete skill. Please try again.',
        variant: "destructive"
      });
    }
  };

  const handleDeleteInjury = async (injuryId: string) => {
    if (!fighterData.fighter) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_injuries?id=eq.${injuryId}`,
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
        throw new Error('Failed to delete injury');
      }

      await fetchFighterData();
    } catch (error) {
      console.error('Error deleting injury:', error);
      throw error;
    }
  };

  const handleEditClick = () => {
    setEditState(prev => ({
      ...prev,
      name: fighterData.fighter?.fighter_name || '',
      label: fighterData.fighter?.label || '',
      kills: fighterData.fighter?.kills || 0,
      costAdjustment: String(fighterData.fighter?.cost_adjustment || 0)
    }));
    setUiState(prev => ({
      ...prev,
      modals: {
        ...prev.modals,
        editFighter: true
      }
    }));
  };

  // Update modal handlers
  const handleModalToggle = (modalName: keyof UIState['modals'], value: boolean) => {
    setUiState(prev => ({
      ...prev,
      modals: {
        ...prev.modals,
        [modalName]: value
      }
    }));
  };

  if (uiState.isLoading) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Loading...
        </div>
      </div>
    </main>
  );

  if (uiState.error || !fighterData.fighter || !fighterData.gang) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Error: {uiState.error || 'Data not found'}
        </div>
      </div>
    </main>
  );

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="mb-6">
            <select
              value={params.id}
              onChange={handleFighterChange}
              className="w-full p-2 border rounded"
            >
              {fighterData.gangFighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fighter_name} - {f.fighter_type} {f.xp !== undefined ? `(${f.xp} XP)` : ''}
                </option>
              ))}
            </select>
          </div>
          <FighterDetailsCard 
            id={fighterData.fighter?.id || ''}
            name={fighterData.fighter?.fighter_name || ''}
            type={fighterData.fighter?.fighter_type.fighter_type || ''}
            fighter_class={fighterData.fighter?.fighter_type.fighter_class || ''}
            credits={fighterData.fighter?.credits || 0}
            movement={fighterData.fighter?.movement + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['M'] || 0)}
            weapon_skill={fighterData.fighter?.weapon_skill + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['WS'] || 0)}
            ballistic_skill={fighterData.fighter?.ballistic_skill + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['BS'] || 0)}
            strength={fighterData.fighter?.strength + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['S'] || 0)}
            toughness={fighterData.fighter?.toughness + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['T'] || 0)}
            wounds={fighterData.fighter?.wounds + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['W'] || 0)}
            initiative={fighterData.fighter?.initiative + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['I'] || 0)}
            attacks={fighterData.fighter?.attacks + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['A'] || 0)}
            leadership={fighterData.fighter?.leadership + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['Ld'] || 0)}
            cool={fighterData.fighter?.cool + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['Cl'] || 0)}
            willpower={fighterData.fighter?.willpower + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['Wp'] || 0)}
            intelligence={fighterData.fighter?.intelligence + (calculateInjuryModifications(fighterData.fighter?.injuries || [])['Int'] || 0)}
            xp={fighterData.fighter?.xp}
            total_xp={fighterData.fighter?.total_xp}
            advancements={fighterData.fighter?.advancements}
            onNameUpdate={handleNameUpdate}
            onAddXp={() => handleModalToggle('addXp', true)}
            onEdit={handleEditClick}
            killed={fighterData.fighter?.killed}
            retired={fighterData.fighter?.retired}
            enslaved={fighterData.fighter?.enslaved}
            starved={fighterData.fighter?.starved}
            kills={fighterData.fighter?.kills || 0}
          />
          
          <WeaponList 
            fighterId={params.id} 
            gangId={fighterData.gang?.id || ''}
            gangCredits={fighterData.gang?.credits || 0}
            fighterCredits={fighterData.fighter?.credits || 0}
            onEquipmentUpdate={handleEquipmentUpdate}
            equipment={fighterData.equipment}
            onAddEquipment={() => handleModalToggle('addWeapon', true)}
          />
          
          <SkillsList 
            skills={fighterData.fighter?.skills || {}} 
            onDeleteSkill={handleDeleteSkill}
            fighterId={fighterData.fighter?.id || ''}
            fighterXp={fighterData.fighter?.xp || 0}
            onSkillAdded={fetchFighterData}
            free_skill={fighterData.fighter?.free_skill}
          />
          
          <AdvancementsList
            fighterXp={fighterData.fighter?.xp || 0}
            fighterChanges={transformFighterData(fighterData.fighter)}
            fighterId={fighterData.fighter?.id || ''}
            onAdvancementDeleted={fetchFighterData}
          />
          
          <InjuriesList 
            injuries={fighterData.fighter?.injuries || []}
            onDeleteInjury={handleDeleteInjury}
            fighterId={fighterData.fighter?.id || ''}
            onInjuryAdded={fetchFighterData}
          />
          
          <div className="mt-6">
            {fighterData.fighter && (
              <NotesList 
                fighterId={fighterData.fighter.id} 
                initialNote={fighterData.fighter.note}
              />
            )}
          </div>
          
          {uiState.modals.addWeapon && (
            <>
              {console.log('Fighter data:', {
                gang_type_id: fighterData.fighter?.gang_type_id,
                fighter_type_id: fighterData.fighter?.fighter_type_id,
                fighter: fighterData.fighter
              })}
              <ItemModal
                title="Equipment"
                onClose={() => handleModalToggle('addWeapon', false)}
                gangCredits={fighterData.gang?.credits || 0}
                gangId={fighterData.gang?.id || ''}
                gangTypeId={fighterData.fighter?.gang_type_id || ''}
                fighterId={fighterData.fighter?.id || ''}
                fighterTypeId={fighterData.fighter?.fighter_type?.fighter_type_id || ''}
                fighterCredits={fighterData.fighter?.credits || 0}
                onEquipmentBought={handleEquipmentBought}
              />
            </>
          )}
          
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                className="flex-1 min-w-[200px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => handleModalToggle('kill', true)}
              >
                {fighterData.fighter?.killed ? 'Resurrect Fighter' : 'Kill Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.retired ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => handleModalToggle('retire', true)}
              >
                {fighterData.fighter?.retired ? 'Unretire Fighter' : 'Retire Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.enslaved ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => handleModalToggle('enslave', true)}
              >
                {fighterData.fighter?.enslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
              </Button>
              <Button
                variant={fighterData.fighter?.starved ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => handleModalToggle('starve', true)}
              >
                {fighterData.fighter?.starved ? 'Feed Fighter' : 'Starve Fighter'}
              </Button>
              <Button 
                variant="destructive"
                className="flex-1 min-w-[200px]"
                onClick={() => handleModalToggle('delete', true)}
              >
                Delete Fighter
              </Button>
            </div>
          </div>

          {uiState.modals.delete && (
            <Modal
              title="Confirm Deletion"
              content={`Are you sure you want to delete ${fighterData.fighter?.fighter_name}? This action cannot be undone.`}
              onClose={() => handleModalToggle('delete', false)}
              onConfirm={handleDeleteFighter}
            />
          )}
          
          {uiState.modals.kill && (
            <Modal
              title={fighterData.fighter?.killed ? 'Confirm Resurrection' : 'Confirm Kill'}
              content={
                fighterData.fighter?.killed 
                  ? `Are you sure you want to resurrect ${fighterData.fighter?.fighter_name}?`
                  : `Are you sure ${fighterData.fighter?.fighter_name} was killed in action?`
              }
              onClose={() => handleModalToggle('kill', false)}
              onConfirm={handleKillFighter}
            />
          )}
          
          {uiState.modals.retire && (
            <Modal
              title={fighterData.fighter?.retired ? 'Confirm Unretirement' : 'Confirm Retirement'}
              content={
                fighterData.fighter?.retired 
                  ? `Are you sure you want to bring ${fighterData.fighter?.fighter_name} out of retirement?`
                  : `Are you sure you want to retire ${fighterData.fighter?.fighter_name}?`
              }
              onClose={() => handleModalToggle('retire', false)}
              onConfirm={handleRetireFighter}
            />
          )}
          
          {uiState.modals.addXp && fighterData.fighter && (
            <Modal
              title="Add XP"
              headerContent={
                <div className="flex items-center">
                  <span className="mr-2 text-sm text-gray-600">Current XP</span>
                  <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">
                    {fighterData.fighter.xp ?? 0}
                  </span>
                </div>
              }
              content={
                <div className="space-y-4">
                  <div>
                    <Input
                      type="number"
                      value={editState.xpAmount}
                      onChange={(e) => setEditState(prev => ({
                        ...prev,
                        xpAmount: e.target.value
                      }))}
                      placeholder="Enter XP amount"
                      min="1"
                      className="w-full"
                    />
                    {editState.xpError && <p className="text-red-500 text-sm mt-1">{editState.xpError}</p>}
                  </div>
                </div>
              }
              onClose={() => {
                handleModalToggle('addXp', false);
                setEditState(prev => ({
                  ...prev,
                  xpAmount: ''
                }));
                setEditState(prev => ({
                  ...prev,
                  xpError: ''
                }));
              }}
              onConfirm={handleAddXp}
              confirmText="Add XP"
              confirmDisabled={!editState.xpAmount}
            />
          )}
          
          {uiState.modals.advancement && (
            <AdvancementModal
              fighterId={params.id}
              currentXp={fighterData.fighter?.xp ?? 0}
              onClose={() => handleModalToggle('advancement', false)}
              onAdvancementAdded={handleAdvancementAdded}
            />
          )}
          
          {uiState.modals.enslave && (
            <Modal
              title={fighterData.fighter?.enslaved ? 'Confirm Rescue' : 'Confirm Sale'}
              content={
                fighterData.fighter?.enslaved 
                  ? `Are you sure you want to rescue ${fighterData.fighter?.fighter_name} from the Guilders?`
                  : `Are you sure you want to sell ${fighterData.fighter?.fighter_name} to the Guilders?`
              }
              onClose={() => handleModalToggle('enslave', false)}
              onConfirm={handleEnslaveFighter}
            />
          )}
          
          {uiState.modals.starve && (
            <Modal
              title={fighterData.fighter?.starved ? 'Confirm Feeding' : 'Confirm Starvation'}
              content={
                fighterData.fighter?.starved 
                  ? `Are you sure you want to feed ${fighterData.fighter?.fighter_name}?`
                  : `Are you sure ${fighterData.fighter?.fighter_name} is starving?`
              }
              onClose={() => handleModalToggle('starve', false)}
              onConfirm={handleStarveFighter}
            />
          )}
          
          {uiState.modals.editFighter && (
            <Modal
              title="Edit Fighter"
              content={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Fighter name</p>
                    <Input
                      type="text"
                      value={editState.name}
                      onChange={(e) => setEditState(prev => ({
                        ...prev,
                        name: e.target.value
                      }))}
                      className="w-full"
                      placeholder="Fighter name"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Label (max 5 characters)</p>
                    <Input
                      type="text"
                      value={editState.label}
                      onChange={(e) => {
                        const value = e.target.value.slice(0, 5);
                        setEditState(prev => ({
                          ...prev,
                          label: value
                        }));
                      }}
                      className="w-full"
                      placeholder="Label (5 chars max)"
                      maxLength={5}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Cost Adjustment</p>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="-?[0-9]*"
                        value={editState.costAdjustment}
                        onKeyDown={(e) => {
                          if (![8, 9, 13, 27, 46, 189, 109].includes(e.keyCode) && 
                              !/^[0-9]$/.test(e.key) && 
                              e.key !== '-') {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const value = e.target.value;
                          if (value === '' || value === '-' || /^-?\d*$/.test(value)) {
                            setEditState(prev => ({
                              ...prev,
                              costAdjustment: value
                            }));
                          }
                        }}
                        className="w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="Cost adjustment"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Kills</p>
                      <Input
                        type="number"
                        min="0"
                        value={editState.kills}
                        onChange={(e) => setEditState(prev => ({
                          ...prev,
                          kills: parseInt(e.target.value) || 0
                        }))}
                        className="w-full"
                        placeholder="Number of kills"
                      />
                    </div>
                  </div>
                </div>
              }
              onClose={() => {
                handleModalToggle('editFighter', false);
                setEditState(prev => ({
                  ...prev,
                  name: '',
                  label: '',
                  kills: 0,
                  costAdjustment: '0'
                }));
              }}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterData.fighter?.id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      fighter_name: editState.name,
                      label: editState.label,
                      kills: editState.kills,
                      cost_adjustment: editState.costAdjustment === '' || editState.costAdjustment === '-' 
                        ? 0 
                        : Number(editState.costAdjustment)
                    }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter');

                  handleNameUpdate(editState.name);
                  setFighterData(prev => ({
                    ...prev,
                    fighter: prev.fighter ? { 
                      ...prev.fighter, 
                      kills: editState.kills,
                      fighter_name: editState.name,
                      label: editState.label,
                      cost_adjustment: editState.costAdjustment === '' || editState.costAdjustment === '-' 
                        ? 0 
                        : Number(editState.costAdjustment),
                      credits: prev.fighter.base_credits + (editState.costAdjustment === '' || editState.costAdjustment === '-' 
                        ? 0 
                        : Number(editState.costAdjustment))
                    } : null
                  }));
                  
                  toast({
                    description: "Fighter updated successfully",
                    variant: "default"
                  });
                  handleModalToggle('editFighter', false);
                  return true;
                } catch (error) {
                  console.error('Error updating fighter:', error);
                  toast({
                    description: 'Failed to update fighter',
                    variant: "destructive"
                  });
                  return false;
                }
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
