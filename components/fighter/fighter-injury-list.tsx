'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FighterEffect, FighterSkills } from '@/types/fighter';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPermissions } from '@/types/user-permissions';
import {
  addFighterInjury,
  deleteFighterInjury,
  verifyAndLogRolledFighterInjury
} from '@/app/actions/fighter-injury';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66Outcome, resolveInjuryFromUtil, resolveInjuryFromUtilCrew, resolveInjuryRangeFromUtilByName, resolveInjuryRangeFromUtilByNameCrew, resolveRigGlitchFromUtil, resolveRigGlitchRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';
import { Combobox } from '@/components/ui/combobox';
import { useMutation } from '@tanstack/react-query';
import FighterEffectSelection from '@/components/fighter-effect-selection';
import { hasKilledStatusFlag } from '@/utils/fighter-status';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  /** When true, open the Add Lasting Injury / Rig Glitch modal on mount (e.g. from gang card menu) */
  initialOpenAddModal?: boolean;
  /** When true, render only the add form (no list). Use when opening directly from gang card menu. */
  addFormOnly?: boolean;
  /** When addFormOnly, called when user cancels or after successful add (closes parent modal). */
  onRequestClose?: () => void;
  onInjuryUpdate?: (
    updatedInjuries: FighterEffect[],
    recoveryStatus?: boolean,
    capturedStatus?: boolean,
    capturedByGangId?: string | null,
    killedStatus?: boolean
  ) => void;
  onSkillsUpdate?: (updatedSkills: FighterSkills) => void;
  onKillCountUpdate?: (newKillCount: number) => void;
  onGangFinancialsUpdate?: (financials: { credits: number; rating: number; wealth: number }) => void;
  onEquipmentEffectUpdate?: (fighterEquipmentId: string | null, effectData: any | null) => void;
  skills?: FighterSkills;
  fighterId: string;
  fighterGangId?: string;
  fighterCampaigns?: Array<{ campaign_id?: string; id?: string }>;
  fighterRecovery?: boolean;
  fighterKilled?: boolean;
  fighterCaptured?: boolean;
  fighterCapturedByGangId?: string | null;
  userPermissions: UserPermissions;
  fighter_class?: string;
  is_spyrer?: boolean;
  kill_count?: number;
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
}

export function InjuriesList({
  injuries = [],
  initialOpenAddModal = false,
  addFormOnly = false,
  onRequestClose,
  onInjuryUpdate,
  onSkillsUpdate,
  onKillCountUpdate,
  onGangFinancialsUpdate,
  onEquipmentEffectUpdate,
  skills = {},
  fighterId,
  fighterGangId,
  fighterCampaigns,
  fighterRecovery = false,
  fighterKilled = false,
  fighterCaptured = false,
  fighterCapturedByGangId = null,
  userPermissions,
  fighter_class,
  is_spyrer = false,
  kill_count = 0,
  fighterWeapons
}: InjuriesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [clearAllKillCost, setClearAllKillCost] = useState<number>(4);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const [showEquipmentSelection, setShowEquipmentSelection] = useState(false);
  const [targetEquipmentId, setTargetEquipmentId] = useState<string | null>(null);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const [injuryRollCooldown, setInjuryRollCooldown] = useState(false);
  const [selectedCapturingGangId, setSelectedCapturingGangId] = useState<string>('');
  const [selectedBitterEnmityGangId, setSelectedBitterEnmityGangId] = useState<string>('');
  const [campaignGangs, setCampaignGangs] = useState<Array<{ id: string; name: string; gang_type: string; gang_colour?: string | null; owner_username?: string }>>([]);
  const [isFetchingGangs, setIsFetchingGangs] = useState(false);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] }>(null);

  const campaignIds = useMemo(() =>
    (fighterCampaigns ?? [])
      .map(campaign => campaign.campaign_id ?? campaign.id)
      .filter((campaignId): campaignId is string => Boolean(campaignId)),
    [fighterCampaigns]
  );

  const selectedInjuryRequiresCaptured = useMemo(() => {
    const typeSpecificData = selectedInjury?.type_specific_data && typeof selectedInjury.type_specific_data === 'object'
      ? selectedInjury.type_specific_data
      : {};
    return typeSpecificData.captured === "true";
  }, [selectedInjury]);

  const hasCapturedInjury = useMemo(
    () => fighterCaptured || injuries.some(injury => injury.effect_name === 'Captured'),
    [fighterCaptured, injuries]
  );

  const addInjuryBlockedByBitterEnmityGang = useMemo(
    () =>
      selectedInjury?.effect_name === 'Bitter Enmity' &&
      campaignGangs.length > 0 &&
      !selectedBitterEnmityGangId,
    [selectedInjury?.effect_name, campaignGangs.length, selectedBitterEnmityGangId]
  );

  // TanStack Query mutation for adding injuries
  const addInjuryMutation = useMutation({
    mutationFn: async (variables: { 
      fighter_id: string; 
      injury_type_id: string; 
      send_to_recovery?: boolean; 
      set_killed?: boolean; 
      set_captured?: boolean; 
      captured_by_gang_id?: string | null;
      target_equipment_id?: string;
      bitter_enmity_target_gang_id?: string | null;
      injury_data: any; // Full injury data for optimistic updates
    }) => {
      const result = await addFighterInjury({
        fighter_id: variables.fighter_id,
        injury_type_id: variables.injury_type_id,
        send_to_recovery: variables.send_to_recovery,
        set_killed: variables.set_killed,
        set_captured: variables.set_captured,
        captured_by_gang_id: variables.captured_by_gang_id,
        target_equipment_id: variables.target_equipment_id,
        bitter_enmity_target_gang_id: variables.bitter_enmity_target_gang_id ?? null
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to add lasting injury');
      }
      return result;
    },
    onMutate: async (variables) => {
      const injuryData = variables.injury_data;
      if (!injuryData) return {};

      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousSkills = { ...skills };
      const previousRecovery = fighterRecovery;
      const previousKilled = fighterKilled;
      const previousCaptured = fighterCaptured;
      const previousCapturedByGangId = fighterCapturedByGangId;

      const baseTsd =
        injuryData.type_specific_data && typeof injuryData.type_specific_data === 'object'
          ? { ...(injuryData.type_specific_data as object) }
          : {};
      let mergedTsd: Record<string, unknown> = { ...baseTsd };
      const bitterId = variables.bitter_enmity_target_gang_id;
      let bitterMeta: {
        bitter_enmity_target_gang_id: string;
        bitter_enmity_target_gang_name: string;
        bitter_enmity_target_gang_colour: string | null;
      } | null = null;
      if (bitterId) {
        const g = campaignGangs.find((row) => row.id === bitterId);
        bitterMeta = {
          bitter_enmity_target_gang_id: bitterId,
          bitter_enmity_target_gang_name: g?.name ?? '',
          bitter_enmity_target_gang_colour: g?.gang_colour ?? null
        };
        mergedTsd = { ...mergedTsd, ...bitterMeta };
      }

      // Optimistically add injury (data passed through variables)
      const tempInjury: FighterEffect = {
        ...injuryData,
        id: `optimistic-injury-${Date.now()}`,
        created_at: new Date().toISOString(),
        fighter_equipment_id: variables.target_equipment_id || undefined,
        type_specific_data: mergedTsd as FighterEffect['type_specific_data']
      };

      if (onInjuryUpdate) {
        onInjuryUpdate(
          [...injuries, tempInjury],
          variables.set_killed ? false : variables.send_to_recovery ? true : variables.set_captured ? false : undefined,
          variables.set_captured ? true : undefined,
          variables.set_captured ? (variables.captured_by_gang_id ?? null) : undefined,
          variables.set_killed ? true : undefined
        );
      }

      // Optimistically add equipment effect if attached to equipment
      if (variables.target_equipment_id && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(variables.target_equipment_id, tempInjury as any);
      }

      // Optimistically add skill if injury grants one
      const grantedSkill = injuryData?.granted_skill;
      let grantedSkillName: string | undefined;

      if (onSkillsUpdate && grantedSkill) {
        grantedSkillName = grantedSkill.name;
        const updatedSkills = {
          ...skills,
          [grantedSkill.name]: {
            id: `optimistic-skill-${Date.now()}`,
            credits_increase: 0,
            xp_cost: 0,
            is_advance: false,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: tempInjury.id,
            injury_name: injuryData?.effect_name,
            ...(bitterMeta ? bitterMeta : {})
          }
        };
        onSkillsUpdate(updatedSkills);
      }

      return {
        previousInjuries,
        previousSkills,
        previousRecovery,
        previousKilled,
        previousCaptured,
        previousCapturedByGangId,
        grantedSkillName,
        injuryName: injuryData?.effect_name,
        targetEquipmentId: variables.target_equipment_id
      };
    },
    onSuccess: (result, variables, context) => {
      const statusMessage: string[] = [];
      if (variables.send_to_recovery) statusMessage.push('fighter sent to Recovery');
      if (variables.set_killed) statusMessage.push('fighter marked as Killed');
      if (variables.set_captured) statusMessage.push('fighter marked as Captured');
      if (result.gang && onGangFinancialsUpdate) {
        onGangFinancialsUpdate(result.gang);
      }

      const successText = is_spyrer ? 'Rig glitch added successfully' : 'Lasting injury added successfully';
      toast.success(`${successText}${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`);

      if (addFormOnly) onRequestClose?.();

      // Replace optimistic injury with real one from server so delete/other actions use real id
      if (result.injury && context?.previousInjuries && onInjuryUpdate) {
        const realInjury: FighterEffect = {
          ...result.injury,
          fighter_equipment_id: variables.target_equipment_id || undefined,
        };
        onInjuryUpdate(
          [...context.previousInjuries, realInjury],
          result.recovery_status ?? (variables.set_killed ? false : variables.send_to_recovery ? true : variables.set_captured ? false : undefined),
          variables.set_captured ? true : undefined,
          variables.set_captured ? (variables.captured_by_gang_id ?? null) : undefined,
          result.killed_status ?? (variables.set_killed ? true : undefined)
        );
      }

      // Reconcile equipment effect with server response (replace optimistic with real data)
      if (context?.targetEquipmentId && result.injury && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.targetEquipmentId, result.injury);
      }
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(
          context.previousInjuries,
          context.previousRecovery,
          context.previousCaptured,
          context.previousCapturedByGangId,
          context.previousKilled
        );
      }
      if (context?.previousSkills && onSkillsUpdate) {
        onSkillsUpdate(context.previousSkills);
      }
      // Rollback equipment effect
      if (context?.targetEquipmentId && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.targetEquipmentId, null);
      }

      const errorText = is_spyrer ? 'Failed to add rig glitch' : 'Failed to add lasting injury';
      toast.error(`${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // TanStack Query mutation for deleting injuries
  const deleteInjuryMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; injury_id: string }) => {
      const result = await deleteFighterInjury(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete lasting injury');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the injury being deleted
      const injuryToDelete = injuries.find(i => i.id === variables.injury_id);
      if (!injuryToDelete) return {};

      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousSkills = { ...skills };
      const previousKilled = fighterKilled;
      const fighterEquipmentId = (injuryToDelete as any)?.fighter_equipment_id;
      const updatedInjuries = injuries.filter(i => i.id !== variables.injury_id);
      const shouldClearKilled = hasKilledStatusFlag(injuryToDelete.type_specific_data)
        && !updatedInjuries.some(injury => hasKilledStatusFlag(injury.type_specific_data));

      // Optimistically remove injury
      if (onInjuryUpdate) {
        onInjuryUpdate(
          updatedInjuries,
          undefined,
          undefined,
          undefined,
          shouldClearKilled ? false : undefined
        );
      }

      // Optimistically remove equipment effect if attached to equipment
      if (fighterEquipmentId && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(fighterEquipmentId, null);
      }

      // Optimistically remove skill if injury granted one
      const injuryName = injuryToDelete.effect_name;
      if (onSkillsUpdate) {
        const updatedSkills = { ...skills };
        Object.keys(updatedSkills).forEach(skillName => {
          const skill = updatedSkills[skillName];
          if (skill.injury_name === injuryName) {
            delete updatedSkills[skillName];
          }
        });
        onSkillsUpdate(updatedSkills);
      }

      return {
        previousInjuries,
        previousSkills,
        previousKilled,
        injuryName,
        fighterEquipmentId,
        previousEffect: injuryToDelete,
        updatedInjuries
      };
    },
    onSuccess: (result, variables, context) => {
      if (result.killed_status !== undefined && context?.updatedInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.updatedInjuries, undefined, undefined, undefined, result.killed_status);
      }
      if (result.gang && onGangFinancialsUpdate) {
        onGangFinancialsUpdate(result.gang);
      }
      toast.success(`${context?.injuryName || 'Injury'} removed successfully`);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(
          context.previousInjuries,
          undefined,
          undefined,
          undefined,
          context.previousKilled
        );
      }
      if (context?.previousSkills && onSkillsUpdate) {
        onSkillsUpdate(context.previousSkills);
      }
      // Rollback equipment effect removal
      if (context?.fighterEquipmentId && context?.previousEffect && onEquipmentEffectUpdate) {
        onEquipmentEffectUpdate(context.fighterEquipmentId, context.previousEffect as any);
      }

      const errorText = is_spyrer ? 'Failed to delete rig glitch' : 'Failed to delete lasting injury';
      toast.error(`${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // TanStack Query mutation for clearing all glitches
  const clearAllGlitchesMutation = useMutation({
    mutationFn: async (params: { currentKillCount: number; glitches: FighterEffect[]; costInKills: number }) => {
      // Check if fighter has enough kills
      if (params.currentKillCount < params.costInKills) {
        throw new Error(`Not enough kills. Required: ${params.costInKills}, Available: ${params.currentKillCount}`);
      }

      // Delete all glitches
      let deletedCount = 0;
      let killedStatus: boolean | undefined = undefined;
      let gangFinancials: { credits: number; rating: number; wealth: number } | undefined = undefined;
      for (const injury of params.glitches) {
        const result = await deleteFighterInjury({
          fighter_id: fighterId,
          injury_id: injury.id
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete glitch');
        }
        if (result.killed_status !== undefined) {
          killedStatus = result.killed_status;
        }
        if (result.gang) {
          gangFinancials = result.gang;
        }
        deletedCount++;
      }

      // Deduct kills from kill_count
      const newKillCount = params.currentKillCount - params.costInKills;
      const updateResult = await updateFighterDetails({
        fighter_id: fighterId,
        kill_count: newKillCount
      });

      if (!updateResult.success) {
        throw new Error('Failed to update kill count');
      }

      return { clearedCount: deletedCount, newKillCount, killedStatus, gangFinancials };
    },
    onMutate: async (params) => {
      // Store previous state for rollback
      const previousInjuries = [...injuries];
      const previousKillCount = params.currentKillCount;
      const previousKilled = fighterKilled;
      const shouldClearKilled = params.glitches.some(injury => hasKilledStatusFlag(injury.type_specific_data));

      // Optimistically clear all injuries
      if (onInjuryUpdate) {
        onInjuryUpdate([], undefined, undefined, undefined, shouldClearKilled ? false : undefined);
      }

      // Optimistically update kill count
      if (onKillCountUpdate) {
        onKillCountUpdate(params.currentKillCount - params.costInKills);
      }

      return {
        previousInjuries,
        previousKillCount,
        previousKilled
      };
    },
    onSuccess: (result) => {
      if (result.killedStatus !== undefined && onInjuryUpdate) {
        onInjuryUpdate([], undefined, undefined, undefined, result.killedStatus);
      }
      if (result.gangFinancials && onGangFinancialsUpdate) {
        onGangFinancialsUpdate(result.gangFinancials);
      }
      toast.success(`Successfully cleared ${result.clearedCount} rig glitches. New kill count: ${result.newKillCount}`);
      setIsClearAllModalOpen(false);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries, undefined, undefined, undefined, context.previousKilled);
      }
      if (context?.previousKillCount !== undefined && onKillCountUpdate) {
        onKillCountUpdate(context.previousKillCount);
      }

      toast.error(error instanceof Error ? error.message : 'Failed to clear rig glitches');
    }
  });

  // TanStack Query mutation for logging rolled injury results
  const logInjuryRollMutation = useMutation({
    mutationFn: async (variables: { 
      fighter_id: string; 
      injury_type_id: string;
      injury_table: string;
      dice_data: any;
    }) => {
      const result = await verifyAndLogRolledFighterInjury({
        fighter_id: variables.fighter_id,
        injury_type_id: variables.injury_type_id,
        injury_table: variables.injury_table,
        dice_data: variables.dice_data
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to log lasting injury');
      }
      return result;
    },
    onSuccess: (result, variables, context) => {
      const statusMessage: string[] = [];
      
      const successText = is_spyrer ? 'Rig glitch logged successfully' : 'Lasting injury logged successfully';
      toast.success(`${successText}${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`);
    },
    onError: (error, variables, context) => {
      const errorText = is_spyrer ? 'Failed to log rig glitch' : 'Failed to log lasting injury';
      toast.error(`${errorText}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Helper function to format the range display
  const formatInjuryRange = (injuryName: string): string => {
    const range = is_spyrer
      ? resolveRigGlitchRangeFromUtilByName(injuryName)
      : (fighter_class === 'Crew'
        ? resolveInjuryRangeFromUtilByNameCrew(injuryName)
        : resolveInjuryRangeFromUtilByName(injuryName));

    if (!range) return '';

    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Coordinates applying a resolved dice roll:
  // - Guards against duplicate submissions
  // - Applies UI selection state
  // - Logs the roll to the server
  // - Enforces a short cooldown to prevent spam
  const logResolvedRollWithCooldown = (injury: FighterEffect, roll: number) => {  
    if (injuryRollCooldown || logInjuryRollMutation.isPending) {
      return false;
    }

    setInjuryRollCooldown(true);

    // Ensure the cooldown is always released once it has been set
    try {
      selectRolledInjury(injury);
      logRolledInjury(injury, roll);
      return true;      
    } finally {
      // Cooldown to prevent rapid re-rolling and excessive logging
      setTimeout(() => setInjuryRollCooldown(false), 2000);
    }
  };

  // Updates local UI state to reflect the injury produced by a dice roll.
  // This is purely a UI concern and does not trigger any persistence.
  const selectRolledInjury = (injury: FighterEffect) => {
    setSelectedInjuryId(injury.id);
    setSelectedInjury(injury);
  };
  
  // Persists a resolved dice roll to the backend for auditing / verification.
  // Fire-and-forget mutation; success and error handling are managed by the mutation.
  const logRolledInjury = (injury: FighterEffect, roll: number) => {
    const injuryTable = is_spyrer
      ? 'Rig Glitch'
      : (fighter_class === 'Crew' ? 'Lasting Injury Crew' : 'Lasting Injury');

    logInjuryRollMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: injury.id,
      injury_table: injuryTable,
      dice_data: { result: roll }
    });
  };

  const fetchAvailableInjuries = useCallback(async () => {
    if (isLoadingInjuries) return;

    try {
      setIsLoadingInjuries(true);
      const response = await fetch(
        `/api/fighters/injuries?is_spyrer=${is_spyrer}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      if (!response.ok) throw new Error(is_spyrer ? 'Failed to fetch rig glitches' : 'Failed to fetch lasting injuries');
      const data: FighterEffect[] = await response.json();

      setLocalAvailableInjuries(data);
    } catch (error) {
      console.error(is_spyrer ? 'Error fetching rig glitches:' : 'Error fetching lasting injuries:', error);
      toast.error(is_spyrer ? 'Failed to load rig glitch types' : 'Failed to load lasting injury types');
    } finally {
      setIsLoadingInjuries(false);
    }
  }, [isLoadingInjuries, is_spyrer, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
    if (localAvailableInjuries.length === 0) {
      fetchAvailableInjuries();
    }
  }, [localAvailableInjuries.length, fetchAvailableInjuries]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedInjuryId('');
    setSelectedInjury(null);
    setSelectedCapturingGangId('');
    setSelectedBitterEnmityGangId('');
  }, []);

  // When opened from gang card menu, open the Add modal (or add-form-only view) and fetch if needed
  useEffect(() => {
    if (!initialOpenAddModal && !addFormOnly) return;
    setIsAddModalOpen(true);
    if (localAvailableInjuries.length === 0) {
      fetchAvailableInjuries();
    }
  // Only run when mounting with initialOpenAddModal or addFormOnly true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenAddModal, addFormOnly]);

  useEffect(() => {
    const needsCampaignGangPicker =
      campaignIds.length > 0 &&
      (selectedInjuryRequiresCaptured || selectedInjury?.effect_name === 'Bitter Enmity');

    if (!needsCampaignGangPicker) {
      setCampaignGangs([]);
      setSelectedCapturingGangId('');
      setSelectedBitterEnmityGangId('');
      return;
    }

    let cancelled = false;
    setIsFetchingGangs(true);

    const fetchGangs = async () => {
      try {
        const allGangs: Array<{ id: string; name: string; gang_type: string; gang_colour?: string | null; owner_username?: string }> = [];
        const seenIds = new Set<string>();

        const gangResults = await Promise.all(
          campaignIds.map(async (campaignId) => {
            const res = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`);
            if (!res.ok) return [];
            return await res.json();
          })
        );

        for (const gangs of gangResults) {
          for (const g of gangs) {
            if (g.id !== fighterGangId && !seenIds.has(g.id)) {
              seenIds.add(g.id);
              allGangs.push({
                id: g.id,
                name: g.name,
                gang_type: g.gang_type,
                gang_colour: g.gang_colour ?? undefined,
                owner_username: g.owner_username
              });
            }
          }
        }

        if (!cancelled) {
          setCampaignGangs(allGangs);
        }
      } catch (err) {
        console.error('Failed to fetch campaign gangs:', err);
      } finally {
        if (!cancelled) setIsFetchingGangs(false);
      }
    };

    fetchGangs();
    return () => { cancelled = true; };
  }, [selectedInjuryRequiresCaptured, selectedInjury?.effect_name, campaignIds, fighterGangId]);

  const handleAddInjury = async () => {
    if (!selectedInjuryId) {
      toast.error("Please select a lasting injury");
      return false;
    }

    // Find the selected injury object
    const injury = localAvailableInjuries.find(injury => injury.id === selectedInjuryId);
    if (!injury) {
      toast.error("Selected lasting injury not found");
      return false;
    }

    setSelectedInjury(injury);

    // Check if the injury requires Recovery or Captured status
    const typeSpecificData = injury.type_specific_data && typeof injury.type_specific_data === 'object' ? injury.type_specific_data : {};
    const appliesToEquipment = typeSpecificData.applies_to === 'equipment';
    const requiresRecovery = typeSpecificData.recovery === "true";
    const requiresKilled = hasKilledStatusFlag(typeSpecificData);
    const requiresCaptured = typeSpecificData.captured === "true";

    if (requiresCaptured && hasCapturedInjury) {
      toast.error("This fighter already has the Captured lasting injury");
      return false;
    }

    if (
      injury.effect_name === 'Bitter Enmity' &&
      campaignGangs.length > 0 &&
      !selectedBitterEnmityGangId
    ) {
      toast.error('Please select the enemy gang for Bitter Enmity');
      return false;
    }

    const bitterEnmitySubmitId =
      injury.effect_name === 'Bitter Enmity' && selectedBitterEnmityGangId
        ? selectedBitterEnmityGangId
        : undefined;

    // Check if glitch requires equipment selection FIRST
    // Only show equipment selection if there are weapons available to select
    if (appliesToEquipment) {
      const hasAvailableEquipment = fighterWeapons && fighterWeapons.length > 0;
      
      if (hasAvailableEquipment) {
        setIsAddModalOpen(false);
        setShowEquipmentSelection(true);
        return false;
      }
      // Show error instead of silently falling through
      toast.error("This effect requires equipment but the fighter has no weapons");
      return false;
    }

    // If fighter is already in Recovery, don't show the Recovery modal again
    if (requiresCaptured) {
      // Captured injuries mark the fighter as Captured and optionally record the capturing gang.
      setIsAddModalOpen(false);
      if (addFormOnly) onRequestClose?.();
      addInjuryMutation.mutate({
        fighter_id: fighterId,
        injury_type_id: selectedInjuryId,
        send_to_recovery: false,
        set_killed: requiresKilled,
        set_captured: true,
        captured_by_gang_id: selectedCapturingGangId || null,
        bitter_enmity_target_gang_id: bitterEnmitySubmitId,
        injury_data: injury
      });
      return true;
    } else if (requiresRecovery && !fighterRecovery) {
      // Close the injury selection modal and open the Recovery confirmation modal
      setIsAddModalOpen(false);
      setIsRecoveryModalOpen(true);
      return false;
    } else {
      // Directly add the injury without asking for status changes
      // Close modal immediately and trigger mutation
      setIsAddModalOpen(false);
      if (addFormOnly) onRequestClose?.();
      addInjuryMutation.mutate({
        fighter_id: fighterId,
        injury_type_id: selectedInjuryId,
        send_to_recovery: false,
        set_killed: requiresKilled,
        set_captured: false,
        bitter_enmity_target_gang_id: bitterEnmitySubmitId,
        injury_data: injury
      });
      return true;
    }
  };

  const proceedWithAddingInjury = (sendToRecovery: boolean = false, setCaptured: boolean = false) => {
    if (!selectedInjuryId) {
      toast.error("Please select a lasting injury");
      return;
    }

    if (
      selectedInjury?.effect_name === 'Bitter Enmity' &&
      campaignGangs.length > 0 &&
      !selectedBitterEnmityGangId
    ) {
      toast.error('Please select the enemy gang for Bitter Enmity');
      return;
    }

    // Close modals immediately
    setIsRecoveryModalOpen(false);

    const typeSpecificData = selectedInjury?.type_specific_data && typeof selectedInjury.type_specific_data === 'object'
      ? selectedInjury.type_specific_data
      : {};

    const bitterForProceed =
      selectedInjury?.effect_name === 'Bitter Enmity' && selectedBitterEnmityGangId
        ? selectedBitterEnmityGangId
        : undefined;

    // Trigger mutation
    addInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: selectedInjuryId,
      send_to_recovery: sendToRecovery,
      set_killed: hasKilledStatusFlag(typeSpecificData),
      set_captured: setCaptured,
      captured_by_gang_id: setCaptured ? (selectedCapturingGangId || null) : undefined,
      target_equipment_id: targetEquipmentId || undefined,
      bitter_enmity_target_gang_id: bitterForProceed,
      injury_data: selectedInjury
    });

    // Reset target after mutation
    setTargetEquipmentId(null);
    setSelectedCapturingGangId('');
    setSelectedBitterEnmityGangId('');
  };

  const handleDeleteInjury = (injuryId: string, injuryName: string) => {
    // Close modal immediately
    setDeleteModalData(null);

    // Trigger mutation
    deleteInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_id: injuryId
    });
  };

  const glitchCount = is_spyrer
    ? injuries.filter(inj => {
        const typeData = inj.type_specific_data && typeof inj.type_specific_data === 'object'
          ? inj.type_specific_data
          : {};
        return typeData.adds_to_glitch_count === true;
      }).length
    : 0;
  const title = is_spyrer
    ? (
        <>
          Rig Glitches <span className="text-sm sm:hidden">({glitchCount})</span><span className="text-sm hidden sm:inline">(Glitch count: {glitchCount})</span>
        </>
      )
    : "Lasting Injuries";

  // Handler for clearing all glitches
  const handleClearAllGlitches = () => {
    clearAllGlitchesMutation.mutate({
      currentKillCount: kill_count,
      glitches: injuries,
      costInKills: clearAllKillCost
    });
    return true;
  };

  // Reset cost when modal opens
  const handleOpenClearAllModal = () => {
    setClearAllKillCost(4);
    setIsClearAllModalOpen(true);
  };

  // Add form content when addFormOnly (no list, no inner modal). Rendered inside parent modal.
  const addFormContent = (
    <div className="space-y-4">
      <div>
        <DiceRoller
          items={localAvailableInjuries}
          ensureItems={localAvailableInjuries.length === 0 ? fetchAvailableInjuries : undefined}
          getRange={(i: FighterEffect) => {
            const d: any = (i as any)?.type_specific_data || {};
            if (typeof d.d66_min === 'number' && typeof d.d66_max === 'number') {
              return { min: d.d66_min, max: d.d66_max };
            }
            return null;
          }}
          getName={(i: FighterEffect) => (i as any).effect_name}
          inline
          rollFn={rollD66Outcome}
          resolveNameForRoll={(r) => {
            const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
            return resolver(r)?.name;
          }}
          onRolled={(rolled) => {
            if (rolled.length > 0) {
              const roll = rolled[0].roll;
              const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
              const util = resolver(roll);
              let match: any = null;
              if (util) {
                match = localAvailableInjuries.find(i => (i as any).effect_name === util.name);
              }
              if (!match) {
                match = rolled[0].item as any;
              }
              if (match) {
                logResolvedRollWithCooldown(match, roll);
              }
            }
          }}
          onRoll={(roll) => {
            const resolver = is_spyrer ? resolveRigGlitchFromUtil : (fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil);
            const util = resolver(roll);
            if (!util) return;
            const match = localAvailableInjuries.find(i => (i as any).effect_name === util.name) as any;
            if (match) {
              logResolvedRollWithCooldown(match, roll);
            }
          }}
          buttonText="Roll D66"
          disabled={
            !userPermissions.canEdit ||
            logInjuryRollMutation.isPending ||
            injuryRollCooldown
          }
        />
      </div>
      <div className="space-y-2 pt-3 border-t">
        <label htmlFor="injurySelect" className="text-sm font-medium">
          {is_spyrer ? "Rig Glitches" : "Lasting Injuries"}
        </label>
        <Combobox
          value={selectedInjuryId}
          onValueChange={(value) => {
            setSelectedInjuryId(value);
            setSelectedCapturingGangId('');
            setSelectedBitterEnmityGangId('');
            if (value) {
              const selectedInjury = localAvailableInjuries.find(injury => injury.id === value);
              setSelectedInjury(selectedInjury || null);
            } else {
              setSelectedInjury(null);
            }
          }}
          placeholder={isLoadingInjuries && localAvailableInjuries.length === 0
            ? "Loading injuries..."
            : is_spyrer ? "Select a Rig Glitch" : "Select a Lasting Injury"
          }
          disabled={isLoadingInjuries && localAvailableInjuries.length === 0}
          options={Object.entries(
            localAvailableInjuries
              .slice()
              .filter(injury => {
                if (fighter_class === 'Crew') {
                  return lastingInjuryCrewRank.hasOwnProperty(injury.effect_name);
                }
                if (injury.effect_name === 'Captured' && hasCapturedInjury) {
                  return false;
                }
                return true;
              })
              .sort((a, b) => {
                const rangeA = formatInjuryRange(a.effect_name);
                const rangeB = formatInjuryRange(b.effect_name);
                if (!rangeA && !rangeB) return 0;
                if (!rangeA) return 1;
                if (!rangeB) return -1;
                const minA = parseInt(rangeA.split('-')[0]);
                const minB = parseInt(rangeB.split('-')[0]);
                return minA - minB;
              })
              .reduce((groups, injury) => {
                const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                const rank = rankMap[injury.effect_name] ?? Infinity;
                let groupLabel = "Other Injuries";
                if (is_spyrer) {
                  groupLabel = "Rig Glitches";
                } else if (rank <= 29) {
                  groupLabel = "Lasting Injuries";
                } else if (rank >= 30) {
                  groupLabel = "Mutations / Festering Injuries";
                }
                if (!groups[groupLabel]) groups[groupLabel] = [];
                groups[groupLabel].push(injury);
                return groups;
              }, {} as Record<string, typeof localAvailableInjuries>)
          ).flatMap(([groupLabel, injuries]) => [
            {
              value: `__header_${groupLabel}`,
              label: <span className="font-bold text-sm">{groupLabel}</span>,
              displayValue: groupLabel,
              disabled: true
            },
            ...injuries.map((injury) => {
              const range = formatInjuryRange(injury.effect_name);
              const displayText = range ? `${range} ${injury.effect_name}` : injury.effect_name;
              return {
                value: injury.id,
                label: range ? (
                  <>
                    <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{injury.effect_name}
                  </>
                ) : injury.effect_name,
                displayValue: displayText
              };
            })
          ])}
        />
      </div>
      {selectedInjuryRequiresCaptured && campaignIds.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Captured by
          </label>
          {isFetchingGangs ? (
            <p className="text-sm text-muted-foreground">Loading gangs...</p>
          ) : campaignGangs.length > 0 ? (
            <Combobox
              options={campaignGangs
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(g => {
                  const owner = g.owner_username ? ` \u2022 ${g.owner_username}` : '';
                  return {
                    value: g.id,
                    label: (
                      <span>
                        <span>{g.name}</span>
                        {owner && <span className="text-xs text-muted-foreground">{owner}</span>}
                      </span>
                    ),
                    displayValue: `${g.name}${owner}`,
                  };
                })
              }
              value={selectedCapturingGangId}
              onValueChange={setSelectedCapturingGangId}
              placeholder="Select capturing gang..."
              clearable
            />
          ) : (
            <p className="text-sm text-muted-foreground">No other gangs in campaign.</p>
          )}
        </div>
      )}
      {selectedInjury?.effect_name === 'Bitter Enmity' && campaignIds.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Against
          </label>
          {isFetchingGangs ? (
            <p className="text-sm text-muted-foreground">Loading gangs...</p>
          ) : campaignGangs.length > 0 ? (
            <Combobox
              options={campaignGangs
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(g => {
                  const owner = g.owner_username ? ` \u2022 ${g.owner_username}` : '';
                  const colour = g.gang_colour || '#888888';
                  return {
                    value: g.id,
                    label: (
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                          style={{ backgroundColor: colour }}
                          aria-hidden
                        />
                        <span>{g.name}</span>
                        {owner && <span className="text-xs text-muted-foreground">{owner}</span>}
                      </span>
                    ),
                    displayValue: `${g.name}${owner}`,
                  };
                })
              }
              value={selectedBitterEnmityGangId}
              onValueChange={setSelectedBitterEnmityGangId}
              placeholder="Select enemy gang..."
              clearable
            />
          ) : (
            <p className="text-sm text-muted-foreground">No other gangs in campaign.</p>
          )}
        </div>
      )}
      {addFormOnly && (
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onRequestClose} disabled={addInjuryMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAddInjury()}
            disabled={!selectedInjuryId || addInjuryMutation.isPending || addInjuryBlockedByBitterEnmityGang}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
          >
            {is_spyrer ? "Add Rig Glitch" : "Add Lasting Injury"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {addFormOnly ? addFormContent : null}
      {!addFormOnly && (is_spyrer ? (
        <div className="mt-6">
          <div className="flex flex-wrap justify-between items-center mb-2">
            <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
            <div className="flex gap-2">
              <Button
                onClick={handleOpenClearAllModal}
                className="bg-card hover:bg-muted text-foreground border border-border"
                disabled={injuries.length === 0 || !userPermissions.canEdit || kill_count < 1 || clearAllGlitchesMutation.isPending}
              >
                Clear all
              </Button>
              <Button
                onClick={handleOpenModal}
                className="bg-neutral-900 hover:bg-gray-800 text-white"
                disabled={!userPermissions.canEdit}
              >
                Add
              </Button>
            </div>
          </div>

          <div>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                {injuries.length > 0 && (
                  <thead>
                    <tr className="bg-muted">
                      <th className="px-1 py-1 text-left" style={{ width: '75%' }}>Name</th>
                      <th className="px-1 py-1 text-right">Action</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {injuries.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="text-muted-foreground italic text-center py-4">
                        No rig glitches yet.
                      </td>
                    </tr>
                  ) : (
                    injuries
                      .sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return dateA - dateB;
                      })
                      .map((injury) => (
                        <tr key={injury.id} className="border-t">
                          <td className="px-1 py-1">{injury.effect_name}</td>
                          <td className="px-1 py-1">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline_remove"
                                size="sm"
                                onClick={() => setDeleteModalData({
                                  id: injury.id,
                                  name: injury.effect_name
                                })}
                                disabled={deleteInjuryMutation.isPending || !userPermissions.canEdit}
                                className="text-xs px-1.5 h-6"
                                title="Delete"
                              >
                                <LuTrash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <List
          title={title}
          items={injuries
            .sort((a, b) => {
              const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
              const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
              return dateA - dateB;
            })
            .map((injury) => ({
              id: injury.id,
              name: injury.effect_name,
              injury_id: injury.id
            }))
          }
          columns={[
            {
              key: 'name',
              label: 'Name',
              width: '75%'
            }
          ]}
          actions={[
            {
              icon: <LuTrash2 className="h-4 w-4" />,
              title: "Delete",
              variant: 'outline_remove',
              onClick: (item) => setDeleteModalData({
                id: item.injury_id,
                name: item.name
              }),
              disabled: () => deleteInjuryMutation.isPending || !userPermissions.canEdit
            }
          ]}
          onAdd={handleOpenModal}
          addButtonDisabled={!userPermissions.canEdit}
          addButtonText="Add"
          emptyMessage={is_spyrer ? "No rig glitches yet." : "No lasting injuries yet."}
        />
      ) )}

      {isAddModalOpen && !addFormOnly && (
        <Modal
          title={is_spyrer ? "Add Rig Glitches" : "Add Lasting Injuries"}
          content={addFormContent}
          onClose={handleCloseModal}
          onConfirm={handleAddInjury}
          confirmText={is_spyrer ? "Add Rig Glitch" : "Add Lasting Injury"}
          confirmDisabled={!selectedInjuryId || addInjuryMutation.isPending || addInjuryBlockedByBitterEnmityGang}
        />
      )}

      {isRecoveryModalOpen && (
        <div
          className="fixed inset-0 min-h-screen bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-[100] px-[10px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsRecoveryModalOpen(false);
              setSelectedInjuryId('');
              setSelectedInjury(null);
              setTargetEquipmentId(null);
            }
          }}
        >
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">Send fighter into Recovery?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsRecoveryModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                    setTargetEquipmentId(null);
                  }}
                  className="text-muted-foreground hover:text-muted-foreground text-xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-[10px] py-4">
              <p><strong>Do you want to send the fighter into Recovery?</strong></p>
              <p className="text-sm text-amber-500">You will need to manually remove the Recovery flag the next time you update the gang.</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsRecoveryModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                  setTargetEquipmentId(null);
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(false, false); }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(true, false); }}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalData && (
        <Modal
          title={is_spyrer ? "Delete Rig Glitch" : "Delete Lasting Injury"}
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => { void handleDeleteInjury(deleteModalData.id, deleteModalData.name); return true; }}
        />
      )}

      {showEquipmentSelection && selectedInjury && (
        <Modal
          title="Select Weapon"
          content={
            <FighterEffectSelection
              ref={effectSelectionRef}
              equipmentId=""
              effectTypes={[]}
              targetSelectionOnly
              fighterId={fighterId}
              modifierEquipmentId=""
              effectTypeId={selectedInjury.id}
              effectName={selectedInjury.effect_name}
              fighterWeapons={fighterWeapons}
              onApplyToTarget={async (equipmentId) => {
                setTargetEquipmentId(equipmentId);
                setShowEquipmentSelection(false);

                const typeSpecificData = (selectedInjury as any).type_specific_data || {};
                const requiresRecovery = typeSpecificData.recovery === "true";
                const requiresKilled = hasKilledStatusFlag(typeSpecificData);
                const requiresCaptured = typeSpecificData.captured === "true";

                // Check for recovery/captured modal or proceed directly
                if (requiresCaptured) {
                  addInjuryMutation.mutate({
                    fighter_id: fighterId,
                    injury_type_id: selectedInjuryId,
                    send_to_recovery: false,
                    set_killed: requiresKilled,
                    set_captured: true,
                    captured_by_gang_id: selectedCapturingGangId || null,
                    target_equipment_id: equipmentId,
                    bitter_enmity_target_gang_id:
                      selectedInjury.effect_name === 'Bitter Enmity' && selectedBitterEnmityGangId
                        ? selectedBitterEnmityGangId
                        : undefined,
                    injury_data: selectedInjury
                  });
                  // Reset state
                  setTargetEquipmentId(null);
                  setSelectedCapturingGangId('');
                  setSelectedBitterEnmityGangId('');
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                } else if (requiresRecovery && !fighterRecovery) {
                  setIsRecoveryModalOpen(true);
                } else {
                  addInjuryMutation.mutate({
                    fighter_id: fighterId,
                    injury_type_id: selectedInjuryId,
                    send_to_recovery: false,
                    set_killed: requiresKilled,
                    set_captured: false,
                    target_equipment_id: equipmentId,
                    bitter_enmity_target_gang_id:
                      selectedInjury.effect_name === 'Bitter Enmity' && selectedBitterEnmityGangId
                        ? selectedBitterEnmityGangId
                        : undefined,
                    injury_data: selectedInjury
                  });
                  // Reset state
                  setTargetEquipmentId(null);
                  setSelectedBitterEnmityGangId('');
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }
              }}
              onSelectionComplete={() => {}}
              onCancel={() => {
                setShowEquipmentSelection(false);
                setTargetEquipmentId(null);
                setSelectedInjuryId('');
                setSelectedInjury(null);
              }}
              onValidityChange={(isValid) => setIsEffectSelectionValid(isValid)}
            />
          }
          onClose={() => {
            setShowEquipmentSelection(false);
            setTargetEquipmentId(null);
            setSelectedInjuryId('');
            setSelectedInjury(null);
          }}
          onConfirm={async () => {
            return await effectSelectionRef.current?.handleConfirm() || false;
          }}
          confirmText="Select Weapon"
          confirmDisabled={!isEffectSelectionValid}
          width="lg"
        />
      )}

      {isClearAllModalOpen && (
        <Modal
          title="Clear Rig Glitches"
          content={
            <div className="space-y-4">
              <div>
                <p className="mb-4">The following rig glitches will be cleared:</p>
                <ul className="divide-y divide-gray-200 mb-4">
                  {injuries.map((injury: FighterEffect) => (
                    <li key={injury.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-base">{injury.effect_name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-3 border-t space-y-3">
                <div>
                  <label htmlFor="killCost" className="text-sm font-medium block mb-2">
                    Kill Cost
                  </label>
                  <Input
                    id="killCost"
                    type="number"
                    min="1"
                    max={kill_count}
                    value={clearAllKillCost}
                    onChange={(e) => setClearAllKillCost(Math.max(1, Math.min(kill_count, parseInt(e.target.value) || 4)))}
                    className="w-32"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Current kills: <strong>{kill_count}</strong> → New kills: <strong>{kill_count - clearAllKillCost}</strong>
                </p>
              </div>
            </div>
          }
          onClose={() => setIsClearAllModalOpen(false)}
          onConfirm={handleClearAllGlitches}
          confirmText="Clear All"
          confirmDisabled={injuries.length === 0 || clearAllGlitchesMutation.isPending || clearAllKillCost < 1 || clearAllKillCost > kill_count}
        />
      )}
    </>
  );
} 