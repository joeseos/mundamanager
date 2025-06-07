'use client';

import { createClient } from "@/utils/supabase/client";
import { Skill, FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/equipment";
import { Equipment, WeaponProfile } from '@/types/equipment';
import { AdvancementsList, AdvancementModal } from "@/components/fighter/fighter-advancement-list";
import { SkillsList } from "@/components/fighter/fighter-skills-list";
import { InjuriesList } from "@/components/fighter/fighter-injury-list";
import { NotesList } from "@/components/fighter/fighter-notes-list";
import { Input } from "@/components/ui/input";
import { FighterEffects, VehicleEquipment, VehicleEquipmentProfile } from '@/types/fighter';
import { vehicleExclusiveCategories, vehicleCompatibleCategories, VEHICLE_EQUIPMENT_CATEGORIES } from '@/utils/vehicleEquipmentCategories';
import { useSession } from '@/hooks/use-session';
import { EditFighterModal } from "@/components/fighter/fighter-edit-modal";
import { FighterProps } from '@/types/fighter';
import { Plus, Minus, X } from "lucide-react";
import { Vehicle } from '@/types/fighter';
import { VehicleDamagesList } from "@/components/fighter/vehicle-lasting-damages";
import { FighterXpModal } from "@/components/fighter/fighter-xp-modal";
import { List } from "@/components/ui/list";

interface UserPermissions {
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  userId: string;
}

interface FighterPageProps {
  initialFighterData: any;
  initialGangFighters: Array<{
    id: string;
    fighter_name: string;
    fighter_type: string;
    xp: number | null;
  }>;
  userPermissions: UserPermissions;
  fighterId: string;
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
  fighter_sub_type?: {
    fighter_sub_type: string;
    fighter_sub_type_id: string;
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
    cyberteknika: FighterEffect[];
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
  rating?: number;
}

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

export default function FighterPage({ 
  initialFighterData, 
  initialGangFighters, 
  userPermissions, 
  fighterId 
}: FighterPageProps) {
  // Transform initial data and set up state
  const [fighterData, setFighterData] = useState<FighterPageState>(() => {
    // Transform skills
    const transformedSkills: FighterSkills = {};
    if (Array.isArray(initialFighterData.fighter.skills)) {
      initialFighterData.fighter.skills.forEach((skill: any) => {
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
    } else if (typeof initialFighterData.fighter.skills === 'object' && initialFighterData.fighter.skills !== null) {
      Object.assign(transformedSkills, initialFighterData.fighter.skills);
    }

    // Transform equipment
    const transformedEquipment = (initialFighterData.equipment || []).map((item: any) => ({
      fighter_equipment_id: item.fighter_equipment_id,
      equipment_id: item.equipment_id,
      equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
        ? `${item.equipment_name} (Master-crafted)`
        : item.equipment_name,
      equipment_type: item.equipment_type,
      cost: item.purchase_cost,
      base_cost: item.original_cost,
      weapon_profiles: item.weapon_profiles,
      core_equipment: item.core_equipment,
      is_master_crafted: item.is_master_crafted
    }));

    // Transform vehicle equipment
    const transformedVehicleEquipment = (initialFighterData.fighter?.vehicles?.[0]?.equipment || []).map((item: any) => ({
      fighter_equipment_id: item.fighter_equipment_id,
      equipment_id: item.equipment_id,
      equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
        ? `${item.equipment_name} (Master-crafted)`
        : item.equipment_name,
      equipment_type: item.equipment_type,
      cost: item.purchase_cost,
      base_cost: item.original_cost,
      vehicle_equipment_profiles: item.vehicle_equipment_profiles || [],
      core_equipment: false,
      vehicle_id: initialFighterData.fighter?.vehicles?.[0]?.id,
      vehicle_equipment_id: item.id
    }));

    return {
      fighter: {
        ...initialFighterData.fighter,
        fighter_class: initialFighterData.fighter.fighter_class,
        fighter_type: initialFighterData.fighter.fighter_type,
        base_credits: initialFighterData.fighter.credits - (initialFighterData.fighter.cost_adjustment || 0),
        gang_id: initialFighterData.gang.id,
        gang_type_id: initialFighterData.gang.gang_type_id,
        skills: transformedSkills,
        effects: {
          injuries: initialFighterData.fighter.effects?.injuries || [],
          advancements: initialFighterData.fighter.effects?.advancements || [],
          bionics: initialFighterData.fighter.effects?.bionics || [],
          cyberteknika: initialFighterData.fighter.effects?.cyberteknika || [],
          user: initialFighterData.fighter.effects?.user || []
        }
      },
      equipment: transformedEquipment,
      vehicleEquipment: transformedVehicleEquipment,
      gang: {
        id: initialFighterData.gang.id,
        credits: initialFighterData.gang.credits,
        gang_type_id: initialFighterData.gang.gang_type_id,
        positioning: initialFighterData.gang.positioning
      },
      gangFighters: initialGangFighters
    };
  });

  const [uiState, setUiState] = useState<UIState>({
    isLoading: false,
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

  // Update the fetchFighterData callback to use fighterId instead of params.id
  const fetchFighterData = useCallback(async () => {
    if (!fighterId) {
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
            "input_fighter_id": fighterId
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Failed to fetch fighter details');
      }

      const responseData = await response.json();
      console.log('RPC Response:', responseData);
      
      // Handle different response structures with better error checking
      let result;
      if (Array.isArray(responseData)) {
        if (responseData.length === 0) {
          throw new Error('No fighter data returned from server - empty array');
        }
        
        const firstItem = responseData[0];
        if (!firstItem) {
          throw new Error('No fighter data returned from server - null first item');
        }
        
        // Check if the first item has a result property
        if (firstItem.result) {
          result = firstItem.result;
        } else {
          // If no result property, use the item directly
          result = firstItem;
        }
      } else if (responseData && typeof responseData === 'object') {
        // If it's an object, check for result property
        if (responseData.result) {
          result = responseData.result;
        } else {
          // Use the object directly
          result = responseData;
        }
      } else {
        throw new Error('Invalid response format from server');
      }

      if (!result) {
        throw new Error('No fighter data returned from server - result is null');
      }

      // Validate that result has the expected structure
      if (!result.fighter) {
        console.error('Invalid result structure:', result);
        throw new Error('Invalid fighter data structure returned from server');
      }

      // Transform regular equipment data
      const transformedEquipment = (result.equipment || []).map((item: any) => ({
        fighter_equipment_id: item.fighter_equipment_id,
        equipment_id: item.equipment_id,
        equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
          ? `${item.equipment_name} (Master-crafted)`
          : item.equipment_name,
        equipment_type: item.equipment_type,
        cost: item.purchase_cost,
        base_cost: item.original_cost,
        weapon_profiles: item.weapon_profiles,
        core_equipment: item.core_equipment,
        is_master_crafted: item.is_master_crafted
      }));
      
      // Just log the first equipment item to see the structure
      if (result.equipment && result.equipment.length > 0) {
        console.log('Equipment item original:', result.equipment[0]);
        console.log('Equipment item transformed:', transformedEquipment[0]);
      }
      console.log(result.fighter.effects)
      console.log(result.fighter.effects.injuries)
      var testing: FighterEffect[] = result.fighter.effects.injuries
      console.log(testing)
      // Transform vehicle equipment data from the nested structure
      const transformedVehicleEquipment = (result.fighter?.vehicles?.[0]?.equipment || []).map((item: any) => ({
        fighter_equipment_id: item.fighter_equipment_id,
        equipment_id: item.equipment_id,
        equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
          ? `${item.equipment_name} (Master-crafted)`
          : item.equipment_name,
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
            cyberteknika: result.fighter.effects?.cyberteknika || [],
            user: result.fighter.effects?.user || []
          }
        },
        equipment: transformedEquipment,
        vehicleEquipment: transformedVehicleEquipment,
        gang: {
          id: result.gang.id,
          credits: result.gang.credits,
          gang_type_id: result.gang.gang_type_id,
          positioning: result.gang.positioning
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
  }, [fighterId]);

  useEffect(() => {
    fetchFighterData();
  }, [fetchFighterData]);

  // Add conditional rendering based on permissions
  const canShowEditButtons = userPermissions.canEdit;
  const canShowDeleteButtons = userPermissions.canDelete;

  // Helper function to convert Fighter to FighterProps for EditFighterModal
  const convertToFighterProps = (fighter: Fighter): any => {
    return {
      ...fighter,
      base_stats: {
        movement: fighter.movement,
        weapon_skill: fighter.weapon_skill,
        ballistic_skill: fighter.ballistic_skill,
        strength: fighter.strength,
        toughness: fighter.toughness,
        wounds: fighter.wounds,
        initiative: fighter.initiative,
        attacks: fighter.attacks,
        leadership: fighter.leadership,
        cool: fighter.cool,
        willpower: fighter.willpower,
        intelligence: fighter.intelligence,
      },
      current_stats: {
        movement: fighter.movement,
        weapon_skill: fighter.weapon_skill,
        ballistic_skill: fighter.ballistic_skill,
        strength: fighter.strength,
        toughness: fighter.toughness,
        wounds: fighter.wounds,
        initiative: fighter.initiative,
        attacks: fighter.attacks,
        leadership: fighter.leadership,
        cool: fighter.cool,
        willpower: fighter.willpower,
        intelligence: fighter.intelligence,
      },
      total_xp: fighter.total_xp,
      weapons: [],
      wargear: [],
      advancements: {
        characteristics: {},
        skills: {}
      }
    };
  };

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
            'Prefer': 'return=representation'
          }
        }
      );

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

      const deletedData = await deleteResponse.json().catch(() => null);

      if (!deletedData || (Array.isArray(deletedData) && deletedData.length === 0)) {
        throw new FighterDeleteError('Fighter could not be deleted - no changes made', 403);
      }

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
    setFighterData(prev => {
      const removed = prev.equipment.find(
        e => !updatedEquipment.some(ue => ue.fighter_equipment_id === e.fighter_equipment_id)
      );
      let updatedEffects = prev.fighter?.effects;
      if (removed?.equipment_effect && updatedEffects) {
        updatedEffects = {
          ...updatedEffects,
          user: updatedEffects.user.filter(
            effect => effect.id !== removed.equipment_effect?.id
          )
        };
      }
      return {
        ...prev,
        equipment: updatedEquipment,
        fighter: prev.fighter ? {
          ...prev.fighter,
          credits: newFighterCredits,
          effects: updatedEffects || prev.fighter.effects
        } : null,
        gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null
      };
    });
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

      let updatedEffects = prev.fighter.effects;
      if (boughtEquipment.equipment_effect) {
        updatedEffects = {
          ...updatedEffects,
          user: [...(updatedEffects.user || []), boughtEquipment.equipment_effect]
        };
      }

      return {
        ...prev,
        fighter: {
          ...prev.fighter,
          credits: newFighterCredits,
          vehicles: updatedVehicles,
          effects: updatedEffects
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
      const response = await fetch(`/api/fighters/${fighterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp_to_add: amount,
          operation: 'add'
        }),
      });

      if (!response.ok) throw new Error('Failed to add XP');

      const updatedFighter = await response.json();

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

  const handleAdvancementAdded = () => {
    fetchFighterData();
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

  // Add the useSession hook
  const session = useSession();

  // Keep meat-checking functionality
  const isMeatEnabled = useCallback(() => {
    return fighterData.fighter?.campaigns?.some(campaign => campaign.has_meat) ?? false;
  }, [fighterData.fighter?.campaigns]);

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

  const getPillColor = (occupied: number | undefined, total: number | undefined) => {
    const occupiedValue = occupied || 0;
    const totalValue = total || 0;
    
    if (occupiedValue > totalValue) return "bg-red-500";
    if (occupiedValue === totalValue) return "bg-gray-500";
    return "bg-green-500";
  };

  const vehicle = fighterData.fighter?.vehicles?.[0];

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4">
          <div className="mb-4">
            <select
              value={fighterId}
              onChange={handleFighterChange}
              className="w-full p-2 border rounded"
            >
            {[...fighterData.gangFighters]
              .sort((a, b) => {
                const positioning = fighterData.gang?.positioning || {};
                const indexA = Object.entries(positioning).find(([, id]) => id === a.id)?.[0];
                const indexB = Object.entries(positioning).find(([, id]) => id === b.id)?.[0];
                const posA = indexA !== undefined ? parseInt(indexA) : Infinity;
                const posB = indexB !== undefined ? parseInt(indexB) : Infinity;
                return posA - posB;
              })
              .map((f) => (
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
            sub_type={fighterData.fighter?.fighter_sub_type}
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
            onEdit={canShowEditButtons ? () => handleModalToggle('editFighter', true) : undefined}
            killed={fighterData.fighter?.killed}
            retired={fighterData.fighter?.retired}
            enslaved={fighterData.fighter?.enslaved}
            starved={fighterData.fighter?.starved}
            recovery={fighterData.fighter?.recovery}
            fighter_class={fighterData.fighter?.fighter_class}
            kills={fighterData.fighter?.kills || 0}
            effects={fighterData.fighter.effects || { 
              injuries: [], 
              advancements: [], 
              bionics: [], 
              cyberteknika: [], 
              user: [] 
            }}
            vehicles={fighterData.fighter?.vehicles}
            gangId={fighterData.gang?.id}
            vehicleEquipment={fighterData.vehicleEquipment}
          />

          {vehicle && (
            <div className="w-full">
               <div className="flex items-center gap-1">
                 <h3 className="text-base text-gray-600">Upgrade Slots:</h3>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.body_slots_occupied, vehicle.body_slots)} text-white text-xs font-medium rounded-full`}>Body: {vehicle.body_slots_occupied}/{vehicle.body_slots}</span>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.drive_slots_occupied, vehicle.drive_slots)} text-white text-xs font-medium rounded-full`}>Drive: {vehicle.drive_slots_occupied}/{vehicle.drive_slots}</span>
                 <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(vehicle.engine_slots_occupied, vehicle.engine_slots)} text-white text-xs font-medium rounded-full`}>Engine: {vehicle.engine_slots_occupied}/{vehicle.engine_slots}</span>
               </div>
             </div>
          )}

          {/* Vehicle Equipment Section - only show if fighter has a vehicle */}
          {canShowEditButtons && vehicle && (
            <List
              title="Vehicle Equipment"
              items={fighterData.vehicleEquipment}
              columns={[
                {
                  key: 'equipment_name',
                  label: 'Name',
                  width: '75%'
                },
                {
                  key: 'cost',
                  label: 'Cost',
                  align: 'right'
                }
              ]}
              actions={[
                {
                  label: 'Stash',
                  variant: 'outline',
                  onClick: (item) => setStashVehicleEquipmentData({
                    id: item.vehicle_equipment_id,
                    equipmentId: item.equipment_id,
                    name: item.equipment_name,
                    cost: item.cost
                  })
                },
                {
                  label: 'Sell',
                  variant: 'outline',
                  onClick: (item) => setSellVehicleEquipmentData({
                    id: item.vehicle_equipment_id,
                    equipmentId: item.equipment_id,
                    name: item.equipment_name,
                    cost: item.cost
                  })
                },
                {
                  label: 'Delete',
                  variant: 'destructive',
                  onClick: (item) => setDeleteVehicleEquipmentData({
                    id: item.vehicle_equipment_id,
                    equipmentId: item.equipment_id,
                    name: item.equipment_name,
                    cost: item.cost
                  })
                }
              ]}
              onAdd={() => handleModalToggle('addVehicleEquipment', true)}
              addButtonText="Add"
              emptyMessage="No vehicle equipment installed"
            />
          )}

          {canShowEditButtons && (
            <WeaponList
              fighterId={fighterId}
              gangId={fighterData.gang?.id || ''}
              gangCredits={fighterData.gang?.credits || 0}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentUpdate={handleEquipmentUpdate}
              equipment={fighterData.equipment}
              onAddEquipment={() => handleModalToggle('addWeapon', true)}
            />
          )}

          {canShowEditButtons && (
            <SkillsList
              skills={fighterData.fighter?.skills || {}}
              onDeleteSkill={() => {}} // Will add handler later
              fighterId={fighterData.fighter?.id || ''}
              fighterXp={fighterData.fighter?.xp || 0}
              onSkillAdded={fetchFighterData}
              free_skill={fighterData.fighter?.free_skill}
            />
          )}

          {canShowEditButtons && (
            <AdvancementsList
              fighterXp={fighterData.fighter?.xp || 0}
              fighterId={fighterData.fighter?.id || ''}
              advancements={fighterData.fighter?.effects?.advancements || []}
              skills={fighterData.fighter?.skills || {}}
              onDeleteAdvancement={async (advancementId: string) => {
                // Refresh fighter data after deletion
                await fetchFighterData();
              }}
              onAdvancementAdded={fetchFighterData}
            />
          )}

          {canShowEditButtons && (
            <InjuriesList
              injuries={fighterData.fighter?.effects?.injuries || []}
              fighterId={fighterData.fighter?.id || ''}
              onDeleteInjury={async (injuryId: string) => {
                // Refresh fighter data after deletion
                await fetchFighterData();
              }}
              onInjuryAdded={fetchFighterData}
              fighterRecovery={fighterData.fighter?.recovery}
            />
          )}

          {/* Vehicle Lasting Damage Section - only show if fighter has a vehicle */}
          {canShowEditButtons && vehicle && (
            <VehicleDamagesList
              damages={vehicle.effects?.damages || []}
              onDeleteDamage={async (damageId: string) => {
                // Refresh fighter data after deletion
                await fetchFighterData();
                return true;
              }}
              fighterId={fighterData.fighter?.id || ''}
              vehicleId={vehicle.id}
              vehicle={vehicle}
              setDamages={(updateFn) => {
                // This will be handled by fetchFighterData refresh
              }}
              gangCredits={fighterData.gang?.credits || 0}
              setGangCredits={(updateFn) => {
                // This will be handled by fetchFighterData refresh
              }}
              onDamageAdded={() => {
                fetchFighterData();
              }}
              onGangCreditsChange={() => {
                fetchFighterData();
              }}
            />
          )}

          <div className="mt-6">
            {fighterData.fighter && (
              <NotesList
                fighterId={fighterData.fighter.id}
                initialNote={fighterData.fighter.note}
              />
            )}
          </div>

          {/* Action buttons with conditional rendering */}
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              {canShowEditButtons && (
                <>
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
                </>
              )}
              
              {canShowDeleteButtons && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleModalToggle('delete', true)}
                >
                  Delete Fighter
                </Button>
              )}
            </div>
          </div>

          {/* Basic modals */}
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
              title={fighterData.fighter?.killed ? "Resurrect Fighter" : "Kill Fighter"}
              content={
                <div>
                  <p>
                    {fighterData.fighter?.killed 
                      ? `Are you sure you want to resurrect "${fighterData.fighter?.fighter_name}"?`
                      : `Are you sure you want to kill "${fighterData.fighter?.fighter_name}"?`
                    }
                  </p>
                </div>
              }
              onClose={() => handleModalToggle('kill', false)}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ killed: !fighterData.fighter?.killed }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter status');

                  await fetchFighterData();
                  handleModalToggle('kill', false);
                  
                  toast({
                    description: fighterData.fighter?.killed 
                      ? 'Fighter has been resurrected' 
                      : 'Fighter has been killed',
                    variant: "default"
                  });
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.retire && (
            <Modal
              title={fighterData.fighter?.retired ? "Unretire Fighter" : "Retire Fighter"}
              content={
                <div>
                  <p>
                    {fighterData.fighter?.retired 
                      ? `Are you sure you want to unretire "${fighterData.fighter?.fighter_name}"?`
                      : `Are you sure you want to retire "${fighterData.fighter?.fighter_name}"?`
                    }
                  </p>
                </div>
              }
              onClose={() => handleModalToggle('retire', false)}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ retired: !fighterData.fighter?.retired }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter status');

                  await fetchFighterData();
                  handleModalToggle('retire', false);
                  
                  toast({
                    description: fighterData.fighter?.retired 
                      ? 'Fighter has been unretired' 
                      : 'Fighter has been retired',
                    variant: "default"
                  });
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.enslave && (
            <Modal
              title={fighterData.fighter?.enslaved ? "Rescue from Guilders" : "Sell to Guilders"}
              content={
                <div>
                  <p>
                    {fighterData.fighter?.enslaved 
                      ? `Are you sure you want to rescue "${fighterData.fighter?.fighter_name}" from the Guilders?`
                      : `Are you sure you want to sell "${fighterData.fighter?.fighter_name}" to the Guilders?`
                    }
                  </p>
                </div>
              }
              onClose={() => handleModalToggle('enslave', false)}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enslaved: !fighterData.fighter?.enslaved }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter status');

                  await fetchFighterData();
                  handleModalToggle('enslave', false);
                  
                  toast({
                    description: fighterData.fighter?.enslaved 
                      ? 'Fighter has been rescued from the Guilders' 
                      : 'Fighter has been sold to the Guilders',
                    variant: "default"
                  });
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.starve && (
            <Modal
              title={fighterData.fighter?.starved ? "Feed Fighter" : "Starve Fighter"}
              content={
                <div>
                  <p>
                    {fighterData.fighter?.starved 
                      ? `Are you sure you want to feed "${fighterData.fighter?.fighter_name}"?`
                      : `Are you sure you want to starve "${fighterData.fighter?.fighter_name}"?`
                    }
                  </p>
                </div>
              }
              onClose={() => handleModalToggle('starve', false)}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ starved: !fighterData.fighter?.starved }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter status');

                  await fetchFighterData();
                  handleModalToggle('starve', false);
                  
                  toast({
                    description: fighterData.fighter?.starved 
                      ? 'Fighter has been fed' 
                      : 'Fighter has been starved',
                    variant: "default"
                  });
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.recovery && (
            <Modal
              title={fighterData.fighter?.recovery ? "Recover Fighter" : "Send to Recovery"}
              content={
                <div>
                  <p>
                    {fighterData.fighter?.recovery 
                      ? `Are you sure you want to recover "${fighterData.fighter?.fighter_name}" from the recovery bay?`
                      : `Are you sure you want to send "${fighterData.fighter?.fighter_name}" to the recovery bay?`
                    }
                  </p>
                </div>
              }
              onClose={() => handleModalToggle('recovery', false)}
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recovery: !fighterData.fighter?.recovery }),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter status');

                  await fetchFighterData();
                  handleModalToggle('recovery', false);
                  
                  toast({
                    description: fighterData.fighter?.recovery 
                      ? 'Fighter has been recovered from the recovery bay' 
                      : 'Fighter has been sent to the recovery bay',
                    variant: "default"
                  });
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.addXp && fighterData.fighter && (
            <FighterXpModal
              isOpen={uiState.modals.addXp}
              fighterId={fighterId}
              currentXp={fighterData.fighter.xp ?? 0}
              onClose={() => {
                setEditState(prev => ({
                  ...prev,
                  xpAmount: '',
                  xpError: ''
                }));
                handleModalToggle('addXp', false);
              }}
              onConfirm={handleAddXp}
              xpAmountState={{
                xpAmount: editState.xpAmount,
                xpError: editState.xpError
              }}
              onXpAmountChange={(value) => {
                setEditState(prev => ({
                  ...prev,
                  xpAmount: value,
                  xpError: ''
                }));
              }}
            />
          )}

          {canShowEditButtons && uiState.modals.editFighter && fighterData.fighter && (
            <EditFighterModal
              fighter={convertToFighterProps(fighterData.fighter)}
              isOpen={uiState.modals.editFighter}
              initialValues={{
                name: fighterData.fighter.fighter_name,
                label: fighterData.fighter.label || '',
                kills: fighterData.fighter.kills || 0,
                costAdjustment: String(fighterData.fighter.cost_adjustment || 0)
              }}
              onClose={() => handleModalToggle('editFighter', false)}
              onSubmit={async (values) => {
                try {
                  // Transform the data from modal format to API format
                  const apiData: any = {
                    fighter_name: values.name, // API expects fighter_name, not name
                    label: values.label,
                    kills: values.kills,
                    cost_adjustment: parseInt(values.costAdjustment) || 0, // Convert to number
                    special_rules: values.special_rules,
                  };

                  // Add fighter type fields if provided
                  if (values.fighter_class) apiData.fighter_class = values.fighter_class;
                  if (values.fighter_class_id) apiData.fighter_class_id = values.fighter_class_id;
                  if (values.fighter_type) apiData.fighter_type = values.fighter_type;
                  if (values.fighter_type_id) apiData.fighter_type_id = values.fighter_type_id;
                  if (values.fighter_sub_type !== undefined) apiData.fighter_sub_type = values.fighter_sub_type;
                  if (values.fighter_sub_type_id !== undefined) apiData.fighter_sub_type_id = values.fighter_sub_type_id;

                  // Update fighter data via API
                  const response = await fetch(`/api/fighters/${fighterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(apiData),
                  });

                  if (!response.ok) throw new Error('Failed to update fighter');

                  // Refresh fighter data after successful update
                  await fetchFighterData();
                  return true;
                } catch (error) {
                  console.error('Error updating fighter:', error);
                  return false;
                }
              }}
            />
          )}

          {canShowEditButtons && uiState.modals.addWeapon && fighterData.fighter && fighterData.gang && (
            <ItemModal
              title="Add Equipment"
              onClose={() => handleModalToggle('addWeapon', false)}
              gangCredits={fighterData.gang.credits}
              gangId={fighterData.gang.id}
              gangTypeId={fighterData.gang.gang_type_id}
              fighterId={fighterData.fighter.id}
              fighterTypeId={fighterData.fighter.fighter_type.fighter_type_id}
              fighterCredits={fighterData.fighter.credits}
              onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => 
                handleEquipmentBought(newFighterCredits, newGangCredits, boughtEquipment, false)
              }
            />
          )}

          {canShowEditButtons && uiState.modals.addVehicleEquipment && fighterData.fighter && fighterData.gang && vehicle && (
            <ItemModal
              title="Add Vehicle Equipment"
              onClose={() => handleModalToggle('addVehicleEquipment', false)}
              gangCredits={fighterData.gang.credits}
              gangId={fighterData.gang.id}
              gangTypeId={fighterData.gang.gang_type_id}
              fighterId={fighterData.fighter.id}
              fighterTypeId={fighterData.fighter.fighter_type.fighter_type_id}
              fighterCredits={fighterData.fighter.credits}
              vehicleId={vehicle.id}
              vehicleType={vehicle.vehicle_type}
              isVehicleEquipment={true}
              allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
              onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => 
                handleEquipmentBought(newFighterCredits, newGangCredits, boughtEquipment, true)
              }
            />
          )}

          {/* Vehicle Equipment Modals */}
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
              onConfirm={() => {
                // Handle vehicle equipment deletion
                console.log('Delete vehicle equipment:', deleteVehicleEquipmentData);
                setDeleteVehicleEquipmentData(null);
              }}
            />
          )}

          {sellVehicleEquipmentData && (
            <Modal
              title="Sell Vehicle Equipment"
              content={`Are you sure you want to sell ${sellVehicleEquipmentData.name} for ${sellVehicleEquipmentData.cost} credits?`}
              onClose={() => setSellVehicleEquipmentData(null)}
              onConfirm={() => {
                // Handle vehicle equipment selling
                console.log('Sell vehicle equipment:', sellVehicleEquipmentData);
                setSellVehicleEquipmentData(null);
              }}
            />
          )}

          {stashVehicleEquipmentData && (
            <Modal
              title="Move Vehicle Equipment to Stash"
              content={`Are you sure you want to move ${stashVehicleEquipmentData.name} to the gang stash?`}
              onClose={() => setStashVehicleEquipmentData(null)}
              onConfirm={() => {
                // Handle vehicle equipment stashing
                console.log('Stash vehicle equipment:', stashVehicleEquipmentData);
                setStashVehicleEquipmentData(null);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
} 