'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FighterEffect, FighterSkills } from '@/types/fighter';
import { toast } from 'sonner';
import { useRollLogger } from '@/hooks/use-roll-logger';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPermissions } from '@/types/user-permissions';
import {
  addFighterInjury,
  deleteFighterInjury,
  verifyAndLogRolledFighterInjury,
  clearRigGlitchesDowntime,
} from '@/app/actions/fighter-injury';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66Outcome, resolveInjuryFor, resolveInjuryRangeByNameFor } from '@/utils/dice';
import { lastingInjuryRankFor } from '@/utils/lastingInjuryRank';
import { requiredHatredTarget, injuryAggregationLabel } from '@/utils/injuryTarget';
import { InjuryHatredTargetPicker } from '@/components/fighter/injury-hatred-target-picker';
import { fetchCampaignGangsAndFighters } from '@/utils/api/fighter-ooa-records';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import { Combobox } from '@/components/ui/combobox';
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
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
  fighter_subtypes: string[];
  is_spyrer?: boolean;
  kill_count?: number;
  gangCredits?: number;
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
  /** Scopes the injury catalog, D66 table and grouping to one ruleset. Null shows an unscoped, ungrouped list. */
  editionSlug?: string | null;
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
  fighter_subtypes,
  is_spyrer = false,
  kill_count = 0,
  gangCredits = 0,
  fighterWeapons,
  editionSlug = null
}: InjuriesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [clearMethod, setClearMethod] = useState<'kills' | 'downtime'>('kills');
  const [clearAllKillCost, setClearAllKillCost] = useState<number>(4);
  const [clearDowntimeCreditCost, setClearDowntimeCreditCost] = useState<number>(100);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const [showEquipmentSelection, setShowEquipmentSelection] = useState(false);
  const [targetEquipmentId, setTargetEquipmentId] = useState<string | null>(null);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const [selectedCapturingGangId, setSelectedCapturingGangId] = useState<string>('');
  const [selectedHatredTargetId, setSelectedHatredTargetId] = useState<string>('');
  // First step of the fighter picker only — narrows the fighter list, never submitted.
  const [selectedHatredGangId, setSelectedHatredGangId] = useState<string>('');
  const [campaignGangs, setCampaignGangs] = useState<CampaignGangWithFighters[]>([]);
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

  // Declared on the effect type, not derived from its name.
  const selectedHatredTarget = useMemo(
    () => requiredHatredTarget(selectedInjury?.type_specific_data),
    [selectedInjury]
  );

  // Gang types work in skirmish; the other kinds need a campaign opponent.
  const hatredTargetIsSelectable =
    selectedHatredTarget === 'gang_type' || campaignGangs.length > 0;

  const addInjuryBlockedByHatredTarget =
    selectedHatredTarget !== null && hatredTargetIsSelectable && !selectedHatredTargetId;

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
      hatred_target_id?: string | null;
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
        hatred_target_id: variables.hatred_target_id ?? null
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
      const hatredKind = requiredHatredTarget(injuryData.type_specific_data);
      const hatredId = variables.hatred_target_id;
      let hatredMeta: {
        hatred_target_kind: string;
        hatred_target_id: string;
        hatred_target_name: string;
        hatred_target_colour: string | null;
      } | null = null;

      if (hatredId && hatredKind) {
        // Resolve from memory only; gang types live in the picker's query, so
        // those fill in when onSuccess swaps in the server row.
        let name: string | null = null;
        let colour: string | null = null;

        if (hatredKind === 'gang') {
          const gang = campaignGangs.find((row) => row.gang_id === hatredId);
          if (gang) {
            name = gang.name;
            colour = gang.gang_colour ?? null;
          }
        } else if (hatredKind === 'fighter') {
          const fighter = campaignGangs
            .flatMap((row) => row.fighters)
            .find((f) => f.id === hatredId);
          if (fighter) name = fighter.fighter_name;
        }

        if (name) {
          hatredMeta = {
            hatred_target_kind: hatredKind,
            hatred_target_id: hatredId,
            hatred_target_name: name,
            hatred_target_colour: colour
          };
          mergedTsd = { ...mergedTsd, ...hatredMeta };
        }
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
            ...(hatredMeta ? hatredMeta : {})
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

  const clearGlitchesDowntimeMutation = useMutation({
    mutationFn: async (params: { glitches: FighterEffect[]; creditCost: number }) => {
      const result = await clearRigGlitchesDowntime({
        fighter_id: fighterId,
        glitch_ids: params.glitches.map(g => g.id),
        credit_cost: params.creditCost,
      });
      if (!result.success) throw new Error(result.error || 'Failed to clear rig glitches');
      return result;
    },
    onMutate: async (params) => {
      const previousInjuries = [...injuries];
      const previousKilled = fighterKilled;
      const shouldClearKilled = params.glitches.some(g => hasKilledStatusFlag(g.type_specific_data));
      if (onInjuryUpdate) {
        onInjuryUpdate([], undefined, undefined, undefined, shouldClearKilled ? false : undefined);
      }
      return { previousInjuries, previousKilled };
    },
    onSuccess: (result) => {
      if (result.killedStatus !== undefined && onInjuryUpdate) {
        onInjuryUpdate([], undefined, undefined, undefined, result.killedStatus);
      }
      if (result.gangFinancials && onGangFinancialsUpdate) {
        onGangFinancialsUpdate(result.gangFinancials);
      }
      toast.success(`Cleared ${result.clearedCount} rig glitch${result.clearedCount !== 1 ? 'es' : ''} via Downtime (-${result.creditCost} credits)`);
      setIsClearAllModalOpen(false);
    },
    onError: (error, _params, context) => {
      if (context?.previousInjuries && onInjuryUpdate) {
        onInjuryUpdate(context.previousInjuries, undefined, undefined, undefined, context.previousKilled);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to clear rig glitches');
    },
  });

  // Logging of rolled injury results. The server message is prefixed here rather
  // than in the hook, so the toast keeps its existing "Failed to log lasting
  // injury: <reason>" shape.
  const injuryRollLogger = useRollLogger<{
    fighter_id: string;
    injury_type_id: string;
    injury_table: string;
    dice_data: any;
  }>({
    log: async (variables) => {
      const result = await verifyAndLogRolledFighterInjury(variables);
      if (result.success) return result;

      const errorText = is_spyrer ? 'Failed to log rig glitch' : 'Failed to log lasting injury';
      return { success: false, error: `${errorText}: ${result.error || 'Unknown error'}` };
    },
    successMessage: is_spyrer ? 'Rig glitch logged successfully' : 'Lasting injury logged successfully',
    errorMessage: is_spyrer ? 'Failed to log rig glitch' : 'Failed to log lasting injury'
  });

  // Helper function to format the range display
  const isCrew = fighter_subtypes.includes('Crew');

  // Which D66 table and rank map this fighter uses, in this edition. Resolved
  // once so the range column, the roller and the grouping can't disagree.
  const injuryTableOpts = { isCrew, isSpyrer: is_spyrer };
  const rankMap = lastingInjuryRankFor(editionSlug, isCrew);

  const formatInjuryRange = (injuryName: string): string => {
    const range = resolveInjuryRangeByNameFor(injuryName, editionSlug, injuryTableOpts);

    if (!range) return '';

    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Coordinates applying a resolved dice roll: logs it to the server (the hook
  // guards against duplicate submissions and enforces the cooldown), then applies
  // the UI selection. The selection is deliberately behind the same guard — a
  // refused double-click must not move the selection either.
  const logResolvedRollWithCooldown = (injury: FighterEffect, roll: number) => {
    const injuryTable = is_spyrer
      ? 'Rig Glitch'
      : (isCrew ? 'Lasting Injury Crew' : 'Lasting Injury');

    const accepted = injuryRollLogger.logRoll({
      fighter_id: fighterId,
      injury_type_id: injury.id,
      injury_table: injuryTable,
      dice_data: { result: roll }
    });
    if (!accepted) return false;

    setSelectedInjuryId(injury.id);
    setSelectedInjury(injury);
    return true;
  };

  const fetchAvailableInjuries = useCallback(async () => {
    if (isLoadingInjuries) return;

    try {
      setIsLoadingInjuries(true);
      const editionQuery = editionSlug ? `&edition_slug=${encodeURIComponent(editionSlug)}` : '';
      const response = await fetch(
        `/api/fighters/injuries?is_spyrer=${is_spyrer}${editionQuery}`,
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
  }, [isLoadingInjuries, is_spyrer, editionSlug]);

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
    setSelectedHatredTargetId('');
    setSelectedHatredGangId('');
  }, []);

  // When opened from gang card menu, open the Add modal (or add-form-only view) and fetch if needed
  const shouldOpenAddModal = initialOpenAddModal || addFormOnly;
  const [prevShouldOpenAddModal, setPrevShouldOpenAddModal] = useState(false);
  if (shouldOpenAddModal && !prevShouldOpenAddModal) {
    setPrevShouldOpenAddModal(true);
    setIsAddModalOpen(true);
    if (localAvailableInjuries.length === 0) {
      fetchAvailableInjuries();
    }
  }

  // Gang types are global, so an Eternal Enmity needs no campaign data at all.
  const needsCampaignGangPicker =
    campaignIds.length > 0 &&
    (selectedInjuryRequiresCaptured ||
      selectedHatredTarget === 'gang' ||
      selectedHatredTarget === 'fighter');

  const [prevNeedsCampaignGangPicker, setPrevNeedsCampaignGangPicker] = useState(needsCampaignGangPicker);
  if (needsCampaignGangPicker !== prevNeedsCampaignGangPicker) {
    setPrevNeedsCampaignGangPicker(needsCampaignGangPicker);
    if (!needsCampaignGangPicker) {
      setCampaignGangs([]);
      setSelectedCapturingGangId('');
      setSelectedHatredTargetId('');
      setSelectedHatredGangId('');
    } else {
      setIsFetchingGangs(true);
    }
  }

  useEffect(() => {
    if (!needsCampaignGangPicker) return;

    let cancelled = false;

    const fetchGangs = async () => {
      try {
        const allGangs: CampaignGangWithFighters[] = [];
        const seenIds = new Set<string>();

        // fetchCampaignGangsAndFighters also normalises the route's literal
        // 'Unknown' owner to null, which the old inline mapping here did not.
        const gangResults = await Promise.all(
          campaignIds.map(async (campaignId) => {
            try {
              return await fetchCampaignGangsAndFighters({ campaignId, gangId: fighterGangId ?? '' });
            } catch {
              return [];
            }
          })
        );

        for (const gangs of gangResults) {
          for (const g of gangs) {
            // The helper passes gangId so the fighter's own gang comes back too.
            if (g.gang_id !== fighterGangId && !seenIds.has(g.gang_id)) {
              seenIds.add(g.gang_id);
              allGangs.push(g);
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
  }, [needsCampaignGangPicker, campaignIds, fighterGangId]);

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

    // `injury` is the freshly resolved row, which may differ from selectedInjury
    // if the user changed the combobox without the state having settled.
    const hatredKind = requiredHatredTarget(injury.type_specific_data);
    const hatredSelectable = hatredKind === 'gang_type' || campaignGangs.length > 0;

    if (hatredKind && hatredSelectable && !selectedHatredTargetId) {
      toast.error(`Please select the target for ${injury.effect_name}`);
      return false;
    }

    const hatredSubmitId = hatredKind && selectedHatredTargetId ? selectedHatredTargetId : undefined;

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
        hatred_target_id: hatredSubmitId,
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
        hatred_target_id: hatredSubmitId,
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

    if (addInjuryBlockedByHatredTarget) {
      toast.error(`Please select the target for ${selectedInjury?.effect_name ?? 'this injury'}`);
      return;
    }

    // Close modals immediately
    setIsRecoveryModalOpen(false);

    const typeSpecificData = selectedInjury?.type_specific_data && typeof selectedInjury.type_specific_data === 'object'
      ? selectedInjury.type_specific_data
      : {};

    const hatredForProceed =
      selectedHatredTarget && selectedHatredTargetId ? selectedHatredTargetId : undefined;

    // Trigger mutation
    addInjuryMutation.mutate({
      fighter_id: fighterId,
      injury_type_id: selectedInjuryId,
      send_to_recovery: sendToRecovery,
      set_killed: hasKilledStatusFlag(typeSpecificData),
      set_captured: setCaptured,
      captured_by_gang_id: setCaptured ? (selectedCapturingGangId || null) : undefined,
      target_equipment_id: targetEquipmentId || undefined,
      hatred_target_id: hatredForProceed,
      injury_data: selectedInjury
    });

    // Reset target after mutation
    setTargetEquipmentId(null);
    setSelectedCapturingGangId('');
    setSelectedHatredTargetId('');
    setSelectedHatredGangId('');
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
          Rig Glitches
          {glitchCount > 0 && (
            <>
              {' '}
              <span className="text-sm sm:hidden">({glitchCount})</span>
              <span className="text-sm hidden sm:inline">(Glitch count: {glitchCount})</span>
            </>
          )}
        </>
      )
    : "Lasting Injuries";

  const canAffordKills = kill_count >= clearAllKillCost;
  const canAffordDowntime = gangCredits >= clearDowntimeCreditCost;

  const handleClearAllConfirm = () => {
    if (clearMethod === 'kills') {
      clearAllGlitchesMutation.mutate({
        currentKillCount: kill_count,
        glitches: injuries,
        costInKills: clearAllKillCost,
      });
    } else if (clearMethod === 'downtime') {
      clearGlitchesDowntimeMutation.mutate({ glitches: injuries, creditCost: clearDowntimeCreditCost });
    }
    return true;
  };

  const handleOpenClearAllModal = () => {
    setClearAllKillCost(4);
    setClearDowntimeCreditCost(100);
    setClearMethod('kills');
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
          resolveNameForRoll={(r) => resolveInjuryFor(r, editionSlug, injuryTableOpts)?.name}
          onRolled={(rolled) => {
            if (rolled.length > 0) {
              const roll = rolled[0].roll;
              const util = resolveInjuryFor(roll, editionSlug, injuryTableOpts);
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
            const util = resolveInjuryFor(roll, editionSlug, injuryTableOpts);
            if (!util) return;
            const match = localAvailableInjuries.find(i => (i as any).effect_name === util.name) as any;
            if (match) {
              logResolvedRollWithCooldown(match, roll);
            }
          }}
          buttonText="Roll D66"
          disabled={
            !userPermissions.canEdit ||
            injuryRollLogger.disabled
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
            setSelectedHatredTargetId('');
            setSelectedHatredGangId('');
            if (value) {
              const selectedInjury = localAvailableInjuries.find(injury => injury.id === value);
              setSelectedInjury(selectedInjury || null);
            } else {
              setSelectedInjury(null);
            }
          }}
          placeholder={isLoadingInjuries && localAvailableInjuries.length === 0
            ? "Loading Lasting Injuries..."
            : is_spyrer ? "Select a Rig Glitch" : "Select a Lasting Injury"
          }
          disabled={isLoadingInjuries && localAvailableInjuries.length === 0}
          options={Object.entries(
            localAvailableInjuries
              .slice()
              .filter(injury => {
                // The crew rank map doubles as an allow-list, but only for the
                // edition that publishes it — otherwise it empties the combobox.
                if (isCrew && rankMap) {
                  return rankMap.hasOwnProperty(injury.effect_name);
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
                let groupLabel: string;
                if (is_spyrer) {
                  groupLabel = "Rig Glitches";
                } else if (!rankMap) {
                  // No rank bands for this edition (N26 publishes no Mutations /
                  // Festering Injuries): one flat group, already sorted by D66.
                  groupLabel = "Lasting Injuries";
                } else {
                  const rank = rankMap[injury.effect_name] ?? Infinity;
                  groupLabel =
                    rank <= 29 ? "Lasting Injuries"
                    : rank >= 30 ? "Mutations / Festering Injuries"
                    : "Other Lasting Injuries";
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
                .map(g => buildGangComboboxOption({
                  id: g.gang_id,
                  name: g.name,
                  gang_colour: g.gang_colour,
                  owner_username: g.owner_username,
                }))
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
      <InjuryHatredTargetPicker
        hatredTarget={selectedHatredTarget}
        candidateGangs={campaignGangs}
        isLoadingCandidates={isFetchingGangs}
        isSkirmish={campaignIds.length === 0}
        editionSlug={editionSlug}
        value={selectedHatredTargetId}
        onChange={setSelectedHatredTargetId}
        gangStepValue={selectedHatredGangId}
        onGangStepChange={setSelectedHatredGangId}
      />
      {addFormOnly && (
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onRequestClose} disabled={addInjuryMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAddInjury()}
            disabled={!selectedInjuryId || addInjuryMutation.isPending || addInjuryBlockedByHatredTarget}
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
                disabled={injuries.length === 0 || !userPermissions.canEdit || clearAllGlitchesMutation.isPending}
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
              // Match the gang card's label rather than a bare effect name.
              name: injuryAggregationLabel(injury),
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
          confirmDisabled={!selectedInjuryId || addInjuryMutation.isPending || addInjuryBlockedByHatredTarget}
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
                className="px-4 py-2 border rounded-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(false, false); }}
                className="px-4 py-2 border rounded-sm hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => { setIsRecoveryModalOpen(false); void proceedWithAddingInjury(true, false); }}
                className="px-4 py-2 bg-black text-white rounded-sm hover:bg-gray-800"
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
                    hatred_target_id:
                      selectedHatredTarget && selectedHatredTargetId
                        ? selectedHatredTargetId
                        : undefined,
                    injury_data: selectedInjury
                  });
                  // Reset state
                  setTargetEquipmentId(null);
                  setSelectedCapturingGangId('');
                  setSelectedHatredTargetId('');
                  setSelectedHatredGangId('');
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
                    hatred_target_id:
                      selectedHatredTarget && selectedHatredTargetId
                        ? selectedHatredTargetId
                        : undefined,
                    injury_data: selectedInjury
                  });
                  // Reset state
                  setTargetEquipmentId(null);
                  setSelectedHatredTargetId('');
                  setSelectedHatredGangId('');
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
          title="Clear all rig glitches"
          content={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setClearMethod('kills')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    clearMethod === 'kills'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Spend kills
                </button>
                <button
                  type="button"
                  onClick={() => setClearMethod('downtime')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    clearMethod === 'downtime'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Downtime
                </button>
              </div>

              <p className="text-sm text-muted-foreground">
                This will clear all {injuries.length} rig glitch{injuries.length !== 1 ? 'es' : ''} from this fighter.
              </p>

              {clearMethod === 'kills' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="killCost" className="text-sm font-medium block mb-2">
                      Kill cost
                    </label>
                    <Input
                      id="killCost"
                      type="tel"
                      inputMode="url"
                      pattern="-?[0-9]+"
                      value={clearAllKillCost}
                      onChange={(e) => setClearAllKillCost(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-32"
                    />
                  </div>
                  <p className="text-sm tabular-nums">
                    Kills: {kill_count} &rarr;{' '}
                    <span className={!canAffordKills ? 'text-red-500' : ''}>
                      {kill_count - clearAllKillCost}
                    </span>
                  </p>
                  {!canAffordKills && (
                    <p className="text-xs text-red-500">Not enough kills available.</p>
                  )}
                </div>
              )}

              {clearMethod === 'downtime' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="creditCost" className="text-sm font-medium block mb-2">
                      Credit cost
                    </label>
                    <Input
                      id="creditCost"
                      type="tel"
                      inputMode="url"
                      pattern="-?[0-9]+"
                      value={clearDowntimeCreditCost}
                      onChange={(e) => setClearDowntimeCreditCost(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-32"
                    />
                  </div>
                  <p className="text-sm tabular-nums">
                    Credits: {gangCredits} &rarr;{' '}
                    <span className={!canAffordDowntime ? 'text-red-500' : ''}>
                      {gangCredits - clearDowntimeCreditCost}
                    </span>
                  </p>
                  {!canAffordDowntime && (
                    <p className="text-xs text-red-500">Not enough credits available.</p>
                  )}
                </div>
              )}
            </div>
          }
          onClose={() => setIsClearAllModalOpen(false)}
          onConfirm={handleClearAllConfirm}
          confirmText="Confirm"
          confirmDisabled={
            injuries.length === 0 ||
            clearAllGlitchesMutation.isPending ||
            clearGlitchesDowntimeMutation.isPending ||
            (clearMethod === 'kills' && !canAffordKills) ||
            (clearMethod === 'downtime' && !canAffordDowntime)
          }
        />
      )}
    </>
  );
} 