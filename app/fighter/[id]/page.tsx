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

const transformFighterData = (fighter: any) => {
  // Get all characteristics from the response
  const characteristics = fighter.characteristics || [];
  
  // Transform skills to match expected format
  const skills = fighter.skills || {};

  return {
    characteristics,
    skills,
    advancement: fighter.advancement || [],
    note: fighter.note || ''
  };
};

const calculateInjuryModifications = (injuries: Injury[]) => {
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

async function getFighterData(fighterId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_details`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        "p_fighter_id": fighterId
      })
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch fighter details');
  }

  const [data] = await response.json();
  return data;
}

export default function FighterPage({ params }: { params: { id: string } }) {
  const [fighter, setFighter] = useState<Fighter | null>(null);
  const [gang, setGang] = useState<Gang | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddWeaponModalOpen, setIsAddWeaponModalOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [advancements, setAdvancements] = useState<Advancement[]>([]);
  const [gangFighters, setGangFighters] = useState<{
    id: string, 
    fighter_name: string, 
    fighter_type: string,
    xp: number | null
  }[]>([]);
  const [isAddXpModalOpen, setIsAddXpModalOpen] = useState(false);
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isKillModalOpen, setIsKillModalOpen] = useState(false);
  const [isRetireModalOpen, setIsRetireModalOpen] = useState(false);
  const [isEnslavedModalOpen, setIsEnslavedModalOpen] = useState(false);
  const [isStarveModalOpen, setIsStarveModalOpen] = useState(false);
  const [isEditFighterModalOpen, setIsEditFighterModalOpen] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedKills, setEditedKills] = useState<number>(0);
  const [editedCostAdjustment, setEditedCostAdjustment] = useState<string>('');
  const [xpAmount, setXpAmount] = useState('');
  const [xpError, setXpError] = useState('');
  const [editedLabel, setEditedLabel] = useState('');

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
        console.error('Error response:', errorText);
        throw new Error('Failed to fetch fighter details');
      }

      const [{ result }] = await response.json();
      console.log('Raw fighter response:', result);
      console.log('Fighter type data:', result.fighter.fighter_type);

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

      setEquipment(transformedEquipment);

      // Set the fighter data with characteristics directly from the response
      setFighter({
        ...result.fighter,
        base_credits: result.fighter.credits - (result.fighter.cost_adjustment || 0),
        gang_id: result.gang.id,
        gang_type_id: result.gang.gang_type_id,
        characteristics: result.fighter.characteristics || [],
        skills: result.fighter.skills || {}
      });

      // Update editedCostAdjustment when fighter data is loaded
      setEditedCostAdjustment(String(result.fighter.cost_adjustment || 0));

      setGang({
        id: result.gang.id,
        credits: result.gang.credits
      });
      
    } catch (err) {
      console.error('Error fetching fighter details:', err);
      setError('Failed to load fighter details');
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchFighterData();
  }, [fetchFighterData]);

  const handleDeleteFighter = useCallback(async () => {
    if (!fighter || !gang) return;

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
            fighter_id: fighter.id,
            operations: [
              {
                path: "fighter_equipment",  // Changed from fighter_weapons
                params: {
                  fighter_id: `eq.${fighter.id}`  // Added eq. prefix
                }
              },
              {
                path: "fighters",
                params: {
                  id: `eq.${fighter.id}`  // Added eq. prefix
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
        description: `${fighter.fighter_name} has been successfully deleted.`,
        variant: "default"
      });

      router.push(`/gang/${gang.id}`);
    } catch (error) {
      console.error('Error deleting fighter:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsDeleteModalOpen(false);
    }
  }, [fighter, gang, toast, router]);

  const handleFighterCreditsUpdate = useCallback((newCredits: number) => {
    setFighter((prev: Fighter | null) => prev ? { ...prev, credits: newCredits } : null);
  }, []);

  const handleGangCreditsUpdate = useCallback((newCredits: number) => {
    setGang((prev: Gang | null) => prev ? { ...prev, credits: newCredits } : null);
  }, []);

  const handleEquipmentUpdate = useCallback((updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number) => {
    setEquipment(updatedEquipment);
    setFighter((prev: Fighter | null) => prev ? { ...prev, credits: newFighterCredits } : null);
    setGang((prev: Gang | null) => prev ? { ...prev, credits: newGangCredits } : null);
  }, []);

  const handleEquipmentBought = useCallback((newFighterCredits: number, newGangCredits: number, boughtEquipment: Equipment) => {
    setFighter((prev: Fighter | null) => prev ? { ...prev, credits: newFighterCredits } : null);
    setGang((prev: Gang | null) => prev ? { ...prev, credits: newGangCredits } : null);
    setEquipment((prevEquipment) => [...prevEquipment, {
      ...boughtEquipment,
      cost: boughtEquipment.cost
    }]);
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
      setGangFighters(data);
    } catch (error) {
      console.error('Error fetching gang fighters:', error);
    }
  }, []);

  useEffect(() => {
    if (fighter?.gang_id) {
      fetchGangFighters(fighter.gang_id);
    }
  }, [fighter?.gang_id, fetchGangFighters]);

  const handleFighterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`/fighter/${e.target.value}`);
  };

  const handleNameUpdate = useCallback((newName: string) => {
    setFighter((prev: Fighter | null) => prev ? { ...prev, fighter_name: newName } : null);
  }, []);

  const handleAddXp = async () => {
    const amount = parseInt(xpAmount);
    
    if (isNaN(amount) || amount <= 0) {
      setXpError('Please enter a valid positive number');
      return false;
    }

    setXpError('');
    
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
      setFighter(prev => {
        if (!prev) return null;
        return {
          ...prev,
          xp: updatedFighter.xp,
          total_xp: updatedFighter.total_xp
        };
      });
      
      toast({
        description: `Successfully added ${amount} XP`,
        variant: "default"
      });
      
      return true;
    } catch (error) {
      console.error('Error adding XP:', error);
      setXpError('Failed to add XP. Please try again.');
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
    if (!fighter) return;

    const newKilledState = !fighter.killed;

    try {
      const response = await fetch(`/api/fighters/${fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          killed: newKilledState
        }),
      });

      if (!response.ok) {
        throw new Error(fighter.killed ? 'Failed to resurrect fighter' : 'Failed to kill fighter');
      }

      toast({
        description: fighter.killed 
          ? `${fighter.fighter_name} has been resurrected.`
          : `${fighter.fighter_name} has been killed in action.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter status:', error);
      toast({
        description: fighter.killed 
          ? 'Failed to resurrect fighter. Please try again.'
          : 'Failed to kill fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsKillModalOpen(false);
    }
  }, [fighter, toast, fetchFighterData]);

  const handleRetireFighter = useCallback(async () => {
    if (!fighter) return;

    const newRetiredState = !fighter.retired;

    try {
      const response = await fetch(`/api/fighters/${fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retired: newRetiredState
        }),
      });

      if (!response.ok) {
        throw new Error(fighter.retired ? 'Failed to unretire fighter' : 'Failed to retire fighter');
      }

      toast({
        description: fighter.retired 
          ? `${fighter.fighter_name} has come out of retirement.`
          : `${fighter.fighter_name} has retired from fighting.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter retirement status:', error);
      toast({
        description: fighter.retired 
          ? 'Failed to unretire fighter. Please try again.'
          : 'Failed to retire fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsRetireModalOpen(false);
    }
  }, [fighter, toast, fetchFighterData]);

  const handleEnslaveFighter = useCallback(async () => {
    if (!fighter) return;

    const newEnslavedState = !fighter.enslaved;

    try {
      const response = await fetch(`/api/fighters/${fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enslaved: newEnslavedState
        }),
      });

      if (!response.ok) {
        throw new Error(fighter.enslaved ? 'Failed to rescue fighter' : 'Failed to sell fighter');
      }

      toast({
        description: fighter.enslaved 
          ? `${fighter.fighter_name} has been rescued from the Guilders.`
          : `${fighter.fighter_name} has been sold to the Guilders.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter enslavement status:', error);
      toast({
        description: fighter.enslaved 
          ? 'Failed to rescue fighter. Please try again.'
          : 'Failed to sell fighter. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsEnslavedModalOpen(false);
    }
  }, [fighter, toast, fetchFighterData]);

  const handleStarveFighter = useCallback(async () => {
    if (!fighter) return;

    const newStarvedState = !fighter.starved;

    try {
      if (fighter.starved) {
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
              fighter_id: fighter.id
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
        const response = await fetch(`/api/fighters/${fighter.id}`, {
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
        description: fighter.starved 
          ? `${fighter.fighter_name} has been fed.`
          : `${fighter.fighter_name} is starving.`,
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
      setIsStarveModalOpen(false);
    }
  }, [fighter, toast, fetchFighterData]);

  const handleDeleteSkill = async (skillId: string) => {
    if (!fighter) return;

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
    if (!fighter) return;

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
    setEditedName(fighter?.fighter_name || '');
    setEditedLabel(fighter?.label || '');
    setEditedKills(fighter?.kills || 0);
    setEditedCostAdjustment(String(fighter?.cost_adjustment || 0));
    setIsEditFighterModalOpen(true);
  };

  if (isLoading) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Loading...
        </div>
      </div>
    </main>
  );

  if (error || !fighter || !gang) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Error: {error || 'Data not found'}
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
              {gangFighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fighter_name} - {f.fighter_type} {f.xp !== undefined ? `(${f.xp} XP)` : ''}
                </option>
              ))}
            </select>
          </div>
          <FighterDetailsCard 
            id={fighter.id}
            name={fighter.fighter_name}
            type={fighter.fighter_type.fighter_type}
            fighter_class={fighter.fighter_type.fighter_class}
            credits={fighter.credits}
            movement={fighter.movement + (calculateInjuryModifications(fighter.injuries)['M'] || 0)}
            weapon_skill={fighter.weapon_skill + (calculateInjuryModifications(fighter.injuries)['WS'] || 0)}
            ballistic_skill={fighter.ballistic_skill + (calculateInjuryModifications(fighter.injuries)['BS'] || 0)}
            strength={fighter.strength + (calculateInjuryModifications(fighter.injuries)['S'] || 0)}
            toughness={fighter.toughness + (calculateInjuryModifications(fighter.injuries)['T'] || 0)}
            wounds={fighter.wounds + (calculateInjuryModifications(fighter.injuries)['W'] || 0)}
            initiative={fighter.initiative + (calculateInjuryModifications(fighter.injuries)['I'] || 0)}
            attacks={fighter.attacks + (calculateInjuryModifications(fighter.injuries)['A'] || 0)}
            leadership={fighter.leadership + (calculateInjuryModifications(fighter.injuries)['Ld'] || 0)}
            cool={fighter.cool + (calculateInjuryModifications(fighter.injuries)['Cl'] || 0)}
            willpower={fighter.willpower + (calculateInjuryModifications(fighter.injuries)['Wp'] || 0)}
            intelligence={fighter.intelligence + (calculateInjuryModifications(fighter.injuries)['Int'] || 0)}
            xp={fighter.xp}
            total_xp={fighter.total_xp}
            advancements={fighter.advancements}
            onNameUpdate={handleNameUpdate}
            onAddXp={() => setIsAddXpModalOpen(true)}
            onEdit={handleEditClick}
            killed={fighter.killed}
            retired={fighter.retired}
            enslaved={fighter.enslaved}
            starved={fighter.starved}
            kills={fighter.kills || 0}
          />
          
          <WeaponList 
            fighterId={params.id} 
            gangId={gang.id}
            gangCredits={gang.credits}
            fighterCredits={fighter.credits}
            onEquipmentUpdate={handleEquipmentUpdate}
            equipment={equipment}
            onAddEquipment={() => setIsAddWeaponModalOpen(true)}
          />
          
          <SkillsList 
            skills={fighter.skills} 
            onDeleteSkill={handleDeleteSkill}
            fighterId={fighter.id}
            fighterXp={fighter.xp || 0}
            onSkillAdded={fetchFighterData}
            free_skill={fighter.free_skill}
          />
          
          <AdvancementsList
            fighterXp={fighter.xp || 0}
            fighterChanges={transformFighterData(fighter)}
            fighterId={fighter.id}
            onAdvancementDeleted={fetchFighterData}
          />
          
          <InjuriesList 
            injuries={fighter.injuries || []}
            onDeleteInjury={handleDeleteInjury}
            fighterId={fighter.id}
            onInjuryAdded={fetchFighterData}
          />
          
          <div className="mt-6">
            {fighter && (
              <NotesList 
                fighterId={fighter.id} 
                initialNote={fighter.note}
              />
            )}
          </div>
          
          {isAddWeaponModalOpen && (
            <ItemModal
              title="Equipment"
              onClose={() => setIsAddWeaponModalOpen(false)}
              gangCredits={gang.credits}
              gangId={gang.id}
              gangTypeId={fighter.gang_type_id}
              fighterId={fighter.id}
              fighterCredits={fighter.credits}
              onEquipmentBought={handleEquipmentBought}
            />
          )}
          
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                className="flex-1 min-w-[200px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setIsKillModalOpen(true)}
              >
                {fighter.killed ? 'Resurrect Fighter' : 'Kill Fighter'}
              </Button>
              <Button
                variant={fighter.retired ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => setIsRetireModalOpen(true)}
              >
                {fighter.retired ? 'Unretire Fighter' : 'Retire Fighter'}
              </Button>
              <Button
                variant={fighter.enslaved ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => setIsEnslavedModalOpen(true)}
              >
                {fighter.enslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
              </Button>
              <Button
                variant={fighter.starved ? 'success' : 'default'}
                className="flex-1 min-w-[200px]"
                onClick={() => setIsStarveModalOpen(true)}
              >
                {fighter.starved ? 'Feed Fighter' : 'Starve Fighter'}
              </Button>
              <Button 
                variant="destructive"
                className="flex-1 min-w-[200px]"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                Delete Fighter
              </Button>
            </div>
          </div>

          {isDeleteModalOpen && (
            <Modal
              title="Confirm Deletion"
              content={`Are you sure you want to delete ${fighter.fighter_name}? This action cannot be undone.`}
              onClose={() => setIsDeleteModalOpen(false)}
              onConfirm={handleDeleteFighter}
            />
          )}
          
          {isKillModalOpen && (
            <Modal
              title={fighter.killed ? 'Confirm Resurrection' : 'Confirm Kill'}
              content={
                fighter.killed 
                  ? `Are you sure you want to resurrect ${fighter.fighter_name}?`
                  : `Are you sure ${fighter.fighter_name} was killed in action?`
              }
              onClose={() => setIsKillModalOpen(false)}
              onConfirm={handleKillFighter}
            />
          )}
          
          {isRetireModalOpen && (
            <Modal
              title={fighter.retired ? 'Confirm Unretirement' : 'Confirm Retirement'}
              content={
                fighter.retired 
                  ? `Are you sure you want to bring ${fighter.fighter_name} out of retirement?`
                  : `Are you sure you want to retire ${fighter.fighter_name}?`
              }
              onClose={() => setIsRetireModalOpen(false)}
              onConfirm={handleRetireFighter}
            />
          )}
          
          {isAddXpModalOpen && fighter && (
            <Modal
              title="Add XP"
              headerContent={
                <div className="flex items-center">
                  <span className="mr-2 text-sm text-gray-600">Current XP</span>
                  <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">
                    {fighter.xp ?? 0}
                  </span>
                </div>
              }
              content={
                <div className="space-y-4">
                  <div>
                    <Input
                      type="number"
                      value={xpAmount}
                      onChange={(e) => setXpAmount(e.target.value)}
                      placeholder="Enter XP amount"
                      min="1"
                      className="w-full"
                    />
                    {xpError && <p className="text-red-500 text-sm mt-1">{xpError}</p>}
                  </div>
                </div>
              }
              onClose={() => {
                setIsAddXpModalOpen(false);
                setXpAmount('');
                setXpError('');
              }}
              onConfirm={handleAddXp}
              confirmText="Add XP"
              confirmDisabled={!xpAmount}
            />
          )}
          
          {isAdvancementModalOpen && (
            <AdvancementModal
              fighterId={params.id}
              currentXp={fighter.xp ?? 0}
              onClose={() => setIsAdvancementModalOpen(false)}
              onAdvancementAdded={handleAdvancementAdded}
            />
          )}
          
          {isEnslavedModalOpen && (
            <Modal
              title={fighter.enslaved ? 'Confirm Rescue' : 'Confirm Sale'}
              content={
                fighter.enslaved 
                  ? `Are you sure you want to rescue ${fighter.fighter_name} from the Guilders?`
                  : `Are you sure you want to sell ${fighter.fighter_name} to the Guilders?`
              }
              onClose={() => setIsEnslavedModalOpen(false)}
              onConfirm={handleEnslaveFighter}
            />
          )}
          
          {isStarveModalOpen && (
            <Modal
              title={fighter.starved ? 'Confirm Feeding' : 'Confirm Starvation'}
              content={
                fighter.starved 
                  ? `Are you sure you want to feed ${fighter.fighter_name}?`
                  : `Are you sure ${fighter.fighter_name} is starving?`
              }
              onClose={() => setIsStarveModalOpen(false)}
              onConfirm={handleStarveFighter}
            />
          )}
          
          {isEditFighterModalOpen && (
            <Modal
              title="Edit Fighter"
              content={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Fighter name</p>
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full"
                      placeholder="Fighter name"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Label (max 5 characters)</p>
                    <Input
                      type="text"
                      value={editedLabel}
                      onChange={(e) => {
                        const value = e.target.value.slice(0, 5);
                        setEditedLabel(value);
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
                        value={editedCostAdjustment}
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
                            setEditedCostAdjustment(value);
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
                        value={editedKills}
                        onChange={(e) => setEditedKills(parseInt(e.target.value) || 0)}
                        className="w-full"
                        placeholder="Number of kills"
                      />
                    </div>
                  </div>
                </div>
              }
              onClose={() => {
                setIsEditFighterModalOpen(false);
                setEditedName('');
                setEditedLabel('');
                setEditedKills(0);
                setEditedCostAdjustment('0');
              }}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighter.id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      fighter_name: editedName,
                      label: editedLabel,
                      kills: editedKills,
                      cost_adjustment: editedCostAdjustment === '' || editedCostAdjustment === '-' 
                        ? 0 
                        : Number(editedCostAdjustment)
                    }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter');

                  handleNameUpdate(editedName);
                  setFighter(prev => prev ? { 
                    ...prev, 
                    kills: editedKills,
                    fighter_name: editedName,
                    label: editedLabel,
                    cost_adjustment: editedCostAdjustment === '' || editedCostAdjustment === '-' 
                      ? 0 
                      : Number(editedCostAdjustment),
                    credits: prev.base_credits + (editedCostAdjustment === '' || editedCostAdjustment === '-' 
                      ? 0 
                      : Number(editedCostAdjustment))
                  } : null);
                  
                  toast({
                    description: "Fighter updated successfully",
                    variant: "default"
                  });
                  setIsEditFighterModalOpen(false);
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
