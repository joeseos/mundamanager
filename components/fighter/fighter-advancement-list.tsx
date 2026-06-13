'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Skill, FighterSkills, FighterEffect as FighterEffectType } from '@/types/fighter';
import { TypeSpecificData } from '@/types/fighter-effect';
import { createClient } from '@/utils/supabase/client';
import { skillSetRank } from "@/utils/skillSetRank";
import { characteristicRank } from "@/utils/characteristicRank";
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useMutation } from '@tanstack/react-query';
import { 
  addCharacteristicAdvancement, 
  addSkillAdvancement, 
  applyPromotionWithSkillAdvancement,
  deleteAdvancement,
  verifyAndLogRolledGangerAdvancementRoll,
  verifyAndLogRolledSkillAdvancementRoll
} from '@/app/actions/fighter-advancement';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { LuUndo2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { Combobox } from '@/components/ui/combobox';
import { FighterPromotionModal, type FighterPromotionResult } from '@/components/fighter/edit-fighter/fighter-promotion-modal';
import {
  roll,
  formatRollOutcomeLine,
  rollNd6Outcome,
  GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE,
  resolveGangerExoticBeastAdvancementFromUtil,
  type TableEntry
} from '@/utils/dice';

// AdvancementModal Interfaces
interface AdvancementModalProps {
  fighterId: string;
  currentXp: number;
  fighterClass: string;
  advancements: Array<FighterEffectType>;
  skills: Record<string, any>;
  onClose: () => void;
  onAdvancementAdded: (advancement: FighterEffectType) => void;
  onSkillUpdate?: (updatedSkills: Record<string, any>) => void;
  onXpCreditsUpdate?: (xpChange: number, creditsChange: number) => void;
  onAdvancementUpdate: (updatedAdvancements: FighterEffectType[]) => void;
  onCharacteristicUpdate?: (characteristicName: string, changeAmount: number) => void;
  userPermissions?: UserPermissions;
  preFetchedFighterTypes?: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    total_cost: number;
    sub_type?: { id: string; sub_type_name: string } | null;
  }>;
  onEnsureFighterTypes?: () => Promise<void>;
  fighterSpecialRules?: string[];
  fighterTypeName?: string;
  fighterTypeId?: string;
  fighterSubTypeId?: string;
  onFighterDetailsUpdate?: (patch: {
    fighter_class?: string;
    fighter_class_id?: string;
    fighter_type?: string;
    fighter_type_id?: string;
    fighter_sub_type?: string | null;
    fighter_sub_type_id?: string | null;
    special_rules?: string[];
  }) => void;
}

interface StatChangeCategory {
  id: string;
  effect_name: string;
  type: 'characteristic';
}

interface SkillType {
  id: string;
  name: string;
  type: 'skill';
  is_custom?: boolean;
  created_at?: string;
  updated_at?: string | null;
}

interface AvailableAdvancement {
  id: string;
  xp_cost: number;
  base_xp_cost?: number;
  stat_change: number;
  can_purchase: boolean;
  level?: number;
  credits_increase?: number;
  skill_id?: string;
  stat_change_name?: string;
  description?: string;
  is_available?: boolean;
  current_level?: number;
  has_enough_xp?: boolean;
  available_acquisition_types?: AcquisitionType[];
  skill_type_id?: string;
  characteristic_code?: string;
  is_custom?: boolean;
}

interface SkillResponse {
  skills: {
    skill_id: string;
    skill_name: string;
    skill_type_id: string;
    available_acquisition_types: AcquisitionType[];
    available: boolean;
    is_custom: boolean;
  }[];
  fighter_id: string;
  fighter_class: string;
}

interface SkillAcquisitionType {
  id: string;
  name: string;
  xpCost: number;
  creditCost: number;
}

type AcquisitionType = {
  name: string;
  type_id: string;
  xp_cost: number;
  credit_cost: number;
};

interface SkillData {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available_acquisition_types: AcquisitionType[];
  available: boolean;
}

// AdvancementsList Interfaces
interface StatChange {
  id: string;
  applied_at: string;
  stat_change_type_id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    [key: string]: number;
  };
}

interface FighterChanges {
  advancement?: StatChange[];
  characteristics?: Array<{
    id: string;
    created_at: string;
    updated_at: string;
    code: string;
    times_increased: number;
    characteristic_name: string;
    credits_increase: number;
    xp_cost: number;
    characteristic_value: number;
    acquired_at: string;
  }>;
  skills?: Skill[];
}

interface AdvancementsListProps {
  fighterXp: number;
  fighterChanges?: FighterChanges;
  fighterId: string;
  fighterClass: string;
  advancements: Array<FighterEffectType>;
  skills: FighterSkills;
  userPermissions: UserPermissions;
  onAdvancementUpdate: (updatedAdvancements: Array<FighterEffectType>) => void;
  onSkillUpdate?: (updatedSkills: FighterSkills) => void;
  onXpCreditsUpdate?: (xpChange: number, creditsChange: number) => void;
  onCharacteristicUpdate?: (characteristicName: string, changeAmount: number) => void;
  preFetchedFighterTypes?: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    total_cost: number;
    sub_type?: { id: string; sub_type_name: string } | null;
  }>;
  onEnsureFighterTypes?: () => Promise<void>;
  fighterSpecialRules?: string[];
  fighterTypeName?: string;
  fighterTypeId?: string;
  fighterSubTypeId?: string;
  onFighterDetailsUpdate?: (patch: {
    fighter_class?: string;
    fighter_class_id?: string;
    fighter_type?: string;
    fighter_type_id?: string;
    fighter_sub_type?: string | null;
    fighter_sub_type_id?: string | null;
    special_rules?: string[];
  }) => void;
}

interface TransformedAdvancement {
  id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    credits: number;
    [key: string]: number;
  };
  acquired_at: string;
  type: 'characteristic' | 'skill';
}

// Type guard function
function isStatChangeCategory(category: StatChangeCategory | SkillType): category is StatChangeCategory {
  return category.type === 'characteristic';
}

// Add SkillAccess interface
interface SkillAccess {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null; // default from fighter type
  override_access_level: 'primary' | 'secondary' | 'allowed' | 'denied' | null; // override from archetype
  skill_type_name: string;
}

/**
 * Returns the effective access level used for advancement workflows.
 * "denied" is treated as null (no access) so the UI shows the warning and offers all
 * acquisition types (matching the behaviour for skill sets the fighter has no access to).
 */
function effectiveSkillAccess(a: SkillAccess): 'primary' | 'secondary' | 'allowed' | null {
  const effective = a.override_access_level ?? a.access_level ?? null;
  if (effective === 'denied') return null;
  return effective;
}

// There is intentionally no "any_selected" type. The rules only provide a
// random option for "Allowed" access — selecting a specific skill from an
// Allowed set is not permitted without Primary or Secondary access.
//
// This list mirrors the `type_id` values returned by `get_available_skills`
// (supabase/functions/get_available_skills.sql, `available_acquisition_types`
// array). If a new acquisition type is ever added to that function, it must
// also be added here so the "no access / denied" fallback in
// `getAcquisitionTypeIdsForAccess` offers all options correctly.
const ALL_SKILL_ACQUISITION_TYPE_IDS = [
  'primary_random',
  'primary_selected',
  'secondary_random',
  'secondary_selected',
  'any_random'
] as const;

// Legendary Names use separate acquisition type IDs returned by `get_available_skills`
// (not primary/secondary/any). See the `legendary_name = TRUE` branch in that function.
const LEGENDARY_SKILL_ACQUISITION_TYPE_IDS = ['selected', 'random'] as const;

function isLegendaryAcquisitionTypeId(typeId: string): boolean {
  return (LEGENDARY_SKILL_ACQUISITION_TYPE_IDS as readonly string[]).includes(typeId);
}

function getAcquisitionTypeIdsForAccess(
  level: 'primary' | 'secondary' | 'allowed' | null
): string[] {
  switch (level) {
    case 'primary':
      return ['primary_random', 'primary_selected'];
    case 'secondary':
      return ['secondary_random', 'secondary_selected'];
    case 'allowed':
      // "Allowed" access is intentionally random-only — there is no "any_selected"
      // acquisition type. A fighter must have Primary or Secondary access to select
      // a specific skill from a set.
      return ['any_random'];
    default:
      // No access: caller is expected to display a warning and offer all options
      return [...ALL_SKILL_ACQUISITION_TYPE_IDS];
  }
}

/**
 * Resolves which acquisition type IDs to offer for the selected skill set.
 * Legendary Names bypass access-level filtering and use their own `selected` / `random` types.
 */
function getAllowedAcquisitionTypeIds(
  accessLevel: 'primary' | 'secondary' | 'allowed' | null,
  availableTypes: AcquisitionType[]
): string[] {
  const availableIds = availableTypes.map((t) => t.type_id);
  if (availableIds.some(isLegendaryAcquisitionTypeId)) {
    return availableIds.filter(isLegendaryAcquisitionTypeId);
  }
  return getAcquisitionTypeIdsForAccess(accessLevel);
}

type SkillSetComboboxOption = {
  value: string;
  label: React.ReactNode;
  displayValue: string;
  disabled?: boolean;
};

/**
 * Builds grouped Skill Set combobox options with access annotations.
 * When `highlightPrimaryOnly` is true, only Primary sets use normal styling; all others are grey/italic.
 */
function buildSkillSetComboboxOptions(
  categories: SkillType[],
  skillAccess: SkillAccess[],
  highlightPrimaryOnly: boolean
): SkillSetComboboxOption[] {
  const skillAccessMap = new Map<string, SkillAccess>();
  skillAccess.forEach((a) => skillAccessMap.set(a.skill_type_id, a));

  const customCategories = categories.filter((c) => c.is_custom);
  const standardCategories = categories.filter((c) => !c.is_custom);

  const groupByLabel: Record<string, SkillType[]> = {};
  standardCategories.forEach((category) => {
    const rank = skillSetRank[category.name.toLowerCase()] ?? Infinity;
    let groupLabel = 'Misc.';
    if (rank <= 19) groupLabel = 'Universal Skill Sets';
    else if (rank <= 39) groupLabel = 'Gang-specific Skill Sets';
    else if (rank <= 59) groupLabel = 'Wyrd Powers';
    else if (rank <= 69) groupLabel = 'Cult Wyrd Powers';
    else if (rank <= 79) groupLabel = 'Psychoteric Whispers';
    else if (rank <= 89) groupLabel = 'Legendary Names';
    else if (rank <= 99) groupLabel = 'Ironhead Squat Mining Clans';
    if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
    groupByLabel[groupLabel].push(category);
  });

  const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
    const aRank = Math.min(
      ...groupByLabel[a].map((cat) => skillSetRank[cat.name.toLowerCase()] ?? Infinity)
    );
    const bRank = Math.min(
      ...groupByLabel[b].map((cat) => skillSetRank[cat.name.toLowerCase()] ?? Infinity)
    );
    return aRank - bRank;
  });

  const options: SkillSetComboboxOption[] = [];

  const pushCategory = (category: SkillType) => {
    const access = skillAccessMap.get(category.id);
    const effectiveLevel = access ? effectiveSkillAccess(access) : null;
    let accessLabel = '';
    if (effectiveLevel === 'primary') accessLabel = '(Primary)';
    else if (effectiveLevel === 'secondary') accessLabel = '(Secondary)';
    else if (effectiveLevel === 'allowed') accessLabel = '(Allowed)';
    const labelText = accessLabel ? `${category.name} ${accessLabel}` : category.name;
    const useNormalLabelStyle = highlightPrimaryOnly
      ? effectiveLevel === 'primary'
      : !!effectiveLevel;
    options.push({
      value: category.id,
      label: useNormalLabelStyle ? (
        <span className="pl-4">{labelText}</span>
      ) : (
        <span className="pl-4 italic text-neutral-400">{labelText}</span>
      ),
      displayValue: labelText,
      ...(highlightPrimaryOnly && effectiveLevel !== 'primary' ? { disabled: true } : {})
    });
  };

  if (customCategories.length > 0) {
    options.push({
      value: '__group__custom',
      label: (
        <span className="text-xs font-bold uppercase tracking-wide">Custom Skill Sets</span>
      ),
      displayValue: 'Custom Skill Sets',
      disabled: true
    });
    customCategories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(pushCategory);
  }

  sortedGroupLabels.forEach((groupLabel) => {
    options.push({
      value: `__group__${groupLabel}`,
      label: (
        <span className="text-xs font-bold uppercase tracking-wide">{groupLabel}</span>
      ),
      displayValue: groupLabel,
      disabled: true
    });
    const groupCategories = groupByLabel[groupLabel].slice().sort((a, b) => {
      const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
      const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
      return rankA - rankB;
    });
    groupCategories.forEach(pushCategory);
  });

  return options;
}

const GANGER_ADVANCEMENT_TABLE_LABEL = 'Ganger / Exotic Beast Advancement';

const CHAMPION_PROMOTION_XP_COST = 12;
const CHAMPION_PROMOTION_CREDITS_INCREASE = 40;

const ADVANCEMENT_TYPE_COMBOBOX_OPTIONS = [
  { value: 'characteristic', label: 'Characteristic' },
  { value: 'skill', label: 'Skill' },
] as const;

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

type GangerCharAdv = {
  id: string;
  characteristic_code: string;
  xp_cost: number;
  credits_increase: number;
  times_increased?: number;
};

type AdvancementTypeValue = 'characteristic' | 'skill' | 'promotion_to_champion' | '';

type ChampionPendingPromotion = FighterPromotionResult;

// AdvancementModal Component
export function AdvancementModal({
  fighterId,
  currentXp,
  fighterClass,
  advancements,
  skills,
  onClose,
  onAdvancementAdded,
  onSkillUpdate,
  onXpCreditsUpdate,
  onAdvancementUpdate,
  onCharacteristicUpdate,
  userPermissions,
  preFetchedFighterTypes = [],
  onEnsureFighterTypes,
  fighterSpecialRules = [],
  fighterTypeName = '',
  fighterTypeId = '',
  fighterSubTypeId = '',
  onFighterDetailsUpdate
}: AdvancementModalProps) {
  
  const [categories, setCategories] = useState<(StatChangeCategory | SkillType)[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [availableAdvancements, setAvailableAdvancements] = useState<AvailableAdvancement[]>([]);
  const [selectedAdvancement, setSelectedAdvancement] = useState<AvailableAdvancement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [advancementType, setAdvancementType] = useState<AdvancementTypeValue>('');
  const [skillAcquisitionType, setSkillAcquisitionType] = useState<string>('');
  // skillsData not used in optimistic path; removed
  const [editableXpCost, setEditableXpCost] = useState<number>(0);
  const [editableCreditsIncrease, setEditableCreditsIncrease] = useState<number>(0);
  /** When true, ganger roll UI must not overwrite footer XP/credits from suggested values. */
  const [gangerCostsUserOverride, setGangerCostsUserOverride] = useState(false);
  const [gangerBuyUi, setGangerBuyUi] = useState<{ canBuy: boolean; pending: boolean }>({
    canBuy: false,
    pending: false
  });
  const [gangerPurchaseBusy, setGangerPurchaseBusy] = useState(false);
  // Ganger / Exotic Beast advancement roll UI (inline)
  const [gangerSelectedRowId, setGangerSelectedRowId] = useState('');
  const [gangerRollCooldown, setGangerRollCooldown] = useState(false);
  const [gangerCharMap, setGangerCharMap] = useState<Record<string, GangerCharAdv>>({});
  const [gangerSpecialistCosts, setGangerSpecialistCosts] = useState<{ xp_cost: number; credits_increase: number }>({
    xp_cost: 6,
    credits_increase: 20
  });
  const [gangerPairStatName, setGangerPairStatName] = useState('');
  const [gangerPreviewSkillAccess, setGangerPreviewSkillAccess] = useState<SkillAccess[]>([]);
  const [gangerPreviewSkillAccessLoading, setGangerPreviewSkillAccessLoading] = useState(false);
  const [gangerSpecialistSkillCategories, setGangerSpecialistSkillCategories] = useState<SkillType[]>([]);
  const [gangerSpecialistCategoriesLoading, setGangerSpecialistCategoriesLoading] = useState(false);
  const [gangerSelectedSkillSetId, setGangerSelectedSkillSetId] = useState('');
  const [gangerSkillsInSet, setGangerSkillsInSet] = useState<
    { skill_id: string; skill_name: string; skill_type_id: string; available: boolean }[]
  >([]);
  const [gangerSkillsInSetLoading, setGangerSkillsInSetLoading] = useState(false);
  const [gangerSkillPickRoll, setGangerSkillPickRoll] = useState<number | null>(null);
  const [gangerSelectedSkillIndex, setGangerSelectedSkillIndex] = useState<number | null>(null);
  const [gangerPromotionOpen, setGangerPromotionOpen] = useState(false);
  const [gangerPendingPromotion, setGangerPendingPromotion] = useState<FighterPromotionResult | null>(null);
  const [championPromotionOpen, setChampionPromotionOpen] = useState(false);
  const [championPendingPromotion, setChampionPendingPromotion] = useState<ChampionPendingPromotion | null>(null);
  const [championPreviewSkillAccess, setChampionPreviewSkillAccess] = useState<SkillAccess[]>([]);
  const [championPreviewSkillAccessLoading, setChampionPreviewSkillAccessLoading] = useState(false);
  const [championPurchaseBusy, setChampionPurchaseBusy] = useState(false);
  // isSubmitting unused; removed
  const [skillAccess, setSkillAccess] = useState<SkillAccess[]>([]);
  const [skillAccessLoading, setSkillAccessLoading] = useState(false);
  // Roll-for-skill UI for non-Ganger fighters when a Random acquisition type is selected
  const [skillRollResult, setSkillRollResult] = useState<{ roll: number; skillName: string } | null>(null);
  // No client-side invalidations; rely on server tag revalidation

  // TanStack Query mutations
  const addCharacteristicMutation = useMutation({
    mutationFn: async (variables: {
      fighter_id: string;
      fighter_effect_type_id: string;
      xp_cost: number;
      credits_increase: number;
      ganger_pair_stat_name?: string;
      ganger_characteristic_code?: string;
    }) => {
      const { ganger_pair_stat_name: _a, ganger_characteristic_code: _b, ...rest } = variables;
      const result = await addCharacteristicAdvancement(rest);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add characteristic advancement');
      }
      return result;
    },
    onMutate: async (variables) => {
      const statChangeName =
        variables.ganger_pair_stat_name ?? selectedAdvancement?.stat_change_name;
      if (!statChangeName) return {};

      // Snapshot the previous value for rollback
      const previousAdvancements = [...advancements];

      // Create optimistic advancement with predictable structure
      const advancementName = `Characteristic: ${statChangeName}`;
      const optimisticId = `optimistic-char-${fighterId}-${statChangeName.replace(/\s+/g, '-').toLowerCase()}`;
      const characteristicCode =
        variables.ganger_characteristic_code ??
        (selectedAdvancement?.characteristic_code ||
          statChangeName.toLowerCase().replace(/\s+/g, '_'));
      // "+" stats (lower is better) use -1; normal stats use 1
      const plusStats = new Set([
        'weapon_skill', 'ballistic_skill', 'initiative',
        'leadership', 'cool', 'willpower', 'intelligence'
      ]);
      const numericValue = plusStats.has(characteristicCode) ? -1 : 1;
      const optimisticAdvancement = {
        id: optimisticId,
        effect_name: advancementName,
        fighter_effect_modifiers: [{
          id: `${optimisticId}-modifier`,
          fighter_effect_id: optimisticId,
          stat_name: characteristicCode,
          numeric_value: numericValue
        }],
        created_at: new Date().toISOString(),
        type_specific_data: {
          xp_cost: variables.xp_cost,
          credits_increase: variables.credits_increase,
          advancement_type: 'characteristic'
        }
      };

      // Optimistically update the advancements list
      const updatedAdvancements = [...advancements, optimisticAdvancement];
      onAdvancementUpdate(updatedAdvancements);

      // Update XP and credits immediately
      if (onXpCreditsUpdate) {
        onXpCreditsUpdate(-variables.xp_cost, variables.credits_increase);
      }

      return { 
        previousAdvancements,
        optimisticAdvancement,
        xpCost: variables.xp_cost,
        creditsIncrease: variables.credits_increase
      };
    },
    onSuccess: (result, variables, context) => {
      // Don't manually replace - let the cache invalidation handle it
      // This prevents race conditions between manual updates and cache refresh
      const name = variables.ganger_pair_stat_name ?? selectedAdvancement?.stat_change_name;
      toast.success("Success!", { description: `Successfully added ${name}` });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic advancement update
      if (context?.previousAdvancements) {
        onAdvancementUpdate(context.previousAdvancements);
      }

      // Rollback XP and credits
      if (context?.xpCost || context?.creditsIncrease) {
        if (onXpCreditsUpdate) {
          onXpCreditsUpdate(context.xpCost || 0, -(context.creditsIncrease || 0));
        }
      }

      toast.error(error instanceof Error ? error.message : 'Failed to add advancement');
    },
    // Let server action handle cache invalidation naturally; nothing here
  });

  const addSkillMutation = useMutation({
    mutationFn: async (variables: {
      fighter_id: string;
      skill_id: string;
      xp_cost: number;
      credits_increase: number;
      is_advance: boolean;
      ganger_skill_name?: string;
    }) => {
      const { ganger_skill_name: _g, ...rest } = variables;
      const result = await addSkillAdvancement(rest);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add skill advancement');
      }
      return result;
    },
    onMutate: async (variables) => {
      const skillName = variables.ganger_skill_name ?? selectedAdvancement?.stat_change_name;
      if (!skillName) return {};
      
      // Store previous states for rollback
      const previousAdvancements = [...advancements];
      const previousSkills = skills;
      
      // For skill advancements, ONLY add to skills list
      // The advancement list will show it via advancementSkills derived from skills
      if (onSkillUpdate) {
        const optimisticSkillId = `temp-${Date.now()}`;
        const updatedSkills = {
          ...skills,
          [skillName]: {
            id: optimisticSkillId,
            credits_increase: variables.credits_increase,
            xp_cost: variables.xp_cost,
            is_advance: true,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: null,
            injury_name: undefined
          }
        };
        onSkillUpdate(updatedSkills);
      }

      // Update XP and credits immediately
      if (onXpCreditsUpdate) {
        onXpCreditsUpdate(-variables.xp_cost, variables.credits_increase);
      }

      return { previousAdvancements, previousSkills, skillName };
    },
    onSuccess: (result, variables, context) => {
      // Don't do anything - let the cache refresh handle the real data
      // The optimistic update will be replaced naturally when the cache refreshes
      const name = variables.ganger_skill_name ?? selectedAdvancement?.stat_change_name;
      toast.success("Success!", { description: `Successfully added ${name}` });
    },
    onError: (error, variables, context) => {
      // Rollback skills update
      if (context?.previousSkills && onSkillUpdate) {
        onSkillUpdate(context.previousSkills);
      }
      
      toast.error(error instanceof Error ? error.message : 'Failed to add advancement');
    }
  });

  const gangerSelectedRow = useMemo(
    () => GANGER_ADVANCEMENT_COMBO_OPTIONS.find((r) => r.id === gangerSelectedRowId),
    [gangerSelectedRowId]
  );

  const isGangerOrExoticBeastClass =
    fighterClass === 'Ganger' || fighterClass === 'Exotic Beast';

  const gangerModalRollBuy =
    isGangerOrExoticBeastClass &&
    !!userPermissions &&
    !!onEnsureFighterTypes &&
    !!onFighterDetailsUpdate;

  useEffect(() => {
    if (!isGangerOrExoticBeastClass || !fighterId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_available_advancements`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session?.access_token || ''}`
            },
            body: JSON.stringify({ fighter_id: fighterId })
          }
        );
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        const ch = data?.characteristics as Record<string, GangerCharAdv> | undefined;
        if (ch && typeof ch === 'object') setGangerCharMap(ch);
        const spec = data?.ganger_to_specialist_advancement as
          | { xp_cost?: number; credits_increase?: number }
          | undefined;
        if (spec && typeof spec.xp_cost === 'number') {
          setGangerSpecialistCosts({
            xp_cost: spec.xp_cost,
            credits_increase: typeof spec.credits_increase === 'number' ? spec.credits_increase : 0
          });
        }
      } catch {
        // non-fatal
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fighterId, isGangerOrExoticBeastClass]);

  useEffect(() => {
    if (gangerSelectedRow?.kind !== 'specialist' || !gangerPendingPromotion?.fighter_type_id) {
      setGangerPreviewSkillAccess([]);
      setGangerPreviewSkillAccessLoading(false);
      return;
    }
    let cancelled = false;
    setGangerPreviewSkillAccessLoading(true);
    const run = async () => {
      try {
        const res = await fetch(
          `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}&previewFighterTypeId=${encodeURIComponent(gangerPendingPromotion.fighter_type_id)}`
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setGangerPreviewSkillAccess([]);
          return;
        }
        const data = await res.json();
        const access = (data.skill_access || []) as SkillAccess[];
        if (!cancelled) setGangerPreviewSkillAccess(access);
      } catch {
        if (!cancelled) setGangerPreviewSkillAccess([]);
      } finally {
        if (!cancelled) setGangerPreviewSkillAccessLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      setGangerPreviewSkillAccessLoading(false);
    };
  }, [fighterId, gangerSelectedRow?.kind, gangerPendingPromotion?.fighter_type_id]);

  useEffect(() => {
    if (gangerSelectedRow?.kind !== 'specialist') {
      setGangerSpecialistSkillCategories([]);
      setGangerSpecialistCategoriesLoading(false);
      return;
    }
    let cancelled = false;
    setGangerSpecialistCategoriesLoading(true);
    const run = async () => {
      try {
        const response = await fetch(`/api/skill-types?fighterId=${encodeURIComponent(fighterId)}`);
        if (!response.ok || cancelled) {
          if (!cancelled) setGangerSpecialistSkillCategories([]);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setGangerSpecialistSkillCategories(
            (data as Array<{ id: string; name: string; is_custom?: boolean }>).map((cat) => ({
              ...cat,
              type: 'skill' as const
            }))
          );
        }
      } catch {
        if (!cancelled) setGangerSpecialistSkillCategories([]);
      } finally {
        if (!cancelled) setGangerSpecialistCategoriesLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      setGangerSpecialistCategoriesLoading(false);
    };
  }, [fighterId, gangerSelectedRow?.kind]);

  useEffect(() => {
    if (!gangerSelectedRow) {
      setGangerPairStatName('');
      return;
    }
    if (gangerSelectedRow.kind !== 'pair' || !gangerSelectedRow.pairOptions) return;
    const [a, b] = gangerSelectedRow.pairOptions;
    setGangerPairStatName((prev) => (prev && [a, b].includes(prev) ? prev : a));
  }, [gangerSelectedRowId, gangerSelectedRow]);

  useEffect(() => {
    if (gangerSelectedRow?.kind !== 'specialist') {
      setGangerPendingPromotion(null);
      setGangerSkillPickRoll(null);
      setGangerSelectedSkillSetId('');
      setGangerSelectedSkillIndex(null);
    }
  }, [gangerSelectedRow?.kind]);

  useEffect(() => {
    setGangerSkillPickRoll(null);
    setGangerSelectedSkillSetId('');
    setGangerSelectedSkillIndex(null);
  }, [gangerPendingPromotion?.fighter_type_id]);

  useEffect(() => {
    setSelectedCategory('');
    setSelectedAdvancement(null);
    setSkillRollResult(null);
    setAvailableAdvancements([]);
  }, [championPendingPromotion?.fighter_type_id]);

  useEffect(() => {
    if (!gangerSelectedSkillSetId || !gangerPendingPromotion?.fighter_type_id) {
      setGangerSkillsInSet([]);
      setGangerSkillsInSetLoading(false);
      return;
    }
    const typeId = gangerSelectedSkillSetId;
    let cancelled = false;
    setGangerSkillsInSetLoading(true);
    const run = async () => {
      try {
        const res = await fetch(
          `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}&skillTypeId=${encodeURIComponent(typeId)}&previewFighterTypeId=${encodeURIComponent(gangerPendingPromotion.fighter_type_id)}`
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setGangerSkillsInSet([]);
          return;
        }
        const data = (await res.json()) as {
          skills?: { skill_id: string; skill_name: string; skill_type_id: string; available: boolean }[];
        };
        if (!cancelled) setGangerSkillsInSet(data.skills ?? []);
      } catch {
        if (!cancelled) setGangerSkillsInSet([]);
      } finally {
        if (!cancelled) setGangerSkillsInSetLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      setGangerSkillsInSetLoading(false);
    };
  }, [fighterId, gangerSelectedSkillSetId, gangerPendingPromotion?.fighter_type_id]);

  const logGangerRollMutation = useMutation({
    mutationFn: async (variables: { outcome_label: string; dice_data: Record<string, unknown> }) => {
      const result = await verifyAndLogRolledGangerAdvancementRoll({
        fighter_id: fighterId,
        advancement_table: GANGER_ADVANCEMENT_TABLE_LABEL,
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

  const logGangerSubRollMutation = useMutation({
    mutationFn: async (variables: { outcome_label: string; dice_data: Record<string, unknown> }) => {
      const result = await verifyAndLogRolledGangerAdvancementRoll({
        fighter_id: fighterId,
        advancement_table: GANGER_ADVANCEMENT_TABLE_LABEL,
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

  const logSkillAdvancementRollMutation = useMutation({
    mutationFn: async (variables: {
      skill_set_name: string;
      skill_set_access_label: string;
      acquisition_type_label: string;
      outcome_label: string;
      dice_data: Record<string, unknown>;
    }) => {
      const result = await verifyAndLogRolledSkillAdvancementRoll({
        fighter_id: fighterId,
        skill_set_name: variables.skill_set_name,
        skill_set_access_label: variables.skill_set_access_label,
        acquisition_type_label: variables.acquisition_type_label,
        outcome_label: variables.outcome_label,
        dice_data: variables.dice_data
      });
      if (!result.success) throw new Error(result.error || 'Failed to log skill advancement roll');
      return result;
    },
    onSuccess: () => {
      toast.success('Skill advancement roll recorded in gang log');
    },
    onError: (e: Error) => {
      toast.error(e?.message || 'Failed to log skill advancement roll');
    }
  });

  const applyGangerSpecialistMutation = useMutation({
    mutationFn: async (vars: {
      promotion: FighterPromotionResult;
      skill_id: string;
      xp_cost: number;
      credits_increase: number;
      skillName: string;
    }) => {
      const result = await applyPromotionWithSkillAdvancement({
        fighter_id: fighterId,
        skill_id: vars.skill_id,
        xp_cost: vars.xp_cost,
        credits_increase: vars.credits_increase,
        promotion: vars.promotion
      });
      if (!result.success) throw new Error(result.error || 'Failed to apply promotion and skill');
      return result;
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
        fighter_sub_type: vars.promotion.fighter_sub_type ?? null,
        fighter_sub_type_id: vars.promotion.fighter_sub_type_id ?? null,
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

  const applyChampionPromotionMutation = useMutation({
    mutationFn: async (vars: {
      promotion: ChampionPendingPromotion;
      skill_id: string;
      xp_cost: number;
      credits_increase: number;
      skillName: string;
    }) => {
      const result = await applyPromotionWithSkillAdvancement({
        fighter_id: fighterId,
        skill_id: vars.skill_id,
        xp_cost: vars.xp_cost,
        credits_increase: vars.credits_increase,
        promotion: vars.promotion
      });
      if (!result.success) throw new Error(result.error || 'Failed to apply promotion and skill');
      return result;
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
        fighter_sub_type: vars.promotion.fighter_sub_type ?? null,
        fighter_sub_type_id: vars.promotion.fighter_sub_type_id ?? null,
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

  const logGangerResolvedRollWithCooldown = (row: TableEntry, rollTotal: number, dice: number[]) => {
    if (gangerRollCooldown || logGangerRollMutation.isPending) return false;
    setGangerRollCooldown(true);
    try {
      const combo = GANGER_ADVANCEMENT_COMBO_OPTIONS.find(
        (o) => o.range[0] === row.range[0] && o.range[1] === row.range[1]
      );
      if (combo) {
        setGangerCostsUserOverride(false);
        setGangerSelectedRowId(combo.id);
      }
      logGangerRollMutation.mutate({
        outcome_label: row.name,
        dice_data: { result: rollTotal, dice }
      });
      return true;
    } finally {
      setTimeout(() => setGangerRollCooldown(false), 2000);
    }
  };

  const executeGangerPairPurchase = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (!gangerSelectedRowId || !gangerSelectedRow || gangerSelectedRow.kind !== 'pair' || !gangerPairStatName) {
        toast.error('Select a table outcome');
        return false;
      }
      const det = gangerCharMap[gangerPairStatName];
      if (!det?.id) {
        toast.error('Could not resolve characteristic data');
        return false;
      }
      if (currentXp < xpCost) {
        toast.error('Insufficient XP');
        return false;
      }
      const characteristicCode =
        det.characteristic_code || gangerPairStatName.toLowerCase().replace(/\s+/g, '_');
      try {
        await addCharacteristicMutation.mutateAsync({
          fighter_id: fighterId,
          fighter_effect_type_id: det.id,
          xp_cost: xpCost,
          credits_increase: creditsIncrease,
          ganger_pair_stat_name: gangerPairStatName,
          ganger_characteristic_code: characteristicCode
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      gangerSelectedRowId,
      gangerSelectedRow,
      gangerPairStatName,
      gangerCharMap,
      currentXp,
      fighterId,
      addCharacteristicMutation
    ]
  );

  const executeGangerSpecialistPurchase = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (!gangerSelectedRowId || !gangerSelectedRow || gangerSelectedRow.kind !== 'specialist') {
        toast.error('Select a table outcome');
        return false;
      }
      if (!gangerPendingPromotion) {
        toast.error('Confirm promotion in the Promote Fighter modal first');
        return false;
      }
      if (!gangerSelectedSkillSetId) {
        toast.error('Choose a Primary skill set');
        return false;
      }
      const accessRow = gangerPreviewSkillAccess.find((a) => a.skill_type_id === gangerSelectedSkillSetId);
      const accessLevel = accessRow ? effectiveSkillAccess(accessRow) : null;
      if (accessLevel !== 'primary') {
        toast.error('This advancement requires a Primary skill set');
        return false;
      }
      if (gangerSelectedSkillIndex === null || !gangerSkillsInSet[gangerSelectedSkillIndex]) {
        toast.error('Choose a skill');
        return false;
      }
      const sk = gangerSkillsInSet[gangerSelectedSkillIndex];
      if (!sk.available) {
        toast.error('Selected skill is not available');
        return false;
      }
      if (currentXp < xpCost) {
        toast.error('Insufficient XP');
        return false;
      }
      try {
        await applyGangerSpecialistMutation.mutateAsync({
          promotion: gangerPendingPromotion,
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
      gangerSelectedRowId,
      gangerSelectedRow,
      gangerPendingPromotion,
      gangerSelectedSkillSetId,
      gangerPreviewSkillAccess,
      gangerSelectedSkillIndex,
      gangerSkillsInSet,
      currentXp,
      applyGangerSpecialistMutation
    ]
  );

  const executeChampionPromotionPurchase = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (advancementType !== 'promotion_to_champion') {
        toast.error('Select Promotion to Champion');
        return false;
      }
      if (!championPendingPromotion) {
        toast.error('Confirm promotion in the Promote Fighter modal first');
        return false;
      }
      if (!selectedCategory) {
        toast.error('Choose a Primary skill set');
        return false;
      }
      const accessRow = championPreviewSkillAccess.find((a) => a.skill_type_id === selectedCategory);
      const accessLevel = accessRow ? effectiveSkillAccess(accessRow) : null;
      if (accessLevel !== 'primary') {
        toast.error('This advancement requires a Primary skill set');
        return false;
      }
      if (!selectedAdvancement) {
        toast.error('Choose a skill');
        return false;
      }
      if (selectedAdvancement.is_available === false) {
        toast.error('Selected skill is not available');
        return false;
      }
      if (currentXp < xpCost) {
        toast.error('Insufficient XP');
        return false;
      }
      try {
        await applyChampionPromotionMutation.mutateAsync({
          promotion: championPendingPromotion,
          skill_id: selectedAdvancement.id,
          xp_cost: xpCost,
          credits_increase: creditsIncrease,
          skillName: selectedAdvancement.stat_change_name ?? 'Skill'
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      advancementType,
      championPendingPromotion,
      selectedCategory,
      championPreviewSkillAccess,
      selectedAdvancement,
      currentXp,
      applyChampionPromotionMutation
    ]
  );

  const purchaseGangerAdvancement = useCallback(
    async (xpCost: number, creditsIncrease: number): Promise<boolean> => {
      if (!gangerSelectedRow) return false;
      if (gangerSelectedRow.kind === 'pair') {
        return executeGangerPairPurchase(xpCost, creditsIncrease);
      }
      if (gangerSelectedRow.kind === 'specialist') {
        return executeGangerSpecialistPurchase(xpCost, creditsIncrease);
      }
      return false;
    },
    [gangerSelectedRow, executeGangerPairPurchase, executeGangerSpecialistPurchase]
  );

  useEffect(() => {
    if (!gangerModalRollBuy) return;
    const pending =
      applyGangerSpecialistMutation.isPending ||
      logGangerSubRollMutation.isPending ||
      logGangerRollMutation.isPending;
    if (!userPermissions?.canEdit) {
      setGangerBuyUi({ canBuy: false, pending });
      return;
    }
    if (!gangerSelectedRowId || !gangerSelectedRow) {
      setGangerBuyUi({ canBuy: false, pending });
      return;
    }
    if (editableXpCost < 0 || currentXp < editableXpCost) {
      setGangerBuyUi({ canBuy: false, pending });
      return;
    }
    if (gangerSelectedRow.kind === 'pair') {
      const ok = !!(gangerPairStatName && gangerCharMap[gangerPairStatName]?.id);
      setGangerBuyUi({ canBuy: ok, pending });
      return;
    }
    if (gangerSelectedRow.kind === 'specialist') {
      const sk =
        gangerSelectedSkillIndex !== null ? gangerSkillsInSet[gangerSelectedSkillIndex] : undefined;
      const accessRow = gangerPreviewSkillAccess.find((a) => a.skill_type_id === gangerSelectedSkillSetId);
      const accessLevel = accessRow ? effectiveSkillAccess(accessRow) : null;
      const ok = !!(
        gangerPendingPromotion &&
        gangerSelectedSkillSetId &&
        accessLevel === 'primary' &&
        gangerSelectedSkillIndex !== null &&
        sk?.available
      );
      setGangerBuyUi({ canBuy: ok, pending });
      return;
    }
    setGangerBuyUi({ canBuy: false, pending });
  }, [
    gangerModalRollBuy,
    userPermissions?.canEdit,
    gangerSelectedRowId,
    gangerSelectedRow,
    editableXpCost,
    currentXp,
    gangerPairStatName,
    gangerCharMap,
    gangerPendingPromotion,
    gangerSelectedSkillSetId,
    gangerPreviewSkillAccess,
    gangerSelectedSkillIndex,
    gangerSkillsInSet,
    applyGangerSpecialistMutation.isPending,
    logGangerSubRollMutation.isPending,
    logGangerRollMutation.isPending
  ]);

  useEffect(() => {
    if (!gangerModalRollBuy) return;
    if (!gangerSelectedRow) return;
    if (gangerSelectedRow.kind === 'pair' && gangerPairStatName) {
      const det = gangerCharMap[gangerPairStatName];
      if (det) {
        if (!gangerCostsUserOverride) {
          setEditableXpCost(det.xp_cost ?? 6);
          setEditableCreditsIncrease(det.credits_increase ?? 0);
        }
      }
      return;
    }
    if (gangerSelectedRow.kind === 'specialist') {
      if (!gangerCostsUserOverride) {
        setEditableXpCost(gangerSpecialistCosts.xp_cost);
        setEditableCreditsIncrease(gangerSpecialistCosts.credits_increase);
      }
    }
  }, [
    gangerModalRollBuy,
    gangerSelectedRow,
    gangerPairStatName,
    gangerCharMap,
    gangerSpecialistCosts,
    gangerCostsUserOverride
  ]);

  const rollGangerSkillInSet = () => {
    if (gangerSkillsInSet.length === 0) {
      toast.error('No skills in this set (or still loading)');
      return;
    }
    if (logGangerSubRollMutation.isPending) return;
    const r = roll(gangerSkillsInSet.length);
    const chosen = gangerSkillsInSet[r - 1];
    setGangerSkillPickRoll(r);
    setGangerSelectedSkillIndex(r - 1);
    logGangerSubRollMutation.mutate({
      outcome_label: `Specialist — Skill: ${chosen.skill_name}`,
      dice_data: {
        result: r,
        dice: [r],
        pool_size: gangerSkillsInSet.length,
        roll_type: 'skill_in_set'
      }
    });
  };

  const rollSkillFromSet = useCallback(() => {
    if (logSkillAdvancementRollMutation.isPending) return;
    const pool = availableAdvancements.filter((a) => a.is_available !== false);
    if (pool.length === 0) {
      toast.error('No available skills in this set');
      return;
    }
    const r = roll(pool.length);
    const chosen = pool[r - 1];
    setSelectedAdvancement({
      ...chosen,
      xp_cost: editableXpCost,
      credits_increase: editableCreditsIncrease,
      has_enough_xp: currentXp >= editableXpCost
    });
    setSkillRollResult({ roll: r, skillName: chosen.stat_change_name ?? 'Skill' });

    // Log the roll to the gang log so it's auditable, mirroring the Ganger / Exotic Beast flow.
    const matchedSet = categories.find(
      (c): c is SkillType => c.type === 'skill' && c.id === selectedCategory
    );
    const skillSetName = matchedSet?.name ?? 'Unknown Skill Set';
    // Compute the effective access for the selected set inline (mirrors selectedSkillSetAccess
    // useMemo below; declared later in the file due to hook ordering).
    const accessRow = skillAccess.find((a) => a.skill_type_id === selectedCategory);
    const accessLevel = accessRow ? effectiveSkillAccess(accessRow) : null;
    const skillSetAccessLabel =
      accessLevel === 'primary'
        ? 'Primary'
        : accessLevel === 'secondary'
          ? 'Secondary'
          : accessLevel === 'allowed'
            ? 'Allowed'
            : 'Not normally accessible';
    const sample = availableAdvancements.find(
      (a) => a.available_acquisition_types && a.available_acquisition_types.length > 0
    );
    const acquisitionTypeLabel =
      advancementType === 'promotion_to_champion'
        ? 'Promotion to Champion'
        : sample?.available_acquisition_types?.find((t) => t.type_id === skillAcquisitionType)?.name ??
          skillAcquisitionType;
    logSkillAdvancementRollMutation.mutate({
      skill_set_name: skillSetName,
      skill_set_access_label: skillSetAccessLabel,
      acquisition_type_label: acquisitionTypeLabel,
      outcome_label: chosen.stat_change_name ?? 'Skill',
      dice_data: {
        result: r,
        dice: [r],
        pool_size: pool.length,
        roll_type: 'skill_advancement',
        acquisition_type_id:
          advancementType === 'promotion_to_champion' ? 'promotion_to_champion' : skillAcquisitionType,
        skill_set_access: accessLevel ?? 'none'
      }
    });
  }, [
    availableAdvancements,
    editableXpCost,
    editableCreditsIncrease,
    currentXp,
    categories,
    selectedCategory,
    skillAccess,
    skillAcquisitionType,
    advancementType,
    logSkillAdvancementRollMutation
  ]);

  const gangerAdvancementComboboxOptions = useMemo(
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

  const gangerSpecialistSkillSetComboboxOptions = useMemo(
    () =>
      buildSkillSetComboboxOptions(
        gangerSpecialistSkillCategories,
        gangerPreviewSkillAccess,
        true
      ),
    [gangerSpecialistSkillCategories, gangerPreviewSkillAccess]
  );

  const gangerSelectedSkillSetAccess = useMemo<'primary' | 'secondary' | 'allowed' | null>(() => {
    if (!gangerSelectedSkillSetId) return null;
    const access = gangerPreviewSkillAccess.find((a) => a.skill_type_id === gangerSelectedSkillSetId);
    return access ? effectiveSkillAccess(access) : null;
  }, [gangerSelectedSkillSetId, gangerPreviewSkillAccess]);

  const gangerSpecialistRequiresPrimarySet =
    gangerSelectedRow?.kind === 'specialist' &&
    !!gangerSelectedSkillSetId &&
    gangerSelectedSkillSetAccess !== 'primary';

  const gangerSkillInSetComboboxOptions = useMemo(
    () =>
      gangerSkillsInSet.map((s) => ({
        value: s.skill_id,
        label: s.available ? s.skill_name : `${s.skill_name} (unavailable)`,
        displayValue: s.skill_name,
        disabled: !s.available
      })),
    [gangerSkillsInSet]
  );

  const gangerSelectedSkillId =
    gangerSelectedSkillIndex !== null && gangerSkillsInSet[gangerSelectedSkillIndex]
      ? gangerSkillsInSet[gangerSelectedSkillIndex].skill_id
      : '';

  const gangerPairDetail =
    gangerSelectedRow?.kind === 'pair' && gangerPairStatName ? gangerCharMap[gangerPairStatName] : null;

  const advancementTypeComboboxOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [...ADVANCEMENT_TYPE_COMBOBOX_OPTIONS];
    if (fighterClass === 'Specialist' || fighterClass === 'Exotic Beast Specialist') {
      options.push({ value: 'promotion_to_champion', label: 'Promotion to Champion' });
    }
    return options;
  }, [fighterClass]);

  const isSkillLikeAdvancementType =
    advancementType === 'skill' || advancementType === 'promotion_to_champion';

  // Effective skill access for the currently-selected Skill Set (skill flow only).
  // Returns null when the fighter has no defined access to this set.
  const selectedSkillSetAccess = useMemo<'primary' | 'secondary' | 'allowed' | null>(() => {
    if (!isSkillLikeAdvancementType || !selectedCategory) return null;
    const accessSource =
      advancementType === 'promotion_to_champion' ? championPreviewSkillAccess : skillAccess;
    const access = accessSource.find((a) => a.skill_type_id === selectedCategory);
    return access ? effectiveSkillAccess(access) : null;
  }, [
    isSkillLikeAdvancementType,
    advancementType,
    selectedCategory,
    skillAccess,
    championPreviewSkillAccess
  ]);

  const selectedSkillSetLacksAccess = useMemo(() => {
    if (!isSkillLikeAdvancementType || !selectedCategory) return false;
    // Suppress the warning while skill access data is still loading to avoid
    // a false "not accessible" flash on slower connections.
    const accessLoading =
      advancementType === 'promotion_to_champion'
        ? championPreviewSkillAccessLoading
        : skillAccessLoading;
    if (accessLoading) return false;
    return selectedSkillSetAccess === null;
  }, [
    isSkillLikeAdvancementType,
    advancementType,
    selectedCategory,
    skillAccessLoading,
    championPreviewSkillAccessLoading,
    selectedSkillSetAccess
  ]);

  const championPromotionRequiresPrimarySet =
    advancementType === 'promotion_to_champion' &&
    !!selectedCategory &&
    selectedSkillSetAccess !== 'primary';

  /**
   * Characteristic combobox options grouped by rank label.
   * Group headers are rendered as disabled rows (the Combobox treats disabled rows as headers).
   */
  const characteristicComboboxOptions = useMemo(() => {
    if (advancementType !== 'characteristic') return [];

    const statChangeCategories = categories.filter(isStatChangeCategory);

    const groupByLabel: Record<string, StatChangeCategory[]> = {};
    statChangeCategories.forEach((category) => {
      const rank = characteristicRank[category.effect_name.toLowerCase()] ?? Infinity;
      let groupLabel = 'Misc.';
      if (rank <= 8) groupLabel = 'Main Characteristics';
      else if (rank <= 12) groupLabel = 'Psychology Characteristics';
      if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
      groupByLabel[groupLabel].push(category);
    });

    const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
      const aRank = Math.min(
        ...groupByLabel[a].map((cat) => characteristicRank[cat.effect_name.toLowerCase()] ?? Infinity)
      );
      const bRank = Math.min(
        ...groupByLabel[b].map((cat) => characteristicRank[cat.effect_name.toLowerCase()] ?? Infinity)
      );
      return aRank - bRank;
    });

    const options: Array<{
      value: string;
      label: React.ReactNode;
      displayValue: string;
      disabled?: boolean;
    }> = [];

    sortedGroupLabels.forEach((groupLabel) => {
      options.push({
        value: `__group__${groupLabel}`,
        label: (
          <span className="text-xs font-bold uppercase tracking-wide">{groupLabel}</span>
        ),
        displayValue: groupLabel,
        disabled: true
      });
      const groupCategories = groupByLabel[groupLabel].slice().sort((a, b) => {
        const rankA = characteristicRank[a.effect_name.toLowerCase()] ?? Infinity;
        const rankB = characteristicRank[b.effect_name.toLowerCase()] ?? Infinity;
        return rankA - rankB;
      });
      groupCategories.forEach((category) => {
        options.push({
          value: category.id,
          label: <span className="pl-4">{category.effect_name}</span>,
          displayValue: category.effect_name
        });
      });
    });

    return options;
  }, [advancementType, categories]);

  /**
   * Skill Set combobox options. Custom Skill Sets group first (when present),
   * then standard sets grouped by rank label, with access annotations.
   * Group headers are rendered as disabled rows (the Combobox treats disabled rows as headers).
   */
  const skillSetComboboxOptions = useMemo(() => {
    if (!isSkillLikeAdvancementType) return [];
    const skillCategories = categories.filter((cat): cat is SkillType => cat.type === 'skill');
    const accessSource =
      advancementType === 'promotion_to_champion' ? championPreviewSkillAccess : skillAccess;
    return buildSkillSetComboboxOptions(
      skillCategories,
      accessSource,
      advancementType === 'promotion_to_champion'
    );
  }, [
    isSkillLikeAdvancementType,
    advancementType,
    categories,
    skillAccess,
    championPreviewSkillAccess
  ]);

  /**
   * Acquisition Type combobox options derived from the selected skill set's access level.
   * Costs are taken from `available_acquisition_types` on any skill in the set (uniform across the set).
   */
  const acquisitionTypeComboboxOptions = useMemo(() => {
    if (advancementType !== 'skill' || !selectedCategory) return [];
    const sample = availableAdvancements.find(
      (a) => a.available_acquisition_types && a.available_acquisition_types.length > 0
    );
    const allTypes = sample?.available_acquisition_types ?? [];
    if (allTypes.length === 0) return [];
    const allowedIds = new Set(getAllowedAcquisitionTypeIds(selectedSkillSetAccess, allTypes));
    return allTypes
      .filter((t) => allowedIds.has(t.type_id))
      .sort((a, b) => a.xp_cost - b.xp_cost)
      .map((t) => ({
        value: t.type_id,
        label: `${t.name} (${t.xp_cost} XP, ${t.credit_cost} credits)`,
        displayValue: `${t.name} (${t.xp_cost} XP, ${t.credit_cost} credits)`
      }));
  }, [advancementType, selectedCategory, availableAdvancements, selectedSkillSetAccess]);

  /** Skill combobox options for the selected Skill Set; already-owned skills are disabled. */
  const skillComboboxOptions = useMemo(() => {
    if (!isSkillLikeAdvancementType) return [];
    return availableAdvancements.map((a) => {
      const isAvailable = a.is_available !== false;
      const baseName = a.stat_change_name ?? 'Skill';
      const customSuffix = a.is_custom ? ' (Custom)' : '';
      const ownedSuffix = !isAvailable ? ' (already owned)' : '';
      const display = `${baseName}${customSuffix}${ownedSuffix}`;
      return {
        value: a.id,
        label: !isAvailable ? <span className="italic text-muted-foreground">{display}</span> : display,
        displayValue: display,
        disabled: !isAvailable
      };
    });
  }, [isSkillLikeAdvancementType, availableAdvancements]);

  const isRandomAcquisitionType =
    skillAcquisitionType === 'random' || skillAcquisitionType.endsWith('_random');

  const applyAcquisitionTypeSelection = useCallback(
    (typeId: string) => {
      setSkillAcquisitionType(typeId);
      setSelectedAdvancement(null);
      setSkillRollResult(null);
      const sample = availableAdvancements.find(
        (a) => a.available_acquisition_types && a.available_acquisition_types.length > 0
      );
      const matched = sample?.available_acquisition_types?.find((t) => t.type_id === typeId);
      if (matched) {
        setEditableXpCost(matched.xp_cost);
        setEditableCreditsIncrease(matched.credit_cost);
      } else {
        setEditableXpCost(0);
        setEditableCreditsIncrease(0);
      }
    },
    [availableAdvancements]
  );

  // Fetch stat change categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!advancementType) return;

      setLoading(true);
      try {
        if (advancementType === 'skill' || advancementType === 'promotion_to_champion') {
          // Use the API route so both standard and custom skill types (including
          // campaign-shared customs) are returned.
          const response = await fetch(`/api/skill-types?fighterId=${encodeURIComponent(fighterId)}`);
          if (!response.ok) throw new Error('Failed to fetch skill sets');
          const data = await response.json();
          const categoriesWithType = (data as Array<{ id: string; name: string; is_custom?: boolean }>).map(
            (cat) => ({
              ...cat,
              type: 'skill' as const
            })
          );
          setCategories(categoriesWithType);
        } else {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_effect_types?fighter_effect_category_id=eq.789b2065-c26d-453b-a4d5-81c04c5d4419`,
            {
              headers: {
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
                'Authorization': `Bearer ${session?.access_token || ''}`,
                'Content-Type': 'application/json',
              }
            }
          );
          if (!response.ok) throw new Error('Failed to fetch characteristics');
          const data = await response.json();
          const categoriesWithType = data.map((cat: any) => ({
            ...cat,
            type: 'characteristic' as const
          }));
          setCategories(categoriesWithType);
        }
      } catch (err) {
        setError(`Failed to load ${advancementType} categories`);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [advancementType, fighterId]);

  // Fetch available advancements when category is selected
  useEffect(() => {
    const fetchAvailableAdvancements = async () => {
      if (!advancementType || !selectedCategory) return;

      try {

        if (advancementType === 'characteristic') {
          // Only fetch characteristics if a category is selected
          if (!selectedCategory) return;

          
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_available_advancements`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
                'Authorization': `Bearer ${session?.access_token || ''}`
              },
              body: JSON.stringify({
                fighter_id: fighterId
              })
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Response status:', response.status);
            console.error('Response text:', errorText);
            throw new Error('Failed to fetch available characteristics');
          }

          const data = await response.json();

          // Find the category name from the selected category
          const selectedCategoryObj = categories.find(cat => cat.id === selectedCategory);
          if (!selectedCategoryObj || !isStatChangeCategory(selectedCategoryObj)) {
            console.error('Selected category not found or wrong type:', selectedCategory);
            return;
          }


          // Get the advancement details for the selected characteristic
          const advancementDetails = data.characteristics[selectedCategoryObj.effect_name];
          if (!advancementDetails) {
            console.error('No advancement details found for category:', selectedCategoryObj.effect_name);
            return;
          }

          // Format the characteristic advancement
          const formattedAdvancement: AvailableAdvancement = {
            id: advancementDetails.id,
            level: advancementDetails.times_increased || 0,
            xp_cost: advancementDetails.xp_cost,
            base_xp_cost: advancementDetails.base_xp_cost,
            stat_change: 1,
            can_purchase: advancementDetails.can_purchase,
            is_available: advancementDetails.is_available,
            has_enough_xp: advancementDetails.has_enough_xp,
            credits_increase: advancementDetails.credits_increase,
            stat_change_name: selectedCategoryObj.effect_name,
            characteristic_code: advancementDetails.characteristic_code,
            available_acquisition_types: []
          };

          setAvailableAdvancements([formattedAdvancement]);
          setSelectedAdvancement(formattedAdvancement);
          setEditableXpCost(formattedAdvancement.xp_cost);
          setEditableCreditsIncrease(formattedAdvancement.credits_increase || 0);

        } else {
          // Handle skills - only fetch if we have selected a skill set
          setSkillsLoading(true);
          try {
            const supabase = createClient();
            const { data: skillsData, error: skillsError } = await supabase.rpc('get_available_skills', {
              fighter_id: fighterId
            });

            if (skillsError) {
              throw new Error('Failed to fetch available skills');
            }

            const data = skillsData as unknown as SkillResponse;

            // Find the selected skill set name
            const selectedSkillType = categories.find(cat => cat.id === selectedCategory);
            if (!selectedSkillType) {
              console.error('Selected skill set not found:', selectedCategory);
              return;
            }

            // Filter skills by the selected type
            const skillsForType = data.skills.filter(
              (skill) => skill.skill_type_id === selectedSkillType.id
            );

            // Format the skills into advancements
            const formattedAdvancements: AvailableAdvancement[] = skillsForType.map((skill) => ({
              id: skill.skill_id,
              skill_id: skill.skill_id,
              xp_cost: 0,
              stat_change: 1,
              can_purchase: skill.available,
              stat_change_name: skill.skill_name,
              credits_increase: 0,
              has_enough_xp: true,
              available_acquisition_types: skill.available_acquisition_types,
              skill_type_id: skill.skill_type_id,
              is_available: skill.available,
              is_custom: skill.is_custom
            }));

            setAvailableAdvancements(formattedAdvancements);
          } finally {
            setSkillsLoading(false);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Full error details:', err);
        setError(`Failed to load ${advancementType} details: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setSkillsLoading(false);
      }
    };

    fetchAvailableAdvancements();
  }, [advancementType, selectedCategory, fighterId, currentXp, categories]);

  // Update useEffect to set initial values when an advancement/acquisition type is selected
  useEffect(() => {
    if (selectedAdvancement && advancementType !== 'promotion_to_champion') {
      setEditableXpCost(selectedAdvancement.xp_cost);
      setEditableCreditsIncrease(selectedAdvancement.credits_increase || 0);
    }
  }, [selectedAdvancement, advancementType]);

  useEffect(() => {
    if (advancementType === 'promotion_to_champion') {
      setEditableXpCost(CHAMPION_PROMOTION_XP_COST);
      setEditableCreditsIncrease(CHAMPION_PROMOTION_CREDITS_INCREASE);
    }
  }, [advancementType]);

  // Add these console.logs to help debug
  // Debug effect removed

  // Add this useEffect to track state changes
  // Debug effect removed

  // First, let's add some debug logging to see what's happening with the skill selection
  // Debug effect removed

  // Add this to track the characteristic data
  useEffect(() => {
    if (selectedCategory && advancementType === 'characteristic') {
      // no-op
    }
  }, [selectedCategory, selectedAdvancement, advancementType]);

  // Fetch skill access for the standard skill advancement flow
  useEffect(() => {
    if (advancementType !== 'skill') return;
    let cancelled = false;
    const fetchSkillAccess = async () => {
      setSkillAccessLoading(true);
      try {
        const response = await fetch(`/api/fighters/skill-access?fighterId=${fighterId}`);
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setSkillAccess(data.skill_access || []);
        } else {
          if (!cancelled) setSkillAccess([]);
        }
      } catch {
        if (!cancelled) setSkillAccess([]);
      } finally {
        if (!cancelled) setSkillAccessLoading(false);
      }
    };
    void fetchSkillAccess();
    return () => { cancelled = true; };
  }, [advancementType, fighterId]);

  // Fetch preview skill access for the target Champion type after promotion is confirmed
  useEffect(() => {
    if (advancementType !== 'promotion_to_champion' || !championPendingPromotion?.fighter_type_id) {
      setChampionPreviewSkillAccess([]);
      setChampionPreviewSkillAccessLoading(false);
      return;
    }
    let cancelled = false;
    setChampionPreviewSkillAccessLoading(true);
    const run = async () => {
      try {
        const res = await fetch(
          `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}&previewFighterTypeId=${encodeURIComponent(championPendingPromotion.fighter_type_id)}`
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setChampionPreviewSkillAccess([]);
          return;
        }
        const data = await res.json();
        const access = (data.skill_access || []) as SkillAccess[];
        if (!cancelled) setChampionPreviewSkillAccess(access);
      } catch {
        if (!cancelled) setChampionPreviewSkillAccess([]);
      } finally {
        if (!cancelled) setChampionPreviewSkillAccessLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      setChampionPreviewSkillAccessLoading(false);
    };
  }, [advancementType, fighterId, championPendingPromotion?.fighter_type_id]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isGangerOrExoticBeastRestricted =
    fighterClass === 'Ganger' || fighterClass === 'Exotic Beast';

  const handleAdvancementPurchase = async () => {
    if (gangerModalRollBuy) {
      setGangerPurchaseBusy(true);
      try {
        const ok = await purchaseGangerAdvancement(editableXpCost, editableCreditsIncrease);
        if (ok) onClose();
      } finally {
        setGangerPurchaseBusy(false);
      }
      return;
    }

    if (advancementType === 'promotion_to_champion') {
      setChampionPurchaseBusy(true);
      try {
        const ok = await executeChampionPromotionPurchase(editableXpCost, editableCreditsIncrease);
        if (ok) onClose();
      } finally {
        setChampionPurchaseBusy(false);
      }
      return;
    }

    if (!selectedAdvancement) return;

    // Close modal immediately for instant UX
    onClose();

    const mutationParams = {
      fighter_id: fighterId,
      xp_cost: editableXpCost,
      credits_increase: editableCreditsIncrease
    };

    if (advancementType === 'characteristic') {
      addCharacteristicMutation.mutate({
        ...mutationParams,
        fighter_effect_type_id: selectedAdvancement.id
      });
    } else if (advancementType === 'skill') {
      addSkillMutation.mutate({
        ...mutationParams,
        skill_id: selectedAdvancement.id,
        is_advance: true
      });
    }
  };

  const formatCharacteristicAdvancement = (advancementDetails: any): AvailableAdvancement => {
    return {
      id: advancementDetails.id,
      level: advancementDetails.times_increased || 0,
      xp_cost: advancementDetails.xp_cost,
      stat_change: 1,
      can_purchase: advancementDetails.can_purchase,
      credits_increase: advancementDetails.credits_increase || 0,
      stat_change_name: advancementDetails.characteristic_name,
      description: advancementDetails.description
    };
  };

  const formatSkillAdvancement = (advancementDetails: any): AvailableAdvancement => {
    return {
      id: advancementDetails.skill_id,
      skill_id: advancementDetails.skill_id,
      xp_cost: advancementDetails.xp_cost || 0,
      stat_change: 1,
      can_purchase: true,
      credits_increase: advancementDetails.credits_increase || 0,
      stat_change_name: advancementDetails.skill_name,
      description: advancementDetails.description
    };
  };

  // Update the useEffect that handles XP cost changes
  const handleXpCostChange = (value: number) => {
    if (gangerModalRollBuy) setGangerCostsUserOverride(true);
    setEditableXpCost(value);
    // Update the advancement with new values
    if (selectedAdvancement) {
      setSelectedAdvancement({
        ...selectedAdvancement,
        xp_cost: value,
        has_enough_xp: currentXp >= value,
        can_purchase: true // Allow purchase if user manually sets XP cost
      });
    }
  };

  const purchaseBlockingBusy =
    addCharacteristicMutation.isPending ||
    addSkillMutation.isPending ||
    gangerPurchaseBusy ||
    championPurchaseBusy ||
    applyGangerSpecialistMutation.isPending ||
    applyChampionPromotionMutation.isPending ||
    logGangerSubRollMutation.isPending ||
    logGangerRollMutation.isPending;

  const buyAdvancementDisabled = gangerModalRollBuy
    ? !gangerBuyUi.canBuy || purchaseBlockingBusy || gangerBuyUi.pending
    : advancementType === 'promotion_to_champion'
      ? !championPendingPromotion ||
        championPreviewSkillAccessLoading ||
        !selectedCategory ||
        selectedSkillSetAccess !== 'primary' ||
        !selectedAdvancement ||
        selectedAdvancement.is_available === false ||
        currentXp < editableXpCost ||
        editableXpCost < 0 ||
        purchaseBlockingBusy
      : !selectedAdvancement ||
        (advancementType === 'skill' && !skillAcquisitionType) ||
        !selectedAdvancement.has_enough_xp ||
        editableXpCost < 0 ||
        purchaseBlockingBusy;

  // Render the AdvancementModal component
  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <h3 className="text-xl md:text-2xl font-bold text-foreground">Advancements</h3>
          <div className="flex items-center">
            <span className="mr-2 text-sm text-muted-foreground">XP</span>
            <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">{currentXp}</span>
            <button
              onClick={onClose}
              className="ml-3 text-muted-foreground hover:text-muted-foreground text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-2 overflow-y-auto grow">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">
              XP cost and rating increase are automatically calculated based on the type and number of advancements.
            </p>
          </div>

          {userPermissions &&
            onEnsureFighterTypes &&
            onFighterDetailsUpdate &&
            (fighterClass === 'Ganger' || fighterClass === 'Exotic Beast') && (
              <div className="mb-4 space-y-4">
                <div>
                  <h4 className="font-semibold">Ganger / Exotic Beast</h4>
                  <p className="text-sm text-muted-foreground">
                    The roll is recorded in your gang log. You can select or adjust the outcome below, whether using
                    this roll or applying your own.
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
                        if (row) logGangerResolvedRollWithCooldown(row, total, dice);
                      }
                    }}
                    onRoll={(total, dice) => {
                      const row = resolveGangerExoticBeastAdvancementFromUtil(total);
                      if (row) logGangerResolvedRollWithCooldown(row, total, dice);
                    }}
                    buttonText="Roll 2D6"
                    disabled={
                      !userPermissions.canEdit ||
                      logGangerRollMutation.isPending ||
                      logGangerSubRollMutation.isPending ||
                      gangerRollCooldown
                    }
                  />
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <label className="text-sm font-medium">Advancements</label>
                  <Combobox
                    value={gangerSelectedRowId}
                    onValueChange={(v) => {
                      setGangerCostsUserOverride(false);
                      setGangerSelectedRowId(v);
                      const row = v ? GANGER_ADVANCEMENT_COMBO_OPTIONS.find((x) => x.id === v) : undefined;
                      if (row?.kind === 'pair' && row.pairOptions) {
                        setGangerPairStatName(row.pairOptions[0]);
                      }
                    }}
                    placeholder="Select an Advancement"
                    options={gangerAdvancementComboboxOptions}
                    dropdownPlacement="down"
                  />
                </div>

                {gangerSelectedRow?.kind === 'pair' && gangerSelectedRow.pairOptions && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Choose a characteristic</p>
                    <div className="flex flex-col gap-2">
                      {gangerSelectedRow.pairOptions.map((name) => (
                        <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="pair-stat"
                            checked={gangerPairStatName === name}
                            onChange={() => {
                              setGangerCostsUserOverride(false);
                              setGangerPairStatName(name);
                            }}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                    {gangerPairDetail && (
                      <p className="text-xs text-muted-foreground">
                        Times increased on this characteristic: {gangerPairDetail.times_increased ?? 0}
                      </p>
                    )}
                  </div>
                )}

                {gangerSelectedRow?.kind === 'specialist' && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm text-amber-500">
                    Promote the fighter to Specialist, then choose or roll for a skill from one of their Primary Skill sets.
                    </p>

                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="default"
                        className="w-full sm:w-auto"
                        onClick={async () => {
                          await onEnsureFighterTypes();
                          setGangerPromotionOpen(true);
                        }}
                        disabled={!userPermissions.canEdit}
                      >
                        Promote to Specialist
                      </Button>
                    </div>

                    {gangerPendingPromotion && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Promotion to{' '}
                        <strong>
                          {gangerPendingPromotion.fighter_type} ({gangerPendingPromotion.fighter_class})
                        </strong>{' '}
                        confirmed. Once the advancement is applied, this promotion cannot be undone.
                      </p>
                    )}

                    {gangerPendingPromotion && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Primary Skill Set</label>
                        <Combobox
                          value={gangerSelectedSkillSetId}
                          onValueChange={(v) => {
                            setGangerSelectedSkillSetId(v);
                            setGangerSkillPickRoll(null);
                            setGangerSelectedSkillIndex(null);
                          }}
                          placeholder="Select a Skill Set"
                          options={gangerSpecialistSkillSetComboboxOptions}
                          disabled={
                            !userPermissions.canEdit ||
                            gangerPreviewSkillAccessLoading ||
                            gangerSpecialistCategoriesLoading
                          }
                          dropdownPlacement="down"
                        />
                        {gangerSpecialistRequiresPrimarySet && (
                          <p className="text-sm text-amber-500">
                            This advancement requires a Primary skill set.
                          </p>
                        )}
                      </div>
                    )}
                    {gangerPendingPromotion && gangerSelectedSkillSetId && gangerSkillsInSetLoading && (
                      <p className="text-sm text-muted-foreground animate-pulse">Loading skills…</p>
                    )}
                    {gangerPendingPromotion &&
                      gangerSelectedSkillSetId &&
                      !gangerSkillsInSetLoading &&
                      gangerSkillsInSet.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Skill</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="default"
                          onClick={rollGangerSkillInSet}
                          disabled={
                            !userPermissions.canEdit ||
                            logGangerSubRollMutation.isPending
                          }
                        >
                          Roll for Skill
                        </Button>
                        {gangerSkillPickRoll !== null && gangerSkillsInSet[gangerSelectedSkillIndex ?? -1] && (
                          <span className="text-sm text-muted-foreground">
                            {formatRollOutcomeLine(gangerSkillPickRoll, [gangerSkillPickRoll])}:{' '}
                            <strong className="text-foreground">
                              {gangerSkillsInSet[gangerSelectedSkillIndex!].skill_name}
                            </strong>
                          </span>
                        )}
                      </div>
                      <Combobox
                        value={gangerSelectedSkillId}
                        onValueChange={(v) => {
                          const idx = gangerSkillsInSet.findIndex((s) => s.skill_id === v);
                          if (idx === -1) return;
                          setGangerSelectedSkillIndex(idx);
                          setGangerSkillPickRoll(null);
                        }}
                        placeholder="Select a Skill"
                        options={gangerSkillInSetComboboxOptions}
                        disabled={!userPermissions.canEdit}
                      />
                    </div>
                    )}
                  </div>
                )}

                <FighterPromotionModal
                  currentClass={fighterClass}
                  currentSpecialRules={fighterSpecialRules}
                  currentFighterType={fighterTypeName}
                  currentFighterTypeId={fighterTypeId}
                  currentFighterSubTypeId={fighterSubTypeId || undefined}
                  fighterTypes={preFetchedFighterTypes}
                  isOpen={gangerPromotionOpen}
                  onClose={() => setGangerPromotionOpen(false)}
                  onPromoted={(data) => {
                    setGangerPendingPromotion(data);
                    setGangerPromotionOpen(false);
                  }}
                />
              </div>
            )}

          <div className="space-y-4">
          {!isGangerOrExoticBeastRestricted && (
            <>
            <div className="relative">
              <Combobox
                value={advancementType}
                onValueChange={(v) => {
                  setAdvancementType(v as AdvancementTypeValue);
                  setSelectedCategory('');
                  setSelectedAdvancement(null);
                  setAvailableAdvancements([]);
                  setSkillAcquisitionType('');
                  setSkillRollResult(null);
                  setChampionPendingPromotion(null);
                }}
                placeholder="Select Advancement Type"
                options={advancementTypeComboboxOptions}
                dropdownPlacement="down"
              />
            </div>

            {advancementType === 'promotion_to_champion' && !loading && (
              <div className="space-y-3">
                <p className="text-sm text-amber-500">
                Promote the fighter to Champion, then choose or roll for a skill from one of their Primary skill sets.
                </p>

                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="default"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      await onEnsureFighterTypes?.();
                      setChampionPromotionOpen(true);
                    }}
                    disabled={!userPermissions?.canEdit || !onEnsureFighterTypes}
                  >
                    Promote to Champion
                  </Button>
                </div>

                {championPendingPromotion && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Promotion to{' '}
                    <strong>
                      {championPendingPromotion.fighter_type} ({championPendingPromotion.fighter_class})
                    </strong>{' '}
                    confirmed. Once the advancement is applied, this promotion cannot be undone.
                  </p>
                )}

                {championPendingPromotion && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Primary Skill Set</label>
                    <Combobox
                      value={selectedCategory}
                      onValueChange={(v) => {
                        setSelectedCategory(v);
                        setSelectedAdvancement(null);
                        setSkillRollResult(null);
                      }}
                      placeholder="Select a Skill Set"
                      options={skillSetComboboxOptions}
                      disabled={championPreviewSkillAccessLoading}
                      dropdownPlacement="down"
                    />
                    {championPromotionRequiresPrimarySet && (
                      <p className="text-sm text-amber-500">
                        This advancement requires a Primary skill set.
                      </p>
                    )}
                  </div>
                )}

                {championPendingPromotion && selectedCategory && skillsLoading && (
                  <p className="text-sm text-muted-foreground animate-pulse">Loading skills…</p>
                )}

                {championPendingPromotion &&
                  selectedCategory &&
                  !skillsLoading &&
                  availableAdvancements.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Skill</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="default"
                          onClick={rollSkillFromSet}
                          disabled={
                            !userPermissions?.canEdit ||
                            logSkillAdvancementRollMutation.isPending ||
                            availableAdvancements.filter((a) => a.is_available !== false).length === 0
                          }
                        >
                          Roll for Skill
                        </Button>
                        {skillRollResult !== null && (
                          <span className="text-sm text-muted-foreground">
                            {formatRollOutcomeLine(skillRollResult.roll, [skillRollResult.roll])}:{' '}
                            <strong className="text-foreground">{skillRollResult.skillName}</strong>
                          </span>
                        )}
                      </div>
                      <Combobox
                        value={selectedAdvancement?.id ?? ''}
                        onValueChange={(v) => {
                          const selected = availableAdvancements.find((adv) => adv.id === v);
                          if (selected) {
                            setSelectedAdvancement({
                              ...selected,
                              xp_cost: editableXpCost,
                              credits_increase: editableCreditsIncrease,
                              has_enough_xp: currentXp >= editableXpCost
                            });
                            setSkillRollResult(null);
                          }
                        }}
                        placeholder="Select a Skill"
                        options={skillComboboxOptions}
                      />
                    </div>
                  )}

                {onEnsureFighterTypes && onFighterDetailsUpdate && (
                  <FighterPromotionModal
                    currentClass={fighterClass}
                    currentSpecialRules={fighterSpecialRules}
                    currentFighterType={fighterTypeName}
                    currentFighterTypeId={fighterTypeId}
                    currentFighterSubTypeId={fighterSubTypeId || undefined}
                    fighterTypes={preFetchedFighterTypes}
                    isOpen={championPromotionOpen}
                    onClose={() => setChampionPromotionOpen(false)}
                    onPromoted={(data) => {
                      setChampionPendingPromotion(data);
                      setChampionPromotionOpen(false);
                      setSelectedCategory('');
                      setSelectedAdvancement(null);
                      setSkillRollResult(null);
                      setAvailableAdvancements([]);
                    }}
                  />
                )}
              </div>
            )}

            {advancementType === 'characteristic' && !loading && (
              <div className="relative">
                <Combobox
                  value={selectedCategory}
                  onValueChange={(v) => {
                    setSelectedCategory(v);
                    setSelectedAdvancement(null);
                    setSkillAcquisitionType('');
                    setEditableXpCost(0);
                    setEditableCreditsIncrease(0);
                  }}
                  placeholder="Select a Characteristic"
                  options={characteristicComboboxOptions}
                  dropdownPlacement="down"
                />
              </div>
            )}

            {advancementType === 'skill' && !loading && (
              <>
                <div className="space-y-2">
                  <Combobox
                    value={selectedCategory}
                    onValueChange={(v) => {
                      setSelectedCategory(v);
                      setSelectedAdvancement(null);
                      setSkillAcquisitionType('');
                      setSkillRollResult(null);
                      setEditableXpCost(0);
                      setEditableCreditsIncrease(0);
                    }}
                    placeholder="Select a Skill Set"
                    options={skillSetComboboxOptions}
                    dropdownPlacement="down"
                  />
                  {selectedCategory && selectedSkillSetLacksAccess && (
                    <p className="text-sm text-amber-500">
                      This Skill Set is not accessible to this fighter. Change their Skill Set
                      access in: Edit Fighter &gt; Customise Skill Set Access.
                    </p>
                  )}
                </div>

                {selectedCategory && skillsLoading && (
                  <p className="text-sm text-muted-foreground animate-pulse">Loading skills…</p>
                )}

                {selectedCategory && !skillsLoading && acquisitionTypeComboboxOptions.length > 0 && (
                  <Combobox
                    value={skillAcquisitionType}
                    onValueChange={applyAcquisitionTypeSelection}
                    placeholder="Select Acquisition Type"
                    options={acquisitionTypeComboboxOptions}
                    dropdownPlacement="down"
                  />
                )}

                {selectedCategory && !skillsLoading && skillAcquisitionType && availableAdvancements.length > 0 && (
                  <div className="space-y-2">
                    {isRandomAcquisitionType && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="default"
                          onClick={rollSkillFromSet}
                          disabled={
                            !userPermissions?.canEdit ||
                            logSkillAdvancementRollMutation.isPending ||
                            availableAdvancements.filter((a) => a.is_available !== false).length === 0
                          }
                        >
                          Roll for Skill
                        </Button>
                        {skillRollResult !== null && (
                          <span className="text-sm text-muted-foreground">
                            {formatRollOutcomeLine(skillRollResult.roll, [skillRollResult.roll])}:{' '}
                            <strong className="text-foreground">{skillRollResult.skillName}</strong>
                          </span>
                        )}
                      </div>
                    )}
                    <Combobox
                      value={selectedAdvancement?.id ?? ''}
                      onValueChange={(v) => {
                        const selected = availableAdvancements.find((adv) => adv.id === v);
                        if (selected) {
                          setSelectedAdvancement({
                            ...selected,
                            xp_cost: editableXpCost,
                            credits_increase: editableCreditsIncrease,
                            has_enough_xp: currentXp >= editableXpCost
                          });
                          setSkillRollResult(null);
                        }
                      }}
                      placeholder="Select a Skill"
                      options={skillComboboxOptions}
                    />
                  </div>
                )}
              </>
            )}
            </>
          )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  XP Cost
                </label>
                <input
                  type="number"
                  value={editableXpCost}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    handleXpCostChange(value);
                  }}
                  className="w-full p-2 border rounded-md"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Cost Increase in Credits
                </label>
                <input
                  type="number"
                  value={editableCreditsIncrease}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    if (gangerModalRollBuy) setGangerCostsUserOverride(true);
                    setEditableCreditsIncrease(value);
                    // Update the advancement with new value
                    if (selectedAdvancement) {
                      setSelectedAdvancement({
                        ...selectedAdvancement,
                        credits_increase: value
                      });
                    }
                  }}
                  className="w-full p-2 border rounded-md"
                  min="0"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            <div className="border-t pt-2 flex justify-end gap-2">
            <button
                onClick={onClose}
                disabled={purchaseBlockingBusy || gangerBuyUi.pending}
                className={`px-4 py-2 border rounded-sm hover:bg-muted ${
                  purchaseBlockingBusy || gangerBuyUi.pending ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Cancel
              </button>
              <Button
                onClick={() => void handleAdvancementPurchase()}
                className={`px-4 py-2 bg-black text-white rounded-sm hover:bg-gray-800 ${
                purchaseBlockingBusy || gangerBuyUi.pending ? 'opacity-50 cursor-not-allowed' : ''
              }`}
                disabled={buyAdvancementDisabled}
              >
                Buy Advancement
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// AdvancementsList Component
export function AdvancementsList({
  fighterXp,
  fighterChanges = { advancement: [], characteristics: [], skills: [] },
  fighterId,
  fighterClass,
  advancements = [],
  skills = {},
  userPermissions,
  onAdvancementUpdate,
  onSkillUpdate,
  onXpCreditsUpdate,
  onCharacteristicUpdate,
  preFetchedFighterTypes = [],
  onEnsureFighterTypes,
  fighterSpecialRules = [],
  fighterTypeName = '',
  fighterTypeId = '',
  fighterSubTypeId = '',
  onFighterDetailsUpdate
}: AdvancementsListProps) {
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isStandalonePromotionOpen, setIsStandalonePromotionOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string; type: string } | null>(null);

  const showPromoteButton = ['Ganger', 'Juve', 'Prospect', 'Champion', 'Specialist', 'Exotic Beast', 'Exotic Beast Specialist'].includes(fighterClass);

  const currentPromotionSubType = useMemo(() => {
    const match = preFetchedFighterTypes.find((ft) => ft.id === fighterTypeId);
    return {
      fighter_sub_type: match?.sub_type?.sub_type_name ?? null,
      fighter_sub_type_id: fighterSubTypeId || (match?.sub_type?.id ?? null),
    };
  }, [preFetchedFighterTypes, fighterTypeId, fighterSubTypeId]);

  const standalonePromotionMutation = useMutation({
    mutationFn: async (promotion: FighterPromotionResult) => {
      const result = await updateFighterDetails({
        fighter_id: fighterId,
        fighter_class: promotion.fighter_class,
        fighter_class_id: promotion.fighter_class_id,
        fighter_type: promotion.fighter_type,
        fighter_type_id: promotion.fighter_type_id,
        fighter_sub_type: promotion.fighter_sub_type ?? null,
        fighter_sub_type_id: promotion.fighter_sub_type_id ?? null,
        special_rules: promotion.special_rules,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to promote fighter');
      }
      return result;
    },
    onMutate: async (promotion) => {
      const previousPatch = {
        fighter_class: fighterClass,
        fighter_type: fighterTypeName,
        fighter_type_id: fighterTypeId,
        special_rules: fighterSpecialRules,
        ...currentPromotionSubType,
      };
      onFighterDetailsUpdate?.(promotion);
      return { previousPatch };
    },
    onSuccess: () => {
      setIsStandalonePromotionOpen(false);
      toast.success('Fighter promoted successfully');
    },
    onError: (error, _promotion, context) => {
      if (context?.previousPatch) {
        onFighterDetailsUpdate?.(context.previousPatch);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to promote fighter');
    },
  });

  // TanStack Query delete mutation
  const deleteAdvancementMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; advancement_id: string; advancement_type: 'characteristic' | 'skill' }) => {
      const result = await deleteAdvancement(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete advancement');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the advancement being deleted from the combined list
      const advancementToDelete = allAdvancements.find(adv => adv.id === variables.advancement_id);
      if (!advancementToDelete) return {};

      // Store previous states for rollback
      const previousAdvancements = [...advancements];
      const previousSkills = { ...skills };
      
      // Determine if this is a skill or characteristic advancement
      const isSkill = variables.advancement_type === 'skill' || advancementToDelete.effect_name.startsWith('Skill: ');
      
      if (isSkill) {
        // For skill advancements, remove from skills object
        const skillName = advancementToDelete.effect_name.replace('Skill: ', '');
        const updatedSkills = { ...skills };
        delete updatedSkills[skillName];
        
        if (onSkillUpdate) {
          onSkillUpdate(updatedSkills);
        }
      } else {
        // For characteristic advancements, remove from advancements array
        const updatedAdvancements = advancements.filter(adv => adv.id !== variables.advancement_id);
        onAdvancementUpdate(updatedAdvancements);
      }

      // Get XP and credits to refund from the advancement data
      const typeSpecificData = typeof advancementToDelete.type_specific_data === 'string'
        ? JSON.parse(advancementToDelete.type_specific_data || '{}')
        : (advancementToDelete.type_specific_data || {});
      
      const xpToRefund = typeSpecificData.xp_cost || 0;
      const creditsToDeduct = typeSpecificData.credits_increase || 0;

      // Don't update characteristic optimistically for deletes - server handles this
      // The server action will decrease the characteristic value correctly
      let characteristicName: string | undefined;
      if (!isSkill) {
        characteristicName = advancementToDelete.effect_name.replace('Characteristic: ', '').toLowerCase().replace(' ', '_');
      }

      // Update XP and credits immediately (refund XP, deduct credits)
      if (onXpCreditsUpdate && (xpToRefund > 0 || creditsToDeduct > 0)) {
        onXpCreditsUpdate(xpToRefund, -creditsToDeduct);
      }

      return { 
        advancementToDelete, 
        previousAdvancements, 
        previousSkills, 
        isSkill, 
        xpToRefund, 
        creditsToDeduct,
        characteristicName
      };
    },
    onSuccess: (result, variables, context) => {
      toast.success(`${context?.advancementToDelete?.effect_name || 'Advancement'} removed successfully`);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.isSkill && context?.previousSkills && onSkillUpdate) {
        onSkillUpdate(context.previousSkills);
      } else if (!context?.isSkill && context?.previousAdvancements) {
        onAdvancementUpdate(context.previousAdvancements);
      }

      // Rollback XP and credits changes
      if (context?.xpToRefund || context?.creditsToDeduct) {
        if (onXpCreditsUpdate) {
          onXpCreditsUpdate(-context.xpToRefund, context.creditsToDeduct);
        }
      }

      // No characteristic rollback needed since server handles characteristic updates

      toast.error('Failed to delete advancement');
    }
  });

  // Memoize the entire data transformation
  const { characteristics, skills: transformedSkills } = useMemo(() => {
    const transformedCharacteristics: TransformedAdvancement[] = [];
    const transformedSkills: TransformedAdvancement[] = [];
    
    // Transform characteristics
    if (fighterChanges.characteristics && Array.isArray(fighterChanges.characteristics)) {
      fighterChanges.characteristics.forEach((data) => {
        transformedCharacteristics.push({
          id: data.id,
          stat_change_name: data.characteristic_name,
          xp_spent: data.xp_cost,
          changes: {
            credits: data.credits_increase,
            [data.code.toLowerCase()]: data.characteristic_value
          },
          acquired_at: data.acquired_at,
          type: 'characteristic'
        });
      });
    }

    // Transform skills
    if (Array.isArray(skills)) {
      skills.forEach((skill) => {
        transformedSkills.push({
          id: skill.id,
          stat_change_name: skill.name,
          xp_spent: skill.xp_cost || 0,
          changes: {
            credits: skill.credits_increase
          },
          acquired_at: skill.acquired_at,
          type: 'skill'
        });
      });
    }

    // Sort each array by acquired_at date
    const sortByDate = (a: TransformedAdvancement, b: TransformedAdvancement) => 
      new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime();

    return {
      characteristics: transformedCharacteristics.sort(sortByDate),
      skills: transformedSkills.sort(sortByDate)
    };
  }, [fighterChanges, skills]); // Only recompute when fighterChanges or skills updates

  // Use Object.entries to safely process the skills object
  const advancementSkills = useMemo(() => {
    return Object.entries(skills)
      .filter(([_, skill]) => skill && (skill as any).is_advance)
      .map(([name, skill]) => {
        const typedSkill = skill as any;
        return {
          id: typedSkill.id,
          effect_name: `Skill: ${name}`,
          created_at: typedSkill.acquired_at,
          type_specific_data: {
            xp_cost: typedSkill.xp_cost || 0,
            credits_increase: typedSkill.credits_increase
          }
        };
      });
  }, [skills]);

  // Combine regular advancements with skill advancements
  const allAdvancements = useMemo(() => {
    return [...advancements, ...advancementSkills];
  }, [advancements, advancementSkills]);

  const handleDeleteAdvancement = (advancementId: string, advancementName: string, advancementType?: string) => {
    // Determine if this is a skill or characteristic based on the advancement type or name
    const isSkill = advancementType === 'skill' || advancementName.startsWith('Skill: ');
    
    // Close modal immediately for instant UX
    setDeleteModalData(null);
    
    // Fire mutation with optimistic updates
    deleteAdvancementMutation.mutate({
      fighter_id: fighterId,
      advancement_id: advancementId,
      advancement_type: isSkill ? 'skill' : 'characteristic'
    });
  };


  const handleAdvancementAdded = (advancement: FighterEffectType) => {
    // This is called by the modal when an advancement is added
    // The optimistic update is already handled in the mutation's onMutate
    // So we don't need to do anything here
  };



  // Transform advancements for the List component
  const transformedAdvancements = useMemo(() => {
    // Filter out optimistic entries if real server data exists for the same advancement
    const filteredAdvancements = allAdvancements.filter((advancement) => {
      // If this is not an optimistic entry, keep it
      if (!advancement.id?.startsWith('optimistic-')) {
        return true;
      }
      
      // If this is an optimistic entry, only keep it if there's no real server entry with the same effect_name
      const hasRealServerEntry = allAdvancements.some(other => 
        !other.id?.startsWith('optimistic-') && 
        other.effect_name === advancement.effect_name
      );
      
      return !hasRealServerEntry;
    });

    return filteredAdvancements
      .sort((a, b) => {
        const dateA = a.created_at || ''; 
        const dateB = b.created_at || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .map((advancement) => {
        const specificData = typeof advancement.type_specific_data === 'string'
          ? JSON.parse(advancement.type_specific_data || '{}')
          : (advancement.type_specific_data || {});
          
        // Determine if this is a skill or characteristic advancement
        const isSkill = advancement.effect_name.startsWith('Skill: ');
          
        return {
          id: advancement.id || `temp-${Math.random()}`,
          name: advancement.effect_name.startsWith('Skill') ? advancement.effect_name : 
                advancement.effect_name.startsWith('Characteristic') ? advancement.effect_name : 
                `Characteristic: ${advancement.effect_name}`,
          xp_cost: specificData.xp_cost || 0,
          credits_increase: specificData.credits_increase || 0,
          advancement_id: advancement.id,
          advancement_type: isSkill ? 'skill' : 'characteristic'
        };
      });
  }, [allAdvancements]);

  const advancementCount = allAdvancements.length;
  const title = (
    <>
      <span className="sm:hidden">Advanc.</span>
      <span className="hidden sm:inline">Advancements</span>{' '}
      <span className="text-sm sm:hidden">({advancementCount})</span>
      <span className="text-sm hidden sm:inline">(Adv. count: {advancementCount})</span>
    </>
  );

  return (
    <>
      <List
        title={title}
        items={transformedAdvancements}
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '50%'
          },
          {
            key: 'xp_cost',
            label: 'XP',
            align: 'right',
            width: '25%'
          },
          {
            key: 'credits_increase',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            icon: <LuUndo2 className="h-4 w-4" />,
            title: "Undo",
            variant: 'outline_remove',
            onClick: (item) => item.advancement_id ? setDeleteModalData({
              id: item.advancement_id,
              name: item.name,
              type: item.advancement_type
            }) : null,
            disabled: (item) => deleteAdvancementMutation.isPending || !item.advancement_id || !userPermissions.canEdit
          }
        ]}
        headerActions={
          showPromoteButton ? (
            <Button
              type="button"
              variant="outline"
              disabled={!userPermissions.canEdit || standalonePromotionMutation.isPending}
              onClick={async () => {
                await onEnsureFighterTypes?.();
                setIsStandalonePromotionOpen(true);
              }}
            >
              Promote
            </Button>
          ) : undefined
        }
        onAdd={() => setIsAdvancementModalOpen(true)}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No advancements yet."
      />

      {/* Modals */}
      <FighterPromotionModal
        currentClass={fighterClass}
        currentSpecialRules={fighterSpecialRules}
        currentFighterType={fighterTypeName}
        currentFighterTypeId={fighterTypeId}
        currentFighterSubTypeId={fighterSubTypeId || undefined}
        fighterTypes={preFetchedFighterTypes}
        isOpen={isStandalonePromotionOpen}
        onClose={() => setIsStandalonePromotionOpen(false)}
        showXpPromotionHint
        onPromoted={(data) => {
          standalonePromotionMutation.mutate(data);
        }}
      />

      {isAdvancementModalOpen && (
        <AdvancementModal
          fighterId={fighterId}
          currentXp={fighterXp}
          fighterClass={fighterClass}
          advancements={advancements}
          skills={skills}
          onClose={() => setIsAdvancementModalOpen(false)}
          onAdvancementAdded={handleAdvancementAdded}
          onSkillUpdate={onSkillUpdate}
          onXpCreditsUpdate={onXpCreditsUpdate}
          onAdvancementUpdate={onAdvancementUpdate}
          onCharacteristicUpdate={onCharacteristicUpdate}
          userPermissions={userPermissions}
          preFetchedFighterTypes={preFetchedFighterTypes}
          onEnsureFighterTypes={onEnsureFighterTypes}
          fighterSpecialRules={fighterSpecialRules}
          fighterTypeName={fighterTypeName}
          fighterTypeId={fighterTypeId}
          fighterSubTypeId={fighterSubTypeId}
          onFighterDetailsUpdate={onFighterDetailsUpdate}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Undo Advancement"
          content={
            <div>
              <p>Are you sure you want to undo <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p>XP spent will be refunded and the fighter's value will be adjusted accordingly.</p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteAdvancement(deleteModalData.id, deleteModalData.name, deleteModalData.type)}
        />
      )}
    </>
  );
} 