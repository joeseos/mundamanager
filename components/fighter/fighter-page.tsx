'use client';

import { FighterSkills, FighterEffect } from "@/types/fighter";
import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { VehicleEquipmentList } from "@/components/fighter/vehicle-equipment-list";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from '@tanstack/react-query';
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
import { useUpdateFighterXp, useUpdateFighterDetails } from "@/lib/mutations/fighters";
import { FighterActions } from "@/components/fighter/fighter-actions";
import { InitialFighterData } from '@/lib/types/initial-data';
import { 
  useGetFighter, 
  useGetFighterEquipment, 
  useGetFighterSkills,
  useGetFighterEffects,
  useGetFighterVehicles,
  useGetFighterTotalCost,
  useGetFighterType,
  useGetFighterSubType,
  useGetFighterCampaigns,
  useGetFighterOwnedBeasts,
  useGetFighterOwnerName
} from '@/lib/queries/fighters';
import { 
  useGetGang, 
  useGetGangCredits, 
  useGetGangPositioning, 
  useGetGangFighters 
} from '@/lib/queries/gangs';
import { queryKeys } from '@/lib/queries/keys';

interface FighterPageProps {
  fighterId: string;
  userId: string;
  userPermissions: UserPermissions;
  initialData?: InitialFighterData;
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
  // Safety check for null fighter data
  if (!fighterData.fighter) {
    return {
      fighter: null,
      equipment: [],
      vehicleEquipment: [],
      gang: null,
      gangFighters: []
    };
  }

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
    cost: item.purchase_cost, // Deprecated: for backward compatibility
    purchase_cost: Number(item.purchase_cost) || 0,
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
    cost: item.purchase_cost, // Deprecated: for backward compatibility
    purchase_cost: Number(item.purchase_cost) || 0,
    base_cost: item.original_cost,
    core_equipment: false,
    vehicle_id: fighterData.fighter?.vehicles?.[0]?.id,
    vehicle_equipment_id: item.vehicle_weapon_id || item.id
  }));

  return {
    fighter: {
      ...fighterData.fighter,
      // Use totalCost if available, otherwise fall back to original credits
      credits: fighterData.totalCost ?? fighterData.fighter.credits,
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
  fighterId,
  userId,
  userPermissions,
  initialData
}: FighterPageProps) {
  // ALL HOOKS MUST BE AT THE VERY TOP - NO EXCEPTIONS!
  // useState hooks - initialize with SSR data if available
  const [fighterData, setFighterData] = useState<FighterPageState>(() => {
    if (initialData) {
      // Create the transformed data structure that transformFighterData expects
      const transformedData = {
        fighter: {
          ...initialData.fighter,
          skills: initialData.skills,
          effects: initialData.effects,
          fighter_type: initialData.fighterType ? {
            id: initialData.fighterType.id,
            fighter_type: initialData.fighterType.fighter_type,
            alliance_crew_name: initialData.fighterType.alliance_crew_name
          } : undefined,
          fighter_sub_type: initialData.fighterSubType ? {
            id: initialData.fighterSubType.id,
            fighter_sub_type: initialData.fighterSubType.sub_type_name
          } : undefined
        },
        gang: initialData.gang,
        equipment: initialData.equipment,
        vehicles: initialData.vehicles,
        totalCost: initialData.totalCost,
        fighterType: initialData.fighterType,
        fighterSubType: initialData.fighterSubType,
        campaigns: initialData.campaigns,
        ownedBeasts: initialData.ownedBeasts,
        ownerName: initialData.ownerName
      };
      return transformFighterData(transformedData, initialData.gangFighters || []);
    }
    return {
      fighter: null,
      equipment: [],
      vehicleEquipment: [],
      gang: null,
      gangFighters: []
    };
  });
  
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
  
  const [isFetchingGangCredits, setIsFetchingGangCredits] = useState(false);
  const [preFetchedFighterTypes, setPreFetchedFighterTypes] = useState<any[]>([]);

  // Other hooks
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TanStack Query hooks for data fetching with SSR hydration - ALL hooks must be called unconditionally
  const { data: fighterBasic, isLoading: fighterLoading, error: fighterError } = useGetFighter(
    fighterId, 
    { initialData: initialData?.fighter, staleTime: 1000 * 60 * 10 }
  );
  
  // Mutation hooks for optimistic updates
  const xpMutation = useUpdateFighterXp(fighterId);
  const detailsMutation = useUpdateFighterDetails(fighterId);
  const { data: equipment, isLoading: equipmentLoading } = useGetFighterEquipment(
    fighterId,
    { initialData: initialData?.equipment, staleTime: 1000 * 60 * 10 }
  );
  const { data: skills, isLoading: skillsLoading } = useGetFighterSkills(
    fighterId,
    { initialData: initialData?.skills, staleTime: 1000 * 60 * 10 }
  );
  const { data: effects, isLoading: effectsLoading } = useGetFighterEffects(
    fighterId,
    { initialData: initialData?.effects, staleTime: 1000 * 60 * 10 }
  );
  const { data: vehicles, isLoading: vehiclesLoading } = useGetFighterVehicles(
    fighterId,
    { initialData: initialData?.vehicles, staleTime: 1000 * 60 * 10 }
  );
  const { data: totalCost, isLoading: costLoading } = useGetFighterTotalCost(
    fighterId,
    { initialData: initialData?.totalCost, staleTime: 1000 * 60 * 10 }
  );
  
  // Gang data with SSR hydration - use placeholder IDs to ensure hooks are always called
  const gangId = fighterBasic?.gang_id || initialData?.gang?.id || 'placeholder';
  const { data: gang, isLoading: gangLoading } = useGetGang(
    gangId,
    { initialData: initialData?.gang, staleTime: 1000 * 60 * 10 }
  );
  const { data: gangCredits, isLoading: creditsLoading } = useGetGangCredits(
    gangId,
    { initialData: initialData?.gang?.credits, staleTime: 1000 * 60 * 10 }
  );
  const { data: gangPositioning, isLoading: positioningLoading } = useGetGangPositioning(
    gangId,
    { initialData: initialData?.gangPositioning, staleTime: 1000 * 60 * 10 }
  );
  const { data: gangFighters, isLoading: gangFightersLoading } = useGetGangFighters(
    gangId,
    { initialData: initialData?.gangFighters, staleTime: 1000 * 60 * 10 }
  );
  
  // Reference data with SSR hydration - use placeholder IDs to ensure hooks are always called
  const fighterTypeId = fighterBasic?.fighter_type_id || initialData?.fighter?.fighter_type_id || 'placeholder';
  const fighterSubTypeId = fighterBasic?.fighter_sub_type_id || initialData?.fighter?.fighter_sub_type_id || 'placeholder';
  const { data: fighterType } = useGetFighterType(fighterTypeId, { 
    initialData: initialData?.fighterType,
    staleTime: 1000 * 60 * 60,
    enabled: !initialData && fighterTypeId !== 'placeholder'
  });
  const { data: fighterSubType } = useGetFighterSubType(fighterSubTypeId, { 
    initialData: initialData?.fighterSubType,
    staleTime: 1000 * 60 * 60,
    enabled: !initialData && fighterSubTypeId !== 'placeholder'
  });
  
  // Additional fighter data with SSR hydration - disable when we have SSR data
  const { data: campaigns } = useGetFighterCampaigns(fighterId, { 
    initialData: initialData?.campaigns,
    staleTime: 1000 * 60 * 10,
    enabled: !initialData
  });
  const { data: ownedBeasts } = useGetFighterOwnedBeasts(fighterId, { 
    initialData: initialData?.ownedBeasts,
    staleTime: 1000 * 60 * 10,
    enabled: !initialData
  });
  const fighterPetId = fighterBasic?.fighter_pet_id || initialData?.fighter?.fighter_pet_id || 'placeholder';
  const { data: ownerName } = useGetFighterOwnerName(fighterPetId, { 
    initialData: initialData?.ownerName,
    staleTime: 1000 * 60 * 10,
    enabled: !initialData && fighterPetId !== 'placeholder'
  });

  // Override with SSR data when available
  const effectiveFighterType = initialData?.fighterType || fighterType;
  const effectiveFighterSubType = initialData?.fighterSubType || fighterSubType;
  const effectiveCampaigns = initialData?.campaigns || campaigns;
  const effectiveOwnedBeasts = initialData?.ownedBeasts || ownedBeasts;
  const effectiveOwnerName = initialData?.ownerName || ownerName;

  // ALL useCallback and useEffect hooks must be here at the top!
  
  // Legacy helper function - keeping for components that haven't been migrated to optimistic updates yet
  // TODO: Remove once all components use mutation hooks
  const invalidateFighterData = useCallback(() => {
    // Invalidate all fighter-related queries
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(fighterId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });
    
    // Also invalidate gang data since fighter actions can affect gang credits/fighters
    if (gangId && gangId !== 'placeholder') {
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.detail(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.fighters(gangId) });
    }
  }, [queryClient, fighterId, gangId]);
  
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
            cost: boughtEquipment.cost, // Deprecated: for backward compatibility
            purchase_cost: boughtEquipment.purchase_cost || boughtEquipment.cost || 0,
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

  const handleNameUpdate = useCallback((newName: string) => {
    setFighterData(prev => ({
      ...prev,
      fighter: prev.fighter ? { ...prev.fighter, fighter_name: newName } : null
    }));
  }, []);

  // Update edit state when fighter data changes
  useEffect(() => {
    if (fighterBasic) {
      setEditState(prev => ({
        ...prev,
        costAdjustment: String(fighterBasic.cost_adjustment || 0)
      }));
    }
  }, [fighterBasic]);

  // Transform data to match component's expected format (with SSR hydration support)
  const transformedFighterData = {
    fighter: {
      ...fighterBasic,
      credits: totalCost ?? initialData?.totalCost ?? fighterBasic?.credits ?? 0,
      alliance_crew_name: effectiveFighterType?.alliance_crew_name,
      fighter_type: {
        id: effectiveFighterType?.id || '',
        fighter_type: effectiveFighterType?.fighter_type || 'Unknown',
        alliance_crew_name: effectiveFighterType?.alliance_crew_name
      },
      fighter_sub_type: effectiveFighterSubType ? {
        id: effectiveFighterSubType.id,
        sub_type_name: effectiveFighterSubType.sub_type_name || (effectiveFighterSubType as any).fighter_sub_type,
        fighter_sub_type: effectiveFighterSubType.sub_type_name || (effectiveFighterSubType as any).fighter_sub_type
      } : undefined,
      skills: skills || {},
      effects: effects || {
        injuries: [],
        advancements: [],
        bionics: [],
        cyberteknika: [],
        'gene-smithing': [],
        'rig-glitches': [],
        augmentations: [],
        equipment: [],
        user: []
      },
      vehicles: vehicles || [],
      campaigns: effectiveCampaigns || [],
      owned_beasts: effectiveOwnedBeasts || [],
      owner_name: effectiveOwnerName,
    },
    gang: gang ? {
      id: gang.id,
      credits: gangCredits || initialData?.gang?.credits || 0,
      gang_type_id: gang.gang_type_id || initialData?.gang?.gang_type_id,
      gang_affiliation_id: gang.gang_affiliation_id || initialData?.gang?.gang_affiliation_id,
      gang_affiliation_name: (gang.gang_affiliation as any)?.name || initialData?.gang?.gang_affiliation_name,
      positioning: gangPositioning || initialData?.gangPositioning || {},
    } : initialData?.gang ? {
      id: initialData.gang.id,
      credits: initialData.gang.credits,
      gang_type_id: initialData.gang.gang_type_id,
      gang_affiliation_id: initialData.gang.gang_affiliation_id,
      gang_affiliation_name: initialData.gang.gang_affiliation_name,
      positioning: initialData.gangPositioning || {},
    } : null,
    equipment: equipment || [],
  };

  // Update state when data changes (SSR or client-side)
  useEffect(() => {
    // Always use transformed data when available
    if (transformedFighterData.fighter && transformedFighterData.gang) {
      setFighterData(transformFighterData(transformedFighterData, gangFighters || []));
    }
  }, [initialData, fighterBasic, gang, equipment, skills, effects, vehicles, totalCost, gangCredits, gangPositioning, gangFighters, effectiveFighterType, effectiveFighterSubType, effectiveCampaigns, effectiveOwnedBeasts, effectiveOwnerName]);

  // Check for loading states - show loading only if we don't have data from any source
  const isLoading = (
    fighterLoading || equipmentLoading || skillsLoading || effectsLoading || 
    vehiclesLoading || costLoading || gangLoading || creditsLoading
  ) && !fighterBasic;

  // Handle error states
  if (fighterError) {
    return <div>Error loading fighter: {fighterError.message}</div>;
  }

  // Handle loading state (only show if no SSR data)
  if (isLoading) {
    return <div>Loading fighter data...</div>;
  }


  // Only show "Fighter not found" if we have no data and queries have finished
  if (!fighterBasic && !fighterLoading && !initialData) {
    return <div>Fighter not found</div>;
  }
  
  // Handle gang data - with SSR we should always have gang data
  if (!initialData && !gang && gangId === 'placeholder') {
    return <div>Loading fighter data...</div>;
  }


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

  const handleFighterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fighterId = e.target.value;
    if (fighterId === 'none') {
      router.push('/');
    } else {
      router.push(`/fighter/${fighterId}`);
    }
  };

  // All handlers already defined above, starting rendering logic

  if (uiState.isLoading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="text-lg">Loading...</div>
    </div>
  );


  // Only show error if we have a real error OR no data from any source after loading is complete
  if (uiState.error || (!fighterBasic && !initialData && !isLoading)) return (
    <div className="flex justify-center items-center h-screen">
      <div className="text-lg text-red-500">
        {uiState.error || 'Fighter not found'}
      </div>
    </div>
  );

  // Get the first vehicle if available for display
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
              .map((gangFighter) => (
                <option key={gangFighter.id} value={gangFighter.id}>
                  {gangFighter.fighter_name} {gangFighter.fighter_type && `(${gangFighter.fighter_type})`}
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
            onAddXp={() => setUiState(prev => ({...prev, modals: {...prev.modals, addXp: true}}))}
            onEdit={canShowEditButtons ? () => setUiState(prev => ({...prev, modals: {...prev.modals, editFighter: true}})) : undefined}
            killed={fighterData.fighter?.killed}
            retired={fighterData.fighter?.retired}
            enslaved={fighterData.fighter?.enslaved}
            starved={fighterData.fighter?.starved}
            recovery={fighterData.fighter?.recovery}
            captured={fighterData.fighter?.captured}
            fighter_class={fighterData.fighter?.fighter_class}
            kills={fighterData.fighter?.kills || 0}
            effects={fighterData.fighter?.effects || { 
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
            owner_name={fighterData.fighter?.owner_name}
            image_url={fighterData.fighter?.image_url}
            userPermissions={userPermissions}
          />

          {/* Equipment Section */}
          <WeaponList
            fighterId={fighterData.fighter?.id || ''}
            gangId={fighterData.gang?.id || ''}
            userPermissions={userPermissions}
            onAddEquipment={() => setUiState(prev => ({...prev, modals: {...prev.modals, addWeapon: true}}))}
          />

          {/* Skills Section */}
          <SkillsList
            skills={fighterData.fighter?.skills || {}}
            fighterId={fighterData.fighter?.id || ''}
            free_skill={fighterData.fighter?.free_skill}
            userPermissions={userPermissions}
          />

          {/* Advancements Section */}
          <AdvancementsList
            fighterXp={fighterData.fighter?.xp || 0}
            fighterId={fighterData.fighter?.id || ''}
            advancements={fighterData.fighter?.effects?.advancements || []}
            skills={fighterData.fighter?.skills || {}}
            userPermissions={userPermissions}
            onAdvancementAdded={() => {
              // Invalidate fighter data when advancement is added
              invalidateFighterData();
            }}
            onAdvancementDeleted={() => {
              // Invalidate fighter data when advancement is deleted
              invalidateFighterData();
            }}
            onDeleteAdvancement={async (advancementId: string) => {
              // Invalidate fighter data when advancement is deleted
              invalidateFighterData();
            }}
          />

          {/* Injuries Section */}
          <InjuriesList
            injuries={fighterData.fighter?.effects?.injuries || []}
            fighterId={fighterData.fighter?.id || ''}
            fighterRecovery={fighterData.fighter?.recovery || false}
            fighter_class={fighterData.fighter?.fighter_class}
            userPermissions={userPermissions}
            onInjuryUpdate={() => {
              // Invalidate fighter data when injury is updated
              invalidateFighterData();
            }}
          />

          {/* Notes and Backstory Section */}
          <FighterNotes
            fighterId={fighterData.fighter?.id || ''}
            initialNote={fighterData.fighter?.note || ''}
            initialNoteBackstory={fighterData.fighter?.note_backstory || ''}
            userPermissions={userPermissions}
            detailsMutation={detailsMutation}
            onNoteUpdate={() => {
              // No longer need to invalidate - optimistic updates handle this
            }}
            onNoteBackstoryUpdate={() => {
              // No longer need to invalidate - optimistic updates handle this
            }}
          />

          {/* Fighter Actions Section */}
          <FighterActions
            fighter={{
              id: fighterData.fighter?.id || '',
              fighter_name: fighterData.fighter?.fighter_name || '',
              killed: fighterData.fighter?.killed,
              retired: fighterData.fighter?.retired,
              enslaved: fighterData.fighter?.enslaved,
              starved: fighterData.fighter?.starved,
              recovery: fighterData.fighter?.recovery,
              captured: fighterData.fighter?.captured,
              credits: fighterData.fighter?.credits || 0,
              campaigns: fighterData.fighter?.campaigns || []
            }}
            gang={{
              id: fighterData.gang?.id || ''
            }}
            fighterId={fighterData.fighter?.id || ''}
            userPermissions={userPermissions}
            onFighterUpdate={() => {
              // Invalidate fighter data when fighter status is updated
              invalidateFighterData();
            }}
          />

          {/* Vehicle Equipment Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleEquipmentList
              fighterId={fighterData.fighter?.id || ''}
              gangId={fighterData.gang?.id || ''}
              gangCredits={fighterData.gang?.credits || 0}
              fighterCredits={fighterData.fighter?.credits || 0}
              onEquipmentUpdate={handleEquipmentUpdate}
              onAddEquipment={() => setUiState(prev => ({...prev, modals: {...prev.modals, addVehicleEquipment: true}}))}
              userPermissions={userPermissions}
            />
          )}
        </div>

        {/* Modals */}
        {uiState.modals.addXp && (
          <FighterXpModal
            isOpen={uiState.modals.addXp}
            fighterId={fighterData.fighter?.id || ''}
            currentXp={fighterData.fighter?.xp || 0}
            onClose={() => setUiState(prev => ({...prev, modals: {...prev.modals, addXp: false}}))}
            onConfirm={() => {
              const xpValue = parseInt(editState.xpAmount);
              if (isNaN(xpValue) || xpValue === 0) {
                return Promise.resolve(false);
              }

              return new Promise<boolean>((resolve) => {
                xpMutation.mutate({
                  fighter_id: fighterData.fighter?.id || '',
                  xp_to_add: xpValue
                }, {
                  onSuccess: () => {
                    toast({
                      description: `XP ${xpValue > 0 ? 'added' : 'subtracted'} successfully`,
                      variant: "default"
                    });
                    
                    // Reset XP amount and close modal
                    setEditState(prev => ({...prev, xpAmount: '', xpError: ''}));
                    setUiState(prev => ({...prev, modals: {...prev.modals, addXp: false}}));
                    resolve(true);
                  },
                  onError: (error) => {
                    console.error('Error updating XP:', error);
                    toast({
                      description: error instanceof Error ? error.message : 'Failed to update XP',
                      variant: "destructive"
                    });
                    resolve(false);
                  }
                });
              });
            }}
            xpAmountState={{
              xpAmount: editState.xpAmount,
              xpError: editState.xpError
            }}
            onXpAmountChange={(value) => {
              const numValue = parseInt(value);
              let error = '';
              
              if (value !== '' && (isNaN(numValue) || numValue === 0)) {
                error = 'Please enter a valid number (not zero)';
              }
              
              setEditState(prev => ({
                ...prev,
                xpAmount: value,
                xpError: error
              }));
            }}
            isLoading={xpMutation.isPending}
          />
        )}

        {uiState.modals.addWeapon && (
          <ItemModal
            title="Add Equipment"
            onClose={() => setUiState(prev => ({...prev, modals: {...prev.modals, addWeapon: false}}))}
            gangCredits={fighterData.gang?.credits || 0}
            gangId={fighterData.gang?.id || ''}
            gangTypeId={fighterData.gang?.gang_type_id || ''}
            fighterId={fighterData.fighter?.id || ''}
            fighterTypeId={fighterData.fighter?.fighter_type?.fighter_type_id || ''}
            gangAffiliationId={fighterData.gang?.gang_affiliation_id}
            fighterCredits={fighterData.fighter?.credits || 0}
            fighterHasLegacy={Boolean(fighterData.gang?.gang_affiliation_id)}
            fighterLegacyName={fighterData.gang?.gang_affiliation_name}
            onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => {
              handleEquipmentBought(newFighterCredits, newGangCredits, boughtEquipment, false);
              setUiState(prev => ({...prev, modals: {...prev.modals, addWeapon: false}}));
            }}
          />
        )}

        {uiState.modals.addVehicleEquipment && vehicle && (
          <ItemModal
            title="Add Vehicle Equipment"
            onClose={() => setUiState(prev => ({...prev, modals: {...prev.modals, addVehicleEquipment: false}}))}
            gangCredits={fighterData.gang?.credits || 0}
            gangId={fighterData.gang?.id || ''}
            gangTypeId={fighterData.gang?.gang_type_id || ''}
            fighterId={fighterData.fighter?.id || ''}
            fighterTypeId={fighterData.fighter?.fighter_type?.fighter_type_id || ''}
            gangAffiliationId={fighterData.gang?.gang_affiliation_id}
            fighterCredits={fighterData.fighter?.credits || 0}
            vehicleId={vehicle.id}
            vehicleType={vehicle.vehicle_type}
            vehicleTypeId={vehicle.vehicle_type_id}
            isVehicleEquipment={true}
            allowedCategories={VEHICLE_EQUIPMENT_CATEGORIES}
            onEquipmentBought={(newFighterCredits, newGangCredits, boughtEquipment) => {
              handleEquipmentBought(newFighterCredits, newGangCredits, boughtEquipment, true);
              setUiState(prev => ({...prev, modals: {...prev.modals, addVehicleEquipment: false}}));
            }}
          />
        )}

        {uiState.modals.editFighter && (
          <EditFighterModal
            fighter={convertToFighterProps(fighterData.fighter!)}
            isOpen={uiState.modals.editFighter}
            initialValues={{
              name: fighterData.fighter?.fighter_name || '',
              label: fighterData.fighter?.label || '',
              kills: fighterData.fighter?.kills || 0,
              costAdjustment: editState.costAdjustment
            }}
            gangId={fighterData.gang?.id || ''}
            gangTypeId={fighterData.gang?.gang_type_id || ''}
            preFetchedFighterTypes={preFetchedFighterTypes}
            onClose={() => setUiState(prev => ({...prev, modals: {...prev.modals, editFighter: false}}))}
            onSubmit={(values) => {
              return new Promise<boolean>((resolve) => {
                detailsMutation.mutate({
                  fighter_id: fighterData.fighter?.id || '',
                  fighter_name: values.name,
                  label: values.label,
                  kills: values.kills,
                  cost_adjustment: parseInt(values.costAdjustment) || 0,
                  fighter_class: values.fighter_class,
                  fighter_class_id: values.fighter_class_id,
                  fighter_type: values.fighter_type,
                  fighter_type_id: values.fighter_type_id,
                  special_rules: values.special_rules,
                  fighter_sub_type: values.fighter_sub_type,
                  fighter_sub_type_id: values.fighter_sub_type_id,
                  fighter_gang_legacy_id: values.fighter_gang_legacy_id
                }, {
                  onSuccess: () => {
                    toast({
                      description: 'Fighter updated successfully',
                      variant: "default"
                    });
                    
                    setUiState(prev => ({...prev, modals: {...prev.modals, editFighter: false}}));
                    resolve(true);
                  },
                  onError: (error) => {
                    console.error('Error updating fighter:', error);
                    toast({
                      description: error instanceof Error ? error.message : 'Failed to update fighter',
                      variant: "destructive"
                    });
                    resolve(false);
                  }
                });
              });
            }}
            onStatsUpdate={() => {
              // Stats are updated optimistically within the EditFighterModal
              // No additional action needed here
            }}
          />
        )}
      </div>
    </main>
  );
}
