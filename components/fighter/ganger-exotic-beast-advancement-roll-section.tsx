'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import DiceRoller from '@/components/dice-roller';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import {
  roll,
  formatRollOutcomeLine,
  rollNd6Outcome,
  GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE,
  resolveGangerExoticBeastAdvancementFromUtil,
  type TableEntry
} from '@/utils/dice';
import { verifyAndLogRolledGangerAdvancementRoll } from '@/app/actions/ganger-advancement-roll';
import { addCharacteristicAdvancement, addSkillAdvancement } from '@/app/actions/fighter-advancement';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { FighterPromotionModal } from '@/components/fighter/edit-fighter/fighter-promotion-modal';
import type { FighterEffect as FighterEffectType } from '@/types/fighter';
import type { FighterSkills } from '@/types/fighter';
import type { UserPermissions } from '@/types/user-permissions';

const ADVANCEMENT_TABLE_LABEL = 'Ganger / Exotic Beast Advancement';

/** Combobox rows (same idea as `repairTypes` in vehicle-lasting-damages). */
type GangerAdvancementComboRow = TableEntry & { id: string };

const GANGER_ADVANCEMENT_COMBO_OPTIONS: GangerAdvancementComboRow[] = GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE.map(
  (entry) => ({
    ...entry,
    id: `ganger-adv-${entry.range[0]}-${entry.range[1]}`
  })
);

function formatGangerAdvancementRangeLabel(entry: TableEntry): string {
  const [a, b] = entry.range;
  return a === b ? `${a}` : `${a}-${b}`;
}

/** Imperative API for the Advancements modal "Buy Advancement" action. */
export type GangerAdvancementRollHandle = {
  purchase: (xpCost: number, creditsIncrease: number) => Promise<boolean>;
};

type CharAdv = {
  id: string;
  characteristic_code: string;
  xp_cost: number;
  credits_increase: number;
  times_increased?: number;
};

interface SkillAccessRow {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | null;
  override_access_level: 'primary' | 'secondary' | 'allowed' | null;
  skill_type_name: string;
}

function effectiveAccess(a: SkillAccessRow): 'primary' | 'secondary' | 'allowed' | null {
  return (a.override_access_level ?? a.access_level) ?? null;
}

export interface GangerExoticBeastAdvancementRollSectionProps {
  fighterId: string;
  fighterXp: number;
  fighterClass: string;
  advancements: FighterEffectType[];
  skills: FighterSkills;
  userPermissions: UserPermissions;
  onAdvancementUpdate: (updated: FighterEffectType[]) => void;
  onSkillUpdate?: (updated: FighterSkills) => void;
  onXpCreditsUpdate?: (xpChange: number, creditsChange: number) => void;
  preFetchedFighterTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    total_cost: number;
  }>;
  onEnsureFighterTypes: () => Promise<void>;
  fighterSpecialRules: string[];
  fighterTypeName: string;
  fighterTypeId: string;
  onFighterDetailsUpdate?: (patch: {
    fighter_class?: string;
    fighter_class_id?: string;
    fighter_type?: string;
    fighter_type_id?: string;
    special_rules?: string[];
  }) => void;
  /** XP cost from the modal footer (single source of truth for purchase). */
  modalXpCost: number;
  /** Credits increase from the modal footer. */
  modalCreditsIncrease: number;
  /** Called when the roll UI suggests default XP/credits (e.g. characteristic or specialist row). */
  onSuggestedCostsChange?: (xp: number, credits: number) => void;
  /** Call when table outcome / pair choice / dice-applied row changes so the modal can re-apply suggested costs after a user override. */
  onCostsSuggestionContextChange?: () => void;
  /** Called when eligibility for Buy Advancement or pending mutation state changes. */
  onPurchaseUiChange?: (state: { canBuy: boolean; pending: boolean }) => void;
}

export const GangerExoticBeastAdvancementRollSection = forwardRef<
  GangerAdvancementRollHandle,
  GangerExoticBeastAdvancementRollSectionProps
>(function GangerExoticBeastAdvancementRollSection(
  {
    fighterId,
    fighterXp,
    fighterClass,
    advancements,
    skills,
    userPermissions,
    onAdvancementUpdate,
    onSkillUpdate,
    onXpCreditsUpdate,
    preFetchedFighterTypes,
    onEnsureFighterTypes,
    fighterSpecialRules,
    fighterTypeName,
    fighterTypeId,
    onFighterDetailsUpdate,
    modalXpCost,
    modalCreditsIncrease: _modalCreditsIncrease,
    onSuggestedCostsChange,
    onCostsSuggestionContextChange,
    onPurchaseUiChange
  },
  ref
) {
  const [selectedRowId, setSelectedRowId] = useState<string>('');
  const [rollCooldown, setRollCooldown] = useState(false);

  const [charMap, setCharMap] = useState<Record<string, CharAdv>>({});
  const [pairStatName, setPairStatName] = useState<string>('');

  const [primarySets, setPrimarySets] = useState<SkillAccessRow[]>([]);
  const [primarySetsLoading, setPrimarySetsLoading] = useState(false);
  const [skillSetRoll, setSkillSetRoll] = useState<number | null>(null);
  const [selectedSetIndex, setSelectedSetIndex] = useState<number | null>(null);
  const [skillsInSet, setSkillsInSet] = useState<
    { skill_id: string; skill_name: string; skill_type_id: string; available: boolean }[]
  >([]);
  const [skillPickRoll, setSkillPickRoll] = useState<number | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number | null>(null);

  const [promotionOpen, setPromotionOpen] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{
    fighter_type: string;
    fighter_type_id: string;
    fighter_class: string;
    fighter_class_id: string;
    special_rules: string[];
  } | null>(null);

  const selectedRow = useMemo(
    () => GANGER_ADVANCEMENT_COMBO_OPTIONS.find((r) => r.id === selectedRowId),
    [selectedRowId]
  );

  const fetchCharAdvancements = useCallback(async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_available_advancements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string },
          body: JSON.stringify({ fighter_id: fighterId })
        }
      );
      if (!response.ok) return;
      const data = await response.json();
      const ch = data?.characteristics as Record<string, CharAdv> | undefined;
      if (ch && typeof ch === 'object') setCharMap(ch);
    } catch {
      // non-fatal
    }
  }, [fighterId]);

  useEffect(() => {
    void fetchCharAdvancements();
  }, [fetchCharAdvancements]);

  /** Primary skill access for the promoted fighter type (current Ganger/Beast type has no primaries). */
  useEffect(() => {
    if (selectedRow?.kind !== 'specialist' || !pendingPromotion?.fighter_type_id) {
      setPrimarySets([]);
      setPrimarySetsLoading(false);
      return;
    }
    let cancelled = false;
    setPrimarySetsLoading(true);
    const run = async () => {
      try {
        const res = await fetch(
          `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}&previewFighterTypeId=${encodeURIComponent(pendingPromotion.fighter_type_id)}`
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setPrimarySets([]);
          return;
        }
        const data = await res.json();
        const access = (data.skill_access || []) as SkillAccessRow[];
        const primaries = access.filter((a) => effectiveAccess(a) === 'primary');
        if (!cancelled) setPrimarySets(primaries);
      } catch {
        if (!cancelled) setPrimarySets([]);
      } finally {
        if (!cancelled) setPrimarySetsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fighterId, selectedRow?.kind, pendingPromotion?.fighter_type_id]);

  useEffect(() => {
    if (!selectedRow) {
      setPairStatName('');
      return;
    }
    if (selectedRow.kind !== 'pair' || !selectedRow.pairOptions) return;
    const [a, b] = selectedRow.pairOptions;
    setPairStatName((prev) => (prev && [a, b].includes(prev) ? prev : a));
  }, [selectedRowId, selectedRow]);

  useEffect(() => {
    if (!onSuggestedCostsChange) return;
    if (!selectedRow) return;
    if (selectedRow.kind === 'pair' && pairStatName) {
      const det = charMap[pairStatName];
      if (det) {
        onSuggestedCostsChange(det.xp_cost ?? 6, det.credits_increase ?? 0);
      }
      return;
    }
    if (selectedRow.kind === 'specialist') {
      onSuggestedCostsChange(6, 20);
    }
  }, [selectedRow, pairStatName, charMap, onSuggestedCostsChange]);

  useEffect(() => {
    if (selectedRow?.kind !== 'specialist') {
      setPendingPromotion(null);
      setSkillSetRoll(null);
      setSkillPickRoll(null);
      setSelectedSetIndex(null);
      setSelectedSkillIndex(null);
    }
  }, [selectedRow?.kind]);

  /** New promotion target clears random rolls so Primary access is re-derived. */
  useEffect(() => {
    setSkillSetRoll(null);
    setSkillPickRoll(null);
    setSelectedSetIndex(null);
    setSelectedSkillIndex(null);
  }, [pendingPromotion?.fighter_type_id]);

  // Load skills for selected primary set (preview promoted type — get_available_skills uses current DB type)
  useEffect(() => {
    if (
      selectedSetIndex === null ||
      !primarySets[selectedSetIndex] ||
      !pendingPromotion?.fighter_type_id
    ) {
      setSkillsInSet([]);
      return;
    }
    const typeId = primarySets[selectedSetIndex].skill_type_id;
    let cancelled = false;
    const run = async () => {
      const res = await fetch(
        `/api/fighters/specialist-preview-skills?fighterId=${encodeURIComponent(fighterId)}&skillTypeId=${encodeURIComponent(typeId)}&previewFighterTypeId=${encodeURIComponent(pendingPromotion.fighter_type_id)}`
      );
      if (!res.ok || cancelled) {
        if (!cancelled) setSkillsInSet([]);
        return;
      }
      const data = (await res.json()) as {
        skills?: { skill_id: string; skill_name: string; skill_type_id: string; available: boolean }[];
      };
      if (!cancelled) setSkillsInSet(data.skills ?? []);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fighterId, selectedSetIndex, primarySets, pendingPromotion?.fighter_type_id]);

  const logRollMutation = useMutation({
    mutationFn: async (variables: { outcome_label: string; dice_data: Record<string, unknown> }) => {
      const result = await verifyAndLogRolledGangerAdvancementRoll({
        fighter_id: fighterId,
        advancement_table: ADVANCEMENT_TABLE_LABEL,
        outcome_label: variables.outcome_label,
        dice_data: variables.dice_data
      });
      if (!result.success) throw new Error(result.error || 'Failed to log advancement roll');
      return result;
    },
    onSuccess: () => {
      toast.success('Advancement roll logged');
    },
    onError: (e: Error) => {
      toast.error(e?.message || 'Failed to log advancement roll');
    }
  });

  const logSubRollMutation = useMutation({
    mutationFn: async (variables: { outcome_label: string; dice_data: Record<string, unknown> }) => {
      const result = await verifyAndLogRolledGangerAdvancementRoll({
        fighter_id: fighterId,
        advancement_table: ADVANCEMENT_TABLE_LABEL,
        outcome_label: variables.outcome_label,
        dice_data: variables.dice_data
      });
      if (!result.success) throw new Error(result.error || 'Failed to log sub-roll');
      return result;
    },
    onSuccess: () => {
      toast.success('Sub-roll recorded in gang log');
    },
    onError: (e: Error) => {
      toast.error(e?.message || 'Failed to log sub-roll');
    }
  });

  const logResolvedRollWithCooldown = (row: TableEntry, rollTotal: number, dice: number[]) => {
    if (rollCooldown || logRollMutation.isPending) return false;
    setRollCooldown(true);
    try {
      const combo = GANGER_ADVANCEMENT_COMBO_OPTIONS.find(
        (o) => o.range[0] === row.range[0] && o.range[1] === row.range[1]
      );
      if (combo) {
        onCostsSuggestionContextChange?.();
        setSelectedRowId(combo.id);
      }
      logRollMutation.mutate({
        outcome_label: row.name,
        dice_data: { result: rollTotal, dice }
      });
      return true;
    } finally {
      setTimeout(() => setRollCooldown(false), 2000);
    }
  };

  const applySpecialistMutation = useMutation({
    mutationFn: async (vars: {
      promotion: {
        fighter_type: string;
        fighter_type_id: string;
        fighter_class: string;
        fighter_class_id: string;
        special_rules: string[];
      };
      skill_id: string;
      xp_cost: number;
      credits_increase: number;
      skillName: string;
    }) => {
      const u = await updateFighterDetails({
        fighter_id: fighterId,
        fighter_class: vars.promotion.fighter_class,
        fighter_class_id: vars.promotion.fighter_class_id,
        fighter_type: vars.promotion.fighter_type,
        fighter_type_id: vars.promotion.fighter_type_id,
        special_rules: vars.promotion.special_rules
      });
      if (!u.success) throw new Error(u.error || 'Failed to promote fighter');
      const s = await addSkillAdvancement({
        fighter_id: fighterId,
        skill_id: vars.skill_id,
        xp_cost: vars.xp_cost,
        credits_increase: vars.credits_increase,
        is_advance: true
      });
      if (!s.success) throw new Error(s.error || 'Failed to add skill');
      return { u, s };
    },
    onMutate: async (vars) => {
      const previousSkills = { ...skills };
      const optimisticSkillId = `optimistic-skill-roll-${Date.now()}`;
      if (onSkillUpdate) {
        onSkillUpdate({
          ...skills,
          [vars.skillName]: {
            id: optimisticSkillId,
            credits_increase: vars.credits_increase,
            xp_cost: vars.xp_cost,
            is_advance: true,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: null
          }
        });
      }
      if (onXpCreditsUpdate) onXpCreditsUpdate(-vars.xp_cost, vars.credits_increase);
      return { previousSkills };
    },
    onSuccess: (_data, vars) => {
      onFighterDetailsUpdate?.({
        fighter_class: vars.promotion.fighter_class,
        fighter_class_id: vars.promotion.fighter_class_id,
        fighter_type: vars.promotion.fighter_type,
        fighter_type_id: vars.promotion.fighter_type_id,
        special_rules: vars.promotion.special_rules
      });
      toast.success('Advancement purchased');
    },
    onError: (e: Error, vars, context) => {
      if (context?.previousSkills && onSkillUpdate) onSkillUpdate(context.previousSkills);
      if (vars && onXpCreditsUpdate) onXpCreditsUpdate(vars.xp_cost, -vars.credits_increase);
      toast.error(e?.message || 'Failed to apply promotion and skill');
    }
  });

  const executePairPurchase = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (!selectedRowId || !selectedRow || selectedRow.kind !== 'pair' || !pairStatName) {
        toast.error('Select a table outcome');
        return false;
      }
      const det = charMap[pairStatName];
      if (!det?.id) {
        toast.error('Could not resolve characteristic data');
        return false;
      }
      if (fighterXp < xpCost) {
        toast.error('Insufficient XP');
        return false;
      }

      const statChangeName = pairStatName;
      const characteristicCode =
        det.characteristic_code || pairStatName.toLowerCase().replace(/\s+/g, '_');

      const optimisticId = `optimistic-char-roll-${fighterId}-${Date.now()}`;
      const optimisticAdvancement: FighterEffectType = {
        id: optimisticId,
        effect_name: `Characteristic: ${statChangeName}`,
        fighter_effect_modifiers: [
          {
            id: `${optimisticId}-mod`,
            fighter_effect_id: optimisticId,
            stat_name: characteristicCode,
            numeric_value: 1
          }
        ],
        created_at: new Date().toISOString(),
        type_specific_data: {
          xp_cost: xpCost,
          credits_increase: creditsIncrease,
          advancement_type: 'characteristic'
        }
      } as FighterEffectType;

      const previousAdvancements = [...advancements];
      onAdvancementUpdate([...advancements, optimisticAdvancement]);
      if (onXpCreditsUpdate) onXpCreditsUpdate(-xpCost, creditsIncrease);

      try {
        const result = await addCharacteristicAdvancement({
          fighter_id: fighterId,
          fighter_effect_type_id: det.id,
          xp_cost: xpCost,
          credits_increase: creditsIncrease
        });
        if (!result.success) throw new Error(result.error || 'Failed');
        if (result.effect) {
          onAdvancementUpdate([...previousAdvancements, result.effect as FighterEffectType]);
        } else {
          onAdvancementUpdate(previousAdvancements);
        }
        toast.success(`Advancement purchased: ${pairStatName}`);
        return true;
      } catch (e) {
        onAdvancementUpdate(previousAdvancements);
        if (onXpCreditsUpdate) onXpCreditsUpdate(xpCost, -creditsIncrease);
        toast.error(e instanceof Error ? e.message : 'Failed to apply');
        return false;
      }
    },
    [
      selectedRowId,
      selectedRow,
      pairStatName,
      charMap,
      fighterXp,
      fighterId,
      advancements,
      onAdvancementUpdate,
      onXpCreditsUpdate
    ]
  );

  const executeSpecialistPurchase = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (!selectedRowId || !selectedRow || selectedRow.kind !== 'specialist') {
        toast.error('Select a table outcome');
        return false;
      }
      if (!pendingPromotion) {
        toast.error('Confirm promotion in the Promote Fighter modal first');
        return false;
      }
      if (selectedSetIndex === null || !primarySets[selectedSetIndex]) {
        toast.error('Roll for a Primary skill set');
        return false;
      }
      if (selectedSkillIndex === null || !skillsInSet[selectedSkillIndex]) {
        toast.error('Roll for a skill');
        return false;
      }
      const sk = skillsInSet[selectedSkillIndex];
      if (!sk.available) {
        toast.error('Selected skill is not available');
        return false;
      }
      if (fighterXp < xpCost) {
        toast.error('Insufficient XP');
        return false;
      }

      try {
        await applySpecialistMutation.mutateAsync({
          promotion: pendingPromotion,
          skill_id: sk.skill_id,
          xp_cost: xpCost,
          credits_increase: creditsIncrease,
          skillName: sk.skill_name
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      selectedRowId,
      selectedRow,
      pendingPromotion,
      selectedSetIndex,
      primarySets,
      selectedSkillIndex,
      skillsInSet,
      fighterXp,
      applySpecialistMutation
    ]
  );

  useImperativeHandle(
    ref,
    () => ({
      purchase: async (xpCost: number, creditsIncrease: number) => {
        if (!selectedRow) return false;
        if (selectedRow.kind === 'pair') {
          return executePairPurchase(xpCost, creditsIncrease);
        }
        if (selectedRow.kind === 'specialist') {
          return executeSpecialistPurchase(xpCost, creditsIncrease);
        }
        return false;
      }
    }),
    [selectedRow, executePairPurchase, executeSpecialistPurchase]
  );

  useEffect(() => {
    if (!onPurchaseUiChange) return;
    const pending =
      applySpecialistMutation.isPending ||
      logSubRollMutation.isPending ||
      logRollMutation.isPending;
    if (!userPermissions.canEdit) {
      onPurchaseUiChange({ canBuy: false, pending });
      return;
    }
    if (!selectedRowId || !selectedRow) {
      onPurchaseUiChange({ canBuy: false, pending });
      return;
    }
    if (modalXpCost < 0 || fighterXp < modalXpCost) {
      onPurchaseUiChange({ canBuy: false, pending });
      return;
    }
    if (selectedRow.kind === 'pair') {
      const ok = !!(pairStatName && charMap[pairStatName]?.id);
      onPurchaseUiChange({ canBuy: ok, pending });
      return;
    }
    if (selectedRow.kind === 'specialist') {
      const sk =
        selectedSkillIndex !== null ? skillsInSet[selectedSkillIndex] : undefined;
      const ok = !!(
        pendingPromotion &&
        selectedSetIndex !== null &&
        selectedSkillIndex !== null &&
        sk?.available
      );
      onPurchaseUiChange({ canBuy: ok, pending });
      return;
    }
    onPurchaseUiChange({ canBuy: false, pending });
  }, [
    onPurchaseUiChange,
    userPermissions.canEdit,
    selectedRowId,
    selectedRow,
    modalXpCost,
    fighterXp,
    pairStatName,
    charMap,
    pendingPromotion,
    selectedSetIndex,
    selectedSkillIndex,
    skillsInSet,
    applySpecialistMutation.isPending,
    logSubRollMutation.isPending,
    logRollMutation.isPending
  ]);

  const rollPrimarySkillSet = () => {
    if (!pendingPromotion) {
      toast.error('Confirm promotion in the Promote Fighter modal first');
      return;
    }
    if (primarySetsLoading) {
      toast.error('Loading Primary skill sets…');
      return;
    }
    if (primarySets.length === 0) {
      toast.error('No Primary skill sets for the promoted fighter type');
      return;
    }
    if (logSubRollMutation.isPending) return;
    const r = roll(primarySets.length);
    const chosen = primarySets[r - 1];
    setSkillSetRoll(r);
    setSelectedSetIndex(r - 1);
    setSkillPickRoll(null);
    setSelectedSkillIndex(null);
    logSubRollMutation.mutate({
      outcome_label: `Specialist — Primary skill set: ${chosen.skill_type_name}`,
      dice_data: {
        result: r,
        dice: [r],
        pool_size: primarySets.length,
        roll_type: 'primary_skill_set'
      }
    });
  };

  const rollSkillInSet = () => {
    if (skillsInSet.length === 0) {
      toast.error('No skills in this set (or still loading)');
      return;
    }
    if (logSubRollMutation.isPending) return;
    const r = roll(skillsInSet.length);
    const chosen = skillsInSet[r - 1];
    setSkillPickRoll(r);
    setSelectedSkillIndex(r - 1);
    logSubRollMutation.mutate({
      outcome_label: `Specialist — Skill: ${chosen.skill_name}`,
      dice_data: {
        result: r,
        dice: [r],
        pool_size: skillsInSet.length,
        roll_type: 'skill_in_set'
      }
    });
  };

  const comboboxOptions = useMemo(
    () =>
      GANGER_ADVANCEMENT_COMBO_OPTIONS.flatMap((row) => {
        const range = formatGangerAdvancementRangeLabel(row);
        const displayText = `${range}: ${row.name}`;
        return [
          {
            value: row.id,
            label: (
              <>
                <span className="text-muted-foreground inline-block w-14 text-center mr-1">{range}</span>
                {row.name}
              </>
            ),
            displayValue: displayText
          }
        ];
      }),
    []
  );

  const primarySetComboboxOptions = useMemo(
    () =>
      primarySets.map((p) => ({
        value: p.skill_type_id,
        label: p.skill_type_name,
        displayValue: p.skill_type_name
      })),
    [primarySets]
  );

  const skillInSetComboboxOptions = useMemo(
    () =>
      skillsInSet.map((s) => ({
        value: s.skill_id,
        label: s.available ? s.skill_name : `${s.skill_name} (unavailable)`,
        displayValue: s.skill_name,
        disabled: !s.available
      })),
    [skillsInSet]
  );

  const selectedPrimarySkillTypeId =
    selectedSetIndex !== null && primarySets[selectedSetIndex]
      ? primarySets[selectedSetIndex].skill_type_id
      : '';

  const selectedSkillId =
    selectedSkillIndex !== null && skillsInSet[selectedSkillIndex]
      ? skillsInSet[selectedSkillIndex].skill_id
      : '';

  if (fighterClass !== 'Ganger' && fighterClass !== 'Exotic Beast') return null;

  const pairDetail = selectedRow?.kind === 'pair' && pairStatName ? charMap[pairStatName] : null;

  return (
    <div className="mb-4 space-y-4">
      <div>
        <h4 className='font-semibold'>Ganger / Exotic Beast</h4>
        <p className="text-sm text-muted-foreground">
        The roll is recorded in your gang log. You can select or adjust the outcome below, whether using this roll or applying your own.
        </p>
      </div>

      <div className="space-y-2">
        <DiceRoller
          items={GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE}
          getRange={(r) => ({ min: r.range[0], max: r.range[1] })}
          getName={(r) => r.name}
          inline
          rollFn={() => rollNd6Outcome(2)}
          resolveNameForRoll={(t) => resolveGangerExoticBeastAdvancementFromUtil(t)?.name}
          onRolled={(rolled) => {
            if (rolled.length > 0) {
              const total = rolled[0].roll;
              const dice = rolled[0].dice;
              const row = resolveGangerExoticBeastAdvancementFromUtil(total);
              if (row) logResolvedRollWithCooldown(row, total, dice);
            }
          }}
          onRoll={(total, dice) => {
            const row = resolveGangerExoticBeastAdvancementFromUtil(total);
            if (row) logResolvedRollWithCooldown(row, total, dice);
          }}
          buttonText="Roll 2D6"
          disabled={
            !userPermissions.canEdit ||
            logRollMutation.isPending ||
            logSubRollMutation.isPending ||
            rollCooldown
          }
        />
      </div>

      <div className="space-y-2 pt-2 border-t">
        <label className="text-sm font-medium">Advancements</label>
        <Combobox
          value={selectedRowId}
          onValueChange={(v) => {
            onCostsSuggestionContextChange?.();
            setSelectedRowId(v);
            const row = v ? GANGER_ADVANCEMENT_COMBO_OPTIONS.find((x) => x.id === v) : undefined;
            if (row?.kind === 'pair' && row.pairOptions) {
              setPairStatName(row.pairOptions[0]);
            }
          }}
          placeholder="Select an Advancement"
          options={comboboxOptions}
        />
      </div>

      {selectedRow?.kind === 'pair' && selectedRow.pairOptions && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Choose a characteristic</p>
          <div className="flex flex-col gap-2">
            {selectedRow.pairOptions.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="pair-stat"
                  checked={pairStatName === name}
                  onChange={() => {
                    onCostsSuggestionContextChange?.();
                    setPairStatName(name);
                  }}
                />
                {name}
              </label>
            ))}
          </div>
          {pairDetail && (
            <p className="text-xs text-muted-foreground">
              Times increased on this characteristic: {pairDetail.times_increased ?? 0}
            </p>
          )}
        </div>
      )}

      {selectedRow?.kind === 'specialist' && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm text-amber-500">
            Promote the fighter to Specialist first so they gain access to their Primary Skill sets, then roll for a Primary set and a random skill.
          </p>

          <div className="flex justify-center">
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={async () => {
                await onEnsureFighterTypes();
                setPromotionOpen(true);
              }}
              disabled={!userPermissions.canEdit}
            >
              Promote to Specialist
            </Button>
          </div>

          {pendingPromotion && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Promotion confirmed. Once the advancement is applied, this promotion cannot be undone.
            </p>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Primary skill set</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                onClick={rollPrimarySkillSet}
                disabled={
                  !userPermissions.canEdit ||
                  !pendingPromotion ||
                  primarySetsLoading ||
                  primarySets.length === 0 ||
                  logSubRollMutation.isPending
                }
              >
                Roll for Primary skill set
              </Button>
              {skillSetRoll !== null && primarySets[selectedSetIndex ?? -1] && (
                <span className="text-sm text-muted-foreground">
                  {formatRollOutcomeLine(skillSetRoll, [skillSetRoll])}:{' '}
                  <strong className="text-foreground">{primarySets[selectedSetIndex!].skill_type_name}</strong>
                </span>
              )}
            </div>
            <Combobox
              value={selectedPrimarySkillTypeId}
              onValueChange={(v) => {
                const idx = primarySets.findIndex((p) => p.skill_type_id === v);
                if (idx === -1) return;
                setSelectedSetIndex(idx);
                setSkillSetRoll(null);
                setSkillPickRoll(null);
                setSelectedSkillIndex(null);
              }}
              placeholder={
                primarySetsLoading
                  ? 'Loading…'
                  : primarySets.length === 0
                    ? 'No Primary sets'
                    : 'Select or search Primary skill set'
              }
              options={primarySetComboboxOptions}
              disabled={
                !userPermissions.canEdit ||
                !pendingPromotion ||
                primarySetsLoading ||
                primarySets.length === 0
              }
            />
          </div>
          {pendingPromotion && primarySetsLoading && (
            <p className="text-xs text-muted-foreground">Loading Primary skill sets for promoted type…</p>
          )}
          {pendingPromotion && !primarySetsLoading && primarySets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No Primary skill sets on this promoted fighter type (check the fighter type configuration).
            </p>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Skill</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                onClick={rollSkillInSet}
                disabled={
                  !userPermissions.canEdit || selectedSetIndex === null || logSubRollMutation.isPending
                }
              >
                Roll for skill
              </Button>
              {skillPickRoll !== null && skillsInSet[selectedSkillIndex ?? -1] && (
                <span className="text-sm text-muted-foreground">
                  {formatRollOutcomeLine(skillPickRoll, [skillPickRoll])}:{' '}
                  <strong className="text-foreground">{skillsInSet[selectedSkillIndex!].skill_name}</strong>
                </span>
              )}
            </div>
            <Combobox
              value={selectedSkillId}
              onValueChange={(v) => {
                const idx = skillsInSet.findIndex((s) => s.skill_id === v);
                if (idx === -1) return;
                setSelectedSkillIndex(idx);
                setSkillPickRoll(null);
              }}
              placeholder={
                selectedSetIndex === null
                  ? 'Choose a Primary skill set first'
                  : skillsInSet.length === 0
                    ? 'Loading skills…'
                    : 'Select or search skill'
              }
              options={skillInSetComboboxOptions}
              disabled={
                !userPermissions.canEdit ||
                selectedSetIndex === null ||
                skillsInSet.length === 0
              }
            />
          </div>
        </div>
      )}

      <FighterPromotionModal
        currentClass={fighterClass}
        currentSpecialRules={fighterSpecialRules}
        currentFighterType={fighterTypeName}
        currentFighterTypeId={fighterTypeId}
        fighterTypes={preFetchedFighterTypes}
        isOpen={promotionOpen}
        onClose={() => setPromotionOpen(false)}
        onPromoted={(data) => {
          setPendingPromotion(data);
          setPromotionOpen(false);
        }}
      />
    </div>
  );
});
