'use client';


import { Skill, FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { VehicleEquipmentList } from "@/components/fighter/vehicle-equipment-list";
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
import { FighterEffects, VehicleEquipment } from '@/types/fighter';
import { vehicleExclusiveCategories, vehicleCompatibleCategories, VEHICLE_EQUIPMENT_CATEGORIES } from '@/utils/vehicleEquipmentCategories';
import { useSession } from '@/hooks/use-session';
import { EditFighterModal } from "@/components/fighter/fighter-edit-modal";
import { FighterProps } from '@/types/fighter';
import { Plus, Minus, X } from "lucide-react";
import { Vehicle } from '@/types/fighter';
import { VehicleDamagesList } from "@/components/fighter/vehicle-lasting-damages";
import { FighterXpModal } from "@/components/fighter/fighter-xp-modal";
import { UserPermissions } from '@/types/user-permissions';
import { SellFighterModal } from "@/components/fighter/sell-fighter";
import { editFighterStatus, updateFighterXp, updateFighterDetails } from "@/app/actions/edit-fighter";



interface FighterTypesData {
  displayTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    gang_type_id: string;
    total_cost: number;
    typeClassKey?: string;
    is_gang_variant?: boolean;
    gang_variant_name?: string;
  }>;
  subTypesByTypeClass: Map<string, Array<{
    id: string;
    fighter_sub_type: string;
    cost: number;
    fighter_type_id: string;
    fighter_type_name: string;
    fighter_class_name: string;
  }>>;
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
  fighterTypesData: FighterTypesData;
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
  alliance_crew_name?: string;
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
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
  };
  vehicles?: Vehicle[];
  gang_id?: string;
  gang_type_id?: string;
  campaigns?: any[];
  weapons?: any[];
  wargear?: any[];
  owner_name?: string; // Name of the fighter who owns this fighter (for exotic beasts)
  image_url?: string;
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




export default function FighterPage({ 
  initialFighterData, 
  initialGangFighters, 
  userPermissions, 
  fighterId,
  fighterTypesData
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
      core_equipment: false,
      vehicle_id: initialFighterData.fighter?.vehicles?.[0]?.id,
      vehicle_equipment_id: item.id
    }));

    return {
      fighter: {
        ...initialFighterData.fighter,
        fighter_class: initialFighterData.fighter.fighter_class,
        fighter_type: {
          fighter_type: initialFighterData.fighter.fighter_type.fighter_type,
          fighter_type_id: initialFighterData.fighter.fighter_type.id
        },
        fighter_sub_type: initialFighterData.fighter.fighter_sub_type ? {
          fighter_sub_type: initialFighterData.fighter.fighter_sub_type.fighter_sub_type,
          fighter_sub_type_id: initialFighterData.fighter.fighter_sub_type.id
        } : undefined,
        base_credits: initialFighterData.fighter.credits - (initialFighterData.fighter.cost_adjustment || 0),
        gang_id: initialFighterData.gang.id,
        gang_type_id: initialFighterData.gang.gang_type_id,
        skills: transformedSkills,
        effects: {
          injuries: initialFighterData.fighter.effects?.injuries || [],
          advancements: initialFighterData.fighter.effects?.advancements || [],
          bionics: initialFighterData.fighter.effects?.bionics || [],
          cyberteknika: initialFighterData.fighter.effects?.cyberteknika || [],
          'gene-smithing': initialFighterData.fighter.effects?.['gene-smithing'] || [],
          'rig-glitches': initialFighterData.fighter.effects?.['rig-glitches'] || [],
          augmentations: initialFighterData.fighter.effects?.augmentations || [],
          equipment: initialFighterData.fighter.effects?.equipment || [],
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
  const [isFetchingGangCredits, setIsFetchingGangCredits] = useState(false);

  // Fetch latest gang credits from API
  const fetchLatestGangCredits = useCallback(async (gangId: string) => {
    setIsFetchingGangCredits(true);
    try {
      const res = await fetch(`/api/gangs/${gangId}`);
      if (!res.ok) throw new Error('Failed to fetch gang data');
      const data = await res.json();
      if (data.gang && typeof data.gang.credits === 'number') {
        setFighterData(prev => ({
          ...prev,
          gang: prev.gang ? { ...prev.gang, credits: data.gang.credits } : prev.gang
        }));
      }
    } catch (error) {
      console.error('Error fetching latest gang credits:', error);
      toast({
        title: 'Error',
        description: 'Could not fetch latest gang credits.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingGangCredits(false);
    }
  }, [toast]);

  // Sync local state with props when they change (after router.refresh())
  useEffect(() => {
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
      core_equipment: false,
      vehicle_id: initialFighterData.fighter?.vehicles?.[0]?.id,
      vehicle_equipment_id: item.id
    }));

    // Update state with fresh data from server
    setFighterData({
      fighter: {
        ...initialFighterData.fighter,
        fighter_class: initialFighterData.fighter.fighter_class,
        fighter_type: {
          fighter_type: initialFighterData.fighter.fighter_type.fighter_type,
          fighter_type_id: initialFighterData.fighter.fighter_type.id
        },
        fighter_sub_type: initialFighterData.fighter.fighter_sub_type ? {
          fighter_sub_type: initialFighterData.fighter.fighter_sub_type.fighter_sub_type,
          fighter_sub_type_id: initialFighterData.fighter.fighter_sub_type.id
        } : undefined,
        base_credits: initialFighterData.fighter.credits - (initialFighterData.fighter.cost_adjustment || 0),
        gang_id: initialFighterData.gang.id,
        gang_type_id: initialFighterData.gang.gang_type_id,
        skills: transformedSkills,
        effects: {
          injuries: initialFighterData.fighter.effects?.injuries || [],
          advancements: initialFighterData.fighter.effects?.advancements || [],
          bionics: initialFighterData.fighter.effects?.bionics || [],
          cyberteknika: initialFighterData.fighter.effects?.cyberteknika || [],
          'gene-smithing': initialFighterData.fighter.effects?.['gene-smithing'] || [],
          'rig-glitches': initialFighterData.fighter.effects?.['rig-glitches'] || [],
          augmentations: initialFighterData.fighter.effects?.augmentations || [],
          equipment: initialFighterData.fighter.effects?.equipment || [],
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
    });

    // Update edit state
    setEditState(prev => ({
      ...prev,
      costAdjustment: String(initialFighterData.fighter.cost_adjustment || 0)
    }));
  }, [initialFighterData, initialGangFighters]);

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
      const result = await editFighterStatus({
        fighter_id: fighterData.fighter.id,
        action: 'delete'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete fighter');
      }

      toast({
        description: `${fighterData.fighter.fighter_name} has been successfully deleted.`,
        variant: "default"
      });

      // Navigate to the gang page as returned by the server action
      if (result.data?.redirectTo) {
        router.push(result.data.redirectTo);
      } else {
        router.push(`/gang/${fighterData.gang.id}`);
      }
    } catch (error) {
      console.error('Error deleting fighter:', {
        error,
        fighterId: fighterData.fighter.id,
        fighterName: fighterData.fighter.fighter_name
      });

      const message = error instanceof Error
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
      if (isVehicleEquipment && updatedVehicles?.[0]) {
        const vehicle = updatedVehicles[0];

        // Handle vehicle effects if equipment has effects
        let updatedVehicleEffects = vehicle.effects || {};
        if (boughtEquipment.equipment_effect) {
          const categoryName = boughtEquipment.equipment_effect.category_name?.toLowerCase() || 'vehicle upgrades';
          updatedVehicleEffects = {
            ...updatedVehicleEffects,
            [categoryName]: [...(updatedVehicleEffects[categoryName] || []), boughtEquipment.equipment_effect]
          };
        }

        updatedVehicles = [{
          ...vehicle,
          effects: updatedVehicleEffects,
          equipment: [...(vehicle.equipment || []), {
            fighter_equipment_id: boughtEquipment.equipment_id,
            equipment_id: boughtEquipment.equipment_id,
            equipment_name: boughtEquipment.equipment_name,
            equipment_type: boughtEquipment.equipment_type,
            cost: boughtEquipment.cost,
            base_cost: boughtEquipment.cost,
            weapon_profiles: boughtEquipment.weapon_profiles || undefined
          }]
        }];
      }

      let updatedEffects = prev.fighter.effects;
      if (boughtEquipment.equipment_effect && !isVehicleEquipment) {
        // Determine the correct category based on the equipment effect's category_name
        const categoryName = boughtEquipment.equipment_effect.category_name?.toLowerCase();
        let targetCategory: keyof typeof updatedEffects = 'user'; // default fallback
        
        // Map category names to effect categories
        if (categoryName === 'bionics') {
          targetCategory = 'bionics';
        } else if (categoryName === 'cyberteknika' || categoryName === 'archaeo-cyberteknika') {
          targetCategory = 'cyberteknika';
        } else if (categoryName === 'gene-smithing') {
          targetCategory = 'gene-smithing';
        } else if (categoryName === 'rig-glitches') {
          targetCategory = 'rig-glitches';
        } else if (categoryName === 'augmentations') {
          targetCategory = 'augmentations';
        } else if (categoryName === 'equipment') {
          targetCategory = 'equipment';
        } else if (categoryName === 'injuries') {
          targetCategory = 'injuries';
        } else if (categoryName === 'advancements') {
          targetCategory = 'advancements';
        }
        // If no match, it will default to 'user'
        
        updatedEffects = {
          ...updatedEffects,
          [targetCategory]: [...(updatedEffects[targetCategory] || []), boughtEquipment.equipment_effect]
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
    
    // Refresh the page to get updated data from server
    router.refresh();
  }, [router]);

  // Gang fighters are already provided in initialGangFighters, no need to fetch them again

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
      const result = await updateFighterXp({
        fighter_id: fighterId,
        xp_to_add: amount
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add XP');
      }

      // Refresh the page to get updated data from server
      router.refresh();

      toast({
        description: `Successfully added ${amount} XP`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Error adding XP:', error);
      setEditState(prev => ({
        ...prev,
        xpError: error instanceof Error ? error.message : 'Failed to add XP. Please try again.'
      }));
      toast({
        description: error instanceof Error ? error.message : 'Failed to add XP',
        variant: "destructive"
      });
      return false;
    }
  };



  // Update modal handlers
  const handleModalToggle = (modalName: keyof UIState['modals'], value: boolean) => {
    // If opening the Add Equipment modal, fetch latest credits first
    if ((modalName === 'addWeapon' || modalName === 'addVehicleEquipment') && value && fighterData.gang?.id) {
      fetchLatestGangCredits(fighterData.gang.id).then(() => {
        setUiState(prev => ({
          ...prev,
          modals: {
            ...prev.modals,
            [modalName]: value
          }
        }));
      });
      return;
    }
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
            alliance_crew_name={fighterData.fighter?.alliance_crew_name || ''}
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
              'gene-smithing': [], 
              'rig-glitches': [], 
              augmentations: [], 
              equipment: [], 
              user: [] 
            }}
            vehicles={fighterData.fighter?.vehicles}
            gangId={fighterData.gang?.id}
            vehicleEquipment={fighterData.vehicleEquipment}
            userPermissions={userPermissions}
            owner_name={initialFighterData.fighter?.owner_name}
            image_url={fighterData.fighter?.image_url}
          />

          {/* Vehicle Equipment Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleEquipmentList
              fighterId={fighterId}
              gangId={fighterData.gang?.id || ''}
              gangCredits={fighterData.gang?.credits || 0}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentUpdate={(updatedEquipment, newFighterCredits, newGangCredits) => {
                setFighterData(prev => ({
                  ...prev,
                  vehicleEquipment: updatedEquipment,
                  fighter: prev.fighter ? { ...prev.fighter, credits: newFighterCredits } : null,
                  gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null
                }));
              }}
              equipment={fighterData.vehicleEquipment}
              onAddEquipment={() => handleModalToggle('addVehicleEquipment', true)}
              userPermissions={userPermissions}
            />
          )}

          <WeaponList
            fighterId={fighterId}
            gangId={fighterData.gang?.id || ''}
            gangCredits={fighterData.gang?.credits || 0}
            fighterCredits={fighterData.fighter?.credits || 0}
            onEquipmentUpdate={handleEquipmentUpdate}
            equipment={fighterData.equipment}
            onAddEquipment={() => handleModalToggle('addWeapon', true)}
            userPermissions={userPermissions}
          />

          <SkillsList
            key={`skills-${Object.keys(fighterData.fighter?.skills || {}).length}`}
            skills={fighterData.fighter?.skills || {}}
            onSkillDeleted={() => router.refresh()}
            fighterId={fighterData.fighter?.id || ''}
            fighterXp={fighterData.fighter?.xp || 0}
            onSkillAdded={() => router.refresh()}
            free_skill={fighterData.fighter?.free_skill}
            userPermissions={userPermissions}
          />

          <AdvancementsList
            key={`advancements-${Object.keys(fighterData.fighter?.skills || {}).length}`}
            fighterXp={fighterData.fighter?.xp || 0}
            fighterId={fighterData.fighter?.id || ''}
            advancements={fighterData.fighter?.effects?.advancements || []}
            skills={fighterData.fighter?.skills || {}}
            onDeleteAdvancement={async (advancementId: string) => {
              // Trigger server component re-execution to get fresh data
              router.refresh();
            }}
            onAdvancementAdded={() => router.refresh()}
            userPermissions={userPermissions}
          />

          <InjuriesList
            injuries={fighterData.fighter?.effects?.injuries || []}
            fighterId={fighterData.fighter?.id || ''}
            fighterRecovery={fighterData.fighter?.recovery}
            userPermissions={userPermissions}
          />

          {/* Vehicle Lasting Damage Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleDamagesList
              damages={vehicle.effects ? vehicle.effects["lasting damages"] || [] : []}
              onDamageUpdate={(updatedDamages) => {
                setFighterData(prev => ({
                  ...prev,
                  fighter: prev.fighter ? {
                    ...prev.fighter,
                    vehicles: prev.fighter.vehicles?.map(v => 
                      v.id === vehicle.id 
                        ? { 
                            ...v, 
                            effects: { 
                              ...v.effects, 
                              "lasting damages": updatedDamages 
                            } 
                          }
                        : v
                    )
                  } : null
                }));
              }}
              fighterId={fighterData.fighter?.id || ''}
              vehicleId={vehicle.id}
              vehicle={vehicle}
              gangCredits={fighterData.gang?.credits || 0}
              onGangCreditsUpdate={(newCredits) => {
                setFighterData(prev => ({
                  ...prev,
                  gang: prev.gang ? { ...prev.gang, credits: newCredits } : null
                }));
              }}
              userPermissions={userPermissions}
            />
          )}

          <div className="mt-6">
            {fighterData.fighter && (
              <NotesList
                fighterId={fighterData.fighter.id}
                initialNote={fighterData.fighter.note}
                userPermissions={userPermissions}
              />
            )}
          </div>

          {/* Action buttons - show for all users */}
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => handleModalToggle('kill', true)}
                disabled={!userPermissions.canEdit}
              >
                {fighterData.fighter?.killed ? 'Resurrect Fighter' : 'Kill Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.retired ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('retire', true)}
                disabled={!userPermissions.canEdit}
              >
                {fighterData.fighter?.retired ? 'Unretire Fighter' : 'Retire Fighter'}
              </Button>
              <Button
                variant={fighterData.fighter?.enslaved ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('enslave', true)}
                disabled={!userPermissions.canEdit}
              >
                {fighterData.fighter?.enslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
              </Button>
              {isMeatEnabled() && (
                <Button
                  variant={fighterData.fighter?.starved ? 'success' : 'default'}
                  className="flex-1"
                  onClick={() => handleModalToggle('starve', true)}
                  disabled={!userPermissions.canEdit}
                >
                  {fighterData.fighter?.starved ? 'Feed Fighter' : 'Starve Fighter'}
                </Button>
              )}
              <Button
                variant={fighterData.fighter?.recovery ? 'success' : 'default'}
                className="flex-1"
                onClick={() => handleModalToggle('recovery', true)}
                disabled={!userPermissions.canEdit}
              >
                {fighterData.fighter?.recovery ? 'Recover Fighter' : 'Send to Recovery'}
              </Button>
              
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleModalToggle('delete', true)}
                disabled={!userPermissions.canEdit}
              >
                Delete Fighter
              </Button>
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
                  const result = await editFighterStatus({
                    fighter_id: fighterId,
                    action: 'kill'
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter status');
                  }

                  router.refresh();
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
                    description: error instanceof Error ? error.message : 'Failed to update fighter status',
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
                  const result = await editFighterStatus({
                    fighter_id: fighterId,
                    action: 'retire'
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter status');
                  }

                  router.refresh();
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
                    description: error instanceof Error ? error.message : 'Failed to update fighter status',
                    variant: "destructive"
                  });
                }
              }}
            />
          )}

          {uiState.modals.enslave && (
            <SellFighterModal
              isOpen={uiState.modals.enslave}
              onClose={() => handleModalToggle('enslave', false)}
              fighterName={fighterData.fighter?.fighter_name || ''}
              fighterValue={fighterData.fighter?.credits || 0}
              isEnslaved={fighterData.fighter?.enslaved || false}
              onConfirm={async (sellValue) => {
                try {
                  const action = fighterData.fighter?.enslaved ? 'rescue' : 'sell';
                  
                  const result = await editFighterStatus({
                    fighter_id: fighterId,
                    action,
                    sell_value: action === 'sell' ? sellValue : undefined
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter status');
                  }

                  // Update local state with new gang credits if selling
                  if (result.data?.gang) {
                    setFighterData(prev => ({
                      ...prev,
                      gang: prev.gang ? { ...prev.gang, credits: result.data!.gang!.credits } : null
                    }));
                  }

                  router.refresh();
                  handleModalToggle('enslave', false);
                  
                  toast({
                    description: fighterData.fighter?.enslaved 
                      ? 'Fighter has been rescued from the Guilders' 
                      : `Fighter has been sold for ${sellValue} credits`,
                    variant: "default"
                  });
                  
                  return true;
                } catch (error) {
                  console.error('Error updating fighter status:', error);
                  toast({
                    description: error instanceof Error ? error.message : 'Failed to update fighter status',
                    variant: "destructive"
                  });
                  return false;
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
                  const result = await editFighterStatus({
                    fighter_id: fighterId,
                    action: 'starve'
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter status');
                  }

                  router.refresh();
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
                    description: error instanceof Error ? error.message : 'Failed to update fighter status',
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
                  const result = await editFighterStatus({
                    fighter_id: fighterId,
                    action: 'recover'
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter status');
                  }

                  router.refresh();
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
                    description: error instanceof Error ? error.message : 'Failed to update fighter status',
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

          {uiState.modals.editFighter && fighterData.fighter && (
            <EditFighterModal
              fighter={convertToFighterProps(fighterData.fighter)}
              isOpen={uiState.modals.editFighter}
              initialValues={{
                name: fighterData.fighter.fighter_name,
                label: fighterData.fighter.label || '',
                kills: fighterData.fighter.kills || 0,
                costAdjustment: String(fighterData.fighter.cost_adjustment || 0)
              }}
              fighterTypesData={fighterTypesData}
              onClose={() => handleModalToggle('editFighter', false)}
              onSubmit={async (values) => {
                try {
                  // Use server action instead of direct API call
                  const result = await updateFighterDetails({
                    fighter_id: fighterId,
                    fighter_name: values.name,
                    label: values.label,
                    kills: values.kills,
                    cost_adjustment: parseInt(values.costAdjustment) || 0,
                    special_rules: values.special_rules,
                    fighter_class: values.fighter_class,
                    fighter_class_id: values.fighter_class_id,
                    fighter_type_id: values.fighter_type_id,
                    fighter_sub_type: values.fighter_sub_type,
                    fighter_sub_type_id: values.fighter_sub_type_id,
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter');
                  }

                  // Refresh fighter data after successful update
                  router.refresh();
                  return true;
                } catch (error) {
                  console.error('Error updating fighter:', error);
                  return false;
                }
              }}
            />
          )}

          {uiState.modals.addWeapon && fighterData.fighter && fighterData.gang && (
            isFetchingGangCredits ? (
              <Modal
                title="Loading..."
                content={<div>Fetching latest gang credits...</div>}
                onClose={() => handleModalToggle('addWeapon', false)}
              />
            ) : (
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
            )
          )}

          {uiState.modals.addVehicleEquipment && fighterData.fighter && fighterData.gang && vehicle && (
            isFetchingGangCredits ? (
              <Modal
                title="Loading..."
                content={<div>Fetching latest gang credits...</div>}
                onClose={() => handleModalToggle('addVehicleEquipment', false)}
              />
            ) : (
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
                vehicleTypeId={vehicle.vehicle_type_id}
                isVehicleEquipment={true}
                allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
                onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => 
                  handleEquipmentBought(newFighterCredits, newGangCredits, boughtEquipment, true)
                }
              />
            )
          )}
        </div>
      </div>
    </main>
  );
} 