'use client';

import { createClient } from "@/utils/supabase/client";
import { FighterDetailsCard } from "@/components/fighter-details-card";
import { WeaponList } from "@/components/weapon-list";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/equipment";
import { AdvancementsList } from "@/components/advancements-list";
import { Equipment, WeaponProfile } from '@/types/equipment';
import dynamic from 'next/dynamic';
import { AdvancementModal } from "@/components/ui/advancement-modal";
import { SkillsList } from "@/components/skills-list";
import { InjuriesList } from "@/components/injuries-list";
import { NotesList } from "@/components/notes-list";
import { Input } from "@/components/ui/input";
import { FighterWeaponsTable } from "@/components/fighter-weapons-table";
import { VehicleEquipment, VehicleEquipmentProfile } from '@/types/fighter';

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

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  role: string | null;
  status: string | null;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
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
  fighter_class: string;
  vehicles?: Array<{
    id: string;
    vehicle_type_id: string;
    vehicle_type: string;  // Add this line
    movement: number;
    front: number;
    side: number;
    rear: number;
    hull_points: number;
    handling: number;
    save: number;
    vehicle_name?: string;
    body_slots: number;
    body_slots_occupied: number;
    drive_slots: number;
    drive_slots_occupied: number;
    engine_slots: number;
    engine_slots_occupied: number;
    equipment?: Array<{
      id: string;
      equipment_id: string;
      equipment_name: string;
      equipment_type: string;
      purchase_cost: number;
      original_cost: number;
      weapon_profiles?: WeaponProfile[];
      vehicle_equipment_profiles?: VehicleEquipmentProfile[];
    }>;
  }>;
  campaigns?: Campaign[];
}

interface Gang {
  id: string;
  credits: number;
  positioning?: Record<number, string>;
  gang_type_id: string;
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
  vehicleEquipment: VehicleEquipment[];
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
    kill: boolean;
    retire: boolean;
    enslave: boolean;
    starve: boolean;
    addXp: boolean;
    advancement: boolean;
    editFighter: boolean;
    addWeapon: boolean;
    addVehicleEquipment: boolean;
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

const VEHICLE_EQUIPMENT_CATEGORIES = [
  "Ammo",
  "Basic Weapons", 
  "Special Weapons",
  "Heavy Weapons",
  "Vehicle Upgrades",
  "Vehicle Wargear"
];

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
    'Wil': 0, // Willpower
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

// Regular function outside component
const transformFighterChangesData = (fighter: Fighter | null) => {
  if (!fighter) return { advancement: [], characteristics: [], skills: {} };
  
  // Transform the skills object to include is_advance
  const transformedSkills = Object.entries(fighter.skills || {}).reduce((acc, [key, value]) => {
    acc[key] = {
      ...value,
      is_advance: true  // Add the missing is_advance property
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
    advancement: fighter.fighter_changes?.advancement || [],
    characteristics: fighter.characteristics || [],
    skills: transformedSkills
  };
};

// First, let's define an interface for the characteristic structure
interface FighterCharacteristic {
  id: string;
  characteristic_name: string;
  characteristic_value: number;
  credits_increase: number;
  xp_cost: number;
  acquired_at: string;
  code: string;
  times_increased: number;
}

export default function FighterPage({ params }: { params: { id: string } }) {
  // Replace multiple state declarations with consolidated state
  const [fighterData, setFighterData] = useState<FighterPageState>({
    fighter: null,
    equipment: [],
    vehicleEquipment: [],
    advancements: [],
    gang: null,
    gangFighters: []
  });

  const [uiState, setUiState] = useState<UIState>({
    isLoading: true,
    error: null,
    modals: {
      delete: false,
      kill: false,
      retire: false,
      enslave: false,
      starve: false,
      addXp: false,
      advancement: false,
      editFighter: false,
      addWeapon: false,
      addVehicleEquipment: false
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

  // Add state for delete modal
  const [deleteVehicleEquipmentData, setDeleteVehicleEquipmentData] = useState<{
    id: string;
    equipmentId: string;
    name: string;
  } | null>(null);

  // Add state for stash modal
  const [stashVehicleEquipmentData, setStashVehicleEquipmentData] = useState<{
    id: string;
    equipmentId: string;
    name: string;
    cost: number;
  } | null>(null);

  // Add state for sell modal with cost state
  const [sellVehicleEquipmentData, setSellVehicleEquipmentData] = useState<{
    id: string;
    equipmentId: string;
    name: string;
    cost: number;
  } | null>(null);

  // Add new state for available injuries
  const [availableInjuries, setAvailableInjuries] = useState<Array<{
    id: string;
    injury_name: string;
    code_1?: string;
    characteristic_1?: number;
    code_2?: string;
    characteristic_2?: number;
  }>>([]);

  // Add function to fetch available injuries
  const fetchAvailableInjuries = useCallback(async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/injuries`,
        {
          method: 'GET',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch injuries');
      const data = await response.json();
      setAvailableInjuries(data);
    } catch (error) {
      console.error('Error fetching injuries:', error);
      toast({
        description: 'Failed to load injury types',
        variant: "destructive"
      });
    }
  }, [toast]);

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
      
      // Transform regular equipment data
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

      // Transform vehicle equipment data from the nested structure
      const transformedVehicleEquipment = (result.fighter?.vehicles?.[0]?.equipment || []).map((item: any) => ({
        fighter_equipment_id: item.fighter_equipment_id,
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name,
        equipment_type: item.equipment_type,
        cost: item.purchase_cost,
        base_cost: item.original_cost,
        vehicle_equipment_profiles: item.vehicle_equipment_profiles || [],
        core_equipment: false,
        vehicle_id: result.fighter?.vehicles?.[0]?.id,
        vehicle_equipment_id: item.id
      }));

      // Update state in a single operation
      setFighterData(prev => ({
        ...prev,
        fighter: {
          ...result.fighter,
          fighter_class: result.fighter.fighter_class,
          fighter_type: result.fighter.fighter_type,
          base_credits: result.fighter.credits - (result.fighter.cost_adjustment || 0),
          gang_id: result.gang.id,
          gang_type_id: result.gang.gang_type_id,
          characteristics: result.fighter.characteristics || [],
          skills: result.fighter.skills || {},
          advancements: {
            characteristics: result.fighter.characteristics?.reduce((acc: Record<string, FighterCharacteristic>, char: FighterCharacteristic) => ({
              ...acc,
              [char.characteristic_name]: char
            }), {}) || {},
            skills: result.fighter.skills || {}
          },
          vehicles: result.fighter.vehicles
        },
        equipment: transformedEquipment,
        vehicleEquipment: transformedVehicleEquipment,
        gang: {
          id: result.gang.id,
          credits: result.gang.credits,
          gang_type_id: result.gang.gang_type_id
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

      console.log('Loaded fighter data:', {
        vehicleData: result.fighter?.vehicles?.[0],
        vehicleTypeId: result.fighter?.vehicles?.[0]?.vehicle_type_id
      });

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
    fetchAvailableInjuries();
  }, [fetchFighterData, fetchAvailableInjuries]);

  const handleDeleteFighter = useCallback(async () => {
    if (!fighterData.fighter || !fighterData.gang) return;

    try {
      // First delete the fighter and their equipment
      const deleteResponse = await fetch(
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

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
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

  const handleEquipmentBought = useCallback((
    newFighterCredits: number, 
    newGangCredits: number, 
    boughtEquipment: Equipment, 
    isVehicleEquipment = false
  ) => {
    setFighterData(prev => {
      if (!prev.fighter) return prev;

      let updatedVehicles = prev.fighter.vehicles;
      if (isVehicleEquipment && updatedVehicles?.[0] && boughtEquipment.vehicle_equipment_profiles?.[0]) {
        const vehicle = updatedVehicles[0];
        const profile = boughtEquipment.vehicle_equipment_profiles[0];
        
        // Update slots based on upgrade_type
        const slotUpdates = {
          body_slots_occupied: profile.upgrade_type === 'body' ? 1 : 0,
          drive_slots_occupied: profile.upgrade_type === 'drive' ? 1 : 0,
          engine_slots_occupied: profile.upgrade_type === 'engine' ? 1 : 0
        };

        updatedVehicles = [{
          ...vehicle,
          body_slots_occupied: (vehicle.body_slots_occupied || 0) + slotUpdates.body_slots_occupied,
          drive_slots_occupied: (vehicle.drive_slots_occupied || 0) + slotUpdates.drive_slots_occupied,
          engine_slots_occupied: (vehicle.engine_slots_occupied || 0) + slotUpdates.engine_slots_occupied,
          equipment: [...(vehicle.equipment || []), {
            id: boughtEquipment.equipment_id,
            equipment_id: boughtEquipment.equipment_id,
            equipment_name: boughtEquipment.equipment_name,
            equipment_type: boughtEquipment.equipment_type,
            purchase_cost: boughtEquipment.cost,
            original_cost: boughtEquipment.cost,
            weapon_profiles: boughtEquipment.weapon_profiles || undefined,
            vehicle_equipment_profiles: boughtEquipment.vehicle_equipment_profiles
          }]
        }];
      }

      return {
        ...prev,
        fighter: {
          ...prev.fighter,
          credits: newFighterCredits,
          vehicles: updatedVehicles
        },
        gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null,
        vehicleEquipment: isVehicleEquipment ? [
          ...prev.vehicleEquipment,
          {
            ...boughtEquipment,
            vehicle_id: prev.fighter.vehicles?.[0]?.id || '',
            vehicle_equipment_id: boughtEquipment.fighter_equipment_id || ''
          } as VehicleEquipment
        ] : prev.vehicleEquipment,
        equipment: !isVehicleEquipment ? [...prev.equipment, boughtEquipment] : prev.equipment
      };
    });
  }, []);

  const fetchGangFighters = useCallback(async (gangId: string) => {
    try {
      const supabase = createClient();
      // Get authenticated session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('No session found');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighters?gang_id=eq.${gangId}&select=id,fighter_name,fighter_type,xp`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
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
    // First validate that the input contains only numbers
    if (!/^-?\d+$/.test(editState.xpAmount)) {
      setEditState(prev => ({
        ...prev,
        xpError: 'Please enter a valid integer'
      }));
      return false;
    }
    
    const amount = parseInt(editState.xpAmount);
    
    if (isNaN(amount) || !Number.isInteger(Number(amount))) {
      setEditState(prev => ({
        ...prev,
        xpError: 'Please enter a valid integer'
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

  // Add a function to check if the input is valid
  const isValidXpInput = (value: string) => {
    // Allow empty string, minus sign, or only digits
    return value === '' || value === '-' || /^-?\d+$/.test(value);
  };

  // Define XP "events" for the checkbox list
  const xpCases = [
    {
      id: 'seriousInjury',
      label: 'Cause Serious Injury',
      xp: 1
    },
    {
      id: 'outOfAction',
      label: 'Cause OOA',
      xp: 2
    },
    {
      id: 'leaderChampionBonus',
      label: 'Leader/Champion',
      xp: 1
    },
    {
      id: 'vehicleWrecked',
      label: 'Wreck Vehicle',
      xp: 2
    },
    {
      id: 'battleParticipation',
      label: 'Battle Participation',
      xp: 1
    },
    {
      id: 'rally',
      label: 'Successful Rally',
      xp: 1
    },
    {
      id: 'assistance',
      label: 'Provide Assistance',
      xp: 1
    }
  ];

  // Track which of these XP events are checked
  const [xpCheckboxes, setXpCheckboxes] = useState(
    xpCases.reduce((acc, xpCase) => {
      acc[xpCase.id] = false;
      return acc;
    }, {} as Record<string, boolean>)
  );

  // Handle toggling a checkbox
  const handleXpCheckboxChange = (id: string) => {
    setXpCheckboxes(prev => {
      // Clone current state
      const newState = { ...prev };

      // Toggle the clicked checkbox
      newState[id] = !prev[id];

      // If they clicked seriousInjury, uncheck outOfAction
      if (id === 'seriousInjury' && newState.seriousInjury) {
        newState.outOfAction = false;
      }
      // If they clicked outOfAction, uncheck seriousInjury
      if (id === 'outOfAction' && newState.outOfAction) {
        newState.seriousInjury = false;
      }

      return newState;
    });
  };

  // Compute total from checkboxes
  const totalXpFromCheckboxes = xpCases.reduce((sum, xpCase) => {
    if (xpCheckboxes[xpCase.id]) {
      return sum + xpCase.xp;
    }
    return sum;
  }, 0);

  useEffect(() => {
    // Convert to string since editState.xpAmount is a string
    setEditState(prev => ({ ...prev, xpAmount: totalXpFromCheckboxes === 0 ? "" : String(totalXpFromCheckboxes) }));
  }, [totalXpFromCheckboxes, setEditState]);

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

  const debugFighterData = () => {
    console.log('Fighter data:', {
      gang_type_id: fighterData.fighter?.gang_type_id,
      fighter_type_id: fighterData.fighter?.fighter_type?.fighter_type_id,
      fighter: fighterData.fighter
    });
  };

  // Add back the initial delete handler function
  const handleVehicleEquipmentDelete = async (fighterEquipmentId: string, equipmentId: string) => {
    try {
      // Find the equipment to delete for the modal
      const equipmentToDelete = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === fighterEquipmentId
      );
      
      if (!equipmentToDelete) {
        toast({
          title: "Error",
          description: "Equipment not found",
          variant: "destructive"
        });
        return;
      }

      // Show confirmation modal
      setDeleteVehicleEquipmentData({
        id: equipmentToDelete.fighter_equipment_id,
        equipmentId: equipmentToDelete.equipment_id,
        name: equipmentToDelete.equipment_name
      });
    } catch (error) {
      console.error('Error preparing to delete equipment:', error);
      toast({
        title: "Error",
        description: "Failed to prepare equipment for deletion",
        variant: "destructive"
      });
    }
  };

  // Rename the current delete handler to handleConfirmVehicleEquipmentDelete
  const handleConfirmVehicleEquipmentDelete = async () => {
    if (!deleteVehicleEquipmentData) return;
    
    try {
      // Find the equipment to remove and its profiles
      const equipmentToRemove = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === deleteVehicleEquipmentData.id
      );

      if (!equipmentToRemove) throw new Error('Equipment not found');
      if (!fighterData.fighter?.vehicles?.[0]) throw new Error('No vehicle found');

      const vehicle = fighterData.fighter.vehicles[0];
      const profile = equipmentToRemove.vehicle_equipment_profiles?.[0];

      // Calculate all state updates before making any changes
      const slotUpdates = {
        body_slots_occupied: profile?.upgrade_type === 'body' ? -1 : 0,
        drive_slots_occupied: profile?.upgrade_type === 'drive' ? -1 : 0,
        engine_slots_occupied: profile?.upgrade_type === 'engine' ? -1 : 0
      };

      const updatedVehicle = {
        ...vehicle,
        body_slots_occupied: Math.max(0, (vehicle.body_slots_occupied || 0) + slotUpdates.body_slots_occupied),
        drive_slots_occupied: Math.max(0, (vehicle.drive_slots_occupied || 0) + slotUpdates.drive_slots_occupied),
        engine_slots_occupied: Math.max(0, (vehicle.engine_slots_occupied || 0) + slotUpdates.engine_slots_occupied),
        equipment: vehicle.equipment?.filter(e => e.equipment_id !== equipmentToRemove.equipment_id)
      };

      // Make a single optimistic update with all changes
      setFighterData(prev => ({
        ...prev,
        fighter: {
          ...prev.fighter!,
          credits: prev.fighter!.credits - equipmentToRemove.cost,
          vehicles: [updatedVehicle]
        },
        vehicleEquipment: prev.vehicleEquipment.filter(
          item => item.fighter_equipment_id !== deleteVehicleEquipmentData.id
        )
      }));

      // Close modal and show feedback
      setDeleteVehicleEquipmentData(null);
      toast({ description: `Successfully deleted ${equipmentToRemove.equipment_name}` });

      // Make the API request
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_equipment?id=eq.${deleteVehicleEquipmentData.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          }
        }
      );

      if (!response.ok) throw new Error('Failed to delete equipment');

    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast({
        title: "Error",
        description: "Failed to delete equipment",
        variant: "destructive"
      });
      // Revert all changes on error
      await fetchFighterData();
    }
  };

  // Add the handleVehicleEquipmentStash function
  const handleVehicleEquipmentStash = async (fighterEquipmentId: string, equipmentId: string) => {
    try {
      // Find the equipment to stash for the modal
      const equipmentToStash = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === fighterEquipmentId
      );
      
      if (!equipmentToStash) {
        toast({
          title: "Error",
          description: "Equipment not found",
          variant: "destructive"
        });
        return;
      }

      // Show confirmation modal
      setStashVehicleEquipmentData({
        id: equipmentToStash.fighter_equipment_id,
        equipmentId: equipmentToStash.equipment_id,
        name: equipmentToStash.equipment_name,
        cost: equipmentToStash.cost || 0
      });
    } catch (error) {
      console.error('Error preparing to stash equipment:', error);
      toast({
        title: "Error",
        description: "Failed to prepare equipment for stash",
        variant: "destructive"
      });
    }
  };

  // Add the actual stash function
  const handleConfirmVehicleEquipmentStash = async () => {
    if (!stashVehicleEquipmentData) return;
    
    try {
      // Find the equipment to remove and its profiles
      const equipmentToRemove = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === stashVehicleEquipmentData.id
      );

      if (!equipmentToRemove) throw new Error('Equipment not found');

      // Optimistically update the state
      const profile = equipmentToRemove.vehicle_equipment_profiles?.[0];
      const vehicle = fighterData.fighter?.vehicles?.[0];

      // Calculate slot updates for removal
      const slotUpdates = profile ? {
        body_slots_occupied: profile.upgrade_type === 'body' ? -1 : 0,
        drive_slots_occupied: profile.upgrade_type === 'drive' ? -1 : 0,
        engine_slots_occupied: profile.upgrade_type === 'engine' ? -1 : 0
      } : {
        body_slots_occupied: 0,
        drive_slots_occupied: 0,
        engine_slots_occupied: 0
      };

      // Optimistically update the state
      setFighterData(prev => {
        if (!prev.fighter?.vehicles?.[0]) return prev;

        return {
          ...prev,
          fighter: {
            ...prev.fighter,
            // Update fighter credits when stashing equipment
            credits: prev.fighter.credits - stashVehicleEquipmentData.cost,
            vehicles: [{
              ...prev.fighter.vehicles[0],
              body_slots_occupied: Math.max(0, (vehicle?.body_slots_occupied || 0) + slotUpdates.body_slots_occupied),
              drive_slots_occupied: Math.max(0, (vehicle?.drive_slots_occupied || 0) + slotUpdates.drive_slots_occupied),
              engine_slots_occupied: Math.max(0, (vehicle?.engine_slots_occupied || 0) + slotUpdates.engine_slots_occupied),
              equipment: prev.fighter.vehicles[0].equipment?.filter(
                e => e.equipment_id !== equipmentToRemove.equipment_id
              )
            }]
          },
          vehicleEquipment: prev.vehicleEquipment.filter(
            equip => equip.fighter_equipment_id !== stashVehicleEquipmentData.id
          )
        };
      });

      // Close the modal immediately for better UX
      setStashVehicleEquipmentData(null);
      toast({ description: "Equipment moved to stash" });

      // Make the actual API request
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/move_to_gang_stash`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            fighter_equipment_id: stashVehicleEquipmentData.id
          })
        }
      );

      if (!response.ok) {
        // If the request fails, revert the optimistic update
        await fetchFighterData();
        throw new Error('Failed to stash equipment');
      }

    } catch (error) {
      console.error('Error stashing equipment:', error);
      toast({
        title: "Error",
        description: "Failed to stash equipment",
        variant: "destructive"
      });
      
      // Revert optimistic update on error
      await fetchFighterData();
    }
  };

  // Update the sell handler to show modal first
  const handleVehicleEquipmentSell = async (fighterEquipmentId: string) => {
    try {
      // Find the equipment to sell
      const equipmentToSell = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === fighterEquipmentId
      );
      
      if (!equipmentToSell) {
        toast({
          title: "Error",
          description: "Equipment not found",
          variant: "destructive"
        });
        return;
      }

      // Show confirmation modal
      setSellVehicleEquipmentData({
        id: equipmentToSell.fighter_equipment_id,
        equipmentId: equipmentToSell.equipment_id,
        name: equipmentToSell.equipment_name,
        cost: equipmentToSell.cost || 0
      });
    } catch (error) {
      console.error('Error preparing to sell equipment:', error);
      toast({
        title: "Error",
        description: "Failed to prepare equipment for sale",
        variant: "destructive"
      });
    }
  };

  // Add the confirm sell handler
  const handleConfirmVehicleEquipmentSell = async () => {
    if (!sellVehicleEquipmentData) return;
    
    try {
      // Find the equipment to remove and its profiles
      const equipmentToRemove = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === sellVehicleEquipmentData.id
      );

      if (!equipmentToRemove) throw new Error('Equipment not found');

      // Optimistically update the UI
      const profile = equipmentToRemove.vehicle_equipment_profiles?.[0];
      const vehicle = fighterData.fighter?.vehicles?.[0];

      // Calculate slot updates for removal
      const slotUpdates = {
        body_slots_occupied: profile?.upgrade_type === 'body' ? -1 : 0,
        drive_slots_occupied: profile?.upgrade_type === 'drive' ? -1 : 0,
        engine_slots_occupied: profile?.upgrade_type === 'engine' ? -1 : 0
      };

      setFighterData(prev => {
        if (!prev.fighter?.vehicles?.[0]) return prev;
        const vehicle = prev.fighter.vehicles[0];

        return {
          ...prev,
          fighter: {
            ...prev.fighter,
            // Update fighter credits
            credits: prev.fighter.credits - sellVehicleEquipmentData.cost,
            vehicles: [{
              ...vehicle,
              body_slots_occupied: Math.max(0, (vehicle.body_slots_occupied || 0) + slotUpdates.body_slots_occupied),
              drive_slots_occupied: Math.max(0, (vehicle.drive_slots_occupied || 0) + slotUpdates.drive_slots_occupied),
              engine_slots_occupied: Math.max(0, (vehicle.engine_slots_occupied || 0) + slotUpdates.engine_slots_occupied),
              equipment: vehicle.equipment?.filter(e => e.equipment_id !== equipmentToRemove.equipment_id)
            }]
          },
          // Update gang credits optimistically
          gang: prev.gang ? {
            ...prev.gang,
            credits: prev.gang.credits + sellVehicleEquipmentData.cost
          } : null,
          vehicleEquipment: prev.vehicleEquipment.filter(
            item => item.fighter_equipment_id !== sellVehicleEquipmentData.id
          )
        };
      });

      // Close modal and show feedback
      setSellVehicleEquipmentData(null);
      toast({ 
        description: `Successfully sold ${equipmentToRemove.equipment_name} for ${sellVehicleEquipmentData.cost} credits` 
      });

      // Make the actual API request
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/sell_equipment_from_fighter`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            fighter_equipment_id: sellVehicleEquipmentData.id,
            manual_cost: sellVehicleEquipmentData.cost
          })
        }
      );

      if (!response.ok) {
        // If the request fails, revert all changes
        await fetchFighterData();
        throw new Error('Failed to sell equipment');
      }

    } catch (error) {
      console.error('Error selling equipment:', error);
      toast({
        title: "Error",
        description: "Failed to sell equipment",
        variant: "destructive"
      });
      // Revert all changes on error
      await fetchFighterData();
    }
  };

  // Keep the meat-checking functionality
  const isMeatEnabled = useCallback(() => {
    return fighterData.fighter?.campaigns?.some(campaign => campaign.has_meat) ?? false;
  }, [fighterData.fighter?.campaigns]);

  // Memoize the transform function inside the component
  const transformFighterChanges = useCallback((fighter: Fighter | null) => {
    return transformFighterChangesData(fighter);
  }, []);

  // Memoize the transformed data
  const memoizedFighterChanges = useMemo(() => 
    transformFighterChanges(fighterData.fighter),
    [fighterData.fighter, transformFighterChanges]
  );

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

  const vehicle = fighterData.fighter?.vehicles?.[0];

  const getPillColor = (occupied: number, total: number) => {
    if (occupied > total) return "bg-red-500";
    if (occupied === total) return "bg-gray-500";
    return "bg-green-500";
  };

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4">
          <div className="mb-4">
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
            fighter_class={fighterData.fighter?.fighter_class}
            credits={fighterData.fighter?.credits || 0}
            movement={fighterData.fighter?.movement}
            weapon_skill={fighterData.fighter?.weapon_skill}
            ballistic_skill={fighterData.fighter?.ballistic_skill}
            strength={fighterData.fighter?.strength}
            toughness={fighterData.fighter?.toughness}
            wounds={fighterData.fighter?.wounds}
            initiative={fighterData.fighter?.initiative}
            attacks={fighterData.fighter?.attacks}
            leadership={fighterData.fighter?.leadership}
            cool={fighterData.fighter?.cool}
            willpower={fighterData.fighter?.willpower}
            intelligence={fighterData.fighter?.intelligence}
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
            injuries={fighterData.fighter?.injuries || []}
            vehicles={fighterData.fighter?.vehicles}
            gangId={fighterData.gang?.id}
            vehicleEquipment={fighterData.vehicleEquipment}
          />

          {vehicle && (
            <div className="mt-6 w-full">
               <div className="flex items-center gap-1">
                 <h3 className="text-base text-gray-600">Upgrade Slots:</h3>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.body_slots_occupied, vehicle.body_slots)} text-white text-xs font-medium rounded-full`}>Body: {vehicle.body_slots_occupied}/{vehicle.body_slots}</span>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.drive_slots_occupied, vehicle.drive_slots)} text-white text-xs font-medium rounded-full`}>Drive: {vehicle.drive_slots_occupied}/{vehicle.drive_slots}</span>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.engine_slots_occupied, vehicle.engine_slots)} text-white text-xs font-medium rounded-full`}>Engine: {vehicle.engine_slots_occupied}/{vehicle.engine_slots}</span>
               </div>
             </div>
          )}

          {vehicle && (
            <div className="mt-6">
              <div className="flex flex-wrap justify-between items-center mb-2">
                <h2 className="text-2xl font-bold">Vehicle Equipment</h2>
                <Button 
                  onClick={() => handleModalToggle('addVehicleEquipment', true)}
                  className="bg-black hover:bg-gray-800 text-white"
                >
                  Add
                </Button>
              </div>
              <FighterWeaponsTable 
                equipment={fighterData.vehicleEquipment}
                onDeleteEquipment={handleVehicleEquipmentDelete}
                onSellEquipment={handleVehicleEquipmentSell}
                onStashEquipment={handleVehicleEquipmentStash}
                isLoading={uiState.isLoading}
              />
            </div>
          )}
          
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
            fighterChanges={memoizedFighterChanges}
            fighterId={fighterData.fighter?.id || ''}
            onAdvancementDeleted={fetchFighterData}
          />
          
          <InjuriesList 
            injuries={fighterData.fighter?.injuries || []}
            availableInjuries={availableInjuries}
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
            <ItemModal
              title="Equipment"
              onClose={() => {
                debugFighterData();
                handleModalToggle('addWeapon', false);
              }}
              gangCredits={fighterData.gang?.credits || 0}
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.fighter?.gang_type_id || ''}
              fighterId={fighterData.fighter?.id || ''}
              fighterTypeId={fighterData.fighter?.fighter_type?.fighter_type_id || ''}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentBought={handleEquipmentBought}
            />
          )}
          
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => handleModalToggle('kill', true)}
              >
                {fighterData.fighter?.killed ? 'Resurrect Fighter' : 'Kill Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.retired ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('retire', true)}
              >
                {fighterData.fighter?.retired ? 'Unretire Fighter' : 'Retire Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.enslaved ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('enslave', true)}
              >
                {fighterData.fighter?.enslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
              </Button>
              {isMeatEnabled() && (
                <Button
                  variant={fighterData.fighter?.starved ? 'success' : 'default'}
                  className="flex-1"
                  onClick={() => handleModalToggle('starve', true)}
                >
                  {fighterData.fighter?.starved ? 'Feed Fighter' : 'Starve Fighter'}
                </Button>
              )}
              <Button 
                variant="destructive"
                className="flex-1"
                onClick={() => handleModalToggle('delete', true)}
              >
                Delete Fighter
              </Button>
            </div>
          </div>

          {uiState.modals.delete && (
            <Modal
              title="Confirm Deletion"
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
                  <div className="text-sm text-gray-600 mb-1">
                    Select any applicable checkboxes, or override the total in the bottom input.
                  </div>
                  {/* Checkbox list for XP */}
                  <div>
                    {/* First 3 XP cases, rendered without separators */}
                    {xpCases.slice(0, 3).map((xpCase) => (
                      <div key={xpCase.id} className="flex items-center space-x-2 mb-2">
                        <input
                          type="checkbox"
                          id={xpCase.id}
                          checked={xpCheckboxes[xpCase.id]}
                          onChange={() => handleXpCheckboxChange(xpCase.id)}
                        />
                        <label htmlFor={xpCase.id} className="text-sm text-gray-800">{xpCase.label} (+{xpCase.xp} XP)</label>
                      </div>
                    ))}

                    {/* Separator after the first three */}
                    <hr className="my-2 border-gray-300" />

                    {/* Remaining XP cases, each followed by a separator except the last */}
                    {xpCases.slice(3).map((xpCase, idx, arr) => (
                      <div key={xpCase.id}>
                        <div className="flex items-center space-x-2 mb-2">
                          <input
                            type="checkbox"
                            id={xpCase.id}
                            checked={xpCheckboxes[xpCase.id]}
                            onChange={() => handleXpCheckboxChange(xpCase.id)}
                          />
                          <label htmlFor={xpCase.id} className="text-sm text-gray-800">{xpCase.label} (+{xpCase.xp} XP)</label>
                        </div>
                        {/* Only show a separator if it's not the last item in this slice */}
                        {idx < arr.length - 1 && (
                          <hr className="my-2 border-gray-300" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Numeric Input */}
                  <div>
                    <div className="text-sm text-gray-600 my-6 mb-1">
                      Total XP from checkboxes: {totalXpFromCheckboxes}
                    </div>

                    <Input
                      type="tel"
                      inputMode="url"
                      pattern="-?[0-9]+"
                      value={editState.xpAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditState((prev) => ({
                          ...prev,
                          xpAmount: value,
                          // Clear any existing error when the user is typing
                          xpError: ''
                        }));
                      }}
                      placeholder="Override XP (use a negative value to subtract)"
                      className="w-full"
                    />
                    {editState.xpError && (
                      <p className="text-red-500 text-sm mt-1">
                        {editState.xpError}
                      </p>
                    )}
                  </div>
                </div>
              }
              onClose={() => {
                handleModalToggle('addXp', false);
                // Clear numeric
                setEditState(prev => ({
                  ...prev,
                  xpAmount: ''
                }));
                setEditState(prev => ({
                  ...prev,
                  xpError: ''
                }));
                // Reset all checkboxes
                setXpCheckboxes(
                  xpCases.reduce((acc, xpCase) => {
                    acc[xpCase.id] = false;
                    return acc;
                  }, {} as Record<string, boolean>)
                );
              }}
              onConfirm={handleAddXp}
              confirmText="Add XP"
              confirmDisabled={!editState.xpAmount || !isValidXpInput(editState.xpAmount)}
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
                        type="tel"
                        inputMode="url"
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
                    fighter: prev.fighter ? 
                      { 
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
          
          {uiState.modals.addVehicleEquipment && (
            <ItemModal
              title="Vehicle Equipment"
              onClose={() => handleModalToggle('addVehicleEquipment', false)}
              gangCredits={fighterData.gang?.credits || 0}
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.fighter?.gang_type_id || ''}
              fighterId={fighterData.fighter?.id || ''}
              vehicleId={fighterData.fighter?.vehicles?.[0]?.id}
              vehicleType={fighterData.fighter?.vehicles?.[0]?.vehicle_type}
              vehicleTypeId={fighterData.fighter?.vehicles?.[0]?.vehicle_type_id}
              fighterTypeId={fighterData.fighter?.vehicles?.[0]?.vehicle_type_id || ''}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentBought={(newFighterCredits, newGangCredits, equipment) => 
                handleEquipmentBought(newFighterCredits, newGangCredits, equipment, true)
              }
              isVehicleEquipment={true}
              allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
            />
          )}
          
          {deleteVehicleEquipmentData && (
            <Modal
              title="Confirm Deletion"
              onClose={() => setDeleteVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentDelete}
            >
              <p>Are you sure you want to delete {deleteVehicleEquipmentData.name}? This action cannot be undone.</p>
            </Modal>
          )}
          
          {stashVehicleEquipmentData && (
            <Modal
              title="Confirm Stash"
              onClose={() => setStashVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentStash}
            >
              <p>Are you sure you want to stash {stashVehicleEquipmentData.name}? This action cannot be undone.</p>
            </Modal>
          )}
          
          {sellVehicleEquipmentData && (
            <Modal
              title="Confirm Sale"
              content={
                <div className="space-y-4">
                  <p>Are you sure you want to sell {sellVehicleEquipmentData.name}?</p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sale price</label>
                    <Input
                      type="number"
                      value={sellVehicleEquipmentData.cost}
                      onChange={(e) => setSellVehicleEquipmentData(prev => prev ? {
                        ...prev,
                        cost: parseInt(e.target.value) || 0
                      } : null)}
                      className="w-full"
                    />
                  </div>
                </div>
              }
              onClose={() => setSellVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentSell}
            />
          )}
        </div>
      </div>
    </main>
  );
}
