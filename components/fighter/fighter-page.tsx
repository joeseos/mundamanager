'use client';

import { FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { VehicleEquipmentList } from "@/components/fighter/vehicle-equipment-list";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/equipment";
import { Equipment, FighterLoadout } from '@/types/equipment';
import { AdvancementsList } from "@/components/fighter/fighter-advancement-list";
import { PowerBoostsList } from "@/components/fighter/fighter-power-boosts";
import { SkillsList } from "@/components/fighter/fighter-skills-list";
import { InjuriesList } from "@/components/fighter/fighter-injury-list";
import { FighterNotes } from "@/components/fighter/fighter-notes-list";
import { VehicleEquipment } from '@/types/fighter';
import { VEHICLE_EQUIPMENT_CATEGORIES } from '@/utils/vehicleEquipmentCategories';
import { EditFighterModal } from "@/components/fighter/fighter-edit-modal";
import { Vehicle } from '@/types/fighter';
import { VehicleDamagesList } from "@/components/fighter/vehicle-lasting-damages";
import { FighterXpModal } from "@/components/fighter/fighter-xp-modal";
import { UserPermissions } from '@/types/user-permissions';
import { FighterActions } from "@/components/fighter/fighter-actions";
import { Combobox } from "@/components/ui/combobox";
import { IoSkull } from "react-icons/io5";
import { MdChair } from "react-icons/md";
import { GiCrossedChains } from "react-icons/gi";
import { TbMeatOff } from "react-icons/tb";
import { FaMedkit } from "react-icons/fa";
import { GiHandcuffs } from "react-icons/gi";
import { applyWeaponModifiers } from '@/utils/effect-modifiers';

interface FighterPageProps {
  initialFighterData: any;
  initialGangFighters: Array<{
    id: string;
    fighter_name: string;
    fighter_type: string;
    xp: number | null;
    killed?: boolean;
    retired?: boolean;
    enslaved?: boolean;
    starved?: boolean;
    recovery?: boolean;
    captured?: boolean;
  }>;
  userPermissions: UserPermissions;
  fighterId: string;
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
  captured?: boolean;
  free_skill?: boolean;
  kills: number;
  kill_count?: number;
  advancements?: {
    characteristics: Record<string, any>;
    skills: Record<string, any>;
  };
  note?: string;
  note_backstory?: string;
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
    'power-boosts': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
    skills: FighterEffect[];
  };
  vehicles?: Vehicle[];
  gang_id?: string;
  gang_type_id?: string;
  campaigns?: any[];
  weapons?: any[];
  wargear?: any[];
  owner_name?: string; // Name of the fighter who owns this fighter (for exotic beasts)
  image_url?: string;
  base_credits?: number;
  is_spyrer?: boolean;
}

interface Gang {
  id: string;
  credits: number;
  positioning?: Record<number, string>;
  gang_type_id: string;
  gang_affiliation_id?: string | null;
  gang_affiliation_name?: string;
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
    killed?: boolean;
    retired?: boolean;
    enslaved?: boolean;
    starved?: boolean;
    recovery?: boolean;
    captured?: boolean;
  }[];
  loadouts: FighterLoadout[];
  activeLoadoutId: string | null;
}

interface UIState {
  isLoading: boolean;
  error: string | null;
  modals: {
    addXp: boolean;
    advancement: boolean;
    editFighter: boolean;
    addWeapon: boolean;
    addVehicleEquipment: boolean;
  };
}

// Helper function to transform fighter data
const transformFighterData = (fighterData: any, gangFighters: any[]): FighterPageState => {
  // Transform skills
  const transformedSkills: FighterSkills = {};
  if (Array.isArray(fighterData.fighter.skills)) {
    fighterData.fighter.skills.forEach((skill: any) => {
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
  } else if (typeof fighterData.fighter.skills === 'object' && fighterData.fighter.skills !== null) {
    Object.assign(transformedSkills, fighterData.fighter.skills);
  }

  // Transform equipment
  const transformedEquipment = (fighterData.equipment || []).map((item: any) => {
    return {
      fighter_equipment_id: item.fighter_equipment_id,
      equipment_id: item.equipment_id,
      equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
        ? `${item.equipment_name} (Master-crafted)`
        : item.equipment_name,
      equipment_type: item.equipment_type,
      equipment_category: item.equipment_category,
      cost: item.purchase_cost,
      base_cost: item.original_cost,
      weapon_profiles: item.weapon_profiles,
      core_equipment: item.core_equipment,
      is_master_crafted: item.is_master_crafted,
      is_editable: item.is_editable || false,
      target_equipment_id: item.target_equipment_id,
      effect_names: item.effect_names,
      loadout_ids: item.loadout_ids
    };
  });

  // Transform vehicle equipment
  const transformedVehicleEquipment = (fighterData.fighter?.vehicles?.[0]?.equipment || []).map((item: any) => ({
    fighter_equipment_id: item.fighter_equipment_id || item.vehicle_weapon_id || item.id,
    equipment_id: item.equipment_id,
    equipment_name: item.is_master_crafted && item.equipment_type === 'weapon'
      ? `${item.equipment_name} (Master-crafted)`
      : item.equipment_name,
    equipment_type: item.equipment_type,
    cost: item.purchase_cost,
    base_cost: item.original_cost,
    core_equipment: false,
    vehicle_id: fighterData.fighter?.vehicles?.[0]?.id,
    vehicle_equipment_id: item.vehicle_weapon_id || item.id
  }));

  // Preserve all effects from server, with defaults for required categories
  const effects = {
    // Preserve all categories from server (including any custom/non-standard categories)
    ...fighterData.fighter.effects,
    // Ensure required categories have defaults
    injuries: fighterData.fighter.effects?.injuries || [],
    advancements: fighterData.fighter.effects?.advancements || [],
    bionics: fighterData.fighter.effects?.bionics || [],
    cyberteknika: fighterData.fighter.effects?.cyberteknika || [],
    'gene-smithing': fighterData.fighter.effects?.['gene-smithing'] || [],
    'rig-glitches': fighterData.fighter.effects?.['rig-glitches'] || [],
    'power-boosts': fighterData.fighter.effects?.['power-boosts'] || [],
    augmentations: fighterData.fighter.effects?.augmentations || [],
    equipment: fighterData.fighter.effects?.equipment || [],
    user: fighterData.fighter.effects?.user || [],
    skills: fighterData.fighter.effects?.skills || []
  };

  const effectsCost = Object.values(effects)
    .flat()
    .reduce((sum: number, effect: any) => sum + ((effect.type_specific_data?.credits_increase as number) || 0), 0);

  const baseCost = (fighterData.fighter.credits || 0) - effectsCost;

  return {
    fighter: {
      ...fighterData.fighter,
      fighter_class: fighterData.fighter.fighter_class,
      fighter_type: {
        fighter_type: fighterData.fighter.fighter_type.fighter_type,
        fighter_type_id: fighterData.fighter.fighter_type.fighter_type_id
      },
      fighter_sub_type: fighterData.fighter.fighter_sub_type ? {
        fighter_sub_type: fighterData.fighter.fighter_sub_type.fighter_sub_type,
        fighter_sub_type_id: fighterData.fighter.fighter_sub_type.id
      } : undefined,
      base_credits: baseCost,
      gang_id: fighterData.gang.id,
      gang_type_id: fighterData.gang.gang_type_id,
      skills: transformedSkills,
      effects: effects
    },
    equipment: transformedEquipment,
    vehicleEquipment: transformedVehicleEquipment,
    gang: {
      id: fighterData.gang.id,
      credits: fighterData.gang.credits,
      gang_type_id: fighterData.gang.gang_type_id,
      gang_affiliation_id: fighterData.gang.gang_affiliation_id,
      gang_affiliation_name: fighterData.gang.gang_affiliation_name,
      positioning: fighterData.gang.positioning
    },
    gangFighters: gangFighters,
    loadouts: fighterData.loadouts || [],
    activeLoadoutId: fighterData.fighter?.active_loadout_id || null
  };
};

export default function FighterPage({
  initialFighterData,
  initialGangFighters,
  userPermissions,
  fighterId
}: FighterPageProps) {
  // Transform initial data and set up state
  const [fighterData, setFighterData] = useState<FighterPageState>(() =>
    transformFighterData(initialFighterData, initialGangFighters)
  );

  const [uiState, setUiState] = useState<UIState>({
    isLoading: false,
    error: null,
    modals: {
      addXp: false,
      advancement: false,
      editFighter: false,
      addWeapon: false,
      addVehicleEquipment: false
    }
  });

  const router = useRouter();
  const { toast } = useToast();
  const [preFetchedFighterTypes, setPreFetchedFighterTypes] = useState<any[]>([]);
  const purchaseHandlerRef = useRef<((payload: { params: any; item: Equipment }) => void) | null>(null);
  const vehiclePurchaseHandlerRef = useRef<((payload: { params: any; item: any }) => void) | null>(null);

  // Fetch fighter types for edit modal
  const fetchFighterTypes = useCallback(async (gangId: string, gangTypeId: string) => {
    try {
      const params = new URLSearchParams({
        gang_id: gangId,
        gang_type_id: gangTypeId,
        is_gang_addition: 'false'
      });
      
      const response = await fetch(`/api/fighter-types?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch fighter types');
      }
      
      const data = await response.json();
      setPreFetchedFighterTypes(data);
    } catch (error) {
      console.error('Error fetching fighter types:', error);
      toast({
        title: 'Error',
        description: 'Could not fetch fighter types.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Sync local state with props when they change
  useEffect(() => {
    setFighterData(transformFighterData(initialFighterData, initialGangFighters));
  }, [initialFighterData, initialGangFighters]);

  // Add conditional rendering based on permissions
  const canShowEditButtons = userPermissions.canEdit;

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

  const handleEquipmentUpdate = useCallback((updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number, deletedEffects: any[] = []) => {
    setFighterData(prev => {
      let updatedEffects = prev.fighter?.effects;

      // Remove deleted effects from fighter effects using server-provided deletedEffects data
      if (deletedEffects.length > 0 && updatedEffects) {
        updatedEffects = { ...updatedEffects };

        // Remove deleted effects from each category
        Object.keys(updatedEffects).forEach(categoryKey => {
          const categoryEffects = (updatedEffects as any)[categoryKey];
          if (Array.isArray(categoryEffects)) {
            (updatedEffects as any)[categoryKey] = categoryEffects.filter(
              (effect: any) => !deletedEffects.some((deletedEffect: any) => deletedEffect.id === effect.id)
            );
          }
        });
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

        updatedVehicles = [{
          ...vehicle,
          equipment: [...(vehicle.equipment || []), {
            fighter_equipment_id: boughtEquipment.fighter_equipment_id || boughtEquipment.equipment_id,
            equipment_id: boughtEquipment.equipment_id,
            equipment_name: boughtEquipment.equipment_name,
            equipment_type: boughtEquipment.equipment_type,
            cost: boughtEquipment.cost,
            base_cost: boughtEquipment.cost,
            weapon_profiles: boughtEquipment.weapon_profiles || undefined
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
    // Avoid page-wide refresh; keep optimistic update
  }, [router]);

  // Gang fighters are already provided in initialGangFighters, no need to fetch them again

  const handleNameUpdate = useCallback((newName: string) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? { ...prev.fighter, fighter_name: newName } : null
    }));
  }, []);

  const handleXpUpdated = useCallback((newXp: number, newTotalXp: number, newKills: number, newKillCount?: number) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? {
        ...prev.fighter,
        xp: newXp,
        total_xp: newTotalXp,
        kills: newKills, // Use absolute kills value from modal
        kill_count: newKillCount !== undefined ? newKillCount : prev.fighter.kill_count
      } : null,
      // Update gang fighters list for dropdown
      gangFighters: prev.gangFighters.map(fighter =>
        fighter.id === fighterId
          ? { ...fighter, xp: newXp }
          : fighter
      )
    }));
  }, [fighterId]);

  // Update modal handlers
  const handleModalToggle = (modalName: keyof UIState['modals'], value: boolean) => {
    // If opening the Edit Fighter modal, fetch fighter types first
    if (modalName === 'editFighter' && value && fighterData.gang?.id && fighterData.gang?.gang_type_id) {
      fetchFighterTypes(fighterData.gang.id, fighterData.gang.gang_type_id).then(() => {
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

  if (uiState.isLoading) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-6">
          Loading...
        </div>
      </div>
    </main>
  );

  if (uiState.error || !fighterData.fighter || !fighterData.gang) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-6">
          Error: {uiState.error || 'Data not found'}
        </div>
      </div>
    </main>
  );

  const vehicle = fighterData.fighter?.vehicles?.[0];

  // Prepare options for Combobox
  const fighterOptions = [...fighterData.gangFighters]
    .sort((a, b) => {
      const positioning = fighterData.gang?.positioning || {};
      const indexA = Object.entries(positioning).find(([, id]) => id === a.id)?.[0];
      const indexB = Object.entries(positioning).find(([, id]) => id === b.id)?.[0];
      const posA = indexA !== undefined ? parseInt(indexA) : Infinity;
      const posB = indexB !== undefined ? parseInt(indexB) : Infinity;
      return posA - posB;
    })
    .map((f) => {
      const statusIcons = [];
      if (f.killed) statusIcons.push(<IoSkull className="text-gray-400 w-4 h-4" key="killed" />);
      if (f.retired) statusIcons.push(<MdChair className="text-muted-foreground w-4 h-4" key="retired" />);
      if (f.enslaved) statusIcons.push(<GiCrossedChains className="text-sky-200 w-4 h-4" key="enslaved" />);
      if (f.starved) statusIcons.push(<TbMeatOff className="text-red-500 w-4 h-4" key="starved" />);
      if (f.recovery) statusIcons.push(<FaMedkit className="text-blue-500 w-4 h-4" key="recovery" />);
      if (f.captured) statusIcons.push(<GiHandcuffs className="text-red-600 w-4 h-4" key="captured" />);
      
      const displayText = `${f.fighter_name} - ${f.fighter_type}${f.xp !== undefined ? ` (${f.xp} XP)` : ''}`;
      
      return {
        value: f.id,
        displayValue: displayText,
        label: (
          <span className="flex items-center gap-1">
            <span>{displayText}</span>
            {statusIcons.length > 0 && <span className="flex items-center gap-0.5">{statusIcons}</span>}
          </span>
        )
      };
    });

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <div className="mb-4">
            <Combobox
              options={fighterOptions}
              value={fighterId}
              onValueChange={(value) => router.push(`/fighter/${value}`)}
              placeholder="Select a fighter..."
              className="w-full"
            />
          </div>
          
          <FighterDetailsCard
            id={fighterData.fighter?.id || ''}
            name={fighterData.fighter?.fighter_name || ''}
            type={fighterData.fighter?.fighter_type?.fighter_type || ''}
            sub_type={fighterData.fighter?.fighter_sub_type}
            label={fighterData.fighter?.label}
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
            captured={fighterData.fighter?.captured}
            fighter_class={fighterData.fighter?.fighter_class}
            kills={fighterData.fighter?.kills || 0}
            kill_count={fighterData.fighter?.kill_count}
            is_spyrer={fighterData.fighter?.is_spyrer}
            effects={fighterData.fighter.effects || {
              injuries: [],
              advancements: [],
              bionics: [],
              cyberteknika: [],
              'gene-smithing': [],
              'rig-glitches': [],
              augmentations: [],
              equipment: [],
              user: [],
              skills: []
            }}
            vehicles={fighterData.fighter?.vehicles}
            gangId={fighterData.gang?.id}
            vehicleEquipment={fighterData.vehicleEquipment}
            userPermissions={userPermissions}
            owner_name={initialFighterData.fighter?.owner_name}
            fighter_gang_legacy={(fighterData as any)?.fighter?.fighter_gang_legacy}
            image_url={fighterData.fighter?.image_url}
          />

          {/* Vehicle Equipment Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleEquipmentList
              fighterId={fighterId}
              gangId={fighterData.gang?.id || ''}
              gangCredits={fighterData.gang?.credits || 0}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentUpdate={(updatedEquipment, newFighterCredits, newGangCredits, deletedEffects = []) => {
                setFighterData(prev => {
                  if (!prev.fighter) return prev;
                  
                  // Remove deleted effects from vehicle effects if any
                  let updatedVehicles = prev.fighter.vehicles;
                  if (deletedEffects.length > 0 && updatedVehicles?.[0]) {
                    const vehicle = updatedVehicles[0];
                    let updatedVehicleEffects = { ...vehicle.effects };
                    
                    // Remove deleted effects from each category
                    Object.keys(updatedVehicleEffects).forEach(categoryKey => {
                      updatedVehicleEffects[categoryKey] = updatedVehicleEffects[categoryKey].filter(
                        (effect: any) => !deletedEffects.some((deletedEffect: any) => deletedEffect.id === effect.id)
                      );
                    });
                    
                    updatedVehicles = [{
                      ...vehicle,
                      effects: updatedVehicleEffects
                    }];
                  }
                  
                  return {
                    ...prev,
                    vehicleEquipment: updatedEquipment,
                    fighter: { 
                      ...prev.fighter, 
                      credits: newFighterCredits,
                      vehicles: updatedVehicles
                    },
                    gang: prev.gang ? { ...prev.gang, credits: newGangCredits } : null
                  };
                });
              }}
              equipment={fighterData.vehicleEquipment}
              onAddEquipment={() => handleModalToggle('addVehicleEquipment', true)}
              userPermissions={userPermissions}
              vehicleEffects={vehicle.effects}
              onRegisterPurchase={(fn) => { vehiclePurchaseHandlerRef.current = fn; }}
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
            onRegisterPurchase={(fn) => { purchaseHandlerRef.current = fn; }}
            fighterEffects={fighterData.fighter?.effects || {}}
            onEffectsUpdate={(updatedEffects) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  effects: {
                    ...prev.fighter.effects,
                    ...updatedEffects
                  }
                } : null
              }));
            }}
            loadouts={fighterData.loadouts}
            activeLoadoutId={fighterData.activeLoadoutId}
            onLoadoutsUpdate={(updatedLoadouts, newActiveLoadoutId) => {
              setFighterData(prev => ({
                ...prev,
                loadouts: updatedLoadouts,
                activeLoadoutId: newActiveLoadoutId
              }));
            }}
          />

          <SkillsList
            skills={fighterData.fighter?.skills || {}}
            fighterId={fighterData.fighter?.id || ''}
            fighterXp={fighterData.fighter?.xp || 0}
            free_skill={fighterData.fighter?.free_skill}
            userPermissions={userPermissions}
            onSkillsUpdate={(updatedSkills) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  skills: updatedSkills
                } : null
              }));
            }}
          />

          <AdvancementsList
            fighterXp={fighterData.fighter?.xp || 0}
            fighterId={fighterData.fighter?.id || ''}
            fighterClass={fighterData.fighter?.fighter_class || ''}
            advancements={fighterData.fighter?.effects?.advancements || []}
            skills={fighterData.fighter?.skills || {}}
            userPermissions={userPermissions}
            onAdvancementUpdate={(updatedAdvancements) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  effects: {
                    ...prev.fighter.effects,
                    advancements: updatedAdvancements
                  }
                } : null
              }));
            }}
            onSkillUpdate={(updatedSkills) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  skills: updatedSkills
                } : null
              }));
            }}
            onXpCreditsUpdate={(xpChange, creditsChange) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  xp: (prev.fighter.xp || 0) + xpChange,
                  credits: (prev.fighter.credits || 0) + creditsChange
                } : null
              }));
            }}
            onCharacteristicUpdate={(characteristicName, changeAmount) => {
              // Characteristics are now updated through effect modifiers
              // The stats calculation will handle the display automatically
              // No direct characteristic updates needed
            }}
          />

          {fighterData.fighter?.is_spyrer && (
            <PowerBoostsList
              fighterId={fighterData.fighter.id}
              powerBoosts={fighterData.fighter?.effects?.['power-boosts'] || []}
              userPermissions={userPermissions}
              currentKillCount={fighterData.fighter.kill_count ?? 0}
              onPowerBoostUpdate={(updatedPowerBoosts) => {
                setFighterData(prev => ({
                  ...prev,
                  fighter: prev.fighter ? {
                    ...prev.fighter,
                    effects: {
                      ...prev.fighter.effects,
                      'power-boosts': updatedPowerBoosts
                    }
                  } : null
                }));
              }}
              onKillsCreditsUpdate={(killsChange, creditsChange) => {
                setFighterData(prev => ({
                  ...prev,
                  fighter: prev.fighter ? {
                    ...prev.fighter,
                    kill_count: (prev.fighter.kill_count || 0) + killsChange,
                    credits: (prev.fighter.credits || 0) + creditsChange
                  } : null
                }));
              }}
            />
          )}

          <InjuriesList
            injuries={[
              ...(fighterData.fighter?.effects?.injuries || []),
              ...(fighterData.fighter?.effects?.['rig-glitches'] || [])
            ]}
            fighterId={fighterData.fighter?.id || ''}
            fighterRecovery={fighterData.fighter?.recovery}
            userPermissions={userPermissions}
            fighter_class={fighterData.fighter?.fighter_class}
            is_spyrer={fighterData.fighter?.is_spyrer}
            kill_count={fighterData.fighter?.kill_count ?? 0}
            skills={fighterData.fighter?.skills || {}}
            fighterWeapons={fighterData.equipment
              ?.filter((e: any) => e.equipment_type === 'weapon')
              .map((e: any) => ({
                id: e.fighter_equipment_id,
                name: e.equipment_name,
                equipment_category: e.equipment_category,
                effect_names: e.effect_names
              }))}
            onEquipmentEffectUpdate={(fighterEquipmentId, effectData) => {
              setFighterData(prev => {
                if (!prev.fighter) return prev;

                // Update equipment to recalculate weapon profiles
                const updatedEquipment = prev.equipment.map((item: Equipment): Equipment => {
                  if (item.fighter_equipment_id === fighterEquipmentId) {
                    if (effectData === null) {
                      // Restore base profiles by removing the effect modifiers
                      const baseProfiles = item.base_weapon_profiles || item.weapon_profiles;
                      return {
                        ...item,
                        weapon_profiles: baseProfiles
                      };
                    } else {
                      // Apply modifiers to weapon profiles
                      const effect = {
                        id: effectData.id,
                        effect_name: effectData.effect_name,
                        fighter_effect_type_id: effectData.fighter_effect_type_id,
                        fighter_equipment_id: fighterEquipmentId,
                        fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
                        type_specific_data: effectData.type_specific_data,
                        created_at: effectData.created_at
                      };

                      // Store base profiles if not already stored, then apply modifiers
                      const baseProfiles = item.base_weapon_profiles || item.weapon_profiles || [];
                      const modifiedProfiles = applyWeaponModifiers(baseProfiles, [effect]);

                      return {
                        ...item,
                        base_weapon_profiles: baseProfiles,
                        weapon_profiles: modifiedProfiles
                      };
                    }
                  }
                  return item;
                });

                // Update fighter effects - add/remove effect from equipment category
                let updatedEffects = prev.fighter.effects;
                if (effectData === null) {
                  // Remove effect with matching fighter_equipment_id from equipment category
                  updatedEffects = {
                    ...updatedEffects,
                    equipment: updatedEffects.equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId)
                  };
                } else {
                  // Add new effect to equipment category
                  const newEffect: FighterEffect = {
                    id: effectData.id,
                    effect_name: effectData.effect_name,
                    fighter_effect_type_id: effectData.fighter_effect_type_id,
                    fighter_equipment_id: fighterEquipmentId ?? undefined,
                    fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
                    type_specific_data: effectData.type_specific_data,
                    created_at: effectData.created_at
                  };
                  updatedEffects = {
                    ...updatedEffects,
                    equipment: [...updatedEffects.equipment, newEffect]
                  };
                }

                return {
                  ...prev,
                  fighter: {
                    ...prev.fighter,
                    effects: updatedEffects
                  },
                  equipment: updatedEquipment
                };
              });
            }}
            onInjuryUpdate={(updatedInjuries, recoveryStatus) => {
              setFighterData(prev => {
                if (!prev.fighter) return prev;

                // Separate injuries and rig-glitches based on whether fighter is a Spyrer
                // For Spyrers, all go to rig-glitches; for others, all go to injuries
                const isSpyrer = prev.fighter.is_spyrer;

                return {
                  ...prev,
                  fighter: {
                    ...prev.fighter,
                    recovery: recoveryStatus !== undefined ? recoveryStatus : prev.fighter.recovery,
                    effects: {
                      ...prev.fighter.effects,
                      injuries: isSpyrer ? [] : updatedInjuries,
                      'rig-glitches': isSpyrer ? updatedInjuries : []
                    }
                  }
                };
              });
            }}
            onSkillsUpdate={(updatedSkills) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  skills: updatedSkills
                } : null
              }));
            }}
            onKillCountUpdate={(newKillCount) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  kill_count: newKillCount
                } : null
              }));
            }}
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
              gangId={fighterData.gang?.id || ''}
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

          {/* Notes Section */}
          <div className="mt-6">
            {fighterData.fighter && (
              <FighterNotes
                fighterId={fighterData.fighter.id}
                initialNote={fighterData.fighter.note}
                initialNoteBackstory={fighterData.fighter.note_backstory}
                onNoteUpdate={(updatedNote) => {
                  setFighterData(prev => ({
                    ...prev,
                    fighter: prev.fighter ? { ...prev.fighter, note: updatedNote } : null
                  }));
                }}
                onNoteBackstoryUpdate={(updatedNoteBackstory) => {
                  setFighterData(prev => ({
                    ...prev,
                    fighter: prev.fighter ? { ...prev.fighter, note_backstory: updatedNoteBackstory } : null
                  }));
                }}
                userPermissions={userPermissions}
              />
            )}
          </div>

          {/* Action buttons */}
          <FighterActions
            fighter={{
              id: fighterData.fighter.id,
              fighter_name: fighterData.fighter.fighter_name,
              killed: fighterData.fighter.killed,
              retired: fighterData.fighter.retired,
              enslaved: fighterData.fighter.enslaved,
              starved: fighterData.fighter.starved,
              recovery: fighterData.fighter.recovery,
              captured: fighterData.fighter.captured,
              credits: fighterData.fighter.credits || 0,
              cost_adjustment: fighterData.fighter.cost_adjustment || 0,
              base_credits: (fighterData.fighter as any).base_credits || 0,
              is_spyrer: fighterData.fighter.is_spyrer,
              campaigns: fighterData.fighter?.campaigns
            }}
            gang={{ id: fighterData.gang?.id || '', gang_name: fighterData.gang?.gang_affiliation_name || '' }}
            fighterId={fighterId}
            userPermissions={userPermissions}
            onFighterUpdate={() => {}}
            onStatusMutate={(optimistic, gangCreditsDelta) => {
              const snapshot = structuredClone(fighterData);
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? { ...prev.fighter, ...optimistic } : null,
                gang: typeof gangCreditsDelta === 'number' && prev.gang
                  ? { ...prev.gang, credits: prev.gang.credits + gangCreditsDelta }
                  : prev.gang
              }));
              return snapshot;
            }}
            onStatusError={(snapshot) => {
              if (snapshot) setFighterData(snapshot);
            }}
            onStatusSuccess={() => {
              // No-op: server-side tags will reconcile authoritative state
            }}
          />


          {uiState.modals.addXp && fighterData.fighter && (
            <FighterXpModal
              isOpen={uiState.modals.addXp}
              fighterId={fighterId}
              currentXp={fighterData.fighter.xp ?? 0}
              currentTotalXp={fighterData.fighter.total_xp ?? 0}
              currentKills={fighterData.fighter.kills ?? 0}
              currentKillCount={fighterData.fighter.kill_count ?? 0}
              is_spyrer={fighterData.fighter.is_spyrer}
              onClose={() => handleModalToggle('addXp', false)}
              onXpUpdated={handleXpUpdated}
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
                kill_count: fighterData.fighter.kill_count,
                costAdjustment: String(fighterData.fighter.cost_adjustment || 0)
              }}
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.gang?.gang_type_id || ''}
              is_spyrer={fighterData.fighter.is_spyrer}
              preFetchedFighterTypes={preFetchedFighterTypes}
              onClose={() => handleModalToggle('editFighter', false)}
              onEditMutate={(optimistic) => {
                const snapshot = structuredClone(fighterData);
                setFighterData(prev => ({
                  ...prev,
                  fighter: prev.fighter ? {
                    ...prev.fighter,
                    ...optimistic,
                    // Ensure type shape matches `Fighter` interface
                    fighter_type: optimistic?.fighter_type ? (optimistic.fighter_type as any) : prev.fighter.fighter_type,
                    fighter_sub_type: optimistic?.fighter_sub_type ? (optimistic.fighter_sub_type as any) : prev.fighter.fighter_sub_type,
                    // Optimistically adjust credits if cost_adjustment changes
                    credits: (() => {
                      const newAdj = (optimistic as any)?.cost_adjustment;
                      if (typeof newAdj === 'number') {
                        const prevAdj = prev.fighter?.cost_adjustment || 0;
                        const prevBase = (prev.fighter?.credits || 0) - prevAdj;
                        return prevBase + newAdj;
                      }
                      return prev.fighter.credits;
                    })()
                  } : null
                }));
                return snapshot;
              }}
              onEditError={(snapshot) => {
                setFighterData(snapshot);
              }}
              onEditSuccess={(serverFighter) => {
                // Keep optimistic effect overlay until server revalidation replaces state;
                // just merge returned fighter fields (serverFighter usually doesn't include effects)
                if (serverFighter) {
                  setFighterData(prev => ({
                    ...prev,
                    fighter: prev.fighter ? { ...prev.fighter, ...serverFighter } : null
                  }));
                }
              }}
            />
          )}

          {uiState.modals.addWeapon && fighterData.fighter && fighterData.gang && (
            <ItemModal
              title="Equipment"
              onClose={() => handleModalToggle('addWeapon', false)}
              gangCredits={fighterData.gang.credits}
              gangId={fighterData.gang.id}
              gangTypeId={fighterData.gang.gang_type_id}
              fighterId={fighterData.fighter.id}
              fighterTypeId={fighterData.fighter.fighter_type.fighter_type_id}
              gangAffiliationId={fighterData.gang.gang_affiliation_id}
              fighterCredits={fighterData.fighter.credits}
              fighterHasLegacy={Boolean((fighterData as any)?.fighter?.fighter_gang_legacy_id)}
              fighterLegacyName={(fighterData as any)?.fighter?.fighter_gang_legacy?.name}
              isCustomFighter={Boolean((fighterData as any)?.fighter?.custom_fighter_type_id)}
              fighterWeapons={(fighterData.equipment || []).filter(eq => eq.equipment_type === 'weapon').map(eq => ({ id: eq.fighter_equipment_id, name: eq.equipment_name, equipment_category: eq.equipment_category, effect_names: eq.effect_names }))}
              campaignTradingPostIds={(fighterData.fighter.campaigns || []).length > 0
                ? ((fighterData.fighter.campaigns || []).find((c: any) => c.trading_posts !== undefined)?.trading_posts || [])
                : undefined}
              campaignTradingPostNames={(fighterData.fighter.campaigns || []).length > 0
                ? ((fighterData.fighter.campaigns || []).find((c: any) => c.trading_posts !== undefined)?.trading_post_names || [])
                : undefined}
              onPurchaseRequest={(payload) => { purchaseHandlerRef.current?.(payload); }}
            />
          )}

          {uiState.modals.addVehicleEquipment && fighterData.fighter && fighterData.gang && vehicle && (
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
              campaignTradingPostIds={(fighterData.fighter.campaigns || []).length > 0
                ? ((fighterData.fighter.campaigns || []).find((c: any) => c.trading_posts !== undefined)?.trading_posts || [])
                : undefined}
              campaignTradingPostNames={(fighterData.fighter.campaigns || []).length > 0
                ? ((fighterData.fighter.campaigns || []).find((c: any) => c.trading_posts !== undefined)?.trading_post_names || [])
                : undefined}
              onPurchaseRequest={(payload) => { vehiclePurchaseHandlerRef.current?.(payload); }}
            />
          )}
        </div>
      </div>
    </main>
  );
} 