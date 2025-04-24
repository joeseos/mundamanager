'use client';

import { createClient } from "@/utils/supabase/client";
import { Skill, FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { useState, useEffect, useCallback, useMemo, use } from 'react';
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/equipment";
import { Equipment, WeaponProfile } from '@/types/equipment';
import dynamic from 'next/dynamic';
import { AdvancementsList, AdvancementModal } from "@/components/fighter/fighter-advancement-list";
import { SkillsList } from "@/components/fighter/fighter-skills-list";
import { InjuriesList } from "@/components/fighter/fighter-injury-list";
import { NotesList } from "@/components/fighter/fighter-notes-list";
import { Input } from "@/components/ui/input";
import { FighterWeaponsTable } from "@/components/fighter/fighter-weapons-list";
import { FighterEffects, VehicleEquipment, VehicleEquipmentProfile } from '@/types/fighter';
import { vehicleExclusiveCategories, vehicleCompatibleCategories, VEHICLE_EQUIPMENT_CATEGORIES } from '@/utils/vehicleEquipmentCategories';
import { useSession } from '@/hooks/use-session';
import { EditFighterModal } from "@/components/fighter/fighter-edit-modal";
import { FighterProps } from '@/types/fighter';
import { Plus, Minus, X } from "lucide-react";
import { Vehicle } from '@/types/fighter';

// Dynamically import heavy components
const WeaponTable = dynamic(() => import('@/components/gang/fighter-card-weapon-table'), {
  loading: () => <p>Loading weapons...</p>,
  ssr: false
});

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
  fighter_type: {
    fighter_type: string;
    fighter_type_id: string;
  };
  fighter_class?: string;
  label?: string;
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
  xp: number;
  total_xp: number;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  free_skill?: boolean;
  kills: number;
  advancements?: {
    characteristics: Record<string, any>;
    skills: Record<string, any>;
  };
  note?: string;
  special_rules?: string[];
  cost_adjustment?: number;
  injury_advances?: number;
  skills?: FighterSkills;
  effects: {
    injuries: FighterEffect[];
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cybernetics: FighterEffect[];
    user: FighterEffect[];
  };
  vehicles?: Vehicle[];
  gang_id?: string;
  gang_type_id?: string;
  campaigns?: any[];
  weapons?: any[];
  wargear?: any[];
}

interface Gang {
  id: string;
  credits: number;
  positioning?: Record<number, string>;
  gang_type_id: string;
  rating?: number;  // Add the rating property as optional
}

// First, define our consolidated state interfaces
interface FighterPageState {
  fighter: Fighter | null;
  equipment: Equipment[];
  vehicleEquipment: VehicleEquipment[];
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
    recovery: boolean;
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

// Add this type near the top of the file or in a types file
interface FighterEffectTypeSpecificData {
  times_increased: number;
  xp_cost: number;
  credits_increase: number;
}

class FighterDeleteError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'FighterDeleteError';
  }
}

export default function FighterPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  // Replace multiple state declarations with consolidated state
  const [fighterData, setFighterData] = useState<FighterPageState>({
    fighter: null,
    equipment: [],
    vehicleEquipment: [],
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
      addVehicleEquipment: false,
      recovery: false
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
    cost: number;
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
  // const [availableInjuries, setAvailableInjuries] = useState<Array<FighterEffect>>([]);

  // Add function to fetch available injuries
  // const fetchAvailableInjuries = useCallback(async () => {
  //   try {
  //     const response = await fetch(
  //       `/api/fighters/injuries`,
  //       {
  //         method: 'GET',
  //         headers: {
  //           'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  //           'Content-Type': 'application/json',
  //         }
  //       }
  //     );
  //     if (!response.ok) throw new Error('Failed to fetch injuries');
  //     const data: FighterEffect[] = await response.json();

  //     setAvailableInjuries(data);
  //   } catch (error) {
  //     console.error('Error fetching injuries:', error);
  //     toast({
  //       description: 'Failed to load injury types',
  //       variant: "destructive"
  //     });
  //   }
  // }, [toast]);

  // Update the fetchFighterData callback
  const fetchFighterData = useCallback(async () => {
    if (!params.id) {
      console.error('No fighter ID provided');
      return;
    }
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/new_get_fighter_details`,
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
      console.log(result.fighter.effects)
      console.log(result.fighter.effects.injuries)
      var testing: FighterEffect[] = result.fighter.effects.injuries
      console.log(testing)
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

      // Transform skills
      const transformedSkills: FighterSkills = {};

      // If skills is an array, convert to object
      if (Array.isArray(result.fighter.skills)) {
        result.fighter.skills.forEach((skill: any) => {
          if (skill.name) {
            transformedSkills[skill.name] = {
              id: skill.id,
              credits_increase: skill.credits_increase,
              xp_cost: skill.xp_cost,
              is_advance: skill.is_advance,
              acquired_at: skill.acquired_at,
              fighter_injury_id: skill.fighter_injury_id
            };
          }
        });
      }
      // If skills is already an object, use it directly
      else if (typeof result.fighter.skills === 'object' && result.fighter.skills !== null) {
        Object.assign(transformedSkills, result.fighter.skills);
      }

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
          skills: transformedSkills,
          effects: {
            injuries: result.fighter.effects?.injuries || [],
            advancements: result.fighter.effects?.advancements || [],
            bionics: result.fighter.effects?.bionics || [],
            cybernetics: result.fighter.effects?.cybernetics || [],
            user: result.fighter.effects?.user || []
          }
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
    // fetchAvailableInjuries();
  }, [fetchFighterData]);

  const handleDeleteFighter = useCallback(async () => {
    if (!fighterData.fighter || !fighterData.gang) return;

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new FighterDeleteError('You must be logged in to delete a fighter', 401);
      }

      const deleteResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighters?id=eq.${fighterData.fighter.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=representation' // Ask for the deleted record to be returned
          }
        }
      );

      // First check if the response is ok
      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => null);

        switch (deleteResponse.status) {
          case 401:
            throw new FighterDeleteError('Your session has expired. Please log in again.', 401);
          case 403:
            throw new FighterDeleteError('You do not have permission to delete this fighter', 403);
          case 404:
            throw new FighterDeleteError('Fighter not found', 404);
          default:
            throw new FighterDeleteError(
              errorData?.message || 'An unexpected error occurred while deleting the fighter',
              deleteResponse.status
            );
        }
      }

      // Try to get the deleted data to confirm deletion
      const deletedData = await deleteResponse.json().catch(() => null);

      // If we got no data back or empty array, the delete didn't work
      if (!deletedData || (Array.isArray(deletedData) && deletedData.length === 0)) {
        throw new FighterDeleteError('Fighter could not be deleted - no changes made', 403);
      }

      // Only show success and redirect if we get here
      toast({
        description: `${fighterData.fighter.fighter_name} has been successfully deleted.`,
        variant: "default"
      });

      router.push(`/gang/${fighterData.gang.id}`);
    } catch (error) {
      console.error('Error deleting fighter:', {
        error,
        fighterId: fighterData.fighter.id,
        fighterName: fighterData.fighter.fighter_name
      });

      const message = error instanceof FighterDeleteError
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      toast({
        title: "Error",
        description: message,
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
            fighter_equipment_id: boughtEquipment.equipment_id,
            equipment_id: boughtEquipment.equipment_id,
            equipment_name: boughtEquipment.equipment_name,
            equipment_type: boughtEquipment.equipment_type,
            cost: boughtEquipment.cost,
            base_cost: boughtEquipment.cost,
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

    const amount = parseInt(editState.xpAmount || '0');

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
  const xpCountCases = [
    { id: 'seriousInjury', label: 'Cause Serious Injury', xp: 1 },
    { id: 'outOfAction', label: 'Cause OOA', xp: 2 },
    { id: 'leaderChampionBonus', label: 'Leader/Champion', xp: 1 },
    { id: 'vehicleWrecked', label: 'Wreck Vehicle', xp: 2 },
  ];

  const xpCheckboxCases = [
    { id: 'battleParticipation', label: 'Battle Participation', xp: 1 },
    { id: 'rally', label: 'Successful Rally', xp: 1 },
    { id: 'assistance', label: 'Provide Assistance', xp: 1 },
  ];


  // Track which of these XP events are checked
  const [xpCounts, setXpCounts] = useState(
    xpCountCases.reduce((acc, xpCase) => {
      acc[xpCase.id] = 0;
      return acc;
    }, {} as Record<string, number>)
  );

  const [xpCheckboxes, setXpCheckboxes] = useState(
    xpCheckboxCases.reduce((acc, xpCase) => {
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

  const handleXpCountChange = (id: string, value: number) => {
    setXpCounts(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Compute total from checkboxes
  const totalXpFromCountsAndCheckboxes =
    Object.entries(xpCounts).reduce((sum, [id, count]) => {
      const xpCase = xpCountCases.find(x => x.id === id);
      return sum + (xpCase ? xpCase.xp * count : 0);
    }, 0) +
    xpCheckboxCases.reduce((sum, xpCase) => {
      return xpCheckboxes[xpCase.id] ? sum + xpCase.xp : sum;
    }, 0);


  useEffect(() => {
    // Convert to string since editState.xpAmount is a string
    setEditState(prev => ({ ...prev, xpAmount: totalXpFromCountsAndCheckboxes === 0 ? "" : String(totalXpFromCountsAndCheckboxes) }));
  }, [totalXpFromCountsAndCheckboxes, setEditState]);


  const handleAdvancementAdded = () => {
    // Simply call fetchFighterData (not refreshFighterData)
    fetchFighterData();
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

  const handleRecoveryFighter = useCallback(async () => {
    if (!fighterData.fighter) return;

    const newRecoveryState = !fighterData.fighter.recovery;

    try {
      const response = await fetch(`/api/fighters/${fighterData.fighter.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recovery: newRecoveryState
        }),
      });

      if (!response.ok) {
        throw new Error(fighterData.fighter.recovery ? 'Failed to remove recovery status' : 'Failed to set recovery status');
      }

      toast({
        description: fighterData.fighter.recovery
          ? `${fighterData.fighter.fighter_name} has been cleared from recovery.`
          : `${fighterData.fighter.fighter_name} has been sent to recovery.`,
        variant: "default"
      });

      await fetchFighterData();
    } catch (error) {
      console.error('Error updating fighter recovery status:', error);
      toast({
        description: fighterData.fighter.recovery
          ? 'Failed to clear recovery status. Please try again.'
          : 'Failed to set recovery status. Please try again.',
        variant: "destructive"
      });
    } finally {
      setUiState(prev => ({
        ...prev,
        modals: {
          ...prev.modals,
          recovery: false
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
      // Use the session from the hook instead of creating a new client
      if (!session) {
        toast({
          description: "You must be logged in to delete skills",
          variant: "destructive"
        });
        return;
      }

      const rpcEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_skill_or_effect`;

      const response = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          input_fighter_id: params.id,
          fighter_skill_id: skillId
        })
      });

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
      // Use the session from the hook
      if (!session) {
        toast({
          description: "You must be logged in to delete injuries",
          variant: "destructive"
        });
        return;
      }

      const rpcEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_skill_or_effect`;

      const response = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          input_fighter_id: params.id,
          fighter_effect_id: injuryId
        })
      });

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
    setEditState({
      name: fighterData.fighter?.fighter_name || '',
      label: fighterData.fighter?.label || '',
      kills: fighterData.fighter?.kills || 0,
      costAdjustment: String(fighterData.fighter?.cost_adjustment || 0),
      xpAmount: '',
      xpError: ''
    });
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
      const equipmentToRemove = fighterData.vehicleEquipment.find(
        e => e.fighter_equipment_id === fighterEquipmentId
      );

      if (!equipmentToRemove) {
        toast({
          title: "Error",
          description: "Equipment not found",
          variant: "destructive"
        });
        return;
      }

      // Show confirmation modal - THIS IS THE KEY PART
      setDeleteVehicleEquipmentData({
        id: equipmentToRemove.fighter_equipment_id,
        equipmentId: equipmentToRemove.equipment_id,
        name: equipmentToRemove.equipment_name,
        cost: equipmentToRemove.cost || 0
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
            'Authorization': `Bearer ${session.access_token}`
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
            'Authorization': `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({
            in_fighter_equipment_id: stashVehicleEquipmentData.id,
            in_user_id: session?.user?.id
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
            'Authorization': `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({
            fighter_equipment_id: sellVehicleEquipmentData.id,
            manual_cost: sellVehicleEquipmentData.cost,
            in_user_id: session?.user?.id
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


  // Add a useEffect to fetch and store the vehicle type ID when needed
  const [vehicleTypeIdMap, setVehicleTypeIdMap] = useState<Record<string, string>>({});

  // Add this useEffect to fetch vehicle type IDs when needed
  useEffect(() => {
    const fetchVehicleTypeId = async (vehicleType: string) => {
      if (!vehicleType || vehicleTypeIdMap[vehicleType]) return;

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) return;

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/vehicle_types?select=id&vehicle_type=eq.${encodeURIComponent(vehicleType)}`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );

        if (!response.ok) throw new Error('Failed to fetch vehicle type ID');
        const data = await response.json();

        if (data && data.length > 0) {
          console.log(`Found ID ${data[0].id} for vehicle type: ${vehicleType}`);
          setVehicleTypeIdMap(prev => ({
            ...prev,
            [vehicleType]: data[0].id
          }));
        }
      } catch (error) {
        console.error('Error fetching vehicle type ID:', error);
      }
    };

    // Fix the null/undefined checks
    if (fighterData.fighter && fighterData.fighter.vehicles && fighterData.fighter.vehicles.length > 0) {
      fighterData.fighter.vehicles.forEach(vehicle => {
        if (vehicle.vehicle_type) {
          fetchVehicleTypeId(vehicle.vehicle_type);
        }
      });
    }
  }, [fighterData.fighter, vehicleTypeIdMap]);

  const handleDeleteAdvancement = async (advancementId: string) => {
    // First check if this is a skill advancement (exists in skills)
    const isSkill = Object.values(fighterData.fighter?.skills || {}).some(
      skill => skill.id === advancementId
    );

    // Find skill name if it's a skill
    let skillName = '';
    if (isSkill) {
      Object.entries(fighterData.fighter?.skills || {}).forEach(([name, skill]) => {
        if (skill.id === advancementId) {
          skillName = name;
        }
      });
    }

    if (isSkill) {
      // Handle as a skill deletion
      try {
        // Use the session from the hook
        if (!session) {
          toast({
            description: "You must be logged in to delete skills",
            variant: "destructive"
          });
          return;
        }

        // Find the skill to get its XP cost
        const skills = fighterData.fighter?.skills || {};
        const skill = skills[skillName];
        const xpCost = skill?.xp_cost || 0;

        // Optimistically update the state
        setFighterData(prev => {
          if (!prev.fighter) return prev;

          // Create a new skills object without the deleted skill
          const updatedSkills = { ...prev.fighter.skills };
          delete updatedSkills[skillName];

          return {
            ...prev,
            fighter: {
              ...prev.fighter,
              xp: (prev.fighter.xp || 0) + xpCost,
              total_xp: (prev.fighter.total_xp || 0) + xpCost,
              skills: updatedSkills
            }
          };
        });

        const rpcEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_skill_or_effect`;

        const response = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            input_fighter_id: params.id,
            fighter_skill_id: advancementId
          })
        });

        if (!response.ok) {
          throw new Error('Failed to delete skill');
        }

        toast({
          description: "Skill advancement successfully deleted.",
          variant: "default"
        });
      } catch (error) {
        console.error('Error deleting skill advancement:', error);
        // Revert the optimistic update by refetching the data
        await fetchFighterData();
        toast({
          description: 'Failed to delete skill advancement. Please try again.',
          variant: "destructive"
        });
      }
    } else {
      // Handle as a regular advancement deletion
      try {
        // Optimistically update the state
        setFighterData(prev => {
          if (!prev.fighter) return prev;

          // Find the advancement being deleted to get its XP cost
          const advancement = prev.fighter.effects.advancements.find(
            adv => adv.id === advancementId
          );

          // Get XP cost from type_specific_data
          const xpCost = typeof advancement?.type_specific_data === 'object'
            ? (advancement.type_specific_data as FighterEffectTypeSpecificData)?.xp_cost || 0
            : 0;

          // Calculate new XP values by adding back the advancement's XP cost
          const newXp = (prev.fighter.xp || 0) + xpCost;
          const newTotalXp = (prev.fighter.total_xp || 0) + xpCost;

          // Create new fighter state with filtered advancements and updated XP values
          return {
            ...prev,
            fighter: {
              ...prev.fighter,
              xp: newXp,
              total_xp: newTotalXp,
              effects: {
                ...prev.fighter.effects,
                advancements: prev.fighter.effects.advancements.filter(
                  adv => adv.id !== advancementId
                )
              }
            }
          };
        });

        const rpcEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_skill_or_effect`;

        const response = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            'Authorization': session ? `Bearer ${session.access_token}` : ''
          },
          body: JSON.stringify({
            input_fighter_id: params.id,
            fighter_effect_id: advancementId
          })
        });

        if (!response.ok) {
          throw new Error('Failed to delete advancement');
        }

        toast({
          description: "Advancement successfully deleted.",
          variant: "default"
        });
      } catch (error) {
        console.error('Error deleting advancement:', error);
        // Revert the optimistic update by refetching the data
        await fetchFighterData();
        toast({
          description: 'Failed to delete advancement',
          variant: "destructive"
        });
      }
    }
  };

  // Safely convert skills to the expected format for AdvancementsList component
  const getSkillsForAdvancements = () => {
    const skills = fighterData.fighter?.skills;

    // If skills is already a Record/object with string keys
    if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
      return skills;
    }

    // If skills is an array, convert it to a Record
    if (Array.isArray(skills)) {
      return skills.reduce((acc, skill) => {
        if (skill && skill.name) {
          acc[skill.name] = {
            id: skill.id,
            credits_increase: skill.credits_increase,
            xp_cost: skill.xp_cost,
            is_advance: skill.is_advance,
            acquired_at: skill.acquired_at,
            fighter_injury_id: skill.fighter_injury_id
          };
        }
        return acc;
      }, {} as Record<string, {
        id: string;
        credits_increase: number;
        xp_cost?: number;
        is_advance: boolean;
        acquired_at: string;
        fighter_injury_id?: string | null;
      }>);
    }

    // Default to empty object if skills is undefined or null
    return {};
  };

  // Add the useSession hook at the top of your component
  const session = useSession();

  // Add a function to handle fighter stat updates
  const handleFighterStatsUpdate = (updatedFighter: any) => {
    setFighterData(prev => {
      if (!prev.fighter) return prev;

      return {
        ...prev,
        fighter: {
          ...prev.fighter,
          // Update stats from updatedFighter but preserve fighter_type object structure
          movement: updatedFighter.movement || prev.fighter.movement,
          weapon_skill: updatedFighter.weapon_skill || prev.fighter.weapon_skill,
          ballistic_skill: updatedFighter.ballistic_skill || prev.fighter.ballistic_skill,
          strength: updatedFighter.strength || prev.fighter.strength,
          toughness: updatedFighter.toughness || prev.fighter.toughness,
          wounds: updatedFighter.wounds || prev.fighter.wounds,
          initiative: updatedFighter.initiative || prev.fighter.initiative,
          attacks: updatedFighter.attacks || prev.fighter.attacks,
          leadership: updatedFighter.leadership || prev.fighter.leadership,
          cool: updatedFighter.cool || prev.fighter.cool,
          willpower: updatedFighter.willpower || prev.fighter.willpower,
          intelligence: updatedFighter.intelligence || prev.fighter.intelligence,
          // Update effects but preserve structure
          effects: {
            ...prev.fighter.effects,
            injuries: updatedFighter.effects?.injuries || prev.fighter.effects.injuries,
            advancements: updatedFighter.effects?.advancements || prev.fighter.effects.advancements,
            bionics: updatedFighter.effects?.bionics || prev.fighter.effects.bionics,
            cybernetics: updatedFighter.effects?.cybernetics || prev.fighter.effects.cybernetics,
            user: updatedFighter.effects?.user || prev.fighter.effects.user
          }
        }
      };
    });
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

  const vehicle = fighterData.fighter?.vehicles?.[0];

  const getPillColor = (occupied: number | undefined, total: number | undefined) => {
    const occupiedValue = occupied || 0;
    const totalValue = total || 0;
    
    if (occupiedValue > totalValue) return "bg-red-500";
    if (occupiedValue === totalValue) return "bg-gray-500";
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
            type={fighterData.fighter?.fighter_type?.fighter_type || ''}
            credits={fighterData.fighter?.credits || 0}
            movement={fighterData.fighter?.movement || 0}
            weapon_skill={fighterData.fighter?.weapon_skill || 0}
            ballistic_skill={fighterData.fighter?.ballistic_skill || 0}
            strength={fighterData.fighter?.strength || 0}
            toughness={fighterData.fighter?.toughness || 0}
            wounds={fighterData.fighter?.wounds || 0}
            initiative={fighterData.fighter?.initiative || 0}
            attacks={fighterData.fighter?.attacks || 0}
            leadership={fighterData.fighter?.leadership || 0}
            cool={fighterData.fighter?.cool || 0}
            willpower={fighterData.fighter?.willpower || 0}
            intelligence={fighterData.fighter?.intelligence || 0}
            xp={fighterData.fighter?.xp || 0}
            total_xp={fighterData.fighter?.total_xp || 0}
            advancements={fighterData.fighter?.advancements || { characteristics: {}, skills: {} }}
            onNameUpdate={handleNameUpdate}
            onAddXp={() => handleModalToggle('addXp', true)}
            onEdit={() => handleModalToggle('editFighter', true)}
            killed={fighterData.fighter?.killed}
            retired={fighterData.fighter?.retired}
            enslaved={fighterData.fighter?.enslaved}
            starved={fighterData.fighter?.starved}
            recovery={fighterData.fighter?.recovery}
            fighter_class={fighterData.fighter?.fighter_class}
            kills={fighterData.fighter?.kills || 0}
            effects={fighterData.fighter.effects || { injuries: [], advancements: [] }}
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
            advancements={fighterData.fighter?.effects?.advancements || []}
            skills={getSkillsForAdvancements()}
            fighterId={params.id}
            fighterXp={fighterData.fighter?.xp || 0}
            onDeleteAdvancement={handleDeleteAdvancement}
            onAdvancementAdded={handleAdvancementAdded}
          />

          <InjuriesList
            injuries={fighterData.fighter?.effects.injuries || []}
            onDeleteInjury={handleDeleteInjury}
            fighterId={fighterData.fighter?.id || ''}
            onInjuryAdded={fetchFighterData}
            fighterRecovery={fighterData.fighter?.recovery || false}
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

          {uiState.modals.addVehicleEquipment && fighterData.fighter?.vehicles?.[0] && (
            <ItemModal
              title="Vehicle Equipment"
              onClose={() => handleModalToggle('addVehicleEquipment', false)}
              gangCredits={fighterData.gang?.credits || 0}
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.fighter?.gang_type_id || ''}
              fighterId={fighterData.fighter?.id || ''}
              fighterTypeId={fighterData.fighter?.fighter_type?.fighter_type_id || ''}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentBought={(newFighterCredits, newGangCredits, equipment) =>
                handleEquipmentBought(newFighterCredits, newGangCredits, equipment, true)}
              vehicleId={fighterData.fighter.vehicles[0].id}
              vehicleType={fighterData.fighter.vehicles[0].vehicle_type}
              vehicleTypeId={
                vehicleTypeIdMap[fighterData.fighter.vehicles[0].vehicle_type] ||
                undefined
              }
              isVehicleEquipment={true}
              allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
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
                variant={fighterData.fighter?.recovery ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('recovery', true)}
              >
                {fighterData.fighter?.recovery ? 'Recover Fighter' : 'Send to Recovery'}
              </Button>
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
              title="Delete Fighter"
              content={
                <div>
                  <p>Are you sure you want to delete "{fighterData.fighter?.fighter_name}"?</p>
                  <br />
                  <p>This action cannot be undone.</p>
                </div>
              }
              onClose={() => handleModalToggle('delete', false)}
              onConfirm={handleDeleteFighter}
            />
          )}

          {uiState.modals.kill && (
            <Modal
              title={fighterData.fighter?.killed ? 'Confirm Resurrection' : 'Confirm Kill'}
              content={
                fighterData.fighter?.killed
                  ? `Are you sure you want to resurrect "${fighterData.fighter?.fighter_name}"?`
                  : `Are you sure "${fighterData.fighter?.fighter_name}" was killed in action?`
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
                  ? `Are you sure you want to bring "${fighterData.fighter?.fighter_name}" out of retirement?`
                  : `Are you sure you want to retire "${fighterData.fighter?.fighter_name}"?`
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
                  <span className="mr-2 text-sm text-gray-600">Fighter XP</span>
                  <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">
                    {fighterData.fighter.xp ?? 0}
                  </span>
                </div>
              }
              content={
                <div className="space-y-4">
                  <div className="space-y-2">
                    {/* Repeatable XP with counters */}
                    {xpCountCases.map((xpCase) => (
                      <div key={xpCase.id} className="flex items-center justify-between">
                        <label className="text-sm text-gray-800">
                          {xpCase.label} (+{xpCase.xp} XP each)
                        </label>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                            onClick={() => handleXpCountChange(xpCase.id, Math.max(0, xpCounts[xpCase.id] - 1))}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-6 text-center">{xpCounts[xpCase.id]}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                            onClick={() => handleXpCountChange(xpCase.id, xpCounts[xpCase.id] + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Separator after the first three */}
                    <hr className="my-2 border-gray-300" />

                    {/* Single XP Checkboxes */}
                    {xpCheckboxCases.map((xpCase, idx, arr) => (
                      <div key={xpCase.id}>
                        <div className="flex items-center justify-between mb-2 mr-[52px]">
                          <label htmlFor={xpCase.id} className="text-sm text-gray-800">
                            {xpCase.label} (+{xpCase.xp} XP)
                          </label>
                          <input
                            type="checkbox"
                            id={xpCase.id}
                            checked={xpCheckboxes[xpCase.id]}
                            onChange={() => handleXpCheckboxChange(xpCase.id)}
                            className="h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </div>
                        {/* Only show a separator if it's not the last item in this slice */}
                        {idx < arr.length - 1 && <hr className="my-2 border-gray-300" />}
                      </div>
                    ))}
                  </div>

                  {/* XP Summary */}
                  <div className="text-xs text-gray-600">
                    <div>Total XP: {totalXpFromCountsAndCheckboxes}</div>
                    <div>Below value can be overridden (use a negative value to subtract)</div>
                  </div>

                  {/* Manual Override */}
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
                        xpError: '',
                      }));
                    }}
                    placeholder="XP Amount"
                    className="w-full"
                  />
                  {editState.xpError && (
                    <p className="text-red-500 text-sm mt-1">{editState.xpError}</p>
                  )}
                </div>
              }
              onClose={() => {
                handleModalToggle('addXp', false);
                // Clear numeric
                setEditState((prev) => ({
                  ...prev,
                  xpAmount: '',
                  xpError: '',
                }));
                // Reset all checkboxes
                setXpCheckboxes(
                  xpCheckboxCases.reduce((acc, xpCase) => {
                    acc[xpCase.id] = false;
                    return acc;
                  }, {} as Record<string, boolean>)
                );
                setXpCounts(
                  xpCountCases.reduce((acc, xpCase) => {
                    acc[xpCase.id] = 0;
                    return acc;
                  }, {} as Record<string, number>)
                );
              }}
              onConfirm={handleAddXp}
              confirmText={parseInt(editState.xpAmount || '0', 10) < 0 ? 'Subtract XP' : 'Add XP'}
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
                  ? `Are you sure you want to rescue "${fighterData.fighter?.fighter_name}" from the Guilders?`
                  : `Are you sure you want to sell "${fighterData.fighter?.fighter_name}" to the Guilders?`
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
            <EditFighterModal
              fighter={{
                ...fighterData.fighter,
                // Add missing properties expected by FighterProps
                base_stats: {
                  movement: fighterData.fighter.movement,
                  weapon_skill: fighterData.fighter.weapon_skill,
                  ballistic_skill: fighterData.fighter.ballistic_skill,
                  strength: fighterData.fighter.strength,
                  toughness: fighterData.fighter.toughness,
                  wounds: fighterData.fighter.wounds,
                  initiative: fighterData.fighter.initiative,
                  attacks: fighterData.fighter.attacks,
                  leadership: fighterData.fighter.leadership,
                  cool: fighterData.fighter.cool,
                  willpower: fighterData.fighter.willpower,
                  intelligence: fighterData.fighter.intelligence
                },
                current_stats: {
                  movement: fighterData.fighter.movement,
                  weapon_skill: fighterData.fighter.weapon_skill,
                  ballistic_skill: fighterData.fighter.ballistic_skill,
                  strength: fighterData.fighter.strength,
                  toughness: fighterData.fighter.toughness,
                  wounds: fighterData.fighter.wounds,
                  initiative: fighterData.fighter.initiative,
                  attacks: fighterData.fighter.attacks,
                  leadership: fighterData.fighter.leadership,
                  cool: fighterData.fighter.cool,
                  willpower: fighterData.fighter.willpower,
                  intelligence: fighterData.fighter.intelligence
                },
                // Convert fighter_type from object to string if needed
                fighter_type: typeof fighterData.fighter.fighter_type === 'object' 
                  ? fighterData.fighter.fighter_type.fighter_type 
                  : fighterData.fighter.fighter_type
              } as any}
              isOpen={uiState.modals.editFighter}
              initialValues={{
                name: fighterData.fighter?.fighter_name || '',
                label: fighterData.fighter?.label || '',
                kills: fighterData.fighter?.kills || 0,
                costAdjustment: String(fighterData.fighter?.cost_adjustment || 0)
              }}
              onClose={() => {
                handleModalToggle('editFighter', false);
              }}
              onSubmit={async (values) => {
                try {
                  const response = await fetch(`/api/fighters/${fighterData.fighter?.id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      fighter_name: values.name,
                      label: values.label,
                      kills: values.kills,
                      cost_adjustment: values.costAdjustment === '' || values.costAdjustment === '-' 
                        ? 0 
                        : Number(values.costAdjustment),
                      fighter_class: values.fighter_class,
                      fighter_class_id: values.fighter_class_id,
                      fighter_type: values.fighter_type,
                      fighter_type_id: values.fighter_type_id,
                      special_rules: values.special_rules
                    }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter');

                  handleNameUpdate(values.name);
                  
                  // Refresh fighter data to get the updated type information
                  await fetchFighterData();
                  
                  toast({
                    description: "Fighter updated successfully",
                    variant: "default"
                  });
                  
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
              onStatsUpdate={(updatedFighter) => {
                // Use the handleFighterStatsUpdate function we defined above
                handleFighterStatsUpdate(updatedFighter);
              }}
            />
          )}

          {deleteVehicleEquipmentData && (
            <Modal
              title="Delete Vehicle Equipment"
              content={
                <div>
                  <p>Are you sure you want to delete "{deleteVehicleEquipmentData.name}"?</p>
                  <br />
                  <p>This action cannot be undone.</p>
                </div>
              }
              onClose={() => setDeleteVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentDelete}
            />
          )}

          {sellVehicleEquipmentData && (
            <Modal
              title="Confirm Sell"
              content={
                <div>
                  <p>Are you sure you want to sell {sellVehicleEquipmentData.name} for {sellVehicleEquipmentData.cost} credits?</p>
                </div>
              }
              onClose={() => setSellVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentSell}
            />
          )}

          {stashVehicleEquipmentData && (
            <Modal
              title="Confirm Stash"
              content={
                <div>
                  <p>Are you sure you want to move {stashVehicleEquipmentData.name} to the gang stash?</p>
                </div>
              }
              onClose={() => setStashVehicleEquipmentData(null)}
              onConfirm={handleConfirmVehicleEquipmentStash}
            />
          )}

          {uiState.modals.recovery && (
            <Modal
              title={fighterData.fighter?.recovery ? 'Clear Recovery Status' : 'Send to Recovery'}
              content={
                fighterData.fighter?.recovery
                  ? `Are you sure you want to clear the recovery status for "${fighterData.fighter?.fighter_name}"?`
                  : `Are you sure you want to send "${fighterData.fighter?.fighter_name}" to recovery?`
              }
              onClose={() => handleModalToggle('recovery', false)}
              onConfirm={handleRecoveryFighter}
            />
          )}
        </div>
      </div>
    </main>
  );
}
