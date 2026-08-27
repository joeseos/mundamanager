import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { FighterProps as Fighter, Archetype } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { HiX } from "react-icons/hi";
import { toast } from 'sonner';
import { applySpecialRulesModifiers, subtypeGrantsFromEffects } from '@/utils/effect-modifiers';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { N26_PROSPECT_SPECIALISATIONS } from '@/utils/keepTypePromotionN26';
import { allowsMultipleSubtypes, hasFighterSpecialisations } from '@/types/edition';
import {
  getArchetypeCatalogSubtype,
  isArchetypeEligible,
} from '@/utils/archetypeEligibility';
import { SkillAccessModal } from './skill-access-modal';
import { FighterCharacteristicTable } from './fighter-characteristic-table';
import { CharacterStatsModal } from './character-stats-modal';

const normalizeSpecialRule = (rule: string) => rule.replace(/^"|"$/g, '');

/** Variants of one fighter share a typeSubtypeKey; see /api/fighter-types. */
function sameVariantFamily(
  a: { id: string; typeSubtypeKey?: string },
  b: { id: string; typeSubtypeKey?: string }
): boolean {
  return (a.typeSubtypeKey ?? a.id) === (b.typeSubtypeKey ?? b.id);
}

/**
 * Rows of a family the Variant dropdown may offer. Only fighter_variant splits a fighter
 * type; a family whose rows differ by specialisation alone is one fighter type, and its
 * specialisation is picked separately without moving the fighter between rows.
 */
function variantOptionsFor(
  family: Array<{ id: string; fighter_variant?: string | null; variantLabel?: string; total_cost: number }>
): Array<{ value: string; label: string; cost: number }> {
  if (!family.some(ft => ft.fighter_variant)) return [];
  return family
    .map(ft => ({ value: ft.id, label: ft.variantLabel || 'Default', cost: ft.total_cost }))
    .sort((a, b) => a.label === 'Default' ? -1 : b.label === 'Default' ? 1 : a.label.localeCompare(b.label));
}

/** fighter_subtypes is a set of names, so order carries no meaning here. */
function sameFighterSubtypes(a?: string[] | null, b?: string[] | null): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  const inLeft = new Set(left);
  return right.every(name => inLeft.has(name));
}

interface FighterTypesData {
  displayTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_subtypes: string[];
    special_rules?: string[];
    gang_type_id: string;
    total_cost: number;
    typeSubtypeKey?: string;
    is_gang_variant?: boolean;
    gang_variant_name?: string;
  }>;
  specialisationsByTypeSubtype: Map<string, Array<{
    id: string;
    fighter_specialisation: string;
    cost: number;
    fighter_type_id: string;
    fighter_type_name: string;
    fighter_subtype_name: string;
  }>>;
}

interface EditFighterModalProps {
  fighter: Fighter;
  isOpen: boolean;
  initialValues: {
    name: string;
    label: string;
    kills: number;
    kill_count?: number;
    costAdjustment: string;
  };
  gangId: string;
  gangTypeId?: string | null;
  customGangTypeId?: string | null;
  is_spyrer?: boolean;
  onClose: () => void;
  onSubmit?: (values: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
    fighter_subtypes?: string[];
    fighter_type?: string;
    fighter_type_id?: string | null;
    custom_fighter_type_id?: string | null;
    special_rules?: string[];
    stats?: Record<string, number>;
    fighter_specialisation?: string | null;
    fighter_specialisation_id?: string | null;
    fighter_gang_legacy_id?: string | null;
  }) => Promise<boolean>;
  onStatsUpdate?: (updatedFighter: Fighter) => void;
  // New optional lifecycle callbacks for optimistic editing
  onEditMutate?: (optimistic: Partial<Fighter>) => any;
  onEditError?: (snapshot: any) => void;
  onEditSuccess?: (serverFighter: any, optimistic: Partial<Fighter>, snapshot: any) => void;
}

export function EditFighterModal({
  fighter,
  isOpen,
  initialValues,
  gangId,
  gangTypeId,
  customGangTypeId,
  onClose,
  onSubmit,
  onStatsUpdate,
  onEditMutate,
  onEditError,
  onEditSuccess,
  is_spyrer = false
}: EditFighterModalProps) {
  // Update form state to include fighter type fields
  const [formValues, setFormValues] = useState({
    name: initialValues.name,
    label: initialValues.label,
    kills: initialValues.kills,
    kill_count: initialValues.kill_count || 0,
    costAdjustment: initialValues.costAdjustment,
    fighter_type: (fighter.fighter_type as any)?.fighter_type || fighter.fighter_type || '',
    fighter_type_id: (fighter.fighter_type as any)?.fighter_type_id || '',
    special_rules: Array.isArray(fighter.special_rules) ? fighter.special_rules : [], 
    stats: {} as Record<string, number>
  });
  
  // Retyping stays within the fighter's own catalog: a vehicle can become another
  // vehicle, but never a Ganger, and vice versa. The flag is part of the key too,
  // since the promotion modals share it.
  const isVehicleFighter = Boolean(fighter.is_vehicle);

  const { data: fetchedFighterTypes } = useQuery({
    queryKey: ['fighter-types-edit', gangId, gangTypeId, customGangTypeId, isVehicleFighter],
    queryFn: async () => {
      const params = new URLSearchParams({
        gang_id: gangId,
        is_gang_addition: 'false',
        is_vehicle: String(isVehicleFighter)
      });
      if (gangTypeId) params.set('gang_type_id', gangTypeId);
      if (customGangTypeId) params.set('custom_gang_type_id', customGangTypeId);

      const response = await fetch(`/api/fighter-types?${params}`);
      if (!response.ok) throw new Error('Failed to fetch fighter types');
      return response.json();
    },
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
  });

  type FighterTypeEntry = {
    id: string;
    fighter_type: string;
    fighter_subtypes: string[];
    special_rules?: string[];
    gang_type_id: string;
    custom_gang_type_id?: string | null;
    total_cost: number;
    typeSubtypeKey?: string;
    variantLabel?: string;
    fighter_variant?: string | null;
    is_gang_variant?: boolean;
    gang_variant_name?: string;
    fighter_specialisation?: string | null;
    fighter_specialisation_id?: string | null;
    available_legacies?: Array<{id: string; name: string}>;
    is_custom_fighter?: boolean;
  };

  const fighterTypes: FighterTypeEntry[] = useMemo(() => {
    if (!fetchedFighterTypes?.length) return [];
    return fetchedFighterTypes.map((type: any) => ({
      id: type.id,
      fighter_type: type.fighter_type,
      fighter_subtypes: type.fighter_subtypes || [],
      special_rules: (type.special_rules || []).map(normalizeSpecialRule).filter(Boolean),
      gang_type_id: type.gang_type_id,
      custom_gang_type_id: type.custom_gang_type_id ?? null,
      total_cost: type.total_cost,
      typeSubtypeKey: type.typeSubtypeKey,
      variantLabel: type.variantLabel,
      fighter_variant: type.fighter_variant ?? null,
      is_gang_variant: type.is_gang_variant,
      gang_variant_name: type.gang_variant_name,
      specialisation: type.specialisation || {},
      fighter_specialisation: type.specialisation?.specialisation_name || null,
      fighter_specialisation_id: type.specialisation?.id || null,
      available_legacies: type.available_legacies || [],
      is_custom_fighter: type.is_custom_fighter || false
    }));
  }, [fetchedFighterTypes]);

  
  // Add state for special rule combobox selection
  const [selectedSpecialRuleOption, setSelectedSpecialRuleOption] = useState('');
  const [customSpecialRule, setCustomSpecialRule] = useState('');

  // Local state for tracking current fighter state (including all modifications)
  const [currentFighter, setCurrentFighter] = useState<Fighter>(fighter);
  
  // State for showing the stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // State for tracking if stats are being saved
  const [isSavingStats, setIsSavingStats] = useState(false);

  // Add state for temporary selected fighter type - pre-select current type
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState<string>((fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '');
  
  // Add state for selected specialisation
  const [selectedVariantTypeId, setSelectedVariantTypeId] = useState<string>((fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '');
  
  // Add state for available specialisations
  const [availableVariants, setAvailableVariants] = useState<Array<{ value: string; label: string; cost: number }>>([]);
  
  // Specialisation is the fighter's own, not the type row's: picking one writes only
  // fighters.fighter_specialisation{,_id}.
  const [selectedFighterSpecialisationId, setSelectedFighterSpecialisationId] = useState<string>(
    fighter.fighter_specialisation?.fighter_specialisation_id || ''
  );

  // Add state for gang legacy
  const [selectedGangLegacyId, setSelectedGangLegacyId] = useState<string>((fighter as any).fighter_gang_legacy_id || '');
  const [availableLegacies, setAvailableLegacies] = useState<Array<{ id: string; name: string }>>([]);
  
  // Track if fighter type has been explicitly selected in this session
  const [hasExplicitlySelectedType, setHasExplicitlySelectedType] = useState(false);

  // Pending stat adjustments (draft only, persisted on main confirm)
  const [pendingStatAdjustments, setPendingStatAdjustments] = useState<Record<string, number>>({});

  // State for skill access modal
  const [showSkillAccessModal, setShowSkillAccessModal] = useState(false);

  // State for fighter subtype selection (names; multi on N26, single on N23)
  const [selectedFighterSubtypes, setSelectedFighterSubtypes] = useState<string[]>(() => {
    const initial = fighter.fighter_subtypes ?? [];
    return allowsMultipleSubtypes(fighter.edition_slug) ? initial : initial.slice(0, 1);
  });
  const [pendingSubtypeToAdd, setPendingSubtypeToAdd] = useState('');

  // State for archetype selection - initialize from fighter's saved archetype
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(fighter.selected_archetype_id || '');

  const allowMultipleSubtypes = allowsMultipleSubtypes(fighter.edition_slug);

  // Fetch fighter subtypes for the subtype dropdown, scoped to the fighter's
  // edition: subtype_name is only unique within an edition, so an unscoped fetch
  // could resolve the wrong fighter_subtype_id (used for the archetype lookup)
  // once a subtype exists in more than one edition.
  const { data: allFighterSubtypes } = useQuery<Array<{ id: string; subtype_name: string }>>({
    queryKey: ['fighter-subtypes', fighter.edition_slug ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fighter.edition_slug) params.set('edition_slug', fighter.edition_slug);
      const response = await fetch(`/api/fighter-subtypes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch fighter subtypes');
      return response.json();
    },
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
  });

  const fighterSubtypesForDisplay = useMemo(() => {
    const catalog = (allFighterSubtypes ?? [])
      .filter(fc => !['*', 'Others', 'Special Terrain'].includes(fc.subtype_name))
      .filter(fc =>
        fc.subtype_name !== 'Exotic Beast Specialist' ||
        fighter.fighter_subtypes?.includes('Exotic Beast') ||
        selectedFighterSubtypes.includes('Exotic Beast')
      );

    // Some fighters carry alliance-crew subtypes that were never rows in
    // fighter_subtypes. Without an option the Combobox falls back to its
    // placeholder and the fighter looks like it has no subtype at all.
    const known = new Set(catalog.map(fc => fc.subtype_name));
    const uncatalogued = selectedFighterSubtypes
      .filter(name => !known.has(name))
      .map(name => ({ id: name, subtype_name: name }));

    return [...catalog, ...uncatalogued];
  }, [allFighterSubtypes, fighter.fighter_subtypes, selectedFighterSubtypes]);

  // Effect-granted subtypes sit in fighter_subtypes like any other, so mark them
  // read-only — removing one would only last until the equipment resynced it.
  const effectGrantedSubtypes = useMemo(() => {
    const allEffects = fighter.effects ? Object.values(fighter.effects).flat() : [];
    const { add } = subtypeGrantsFromEffects(allEffects);
    if (add.length === 0) return new Set<string>();
    const nameFor = new Map((allFighterSubtypes ?? []).map(fc => [fc.id, fc.subtype_name]));
    return new Set(add.map(id => nameFor.get(id)).filter((name): name is string => !!name));
  }, [fighter.effects, allFighterSubtypes]);

  // Subtypes not yet selected — for the N26 add Combobox
  const availableSubtypeComboboxOptions = useMemo(() => {
    const selected = new Set(selectedFighterSubtypes);
    return fighterSubtypesForDisplay
      .filter(fc => !selected.has(fc.subtype_name))
      .map(fc => ({ value: fc.subtype_name, label: fc.subtype_name }));
  }, [fighterSubtypesForDisplay, selectedFighterSubtypes]);

  // Compute the default fighter subtype name from the currently selected fighter type
  const defaultFighterSubtypeName = useMemo(() => {
    if (selectedFighterTypeId && fighterTypes.length > 0) {
      const selectedType = fighterTypes.find(ft => ft.id === selectedFighterTypeId);
      if (selectedType) return selectedType.fighter_subtypes[0] || 'Unknown';
    }
    return fighter.fighter_subtypes?.[0] || 'Unknown';
  }, [selectedFighterTypeId, fighterTypes, fighter.fighter_subtypes]);

  // Archetypes: eligible if any selected subtype matches the gang's Outcasts list; catalog uses fixed priority
  const subtypesForArchetype = useMemo(() => {
    if (selectedFighterSubtypes.length > 0) return selectedFighterSubtypes;
    if (fighter.fighter_subtypes?.length) return fighter.fighter_subtypes;
    return defaultFighterSubtypeName ? [defaultFighterSubtypeName] : [];
  }, [selectedFighterSubtypes, fighter.fighter_subtypes, defaultFighterSubtypeName]);

  const archetypeCatalogSubtype = getArchetypeCatalogSubtype(subtypesForArchetype, {
    gangTypeId,
  });

  const archetypeFighterSubtypeId = useMemo(() => {
    if (!archetypeCatalogSubtype || !allFighterSubtypes) return '';
    return allFighterSubtypes.find(fc => fc.subtype_name === archetypeCatalogSubtype)?.id ?? '';
  }, [archetypeCatalogSubtype, allFighterSubtypes]);

  // Resolve the effective fighter type for default special rules (specialisation aware)
  const effectiveFighterType = useMemo(() => {
    if (!selectedFighterTypeId || fighterTypes.length === 0) return null;

    const selectedFighterType = fighterTypes.find(ft => ft.id === selectedFighterTypeId);
    if (!selectedFighterType) return null;

    return fighterTypes.find(ft => ft.id === selectedVariantTypeId) ?? selectedFighterType;
  }, [selectedFighterTypeId, selectedVariantTypeId, fighterTypes]);

  // Default special rules for the effective fighter type that are not already on the fighter
  const availableDefaultSpecialRules = useMemo(() => {
    const typeRules = (effectiveFighterType?.special_rules || [])
      .map(normalizeSpecialRule)
      .filter(Boolean);

    const currentRules = new Set(
      formValues.special_rules.map(normalizeSpecialRule).filter(Boolean)
    );

    return typeRules.filter(rule => !currentRules.has(rule));
  }, [effectiveFighterType, formValues.special_rules]);

  const specialRuleComboboxOptions = useMemo(() => {
    const options: Array<{
      value: string;
      label: string | React.ReactNode;
      displayValue?: string;
      disabled?: boolean;
    }> = [];

    options.push({ value: 'custom', label: 'Custom' });

    if (availableDefaultSpecialRules.length > 0) {
      options.push({
        value: '__default_special_rules_header__',
        label: <span className="font-bold">Default Special Rules</span>,
        displayValue: 'Default Special Rules',
        disabled: true,
      });
      availableDefaultSpecialRules.forEach(rule => {
        options.push({
          value: rule,
          label: <span className="ml-3">{rule}</span>,
          displayValue: rule,
        });
      });
    }

    return options;
  }, [availableDefaultSpecialRules]);

  // One entry per variant family, preferring the base (no variant) row, then the cheapest.
  const fighterTypeComboboxOptions = useMemo(() => {
    const typeSubtypeMap = new Map<string, { fighter: typeof fighterTypes[number]; cost: number }>();

    fighterTypes.forEach(ft => {
      const key = ft.typeSubtypeKey ?? ft.id;

      if (!typeSubtypeMap.has(key)) {
        typeSubtypeMap.set(key, { fighter: ft, cost: ft.total_cost });
        return;
      }

      const current = typeSubtypeMap.get(key)!;

      if (!ft.fighter_variant && current.fighter.fighter_variant) {
        typeSubtypeMap.set(key, { fighter: ft, cost: ft.total_cost });
      } else if (!current.fighter.fighter_variant && ft.fighter_variant) {
        // Keep current (the family's base row)
      } else if (ft.total_cost < current.cost) {
        typeSubtypeMap.set(key, { fighter: ft, cost: ft.total_cost });
      }
    });

    const typeOptions = Array.from(typeSubtypeMap.values())
      .sort((a, b) => {
        const subtypeRankA = getFighterSubtypeSortRank(a.fighter.fighter_subtypes, fighter.edition_slug);
        const subtypeRankB = getFighterSubtypeSortRank(b.fighter.fighter_subtypes, fighter.edition_slug);

        if (subtypeRankA !== subtypeRankB) {
          return subtypeRankA - subtypeRankB;
        }

        return a.cost - b.cost;
      })
      .map(({ fighter: ft }) => {
        const displayName = `${ft.fighter_type} (${ft.fighter_subtypes.join(', ')})`;
        const gangVariantSuffix = (ft as any).is_gang_variant ? ` - ${(ft as any).gang_variant_name}` : '';
        return {
          value: ft.id,
          label: `${displayName}${gangVariantSuffix}`,
        };
      });

    return typeOptions;
  }, [fighterTypes, fighter.edition_slug]);

  // Eligible when Outcasts (N23/N26) + any selected subtype is in that gang's archetype list
  const canUseArchetypes = isArchetypeEligible({
    gangTypeId,
    fighterSubtypes: subtypesForArchetype,
  });

  // Fetch archetypes using TanStack Query (only if eligible and modal is open)
  const { data: archetypesData } = useQuery({
    queryKey: ['skill-archetypes', archetypeFighterSubtypeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (archetypeFighterSubtypeId) {
        params.set('fighter_subtype_id', archetypeFighterSubtypeId);
      }
      const response = await fetch(`/api/fighters/skill-archetypes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch archetypes');
      return response.json();
    },
    enabled: isOpen && canUseArchetypes,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Drop a stale selection when the fighter is ineligible, or a settled non-empty
  // catalog no longer lists it. Derived, not corrected in an effect, so no render
  // ever holds an archetype the fighter cannot have.
  const effectiveArchetypeId = useMemo(() => {
    if (!selectedArchetypeId || !canUseArchetypes) return '';

    const archetypes = archetypesData?.archetypes as Archetype[] | undefined;
    // Wait for a real catalog payload; empty/missing lists must not wipe a valid selection
    if (!archetypes || archetypes.length === 0) return selectedArchetypeId;

    return archetypes.some((a) => a.id === selectedArchetypeId) ? selectedArchetypeId : '';
  }, [selectedArchetypeId, canUseArchetypes, archetypesData]);

  // TanStack mutation for editing fighter details
  const mutation = useMutation({
    mutationFn: async (submit: {
      name: string;
      label: string;
      kills: number;
      kill_count?: number;
      costAdjustment: string;
      fighter_subtypes?: string[];
      fighter_type?: string;
      fighter_type_id?: string | null;
      custom_fighter_type_id?: string | null;
      special_rules?: string[];
      fighter_specialisation?: string | null;
      fighter_specialisation_id?: string | null;
      fighter_gang_legacy_id?: string | null;
      selected_archetype_id?: string | null;
    }) => {
      const result = await updateFighterDetails({
        fighter_id: fighter.id,
        fighter_name: submit.name,
        label: submit.label,
        kills: submit.kills,
        kill_count: submit.kill_count,
        cost_adjustment: parseInt(submit.costAdjustment) || 0,
        special_rules: submit.special_rules,
        fighter_subtypes: submit.fighter_subtypes,
        fighter_type: submit.fighter_type,
        fighter_type_id: submit.fighter_type_id,
        custom_fighter_type_id: submit.custom_fighter_type_id,
        fighter_specialisation: submit.fighter_specialisation,
        fighter_specialisation_id: submit.fighter_specialisation_id,
        fighter_gang_legacy_id: submit.fighter_gang_legacy_id,
        selected_archetype_id: submit.selected_archetype_id,
        stat_adjustments: Object.keys(pendingStatAdjustments).length > 0 ? pendingStatAdjustments : undefined
      });
      if (!result.success) throw new Error(result.error || 'Failed to update fighter');
      return {
        fighter: result.data?.fighter,
        warning: result.warning,
      };
    },
    onMutate: (submit) => {
      // Build optimistic user-effect overlay from pendingStatAdjustments
      const optimisticModifiers = Object.entries(pendingStatAdjustments || {})
        .filter(([, delta]) => typeof delta === 'number' && delta !== 0)
        .map(([prop, delta]) => ({
          id: `optimistic-${prop}`,
          fighter_effect_id: 'optimistic-user',
          stat_name: prop,
          numeric_value: delta,
        }));

      const optimisticEffectsOverlay = optimisticModifiers.length > 0
        ? {
            effects: {
              ...currentFighter.effects,
              user: [
                ...((currentFighter.effects && currentFighter.effects.user) ? currentFighter.effects.user : []),
                {
                  id: 'optimistic-user',
                  effect_name: 'User Adjustment',
                  fighter_effect_modifiers: optimisticModifiers,
                } as any,
              ],
            },
          }
        : {};

      const optimistic: any = {
        fighter_name: submit.name,
        label: submit.label,
        kills: submit.kills,
        kill_count: submit.kill_count,
        cost_adjustment: parseInt(submit.costAdjustment) || 0,
        ...(submit.fighter_subtypes !== undefined
          ? { fighter_subtypes: submit.fighter_subtypes }
          : {}),
        ...(submit.fighter_type && (submit.fighter_type_id || submit.custom_fighter_type_id)
          ? {
              fighter_type: { fighter_type: submit.fighter_type, fighter_type_id: submit.fighter_type_id ?? null, gang_type_id: (submit as any).gang_type_id ?? null, custom_gang_type_id: (submit as any).custom_gang_type_id ?? null } as any,
              custom_fighter_type_id: submit.custom_fighter_type_id ?? null,
              fighter_type_id: submit.fighter_type_id ?? null,
              fighter_variant:
                fighterTypes.find(ft => ft.id === submit.fighter_type_id)?.fighter_variant ?? null,
            }
          : {}),
        ...(submit.fighter_specialisation && submit.fighter_specialisation_id
          ? {
              fighter_specialisation: {
                fighter_specialisation: submit.fighter_specialisation,
                fighter_specialisation_id: submit.fighter_specialisation_id,
              } as any,
            }
          : {}),
        ...(submit.fighter_gang_legacy_id !== undefined
          ? {
              fighter_gang_legacy_id: submit.fighter_gang_legacy_id as any,
              // Consumers read the embedded row, not the id.
              fighter_gang_legacy:
                (availableLegacies.find(l => l.id === submit.fighter_gang_legacy_id) ?? null) as any,
            }
          : {}),
        // Include optimistic effects overlay so UI updates instantly
        ...optimisticEffectsOverlay,
      };
      const snapshot = onEditMutate?.(optimistic);
      return { snapshot, optimistic } as const;
    },
    onError: (err: unknown, _submit, ctx) => {
      if (ctx && 'snapshot' in (ctx as any)) {
        onEditError?.((ctx as any).snapshot);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update fighter');
    },
    onSuccess: async (result, submit, ctx) => {
      const serverFighter = result?.fighter;
      if (ctx && 'optimistic' in (ctx as any) && 'snapshot' in (ctx as any)) {
        onEditSuccess?.(serverFighter, (ctx as any).optimistic, (ctx as any).snapshot);
      }

      // Prefer the persisted archetype — server may clear it when subtypes invalidate the catalog.
      // Skill-access overrides are applied server-side from the validated archetype row.
      const persistedArchetypeId: string | null =
        serverFighter && 'selected_archetype_id' in serverFighter
          ? ((serverFighter as { selected_archetype_id?: string | null }).selected_archetype_id ?? null)
          : (submit.selected_archetype_id ?? null);

      setSelectedArchetypeId(persistedArchetypeId || '');

      if (result?.warning) {
        toast.error(result.warning);
      } else {
        toast.success('Fighter updated successfully');
      }
    }
  });

  // Initialize fighter state and specialisations when fighter or fighter types data changes
  const fighterInitKey = `${fighter.id}-${fighter.selected_archetype_id ?? ''}`;
  const [prevFighterInit, setPrevFighterInit] = useState({ key: fighterInitKey, fighterTypes });
  if (fighterInitKey !== prevFighterInit.key || fighterTypes !== prevFighterInit.fighterTypes) {
    setPrevFighterInit({ key: fighterInitKey, fighterTypes });
    setCurrentFighter(fighter);
    // Both hold a fighter_type id: the family entry and the row picked within it.
    const initialFighterTypeId =
      (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '';
    setSelectedFighterTypeId(initialFighterTypeId);
    setSelectedVariantTypeId(initialFighterTypeId);
    setSelectedFighterSpecialisationId(fighter.fighter_specialisation?.fighter_specialisation_id || '');
    setSelectedGangLegacyId((fighter as any).fighter_gang_legacy_id || '');
    setSelectedArchetypeId(fighter.selected_archetype_id || '');
    setHasExplicitlySelectedType(false);
    const initialSubtypes = fighter.fighter_subtypes ?? [];
    setSelectedFighterSubtypes(
      allowsMultipleSubtypes(fighter.edition_slug)
        ? initialSubtypes
        : initialSubtypes.slice(0, 1)
    );
  }

  // Pre-populate current fighter type and specialisation when fighter types are loaded
  const fighterTypeInitData = useMemo(() => {
    if (fighterTypes.length === 0 || hasExplicitlySelectedType) return null;

    const currentFighterTypeId = (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id;
    if (!currentFighterTypeId) return null;

    const currentType = fighterTypes.find(ft => ft.id === currentFighterTypeId);
    if (!currentType) return null;

    // The fighter's own type may be a variant, so the dropdown lands on its family.
    const fighterTypeGroup = fighterTypes.filter(t => sameVariantFamily(t, currentType));

    let dropdownType = fighterTypeGroup.find(ft => !ft.fighter_variant);

    if (!dropdownType && fighterTypeGroup.length > 0) {
      dropdownType = fighterTypeGroup.reduce((cheapest, current) =>
        current.total_cost < cheapest.total_cost ? current : cheapest
      );
    }

    const dropdownId = dropdownType ? dropdownType.id : currentFighterTypeId;
    const variantOptions = variantOptionsFor(fighterTypeGroup);
    const resolvedVariantTypeId = currentFighterTypeId;

    return {
      dropdownId,
      formUpdate: {
        fighter_type: currentType.fighter_type,
        fighter_subtypes: currentType.fighter_subtypes,
      },
      legacies: currentType.available_legacies || [],
      variantOptions,
      resolvedVariantTypeId,
    };
  }, [fighterTypes, fighter, hasExplicitlySelectedType]);

  // Keyed on the fighter and the loaded catalog, not the memo's identity: seeding from
  // the memo skipped this whenever the query answered from cache on the first render.
  const [initializedFor, setInitializedFor] = useState<
    { fighterId: string; types: typeof fighterTypes } | null
  >(null);
  if (
    fighterTypeInitData &&
    (initializedFor?.fighterId !== fighter.id || initializedFor.types !== fighterTypes)
  ) {
    setInitializedFor({ fighterId: fighter.id, types: fighterTypes });
    setSelectedFighterTypeId(fighterTypeInitData.dropdownId);
    setFormValues(prev => ({ ...prev, ...fighterTypeInitData.formUpdate }));
    setAvailableLegacies(fighterTypeInitData.legacies);
    setAvailableVariants(fighterTypeInitData.variantOptions);
    setSelectedVariantTypeId(fighterTypeInitData.resolvedVariantTypeId);
  }

  const handleChange = (field: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Update the handleFighterTypeChange function
  const handleFighterTypeChange = (fighterTypeId: string) => {
    setSelectedFighterTypeId(fighterTypeId);
    setSelectedSpecialRuleOption('');
    setCustomSpecialRule('');

    // Set flag to indicate user has explicitly selected a fighter type
    setHasExplicitlySelectedType(true);

    // Find the selected fighter type
    const selectedType = fighterTypes.find((ft: any) => ft.id === fighterTypeId);

    if (selectedType) {
      // Update form values with selected type
      setFormValues(prev => ({
        ...prev,
        fighter_type: selectedType.fighter_type,
        fighter_subtypes: selectedType.fighter_subtypes
      }));
      const typeSubtypes = selectedType.fighter_subtypes ?? [];
      setSelectedFighterSubtypes(
        allowMultipleSubtypes ? typeSubtypes : typeSubtypes.slice(0, 1)
      );
      setPendingSubtypeToAdd('');
      setSelectedArchetypeId('');

      // Update available legacies for the selected fighter type
      const nextLegacies = selectedType.available_legacies || [];
      setAvailableLegacies(nextLegacies);
      if (!nextLegacies.some(l => l.id === selectedGangLegacyId)) {
        setSelectedGangLegacyId('');
      }

      // Get all variants of the selected fighter to check for specialisations
      const fighterTypeGroup = fighterTypes.filter(t => sameVariantFamily(t, selectedType));

      setAvailableVariants(variantOptionsFor(fighterTypeGroup));
      setSelectedVariantTypeId(fighterTypeId);
    }
  };

  // Add handler for specialisation change
  const handleVariantChange = (specialisationId: string) => {
    setSelectedVariantTypeId(specialisationId);
    setSelectedSpecialRuleOption('');
    setCustomSpecialRule('');

    // A variant can carry subtypes the base row does not, so the selection follows the
    // chosen row. Subtypes no row in the family owns were granted or hand-added; keep them.
    const variantType = fighterTypes.find(ft => ft.id === specialisationId);
    if (!variantType) return;

    const familySubtypes = new Set(
      fighterTypes.filter(ft => sameVariantFamily(ft, variantType)).flatMap(ft => ft.fighter_subtypes)
    );
    const next = [
      ...variantType.fighter_subtypes,
      ...selectedFighterSubtypes.filter(name => !familySubtypes.has(name)),
    ];

    setFormValues(prev => ({ ...prev, fighter_subtypes: next }));
    applySelectedFighterSubtypes(allowMultipleSubtypes ? next : next.slice(0, 1));
  };

  // Add handler for gang legacy change
  const handleGangLegacyChange = (legacyId: string) => {
    setSelectedGangLegacyId(legacyId);
  };

  // Archetypes key off effectiveFighterSubtype, i.e. the first entry, so a saved
  // archetype only stops applying when that first entry changes.
  const applySelectedFighterSubtypes = (next: string[]) => {
    if (next[0] !== selectedFighterSubtypes[0]) setSelectedArchetypeId('');
    setSelectedFighterSubtypes(next);
  };

  const handleAddFighterSubtype = () => {
    const subtypeName = pendingSubtypeToAdd.trim();
    if (!subtypeName || selectedFighterSubtypes.includes(subtypeName)) return;

    const selected = new Set([...selectedFighterSubtypes, subtypeName]);
    // Keep the reference-list order so the stored array doesn't depend on add order
    applySelectedFighterSubtypes(
      fighterSubtypesForDisplay.map(fc => fc.subtype_name).filter(name => selected.has(name))
    );
    setPendingSubtypeToAdd('');
  };

  const handleRemoveFighterSubtype = (subtypeName: string) => {
    applySelectedFighterSubtypes(
      selectedFighterSubtypes.filter(name => name !== subtypeName)
    );
  };

  const handleSingleFighterSubtypeChange = (subtypeName: string) => {
    applySelectedFighterSubtypes(subtypeName ? [subtypeName] : []);
  };

  // Add handler for special rule combobox selection
  const handleSpecialRuleOptionChange = (value: string) => {
    if (value === 'custom') {
      setSelectedSpecialRuleOption('custom');
      setCustomSpecialRule('');
    } else if (availableDefaultSpecialRules.includes(value)) {
      setSelectedSpecialRuleOption(value);
      setCustomSpecialRule('');
    } else {
      setSelectedSpecialRuleOption('custom');
      setCustomSpecialRule(value);
    }
  };

  const effectSpecialRules = useMemo(() => {
    const allEffects = fighter.effects ? Object.values(fighter.effects).flat() : [];
    return applySpecialRulesModifiers([], allEffects);
  }, [fighter.effects]);

  const effectRemovedRules = useMemo(() => {
    const removed = new Set<string>();
    if (fighter.effects) {
      Object.values(fighter.effects).flat().forEach((effect: any) => {
        if (!effect) return;
        const tsd = typeof effect.type_specific_data === 'object' && effect.type_specific_data
          ? effect.type_specific_data : null;
        if (tsd) {
          (tsd.special_rules_to_remove || []).forEach((r: string) => removed.add(r));
        }
      });
    }
    return removed;
  }, [fighter.effects]);

  // Add handler for adding a special rule
  const handleAddSpecialRule = () => {
    const ruleToAdd = selectedSpecialRuleOption === 'custom'
      ? customSpecialRule.trim()
      : selectedSpecialRuleOption.trim();

    if (!ruleToAdd) return;

    // Avoid duplicates
    const normalisedCurrent = formValues.special_rules.map(normalizeSpecialRule);
    if (normalisedCurrent.includes(normalizeSpecialRule(ruleToAdd))) {
      setSelectedSpecialRuleOption('');
      setCustomSpecialRule('');
      return;
    }

    setFormValues(prev => ({
      ...prev,
      special_rules: [...prev.special_rules, ruleToAdd]
    }));
    setSelectedSpecialRuleOption('');
    setCustomSpecialRule('');
  };

  // Add handler for removing a special rule
  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setFormValues(prev => ({
      ...prev,
      special_rules: prev.special_rules.filter(rule => rule !== ruleToRemove)
    }));
  };

  // Receive draft adjustments from stats modal; preview only
  const handleUpdateStats = async (stats: Record<string, number>) => {
    setPendingStatAdjustments(stats);
    setShowStatsModal(false);
  };

  // Compose preview fighter by overlaying a synthetic user effect from pendingStatAdjustments
  const previewFighter: Fighter = useMemo(() => {
    if (!pendingStatAdjustments || Object.keys(pendingStatAdjustments).length === 0) return currentFighter;
    const modifiers = Object.entries(pendingStatAdjustments).map(([prop, delta]) => ({
      id: `preview-${prop}`,
      fighter_effect_id: 'preview',
      stat_name: prop,
      numeric_value: delta,
    }));
    const previewEffect = { id: 'preview-user', effect_name: 'Preview', fighter_effect_modifiers: modifiers } as any;
    return {
      ...currentFighter,
      effects: {
        ...currentFighter.effects,
        user: [...(currentFighter.effects?.user || []), previewEffect]
      }
    } as Fighter;
  }, [currentFighter, pendingStatAdjustments]);

  // Update the handleConfirm function
  const handleConfirm = async () => {
    try {
      // Get the selected fighter type details - use existing if not explicitly changed
      let selectedFighterType = selectedFighterTypeId ? 
        fighterTypes.find((ft: any) => ft.id === selectedFighterTypeId) : 
        null;
      
      // The variant dropdown picks a row inside the family, so it wins over the family entry.
      const fighterTypeToUse =
        fighterTypes.find(ft => ft.id === selectedVariantTypeId) ??
        (hasExplicitlySelectedType ? selectedFighterType : null);

      // Sending an unchanged type would let the server re-derive the specialisation and
      // clear a promotion pick, so only submit it when the user actually moved.
      const currentFighterTypeId =
        (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '';
      const shouldUpdateFighterType =
        Boolean(fighterTypeToUse) &&
        (hasExplicitlySelectedType || fighterTypeToUse!.id !== currentFighterTypeId);
      
      // Call onSubmit with all values, including specialisation fields
      const submitData: any = {
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        kill_count: formValues.kill_count,
        costAdjustment: formValues.costAdjustment,
        special_rules: formValues.special_rules,
        selected_archetype_id: effectiveArchetypeId || null
      };

      // Sent unchanged, a save aimed at something else would clear the legacy.
      const currentLegacyId = (fighter as any).fighter_gang_legacy_id || '';
      if (selectedGangLegacyId !== currentLegacyId) {
        submitData.fighter_gang_legacy_id = selectedGangLegacyId || null;
      }

      // Only include fighter type fields if we're actually updating the fighter type
      if (shouldUpdateFighterType && fighterTypeToUse) {
        submitData.fighter_subtypes = fighterTypeToUse.fighter_subtypes;
        submitData.fighter_type = fighterTypeToUse.fighter_type;
        if (fighterTypeToUse.is_custom_fighter) {
          // Custom type IDs live in custom_fighter_types, not fighter_types — must not write to fighter_type_id
          submitData.custom_fighter_type_id = fighterTypeToUse.id;
          submitData.fighter_type_id = null;
          submitData.fighter_specialisation = null;
          submitData.fighter_specialisation_id = null;
          // client-only: used by the optimistic fighter_type overlay, not forwarded to the server
          submitData.gang_type_id = fighterTypeToUse.gang_type_id ?? null;
          submitData.custom_gang_type_id = fighterTypeToUse.custom_gang_type_id ?? null;
        } else {
          submitData.fighter_type_id = fighterTypeToUse.id;
          submitData.custom_fighter_type_id = null;
          // client-only: used by the optimistic fighter_type overlay, not forwarded to the server
          submitData.gang_type_id = fighterTypeToUse.gang_type_id ?? null;
          submitData.custom_gang_type_id = null;
        }
      }

      // The server derives the specialisation from any submitted type row, so send the
      // fighter's own whenever the type moves as well — a retype must not rewrite it.
      if (
        hasFighterSpecialisations(fighter.edition_slug) &&
        !isVehicleFighter &&
        !submitData.custom_fighter_type_id
      ) {
        const currentSpecialisationId = fighter.fighter_specialisation?.fighter_specialisation_id || '';
        if (selectedFighterSpecialisationId !== currentSpecialisationId || submitData.fighter_type_id) {
          const specialisation = N26_PROSPECT_SPECIALISATIONS.find(
            s => s.id === selectedFighterSpecialisationId
          );
          submitData.fighter_specialisation_id = selectedFighterSpecialisationId || null;
          submitData.fighter_specialisation = specialisation?.name ?? null;
        }
      }

      // Only send subtypes when dirty so rename/specialisation-only saves cannot
      // clobber a prior override (type update may have set fighter_subtypes above).
      if (!sameFighterSubtypes(selectedFighterSubtypes, fighter.fighter_subtypes)) {
        submitData.fighter_subtypes = selectedFighterSubtypes;
      } else {
        delete submitData.fighter_subtypes;
      }
      
      // If lifecycle callbacks are provided, use TanStack mutation and close immediately
      if (onEditMutate || onEditError || onEditSuccess) {
        mutation.mutate(submitData);
        return true; // close immediately
      }

      // Fallback to legacy onSubmit path if provided
      if (onSubmit) {
        const ok = await onSubmit(submitData);
        if (ok) {
          toast.success('Fighter updated successfully');
          onClose();
        }
        return ok;
      }

      // If no path available, prevent close
      toast.error('No submit handler provided');
      return false;
    } catch (error) {
      console.error('Error updating fighter:', error);
      toast.error('Failed to update fighter');
      return false;
    }
  };

  // Don't render if modal isn't open
  if (!isOpen) return null;

  return (
    <>
      <Modal
        title="Edit Fighter"
        content={
          <div className="space-y-4">
            {/* Fighter Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Fighter Name
              </label>
              <Input
                id="name"
                type="text"
                value={formValues.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full"
              />
            </div>
            
            {/* Label, Cost Adjustment, Kills and Kill Count */}
            <div className={`grid ${is_spyrer ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
              <div>
                <label htmlFor="label" className="block text-sm font-medium mb-1">
                  Label
                </label>
                <Input
                  id="label"
                  type="text"
                  placeholder="Max 5 Char."
                  maxLength={5}
                  value={formValues.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="costAdjustment" className="block text-sm font-medium mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="hidden lg:inline">Cost Adjustment</span>
                  <span className="inline lg:hidden">Cost Adj.</span>
                </label>
                <Input
                  id="costAdjustment"
                  type="number"
                  value={formValues.costAdjustment}
                  onChange={(e) => handleChange('costAdjustment', e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="kills" className="block text-sm font-medium mb-1">
                  OOA
                </label>
                <Input
                  id="kills"
                  type="number"
                  value={formValues.kills}
                  onChange={(e) => handleChange('kills', e.target.value)}
                  className="w-full"
                />
              </div>
              {is_spyrer && (
                <div>
                  <label htmlFor="kill_count" className="block text-sm font-medium mb-1">
                    Kills
                  </label>
                  <Input
                    id="kill_count"
                    type="number"
                    value={formValues.kill_count}
                    onChange={(e) => handleChange('kill_count', e.target.value)}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Fighter Type Dropdown */}
            <div>
              <label htmlFor="fighter_type_id" className="block text-sm font-medium mb-1">
                Change Fighter Type
              </label>
              <Combobox
                id="fighter_type_id"
                value={selectedFighterTypeId}
                onValueChange={handleFighterTypeChange}
                placeholder="Select a fighter type"
                options={fighterTypeComboboxOptions}
                dropdownPlacement="down"
              />
              {fighter.fighter_type && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Current: {typeof (fighter as any).fighter_type === 'object' 
                    ? (fighter as any).fighter_type.fighter_type 
                    : fighter.fighter_type}
                  {` `}
                  {`(${fighter.fighter_subtypes?.join(', ') || 'Unknown Subtype'})`}
                </div>
              )}
            </div>
            
            {/* Variant Dropdown - the rows a fighter type is split into */}
            {selectedFighterTypeId && availableVariants.length > 0 && (
              <div>
                <label htmlFor="fighter_variant" className="block text-sm font-medium mb-1">
                  Fighter Variant
                </label>
                <Combobox
                  id="fighter_variant"
                  value={selectedVariantTypeId}
                  onValueChange={handleVariantChange}
                  placeholder="Select a variant"
                  options={availableVariants.map(({ value, label }) => ({ value, label }))}
                  dropdownPlacement="down"
                />
                <div className="mt-1 text-sm text-muted-foreground">
                  Current: {fighter.fighter_variant || 'Default'}
                </div>
              </div>
            )}

            {/* Specialisation - the fighter's own, never its type's */}
            {hasFighterSpecialisations(fighter.edition_slug) && !isVehicleFighter && (
              <div>
                <label htmlFor="fighter_specialisation_id" className="block text-sm font-medium mb-1">
                  Fighter Specialisation
                </label>
                <Combobox
                  id="fighter_specialisation_id"
                  value={selectedFighterSpecialisationId}
                  onValueChange={setSelectedFighterSpecialisationId}
                  placeholder="None"
                  clearable
                  options={[
                    { value: '', label: 'None' },
                    ...N26_PROSPECT_SPECIALISATIONS.map(s => ({ value: s.id, label: s.name })),
                  ]}
                  dropdownPlacement="down"
                />
                <div className="mt-1 text-sm text-muted-foreground">
                  Current: {fighter.fighter_specialisation?.fighter_specialisation || 'None'}
                </div>
              </div>
            )}

            {/* Fighter Subtype — multi add/chips on N26, single Combobox on N23 */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Fighter Subtype
              </label>
              {allowMultipleSubtypes ? (
                <>
                  <div className="flex space-x-2 mb-2">
                    <div className="grow min-w-0">
                      <Combobox
                        options={availableSubtypeComboboxOptions}
                        value={pendingSubtypeToAdd}
                        onValueChange={setPendingSubtypeToAdd}
                        placeholder="Add a Fighter Subtype"
                        dropdownPlacement="down"
                      />
                    </div>
                    <Button
                      onClick={handleAddFighterSubtype}
                      type="button"
                      disabled={!pendingSubtypeToAdd}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFighterSubtypes.map((subtypeName) => (
                      effectGrantedSubtypes.has(subtypeName) ? (
                        <div
                          key={subtypeName}
                          className="bg-muted/50 px-3 py-1 rounded-full flex items-center text-sm text-muted-foreground italic"
                        >
                          <span>{subtypeName}</span>
                          <span className="ml-2 text-xs">(from equipment)</span>
                        </div>
                      ) : (
                        <div
                          key={subtypeName}
                          className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                        >
                          <span>{subtypeName}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFighterSubtype(subtypeName)}
                            className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-hidden"
                          >
                            <HiX size={14} />
                          </button>
                        </div>
                      )
                    ))}
                  </div>
                </>
              ) : (
                <Combobox
                  value={selectedFighterSubtypes[0] ?? ''}
                  onValueChange={handleSingleFighterSubtypeChange}
                  placeholder="Select fighter subtype"
                  options={fighterSubtypesForDisplay.map(fc => ({
                    value: fc.subtype_name,
                    label: fc.subtype_name,
                  }))}
                  dropdownPlacement="down"
                />
              )}
              <div className="mt-1 text-sm text-muted-foreground">
                Current: {fighter.fighter_subtypes?.join(', ') || 'Unknown'}
              </div>
            </div>

            {/* Gang Legacy Dropdown */}
            {availableLegacies.length > 0 && (
              <div>
                <label htmlFor="fighter_gang_legacy_id" className="block text-sm font-medium mb-1">
                  Gang Legacy
                </label>
                <select
                  id="fighter_gang_legacy_id"
                  value={selectedGangLegacyId}
                  onChange={(e) => handleGangLegacyChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">
                    No Legacy
                  </option>
                  {availableLegacies.map((legacy) => (
                    <option key={legacy.id} value={legacy.id}>
                      {legacy.name}
                    </option>
                  ))}
                </select>
                {(fighter as any).fighter_gang_legacy ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: {typeof (fighter as any).fighter_gang_legacy === 'object' 
                      ? (fighter as any).fighter_gang_legacy.name
                      : (fighter as any).fighter_gang_legacy}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: No Legacy
                  </div>
                )}
              </div>
            )}

            {/* Archetype Selection (Underhive Outcasts — N23 Leader/Champion, N26 + Ganger) */}
            {canUseArchetypes && (
              <div>
                <label htmlFor="archetype" className="block text-sm font-medium mb-1">
                  Archetype
                </label>
                <Combobox
                  id="archetype"
                  value={effectiveArchetypeId}
                  onValueChange={setSelectedArchetypeId}
                  placeholder="None"
                  clearable
                  options={[
                    { value: '', label: 'None' },
                    ...(archetypesData?.archetypes?.map((archetype: Archetype) => ({
                      value: archetype.id,
                      label: archetype.name,
                    })) || []),
                  ]}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Selecting an archetype will change the fighter&apos;s skill access.
                </p>
              </div>
            )}

            {/* Special Rules Section */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Special Rules
              </label>
              <div className="mb-2">
                <div className="flex space-x-2">
                  <div className="grow min-w-0">
                    <Combobox
                      options={specialRuleComboboxOptions}
                      value={selectedSpecialRuleOption}
                      onValueChange={handleSpecialRuleOptionChange}
                      placeholder="Add a Special Rule"
                      allowCustom={true}
                      dropdownPlacement="down"
                    />
                  </div>
                  {selectedSpecialRuleOption !== 'custom' && (
                    <Button
                      onClick={handleAddSpecialRule}
                      type="button"
                    >
                      Add
                    </Button>
                  )}
                </div>
                {selectedSpecialRuleOption === 'custom' && (
                  <div className="flex space-x-2 mt-2">
                    <Input
                      type="text"
                      value={customSpecialRule}
                      onChange={(e) => setCustomSpecialRule(e.target.value)}
                      placeholder="Enter custom Special Rule"
                      className="grow"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSpecialRule();
                        }
                      }}
                    />
                    <Button
                      onClick={handleAddSpecialRule}
                      type="button"
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Display existing special rules as tags */}
              <div className="flex flex-wrap gap-2 mt-2">
                {formValues.special_rules
                  .filter(rule => !effectRemovedRules.has(rule))
                  .map((rule, index) => (
                  <div
                    key={index}
                    className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-hidden"
                    >
                      <HiX size={14} />
                    </button>
                  </div>
                ))}
                {effectSpecialRules
                  .filter(rule => !formValues.special_rules.includes(rule))
                  .map((rule, index) => (
                  <div
                    key={`effect-${index}`}
                    className="bg-muted/50 px-3 py-1 rounded-full flex items-center text-sm text-muted-foreground italic"
                  >
                    <span>{rule}</span>
                    <span className="ml-2 text-xs">(from effect)</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Characteristics */}
            <div>
              <h3 className="text-sm font-medium mb-2">Characteristics</h3>
              {/* Preview pending adjustments in the table by overlaying a synthetic user effect */}
              <FighterCharacteristicTable fighter={previewFighter} />
              <Button 
                onClick={() => setShowStatsModal(true)} 
                className="w-full mt-2"
              >
                Adjust Characteristics
              </Button>
            </div>

            {/* Skill Set Access */}
            <div>
              <h3 className="text-sm font-medium mb-2">Skill Set Access</h3>
              <Button 
                onClick={() => setShowSkillAccessModal(true)} 
                className="w-full"
              >
                Customise Skill Set Access
              </Button>
            </div>
          </div>
        }
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmDisabled={
          !formValues.name.trim() ||
          (selectedFighterSubtypes.length === 0 && (fighter.fighter_subtypes?.length ?? 0) > 0)
        }
      />
      
      {/* Stats modal */}
      {showStatsModal && (
        <CharacterStatsModal 
          onClose={() => setShowStatsModal(false)} 
          fighter={currentFighter}
          onUpdateStats={handleUpdateStats}
          isSaving={isSavingStats}
        />
      )}

      {/* Skill Access modal */}
      <SkillAccessModal
        fighterId={fighter.id}
        isOpen={showSkillAccessModal}
        onClose={() => setShowSkillAccessModal(false)}
        editionSlug={fighter.edition_slug}
      />
    </>
  );
}
