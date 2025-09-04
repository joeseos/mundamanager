'use client';

import { FighterDetailsCard } from "@/components/fighter/fighter-details-card";
import { WeaponList } from "@/components/fighter/fighter-equipment-list";
import { VehicleEquipmentList } from "@/components/fighter/vehicle-equipment-list";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from "@/components/ui/use-toast";
import ItemModal from "@/components/equipment";
import { AdvancementsList } from "@/components/fighter/fighter-advancement-list";
import { SkillsList } from "@/components/fighter/fighter-skills-list";
import { InjuriesList } from "@/components/fighter/fighter-injury-list";
import { FighterNotes } from "@/components/fighter/fighter-notes-list";
import { VEHICLE_EQUIPMENT_CATEGORIES } from '@/utils/vehicleEquipmentCategories';
import { EditFighterModal } from "@/components/fighter/fighter-edit-modal";
import { VehicleDamagesList } from "@/components/fighter/vehicle-lasting-damages";
import { FighterXpModal } from "@/components/fighter/fighter-xp-modal";
import { UserPermissions } from '@/types/user-permissions';
import { updateFighterXpWithOoa, updateFighterDetails, updateFighterEffects, editFighterStatus } from "@/app/lib/server-functions/edit-fighter";
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
  const { data: gangPositioning } = useQuery({
    queryKey: queryKeys.gangs.positioning(fighter?.gang_id || ''),
    queryFn: () => queryGangPositioning(fighter?.gang_id || ''),
    enabled: false // Disabled - data is prefetched on server
  });

  // Computed total cost from all query data
  const currentTotalCost = useMemo(() => {
    if (!fighter) return 0;
    
    const baseCost = fighter.credits || 0;
    const equipmentCost = (equipment || []).reduce((sum, item) => sum + (item.purchase_cost || 0), 0);
    const skillsCost = Object.values(skills || {}).reduce((sum, skill) => sum + (skill.credits_increase || 0), 0);
    const effectsCost = Object.values(effects || {}).flat().reduce((sum, effect) => {
      return sum + ((effect.type_specific_data as any)?.credits_increase || 0);
    }, 0);
    const costAdjustment = fighter.cost_adjustment || 0;
    
    return baseCost + equipmentCost + skillsCost + effectsCost + costAdjustment;
  }, [fighter, equipment, skills, effects]);

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
      queryClient.setQueryData(queryKeys.fighters.detail(variables.fighter_id), (old: any) => ({
        ...old,
        xp: old.xp + variables.xp_to_add,
        kills: old.kills + (variables.ooa_count || 0),
      }));

      return { previousFighter };
    },
    onError: (_err, variables, context) => {
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
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      
      // Optimistically update the fighter cache
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => ({
        ...old,
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
        ...(variables.note !== undefined && { note: variables.note }),
        ...(variables.note_backstory !== undefined && { note_backstory: variables.note_backstory }),
      }));
      
      return { previousFighter };
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic changes
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSuccess: () => {
      // Modal should close immediately after optimistic update
      handleModalToggle('editFighter', false);
    },
  });

  const updateEffectsMutation = useMutation({
    mutationFn: updateFighterEffects,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      
      // Snapshot previous values for rollback
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      
      // Optimistically update effects cache
      queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
        if (!old) return old;
        
        const newUserEffects = Object.entries(variables.stats).map(([statName, adjustment]) => ({
          id: `temp-${Date.now()}-${statName}`,
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
          ...old,
          user: [...(old?.user || []), ...newUserEffects]
        };
      });
      
      return { previousEffects };
    },
    onError: (_err, _variables, context) => {
      // Rollback optimistic changes
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
    },
  });

  // Fighter status mutation (kill, retire, sell, etc.)
  const statusMutation = useMutation({
    mutationFn: async (params: any) => {
      const result = await editFighterStatus(params);
      // Check if the server function returned an error
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
      if (currentGang?.id) {
        await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(currentGang.id) });
      }
      
      // Snapshot previous values
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));
      const previousGangCredits = currentGang?.id ? 
        queryClient.getQueryData(queryKeys.gangs.credits(currentGang.id)) : null;
      
      // Optimistically update fighter status
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => {
        if (!old) return old;
        
        const updates: any = {};
        
        switch (params.action) {
          case 'kill':
            updates.killed = !old.killed;
            break;
          case 'retire':
            updates.retired = !old.retired;
            break;
          case 'sell':
            updates.enslaved = true;
            break;
          case 'rescue':
            updates.enslaved = false;
            break;
          case 'starve':
            updates.starved = !old.starved;
            break;
          case 'recover':
            updates.recovery = !old.recovery;
            break;
          case 'capture':
            updates.captured = !old.captured;
            break;
        }
        
        return { ...old, ...updates };
      });
      
      // Optimistically update gang credits for sell action
      if (params.action === 'sell' && params.sell_value && currentGang?.id) {
        queryClient.setQueryData(queryKeys.gangs.credits(currentGang.id), (old: number) => {
          return (old || 0) + params.sell_value;
        });
      }
      
      return { previousFighter, previousGangCredits };
    },
    onError: (err, _variables, context) => {
      console.error('Fighter status mutation error:', err);
      
      // Show error toast
      toast({
        description: err instanceof Error ? err.message : 'Failed to update fighter status',
        variant: "destructive"
      });
      
      // Rollback optimistic changes
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
      
      // Rollback gang credits if they were updated
      if (context?.previousGangCredits !== undefined && currentGang?.id) {
        queryClient.setQueryData(queryKeys.gangs.credits(currentGang.id), context.previousGangCredits);
      }
    },
    onSuccess: (result, variables) => {
      console.log('Fighter status mutation success:', result);
      
      // Invalidate related queries to ensure fresh data
      if (currentGang?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.detail(currentGang.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(currentGang.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(currentGang.id) });
      }
      
      // Handle delete action redirect
      if (variables.action === 'delete' && result.data?.redirectTo) {
        router.push(result.data.redirectTo);
      }
    },
  });

  // Update edit state when fighter data changes
  useEffect(() => {
    if (fighter) {
      setEditState(prev => ({
        ...prev,
        costAdjustment: String(fighter.cost_adjustment || 0)
      }));
    }
  }, [fighter]);

  // Add conditional rendering based on permissions
  const canShowEditButtons = userPermissions.canEdit;

  // Helper function to convert Fighter to FighterProps for EditFighterModal
  const convertToFighterProps = (fighter: any): any => {
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
      total_xp: fighter.xp || 0,
      weapons: [],
      wargear: [],
      advancements: {
        characteristics: {},
        skills: {}
      },
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
      }
    };
  };

  // Gang fighters from initial data
  const gangFighters = initialGangFighters;

  const handleFighterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`/fighter/${e.target.value}`);
  };

  const handleNameUpdate = useCallback((_newName: string) => {
    // Update will be handled by TanStack Query optimistic updates
    // No local state update needed
  }, []);

  const handleAddXp = async (ooaCount?: number) => {
    if (!/^-?\\d+$/.test(editState.xpAmount)) {
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
    // If opening the Edit Fighter modal, fetch fighter types first
    if (modalName === 'editFighter' && value && gang?.id && gang?.gang_type_id) {
      fetchFighterTypes(gang.id, gang.gang_type_id).then(() => {
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
                   vehiclesLoading || gangLoading || creditsLoading;

  if (isLoading || uiState.isLoading) return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-6">
          Loading...
        </div>
      </div>
    </main>
  );

  // Use TanStack Query data directly
  const currentFighter = fighter;
  const currentEquipment = equipment;
  const currentSkills = skills;
  const currentEffects = effects;
  const currentVehicles = vehicles;
  const currentGang = gang;
  const currentCredits = gangCredits;

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
            {[...gangFighters]
              .sort((a, b) => {
                const positioning = gangPositioning || {};
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
              : (currentFighter?.fighter_type as any)?.fighter_type || ''}
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
            vehicleEquipment={vehicle?.equipment || []}
            userPermissions={userPermissions}
            owner_name={initialFighterData.fighter?.owner_name}
            image_url={currentFighter?.image_url}
          />

          {/* Vehicle Equipment Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleEquipmentList
              fighterId={fighterId}
              gangId={currentGang?.id || ''}
              gangCredits={currentCredits || 0}
              fighterCredits={currentFighter?.credits || 0}
              onEquipmentUpdate={() => {
                // Equipment updates will be handled by TanStack Query optimistic updates
              }}
              equipment={vehicle?.equipment || []}
              onAddEquipment={() => handleModalToggle('addVehicleEquipment', true)}
              userPermissions={userPermissions}
              vehicleEffects={vehicle.effects}
            />
          )}

          <WeaponList
            fighterId={fighterId}
            gangId={currentGang?.id || ''}
            gangCredits={currentCredits || 0}
            fighterCredits={currentFighter?.credits || 0}
            equipment={(currentEquipment as any) || []}
            onAddEquipment={() => handleModalToggle('addWeapon', true)}
            userPermissions={userPermissions}
          />

          <SkillsList
            fighterId={currentFighter?.id || ''}
            free_skill={currentFighter?.free_skill}
            userPermissions={userPermissions}
          />

          <AdvancementsList
            key={`advancements-${Object.keys(currentSkills || {}).length}`}
            fighterXp={currentFighter?.xp || 0}
            fighterId={currentFighter?.id || ''}
            advancements={currentEffects?.advancements || []}
            skills={currentSkills || {}}
            onDeleteAdvancement={async () => {
              // Data will be updated via TanStack Query optimistic updates
            }}
            onAdvancementAdded={() => {
              // Data will be updated via TanStack Query optimistic updates  
            }}
            userPermissions={userPermissions}
          />

          <InjuriesList
            injuries={currentEffects?.injuries || []}
            fighterId={currentFighter?.id || ''}
            gangId={currentFighter?.gang_id || ''}
            fighterRecovery={currentFighter?.recovery}
            userPermissions={userPermissions}
            fighter_class={currentFighter?.fighter_class}
          />

          {/* Vehicle Lasting Damage Section - only show if fighter has a vehicle */}
          {vehicle && (
            <VehicleDamagesList
              damages={vehicle.effects ? vehicle.effects["lasting damages"] || [] : []}
              onDamageUpdate={() => {
                // Damage updates will be handled by TanStack Query optimistic updates
              }}
              fighterId={currentFighter?.id || ''}
              vehicleId={vehicle.id}
              gangId={currentGang?.id || ''}
              vehicle={vehicle}
              gangCredits={currentCredits || 0}
              onGangCreditsUpdate={() => {
                // Credits updates will be handled by TanStack Query optimistic updates
              }}
              userPermissions={userPermissions}
            />
          )}

          {/* Notes Section */}
          <div className="mt-6">
            {currentFighter && (
              <FighterNotes
                fighterId={currentFighter.id}
                initialNote={currentFighter.note}
                initialNoteBackstory={currentFighter.note_backstory}
                onNoteUpdate={(params) => updateDetailsMutation.mutate(params)}
                onNoteBackstoryUpdate={(params) => updateDetailsMutation.mutate(params)}
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
              campaigns: (currentFighter as any)?.campaigns
            }}
            gang={{ id: currentGang?.id || '' }}
            fighterId={fighterId}
            userPermissions={userPermissions}
            onStatusUpdate={(params) => statusMutation.mutate(params)}
          />


          {uiState.modals.addXp && currentFighter && (
            <FighterXpModal
              isOpen={uiState.modals.addXp}
              fighterId={fighterId}
              currentXp={currentFighter.xp ?? 0}
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

          {uiState.modals.editFighter && currentFighter && (
            <EditFighterModal
              fighter={convertToFighterProps(currentFighter)}
              isOpen={uiState.modals.editFighter}
              initialValues={{
                name: currentFighter.fighter_name,
                label: currentFighter.label || '',
                kills: currentFighter.kills || 0,
                costAdjustment: String(currentFighter.cost_adjustment || 0)
              }}
              gangId={currentGang?.id || ''}
              gangTypeId={currentGang?.gang_type_id || ''}
              preFetchedFighterTypes={preFetchedFighterTypes}
              onClose={() => handleModalToggle('editFighter', false)}
              onSubmit={async (values) => {
                try {
                  // First, update fighter details
                  await updateDetailsMutation.mutateAsync({
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

                  // Then, update fighter effects if there are any stats changes
                  if (values.stats && Object.keys(values.stats).length > 0) {
                    await updateEffectsMutation.mutateAsync({
                      fighter_id: fighterId,
                      stats: values.stats
                    });
                  }

                  return true;
                } catch (error) {
                  console.error('Error updating fighter:', error);
                  return false;
                }
              }}
              onEffectsUpdate={async () => {
                // This is now just a placeholder - the actual effects update will happen
                // in the main fighter update mutation when the user confirms the main modal
                return true;
              }}
            />
          )}

          {uiState.modals.addWeapon && currentFighter && currentGang && (
            <ItemModal
              title="Add Equipment"
              onClose={() => handleModalToggle('addWeapon', false)}
              gangCredits={currentCredits || 0}
              gangId={currentGang?.id || ''}
              gangTypeId={currentGang?.gang_type_id}
              fighterId={currentFighter.id}
              fighterTypeId={currentFighter.fighter_type_id}
              gangAffiliationId={currentGang.gang_affiliation_id}
              fighterCredits={currentFighter.credits}
              fighterHasLegacy={Boolean(currentFighter?.fighter_gang_legacy_id)}
              fighterLegacyName={(currentFighter as any)?.fighter_gang_legacy?.name}
            />
          )}

          {uiState.modals.addVehicleEquipment && currentFighter && currentGang && vehicle && (
            <ItemModal
              title="Add Vehicle Equipment"
              onClose={() => handleModalToggle('addVehicleEquipment', false)}
              gangCredits={currentCredits || 0}
              gangId={currentGang?.id || ''}
              gangTypeId={currentGang?.gang_type_id}
              fighterId={currentFighter.id}
              fighterTypeId={currentFighter.fighter_type_id}
              fighterCredits={currentFighter.credits}
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