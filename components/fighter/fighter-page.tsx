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
import { Equipment } from '@/types/equipment';
import { AdvancementsList } from "@/components/fighter/fighter-advancement-list";
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
  }[];
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
  const transformedEquipment = (fighterData.equipment || []).map((item: any) => ({
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
    is_master_crafted: item.is_master_crafted,
    target_equipment_id: item.target_equipment_id
  }));

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

  return {
    fighter: {
      ...fighterData.fighter,
      fighter_class: fighterData.fighter.fighter_class,
      fighter_type: {
        fighter_type: fighterData.fighter.fighter_type.fighter_type,
        fighter_type_id: fighterData.fighter.fighter_type.id
      },
      fighter_sub_type: fighterData.fighter.fighter_sub_type ? {
        fighter_sub_type: fighterData.fighter.fighter_sub_type.fighter_sub_type,
        fighter_sub_type_id: fighterData.fighter.fighter_sub_type.id
      } : undefined,
      base_credits: fighterData.fighter.credits - (fighterData.fighter.cost_adjustment || 0),
      gang_id: fighterData.gang.id,
      gang_type_id: fighterData.gang.gang_type_id,
      skills: transformedSkills,
      effects: {
        injuries: fighterData.fighter.effects?.injuries || [],
        advancements: fighterData.fighter.effects?.advancements || [],
        bionics: fighterData.fighter.effects?.bionics || [],
        cyberteknika: fighterData.fighter.effects?.cyberteknika || [],
        'gene-smithing': fighterData.fighter.effects?.['gene-smithing'] || [],
        'rig-glitches': fighterData.fighter.effects?.['rig-glitches'] || [],
        augmentations: fighterData.fighter.effects?.augmentations || [],
        equipment: fighterData.fighter.effects?.equipment || [],
        user: fighterData.fighter.effects?.user || []
      }
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
    gangFighters: gangFighters
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
  const [isFetchingGangCredits, setIsFetchingGangCredits] = useState(false);
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
    // Avoid page-wide refresh; keep optimistic update
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

  const handleXpUpdated = useCallback((newXp: number, newTotalXp: number, newKills: number) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? {
        ...prev.fighter,
        xp: newXp,
        total_xp: newTotalXp,
        kills: newKills // Use absolute kills value from modal
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

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
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

          <InjuriesList
            injuries={fighterData.fighter?.effects?.injuries || []}
            fighterId={fighterData.fighter?.id || ''}
            fighterRecovery={fighterData.fighter?.recovery}
            userPermissions={userPermissions}
            fighter_class={fighterData.fighter?.fighter_class}
            onInjuryUpdate={(updatedInjuries, recoveryStatus) => {
              setFighterData(prev => ({
                ...prev,
                fighter: prev.fighter ? {
                  ...prev.fighter,
                  recovery: recoveryStatus !== undefined ? recoveryStatus : (prev.fighter.recovery),
                  effects: {
                    ...prev.fighter.effects,
                    injuries: updatedInjuries
                  }
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
              campaigns: fighterData.fighter?.campaigns
            }}
            gang={{ id: fighterData.gang?.id || '' }}
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
                costAdjustment: String(fighterData.fighter.cost_adjustment || 0)
              }}
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.gang?.gang_type_id || ''}
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
            isFetchingGangCredits ? (
              <Modal
                title="Loading..."
                content={<div>Fetching latest gang credits...</div>}
                onClose={() => handleModalToggle('addWeapon', false)}
              />
            ) : (
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
                fighterWeapons={(fighterData.equipment || []).filter(eq => eq.equipment_type === 'weapon').map(eq => ({ id: eq.fighter_equipment_id, name: eq.equipment_name }))}
                onPurchaseRequest={(payload) => { purchaseHandlerRef.current?.(payload); }}
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
                onPurchaseRequest={(payload) => { vehiclePurchaseHandlerRef.current?.(payload); }}
              />
            )
          )}
        </div>
      </div>
    </main>
  );
} 