'use client';

import { FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { VehicleEquipmentList } from "@/components/fighter/vehicle-equipment-list";
import { useState, useEffect, useCallback } from 'react';
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
import { updateFighterXp, updateFighterXpWithOoa, updateFighterDetails, updateFighterEffects } from "@/app/lib/server-functions/edit-fighter";
import { FighterActions } from "@/components/fighter/fighter-actions";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';
import { useGetFighter, useGetFighterEquipment, useGetFighterSkills, useGetFighterEffects, useGetFighterVehicles } from '@/app/lib/queries/fighter-queries';
import { queryGangBasic, queryGangCredits, queryGangPositioning } from '@/app/lib/queries/gang-queries';

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

interface EditState {
  name: string;
  label: string;
  kills: number;
  costAdjustment: string;
  xpAmount: string;
  xpError: string;
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
    is_master_crafted: item.is_master_crafted
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
  const queryClient = useQueryClient();

  // TanStack Query hooks for data fetching
  const { data: fighter, isLoading: fighterLoading } = useGetFighter(fighterId);
  const { data: equipment, isLoading: equipmentLoading } = useGetFighterEquipment(fighterId);
  const { data: skills, isLoading: skillsLoading } = useGetFighterSkills(fighterId);
  const { data: effects, isLoading: effectsLoading } = useGetFighterEffects(fighterId);
  const { data: vehicles, isLoading: vehiclesLoading } = useGetFighterVehicles(fighterId);

  // Gang queries are prefetched on the server, so we just access the cache
  const { data: gang, isLoading: gangLoading } = useQuery({
    queryKey: queryKeys.gangs.detail(fighter?.gang_id || ''),
    queryFn: () => queryGangBasic(fighter?.gang_id || ''),
    enabled: false // Disabled - data is prefetched on server
  });
  const { data: gangCredits, isLoading: creditsLoading } = useQuery({
    queryKey: queryKeys.gangs.credits(fighter?.gang_id || ''),
    queryFn: () => queryGangCredits(fighter?.gang_id || ''),
    enabled: false // Disabled - data is prefetched on server
  });
  const { data: gangPositioning, isLoading: positioningLoading } = useQuery({
    queryKey: queryKeys.gangs.positioning(fighter?.gang_id || ''),
    queryFn: () => queryGangPositioning(fighter?.gang_id || ''),
    enabled: false // Disabled - data is prefetched on server
  });

  // Transform initial data and set up fallback state for transitions
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
  const [preFetchedFighterTypes, setPreFetchedFighterTypes] = useState<any[]>([]);

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


  // Direct server action mutations with optimistic updates
  const updateXpMutation = useMutation({
    mutationFn: updateFighterXpWithOoa,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(variables.fighter_id) });

      // Snapshot previous value
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(variables.fighter_id));

      // Optimistically update
      if (previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(variables.fighter_id), (old: any) => ({
          ...old,
          xp: old.xp + variables.xp_to_add,
          kills: old.kills + (variables.ooa_count || 0),
        }));
      }

      return { previousFighter };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(variables.fighter_id), context.previousFighter);
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    },
  });

  const updateDetailsMutation = useMutation({
    mutationFn: updateFighterDetails,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      
      // Snapshot previous values for rollback
      const previousFighterData = { ...fighterData };
      
      // Optimistically update the local state IMMEDIATELY
      setFighterData(prev => ({
        ...prev,
        fighter: {
          ...prev.fighter!,
          ...(variables.fighter_name !== undefined && { fighter_name: variables.fighter_name }),
          ...(variables.label !== undefined && { label: variables.label }),
          ...(variables.kills !== undefined && { kills: variables.kills }),
          ...(variables.cost_adjustment !== undefined && { cost_adjustment: variables.cost_adjustment }),
          ...(variables.special_rules !== undefined && { special_rules: variables.special_rules }),
          ...(variables.fighter_class !== undefined && { fighter_class: variables.fighter_class }),
          ...(variables.fighter_class_id !== undefined && { fighter_class_id: variables.fighter_class_id }),
          ...(variables.fighter_type !== undefined && variables.fighter_type_id !== undefined && {
            fighter_type: {
              fighter_type: variables.fighter_type,
              fighter_type_id: variables.fighter_type_id
            }
          }),
          ...(variables.fighter_sub_type !== undefined && variables.fighter_sub_type_id !== undefined && {
            fighter_sub_type: variables.fighter_sub_type && variables.fighter_sub_type_id ? {
              fighter_sub_type: variables.fighter_sub_type,
              fighter_sub_type_id: variables.fighter_sub_type_id
            } : undefined
          }),
          ...(variables.fighter_gang_legacy_id !== undefined && { fighter_gang_legacy_id: variables.fighter_gang_legacy_id }),
        }
      }));
      
      return { previousFighterData };
    },
    onError: (err, variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighterData) {
        setFighterData(context.previousFighterData);
      }
    },
    onSuccess: (data, variables) => {
      // No need to invalidate - we've already updated the local state
      // The server response confirms our optimistic update was correct
    },
  });

  const updateEffectsMutation = useMutation({
    mutationFn: updateFighterEffects,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      
      // Snapshot previous values for rollback
      const previousFighterData = { ...fighterData };
      
      // Optimistically update the local state IMMEDIATELY
      // Add the new effects to the user effects category
      setFighterData(prev => {
        if (!prev.fighter) return prev;
        
        const newUserEffects = Object.entries(variables.stats).map(([statName, adjustment]) => ({
          id: `temp-${Date.now()}-${statName}`, // Temporary ID for optimistic update
          effect_name: `User Adjustment: ${statName}`,
          type_specific_data: {
            stat_name: statName,
            adjustment: adjustment,
            created_by: 'user_adjustment'
          },
          fighter_effect_modifiers: [{
            id: `temp-mod-${Date.now()}-${statName}`,
            fighter_effect_id: `temp-${Date.now()}-${statName}`,
            stat_name: statName,
            numeric_value: adjustment
          }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        
        return {
          ...prev,
          fighter: {
            ...prev.fighter,
            effects: {
              ...prev.fighter.effects,
              user: [...(prev.fighter.effects?.user || []), ...newUserEffects]
            }
          }
        };
      });
      
      return { previousFighterData };
    },
    onError: (err, variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighterData) {
        setFighterData(context.previousFighterData);
      }
    },
    onSuccess: (data, variables) => {
      // No need to invalidate - we've already updated the local state
      // The server response confirms our optimistic update was correct
    },
  });

  // Sync local state with props when they change
  useEffect(() => {
    setFighterData(transformFighterData(initialFighterData, initialGangFighters));
    
    // Update edit state
    setEditState(prev => ({
      ...prev,
      costAdjustment: String(initialFighterData.fighter.cost_adjustment || 0)
    }));
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

  const handleAddXp = async (ooaCount?: number) => {
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
      await updateXpMutation.mutateAsync({
        fighter_id: fighterId,
        xp_to_add: amount,
        ooa_count: ooaCount
      });

      // Create success message
      let successMessage = `Successfully added ${amount} XP`;
      if (ooaCount && ooaCount > 0) {
        successMessage += ` and ${ooaCount} OOA${ooaCount > 1 ? 's' : ''}`;
      }

      toast({
        description: successMessage,
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
    // No need to fetch latest credits - we use TanStack Query cache that was prefetched on server
    
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

  // Use TanStack Query loading states
  const isLoading = fighterLoading || equipmentLoading || skillsLoading || effectsLoading || 
                   vehiclesLoading || gangLoading || creditsLoading || positioningLoading;

  if (isLoading || uiState.isLoading) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Loading...
        </div>
      </div>
    </main>
  );

  // Use TanStack Query data or fallback to initial data
  // Prioritize local state updates for optimistic updates
  const currentFighter = fighterData.fighter || fighter;
  const currentEquipment = fighterData.equipment || equipment;
  const currentSkills = fighterData.fighter?.skills || skills;
  const currentEffects = fighterData.fighter?.effects || effects;
  const currentVehicles = fighterData.fighter?.vehicles || vehicles;
  const currentGang = fighterData.gang || gang;
  const currentCredits = gangCredits ?? (fighterData.gang?.credits as number);

  // Calculate total cost from current data
  const baseCost = currentFighter?.credits || 0;
  const equipmentCost = (currentEquipment || []).reduce((sum: number, item: any) => sum + (item.purchase_cost || 0), 0);
  const skillsCost = Object.values(currentSkills || {}).reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
  const effectsCost = Object.values(currentEffects || {}).flat().reduce((sum: number, effect: any) => {
    return sum + ((effect.type_specific_data as any)?.credits_increase || 0);
  }, 0);
  const costAdjustment = currentFighter?.cost_adjustment || 0;
  
  const currentTotalCost = baseCost + equipmentCost + skillsCost + effectsCost + costAdjustment;

  if (uiState.error || !currentFighter || !currentGang) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Error: {uiState.error || 'Data not found'}
        </div>
      </div>
    </main>
  );

  const vehicle = currentVehicles?.[0];

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
            id={currentFighter?.id || ''}
            name={currentFighter?.fighter_name || ''}
            type={typeof currentFighter?.fighter_type === 'string' 
              ? currentFighter.fighter_type 
              : currentFighter?.fighter_type?.fighter_type || ''}
            sub_type={(currentFighter as any)?.fighter_sub_type_id ? { 
              fighter_sub_type: 'Unknown', // We'd need to fetch this separately
              fighter_sub_type_id: (currentFighter as any).fighter_sub_type_id 
            } : (currentFighter as any)?.fighter_sub_type || undefined}
            label={currentFighter?.label}
            alliance_crew_name={(currentFighter as any)?.alliance_crew_name || ''}
            credits={currentTotalCost || 0}
            movement={currentFighter?.movement || 0}
            weapon_skill={currentFighter?.weapon_skill || 0}
            ballistic_skill={currentFighter?.ballistic_skill || 0}
            strength={currentFighter?.strength || 0}
            toughness={currentFighter?.toughness || 0}
            wounds={currentFighter?.wounds || 0}
            initiative={currentFighter?.initiative || 0}
            attacks={currentFighter?.attacks || 0}
            leadership={currentFighter?.leadership || 0}
            cool={currentFighter?.cool || 0}
            willpower={currentFighter?.willpower || 0}
            intelligence={currentFighter?.intelligence || 0}
            xp={currentFighter?.xp || 0}
            total_xp={currentFighter?.xp || 0} // total_xp same as xp for now
            advancements={{ characteristics: {}, skills: {} }}
            onNameUpdate={handleNameUpdate}
            onAddXp={() => handleModalToggle('addXp', true)}
            onEdit={canShowEditButtons ? () => handleModalToggle('editFighter', true) : undefined}
            killed={currentFighter?.killed}
            retired={currentFighter?.retired}
            enslaved={currentFighter?.enslaved}
            starved={currentFighter?.starved}
            recovery={currentFighter?.recovery}
            captured={currentFighter?.captured}
            fighter_class={currentFighter?.fighter_class}
            kills={currentFighter?.kills || 0}
            effects={(currentEffects as any) || { 
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
            vehicles={currentVehicles}
            gangId={currentGang?.id}
            vehicleEquipment={fighterData.vehicleEquipment} // Keep using transformed data for now
            userPermissions={userPermissions}
            owner_name={initialFighterData.fighter?.owner_name}
            image_url={currentFighter?.image_url}
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
            />
          )}

          <WeaponList
            fighterId={fighterId}
            gangId={currentGang?.id || ''}
            gangCredits={currentCredits || 0}
            fighterCredits={fighterData.fighter?.credits || 0}
            equipment={(currentEquipment as any) || []}
            onAddEquipment={() => handleModalToggle('addWeapon', true)}
            userPermissions={userPermissions}
          />

          <SkillsList
            fighterId={fighterData.fighter?.id || ''}
            free_skill={fighterData.fighter?.free_skill}
            userPermissions={userPermissions}
          />

          <AdvancementsList
            key={`advancements-${Object.keys(fighterData.fighter?.skills || {}).length}`}
            fighterXp={fighterData.fighter?.xp || 0}
            fighterId={fighterData.fighter?.id || ''}
            advancements={fighterData.fighter?.effects?.advancements || []}
            skills={fighterData.fighter?.skills || {}}
            onDeleteAdvancement={async () => {
              // Data will be updated via TanStack Query optimistic updates
            }}
            onAdvancementAdded={() => {
              // Data will be updated via TanStack Query optimistic updates  
            }}
            userPermissions={userPermissions}
          />

          <InjuriesList
            injuries={fighterData.fighter?.effects?.injuries || []}
            fighterId={fighterData.fighter?.id || ''}
            fighterRecovery={fighterData.fighter?.recovery}
            userPermissions={userPermissions}
            fighter_class={fighterData.fighter?.fighter_class}
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
              id: currentFighter?.id || '',
              fighter_name: currentFighter?.fighter_name || '',
              killed: currentFighter?.killed || false,
              retired: currentFighter?.retired || false,
              enslaved: currentFighter?.enslaved || false,
              starved: currentFighter?.starved || false,
              recovery: currentFighter?.recovery || false,
              captured: currentFighter?.captured || false,
              credits: currentFighter?.credits || 0,
              campaigns: fighterData.fighter?.campaigns
            }}
            gang={{ id: currentGang?.id || '' }}
            fighterId={fighterId}
            userPermissions={userPermissions}
            onFighterUpdate={() => {
              // Data will be updated via TanStack Query optimistic updates
            }}
          />


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
              gangId={fighterData.gang?.id || ''}
              gangTypeId={fighterData.gang?.gang_type_id || ''}
              preFetchedFighterTypes={preFetchedFighterTypes}
              onClose={() => handleModalToggle('editFighter', false)}
              onSubmit={async (values) => {
                try {
                  // First, update fighter details
                  const result = await updateDetailsMutation.mutateAsync({
                    fighter_id: fighterId,
                    fighter_name: values.name,
                    label: values.label,
                    kills: values.kills,
                    cost_adjustment: parseInt(values.costAdjustment) || 0,
                    special_rules: values.special_rules,
                    fighter_class: values.fighter_class,
                    fighter_class_id: values.fighter_class_id,
                    fighter_type: values.fighter_type,
                    fighter_type_id: values.fighter_type_id,
                    fighter_sub_type: values.fighter_sub_type,
                    fighter_sub_type_id: values.fighter_sub_type_id,
                    fighter_gang_legacy_id: values.fighter_gang_legacy_id,
                  });

                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update fighter');
                  }

                  // Then, update fighter effects if there are any stats changes
                  if (values.stats && Object.keys(values.stats).length > 0) {
                    const effectsResult = await updateEffectsMutation.mutateAsync({
                      fighter_id: fighterId,
                      stats: values.stats
                    });

                    if (!effectsResult.success) {
                      throw new Error(effectsResult.error || 'Failed to update fighter effects');
                    }
                  }

                  // No need to refresh - TanStack Query handles cache updates
                  return true;
                } catch (error) {
                  console.error('Error updating fighter:', error);
                  return false;
                }
              }}
              onEffectsUpdate={async (stats) => {
                // This is now just a placeholder - the actual effects update will happen
                // in the main fighter update mutation when the user confirms the main modal
                return true;
              }}
            />
          )}

          {uiState.modals.addWeapon && fighterData.fighter && fighterData.gang && (
            <ItemModal
              title="Add Equipment"
              onClose={() => handleModalToggle('addWeapon', false)}
              gangCredits={currentCredits || 0}
              gangId={currentGang?.id || ''}
              gangTypeId={currentGang?.gang_type_id}
              fighterId={fighterData.fighter.id}
              fighterTypeId={fighterData.fighter.fighter_type.fighter_type_id}
              gangAffiliationId={fighterData.gang.gang_affiliation_id}
              fighterCredits={fighterData.fighter.credits}
              fighterHasLegacy={Boolean((fighterData as any)?.fighter?.fighter_gang_legacy_id)}
              fighterLegacyName={(fighterData as any)?.fighter?.fighter_gang_legacy?.name}
            />
          )}

          {uiState.modals.addVehicleEquipment && fighterData.fighter && fighterData.gang && vehicle && (
            <ItemModal
              title="Add Vehicle Equipment"
              onClose={() => handleModalToggle('addVehicleEquipment', false)}
              gangCredits={currentCredits || 0}
              gangId={currentGang?.id || ''}
              gangTypeId={currentGang?.gang_type_id}
              fighterId={fighterData.fighter.id}
              fighterTypeId={fighterData.fighter.fighter_type.fighter_type_id}
              fighterCredits={fighterData.fighter.credits}
              vehicleId={vehicle.id}
              vehicleType={vehicle.vehicle_type}
              vehicleTypeId={vehicle.vehicle_type_id}
              isVehicleEquipment={true}
              allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
            />
          )}
        </div>
      </div>
    </main>
  );
} 