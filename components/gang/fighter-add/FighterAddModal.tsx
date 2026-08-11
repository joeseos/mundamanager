'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { FighterType, EquipmentOption, NormalizedEquipmentSelection } from '@/types/fighter-type';
import { FighterProps, Archetype } from '@/types/fighter';
import { toast } from 'sonner';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { getGangAdditionRank, getGangAdditionSortRank } from '@/utils/gangAdditionRank';
import { N26_ADDITION_CATEGORIES } from '@/utils/gangAdditionRankN26';
import { groupAlliancesByType } from '@/utils/allianceRank';
import { bestRankedLabel } from '@/utils/rankLookup';
import { fighterTypeRank } from '@/utils/fighterTypeRank';
import { beastSubtypeName, hasGangAdditionCategories, sameEditionForDisplay } from '@/types/edition';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { ImInfo } from 'react-icons/im';
import { addFighterToGang } from '@/app/actions/add-fighter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getArchetypeCatalogSubtype, isArchetypeEligible } from '@/utils/archetypeEligibility';
import {
  buildFighterFromServerData,
  buildBeastFromServerData,
  createEmptyEffects,
  createStats,
  type AddFighterServerData,
  type ExoticBeastServerData,
} from '@/utils/fighter-builder';
import {
  SelectedEquipmentItem,
  normalizeEquipmentSelection,
  getDefaultEquipmentFromSelection,
  getBaseCost,
} from '@/utils/equipment-selection';
import { EquipmentSelection } from './EquipmentSelection';

/** 'vehicles' is the 'roster' query narrowed to vehicle fighter types. */
export type FighterAddCatalog = 'roster' | 'additions' | 'vehicles';

type AllianceOption = {
  id: string;
  alliance_name: string;
  alliance_type: string | null;
  alliance_crew_name: string | null;
  edition_slug?: string | null;
};

function hasFighterSubtype(type: { fighter_subtypes?: string[] | null }, subtype: string): boolean {
  return (type.fighter_subtypes ?? []).some(
    (s) => s.toLowerCase().trim() === subtype.toLowerCase()
  );
}

function matchesAdditionCategory(
  type: { fighter_subtypes?: string[] | null; alliance_id?: string | null },
  categoryValue: string
): boolean {
  if (categoryValue.startsWith('alliance:')) {
    return type.alliance_id === categoryValue.slice('alliance:'.length);
  }
  if (categoryValue === 'misc') {
    if (type.alliance_id) return false;
    return !N26_ADDITION_CATEGORIES.some((c) => hasFighterSubtype(type, c.subtype));
  }
  const category = N26_ADDITION_CATEGORIES.find((c) => c.value === categoryValue);
  return category ? hasFighterSubtype(type, category.subtype) : false;
}

function isCategorisedGangAddition(type: {
  fighter_subtypes?: string[] | null;
  alliance_id?: string | null;
}): boolean {
  if (type.alliance_id) return true;
  return N26_ADDITION_CATEGORIES.some((c) => hasFighterSubtype(type, c.subtype));
}

interface FighterAddModalProps {
  catalog: FighterAddCatalog;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  gangId: string;
  gangTypeId?: string | null;
  customGangTypeId?: string | null;
  gangAffiliationId?: string | null;
  editionSlug?: string | null;
  initialCredits: number;
  onFighterAdded: (newFighter: any, cost: number) => void;
  onFighterRollback?: (tempFighterId: string, cost: number, ratingCost: number) => void;
  onFighterReconcile?: (tempFighterId: string, realFighter: FighterProps) => void;
  gangVariants?: Array<{ id: string; variant: string }>;
}

/** Map a raw API fighter-type row into the FighterType shape (superset of fields). */
function mapFighterType(type: any): FighterType {
  return {
    id: type.id,
    fighter_type_id: type.id,
    fighter_type: type.fighter_type,
    fighter_subtypes: type.fighter_subtypes || [],
    gang_type: type.gang_type,
    cost: type.cost,
    gang_type_id: type.gang_type_id,
    special_rules: (type.special_rules || [])
      .map((r: string) => (typeof r === 'string' ? r.replace(/^"|"$/g, '') : r))
      .filter(Boolean),
    total_cost: type.total_cost,
    movement: type.movement,
    weapon_skill: type.weapon_skill,
    ballistic_skill: type.ballistic_skill,
    strength: type.strength,
    toughness: type.toughness,
    wounds: type.wounds,
    initiative: type.initiative,
    leadership: type.leadership,
    cool: type.cool,
    willpower: type.willpower,
    intelligence: type.intelligence,
    attacks: type.attacks,
    save: type.save ?? null,
    edition_slug: type.edition_slug ?? null,
    limitation: type.limitation,
    alignment: type.alignment,
    default_equipment: type.default_equipment || [],
    is_gang_addition: type.is_gang_addition || false,
    alliance_id: type.alliance_id || '',
    alliance_crew_name: type.alliance_crew_name || '',
    delegation_cost: type.delegation_cost ?? null,
    equipment_selection: type.equipment_selection,
    specialisation: type.specialisation,
    fighter_specialisation_id: type.specialisation?.id,
    available_legacies: type.available_legacies || [],
    is_custom_fighter: type.is_custom_fighter || false,
    free_skill: type.free_skill || false,
    is_dramatis_personae: type.is_dramatis_personae || false,
    starting_xp: type.starting_xp ?? null,
    is_vehicle: type.is_vehicle ?? false,
  } as FighterType;
}

export default function FighterAddModal({
  catalog,
  showModal,
  setShowModal,
  gangId,
  gangTypeId,
  customGangTypeId,
  gangAffiliationId,
  editionSlug = null,
  initialCredits,
  onFighterAdded,
  onFighterRollback,
  onFighterReconcile,
  gangVariants = [],
}: FighterAddModalProps) {
  const isAdditions = catalog === 'additions';
  const usesCategories = hasGangAdditionCategories(editionSlug);
  const isCategoryAdditions = isAdditions && usesCategories;
  const gangAdditionRank = getGangAdditionRank(editionSlug);
  const isVehicles = catalog === 'vehicles';
  const noun = isVehicles ? 'Vehicle' : 'Fighter';

  const tempIdCounter = useRef(0);
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [selectedSubtype, setSelectedSubtype] = useState(''); // additions: fighter-subtype navigation
  const [selectedSpecialisationId, setSelectedSpecialisationId] = useState('');
  const [availableSpecialisations, setAvailableSpecialisations] = useState<Array<{ id: string; specialisation_name: string }>>([]);
  const [fighterName, setFighterName] = useState('');
  const [fighterCost, setFighterCost] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<SelectedEquipmentItem[]>([]);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);
  const [useDelegationCost, setUseDelegationCost] = useState(false);
  const [includeCustomFighters, setIncludeCustomFighters] = useState(false);
  const [includeAllFighterTypes, setIncludeAllFighterTypes] = useState(false);
  const [selectedLegacyId, setSelectedLegacyId] = useState('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { data: fighterTypes = [] } = useQuery<FighterType[]>({
    queryKey: ['fighter-types', catalog, gangId, gangTypeId, customGangTypeId, includeCustomFighters, includeAllFighterTypes, gangAffiliationId, editionSlug, JSON.stringify(gangVariants)],
    queryFn: async () => {
      const affiliationParam = gangAffiliationId ? `&gang_affiliation_id=${gangAffiliationId}` : '';
      const gangTypeParam = gangTypeId ? `&gang_type_id=${gangTypeId}` : '';
      const customFightersParam = includeCustomFighters ? '&include_custom_fighters=true' : '';
      const includeAllGangTypeParam = includeCustomFighters ? '&include_all_gang_type=true' : '';
      const isVehicleParam = `&is_vehicle=${isVehicles}`;

      let url: string;
      if (isAdditions) {
        url = `/api/fighter-types?gang_id=${gangId}${gangTypeParam}&is_gang_addition=true${affiliationParam}${customFightersParam}${includeAllGangTypeParam}${isVehicleParam}`;
      } else {
        const gangVariantsParam = gangVariants.length > 0 ? `&gang_variants=${encodeURIComponent(JSON.stringify(gangVariants))}` : '';
        const customGangTypeParam = customGangTypeId ? `&custom_gang_type_id=${customGangTypeId}` : '';
        const includeAllTypesParam = includeAllFighterTypes ? '&include_all_types=true' : '';
        url = `/api/fighter-types?gang_id=${gangId}${gangTypeParam}${customGangTypeParam}&is_gang_addition=false${gangVariantsParam}${customFightersParam}${includeAllGangTypeParam}${affiliationParam}${includeAllTypesParam}${isVehicleParam}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      return data
        .filter((type: any) => {
          if (!type.is_custom_fighter) return true;
          const inGangAdditionSubtype = usesCategories
            ? isCategorisedGangAddition(type)
            : getGangAdditionSortRank(type.fighter_subtypes, editionSlug) !== Infinity;
          // Gang-addition-subtype custom fighters belong to the additions catalog only.
          return isAdditions ? inGangAdditionSubtype : !inGangAdditionSubtype;
        })
        .map(mapFighterType)
        // Gang additions are a cross-gang pool (not scoped by gang_type_id), so
        // keep only rows that match the gang's edition — same rule Add Fighter
        // gets for free via edition-scoped gang types.
        .filter((type: FighterType) => sameEditionForDisplay(type.edition_slug, editionSlug));
    },
    enabled: showModal,
  });

  const { data: alliances = [] } = useQuery<AllianceOption[]>({
    queryKey: ['alliances', editionSlug],
    queryFn: async () => {
      const response = await fetch('/api/alliances');
      if (!response.ok) throw new Error('Failed to fetch alliances');
      const data = await response.json();
      return (data as AllianceOption[]).filter((alliance) =>
        sameEditionForDisplay(alliance.edition_slug, editionSlug)
      );
    },
    enabled: showModal && isCategoryAdditions,
    staleTime: 10 * 60 * 1000,
  });

  // Additions catalog: filter the type list by the chosen category or subtype.
  const filteredTypes = isAdditions && selectedSubtype
    ? fighterTypes.filter((type) =>
        isCategoryAdditions
          ? matchesAdditionCategory(type, selectedSubtype)
          : type.alliance_id
            ? type.alliance_crew_name === selectedSubtype
            : type.fighter_subtypes?.includes(selectedSubtype)
      )
    : fighterTypes;

  const currentFighterTypeId = selectedSpecialisationId || selectedFighterTypeId;
  const currentFighterType = fighterTypes.find(t => t.id === currentFighterTypeId);

  const canUseArchetypes = isArchetypeEligible({
    gangTypeId,
    fighterSubtypes: currentFighterType?.fighter_subtypes,
  });

  // Scope the subtype lookup to the fighter type's edition: subtype_name is only
  // unique within an edition, so an unscoped fetch could resolve the wrong
  // fighter_subtype_id once a subtype exists in more than one edition.
  const currentEditionSlug = currentFighterType?.edition_slug ?? null;

  const { data: allFighterSubtypes } = useQuery<Array<{ id: string; subtype_name: string }>>({
    queryKey: ['fighter-subtypes', currentEditionSlug],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentEditionSlug) params.set('edition_slug', currentEditionSlug);
      const response = await fetch(`/api/fighter-subtypes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch fighter subtypes');
      return response.json();
    },
    enabled: showModal && canUseArchetypes,
    staleTime: 10 * 60 * 1000,
  });

  const currentFighterSubtypeId = useMemo(() => {
    const catalogSubtype = getArchetypeCatalogSubtype(currentFighterType?.fighter_subtypes, {
      gangTypeId,
    });
    if (!catalogSubtype || !allFighterSubtypes) return '';
    return allFighterSubtypes.find(fc => fc.subtype_name === catalogSubtype)?.id ?? '';
  }, [currentFighterType, allFighterSubtypes, gangTypeId]);

  const { data: archetypesData } = useQuery({
    queryKey: ['skill-archetypes', currentFighterSubtypeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentFighterSubtypeId) params.set('fighter_subtype_id', currentFighterSubtypeId);
      const response = await fetch(`/api/fighters/skill-archetypes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch archetypes');
      return response.json();
    },
    enabled: showModal && canUseArchetypes,
    staleTime: 10 * 60 * 1000,
  });

  const optimisticUpdatesEnabled = !!(onFighterRollback && onFighterReconcile);

  // Set default equipment + cost for a fighter type/specialisation (delegation-aware base cost).
  const applyDefaultEquipmentAndCost = (typeId: string, delegation: boolean) => {
    const selectedType = fighterTypes.find(t => t.id === typeId);
    if (!selectedType) return;
    const baseCost = getBaseCost(selectedType, delegation);
    if (selectedType.equipment_selection) {
      const defaultEquipment = getDefaultEquipmentFromSelection(selectedType.equipment_selection);
      setSelectedEquipment(defaultEquipment);
      setSelectedEquipmentIds([]);
      const defaultCost = defaultEquipment.reduce((sum, item) => sum + item.cost * item.quantity, 0);
      setFighterCost(String(baseCost + defaultCost));
    } else {
      setSelectedEquipment([]);
      setSelectedEquipmentIds([]);
      setFighterCost(String(baseCost));
    }
  };

  const handleSelectFighterType = (typeId: string) => {
    setSelectedFighterTypeId(typeId);
    setSelectedSpecialisationId('');
    setSelectedLegacyId('');
    setSelectedArchetypeId('');
    setSelectedEquipmentIds([]);
    setSelectedEquipment([]);
    setUseDelegationCost(false);

    if (!typeId) {
      setFighterCost('');
      setAvailableSpecialisations([]);
      return;
    }

    const selectedType = fighterTypes.find(t => t.id === typeId);

    // Dramatis Personae fighters carry a fixed name; auto-fill it (data-driven).
    if (selectedType?.is_dramatis_personae) {
      setFighterName(selectedType.fighter_type);
    } else {
      const previousType = fighterTypes.find(t => t.id === selectedFighterTypeId);
      if (previousType?.is_dramatis_personae && fighterName === previousType.fighter_type) {
        setFighterName('');
      }
    }

    const fighterTypeGroup = fighterTypes.filter(t =>
      t.fighter_type === selectedType?.fighter_type &&
      t.fighter_subtypes?.[0] === selectedType?.fighter_subtypes?.[0]
    );

    if (fighterTypeGroup.length > 1) {
      const specialisations = fighterTypeGroup.map(ft => ({
        id: ft.id,
        specialisation_name: ft.specialisation?.specialisation_name || 'Default',
        cost: ft.total_cost,
      }));
      setAvailableSpecialisations(specialisations);
      // Leave specialisation unselected so the combobox shows the placeholder;
      // cost/equipment apply once the user picks one (confirm stays disabled until then).
      setFighterCost('');
    } else {
      setAvailableSpecialisations([]);
      applyDefaultEquipmentAndCost(typeId, false);
    }
  };

  const handleSelectSpecialisation = (specialisationId: string) => {
    setSelectedSpecialisationId(specialisationId);
    setSelectedLegacyId('');
    setSelectedArchetypeId('');
    setSelectedEquipmentIds([]);
    setSelectedEquipment([]);
    // Preserve the user's delegation-cost choice across specialisation switches (a
    // specialisation is a variant of the same fighter type); recompute cost with it.
    applyDefaultEquipmentAndCost(specialisationId || selectedFighterTypeId, useDelegationCost);
  };

  const buildOptimisticFighter = (tempId: string): FighterProps => {
    const fighterTypeIdToUse = selectedSpecialisationId || selectedFighterTypeId;
    const selectedType = fighterTypes.find(t => t.id === fighterTypeIdToUse);
    const enteredCost = parseInt(fighterCost);
    const actualBaseCost = getBaseCost(selectedType, useDelegationCost);

    const totalEquipmentCost = selectedEquipment.reduce((sum, item) => sum + item.cost * (item.quantity || 1), 0);
    const displayCost = useBaseCostForRating ? (actualBaseCost + totalEquipmentCost) : enteredCost;

    const defaultEquipment = selectedType?.default_equipment || [];
    const optimisticWeapons = defaultEquipment
      .filter((item: any) => item.equipment_type === 'weapon')
      .map((item: any) => ({
        fighter_weapon_id: `temp-${item.id}`,
        weapon_id: item.id,
        weapon_name: item.equipment_name,
        cost: item.cost || 0,
        weapon_profiles: [],
      }));
    const optimisticWargear = defaultEquipment
      .filter((item: any) => item.equipment_type === 'wargear')
      .map((item: any) => ({
        fighter_weapon_id: `temp-${item.id}`,
        wargear_id: item.id,
        wargear_name: item.equipment_name,
        cost: item.cost || 0,
      }));

    const stats = createStats({
      movement: selectedType?.movement || 0,
      weapon_skill: selectedType?.weapon_skill || 0,
      ballistic_skill: selectedType?.ballistic_skill || 0,
      strength: selectedType?.strength || 0,
      toughness: selectedType?.toughness || 0,
      wounds: selectedType?.wounds || 0,
      initiative: selectedType?.initiative || 0,
      attacks: selectedType?.attacks || 0,
      leadership: selectedType?.leadership || 0,
      cool: selectedType?.cool || 0,
      willpower: selectedType?.willpower || 0,
      intelligence: selectedType?.intelligence || 0,
      save: selectedType?.save ?? null,
    });

    return {
      id: tempId,
      fighter_name: fighterName,
      fighter_type_id: fighterTypeIdToUse,
      fighter_type: selectedType?.fighter_type || '',
      fighter_subtypes: selectedType?.fighter_subtypes || [],
      fighter_specialisation: selectedType?.specialisation ? {
        fighter_specialisation_id: selectedType.specialisation.id || '',
        fighter_specialisation: selectedType.specialisation.specialisation_name || '',
      } : undefined,
      credits: displayCost,
      ...stats,
      edition_slug: selectedType?.edition_slug ?? null,
      is_vehicle: selectedType?.is_vehicle ?? false,
      xp: selectedType?.starting_xp ?? 0,
      // Carried so the optimistic card reads N/A straight away for a type that
      // cannot gain XP, instead of showing 0 until the server response lands.
      starting_xp: selectedType?.starting_xp ?? null,
      kills: 0,
      weapons: optimisticWeapons,
      wargear: optimisticWargear,
      special_rules: selectedType?.special_rules || [],
      skills: {},
      advancements: { characteristics: {}, skills: {} },
      free_skill: selectedType?.free_skill || false,
      effects: createEmptyEffects(),
      base_stats: stats,
      current_stats: stats,
    } as FighterProps;
  };

  const addFighterMutation = useMutation({
    mutationFn: async (params: {
      fighter_name: string;
      fighter_type_id: string;
      gang_id: string;
      cost: number;
      selected_equipment: SelectedEquipmentItem[];
      default_equipment: SelectedEquipmentItem[];
      use_base_cost_for_rating: boolean;
      use_delegation_cost: boolean;
      fighter_gang_legacy_id?: string;
      selected_archetype_id?: string;
    }) => {
      const result = await addFighterToGang(params);
      if (!result.success) {
        throw new Error(result.error || `Failed to add ${noun.toLowerCase()}`);
      }
      return result;
    },
    onMutate: async (variables) => {
      closeModal();

      if (!optimisticUpdatesEnabled) {
        return { tempFighterId: null, cost: variables.cost, ratingCost: 0 };
      }

      tempIdCounter.current += 1;
      const tempFighterId = `temp-${tempIdCounter.current}`;
      const optimisticFighter = buildOptimisticFighter(tempFighterId);
      onFighterAdded(optimisticFighter, variables.cost);

      const selectedType = fighterTypes.find(t => t.id === variables.fighter_type_id);
      const actualBaseCost = getBaseCost(selectedType, variables.use_delegation_cost);
      const totalEquipmentCost = variables.selected_equipment.reduce((sum, item) => sum + item.cost * (item.quantity || 1), 0);
      const ratingCost = variables.use_base_cost_for_rating
        ? (actualBaseCost + totalEquipmentCost)
        : variables.cost;

      return { tempFighterId, cost: variables.cost, ratingCost };
    },
    onError: (error, _variables, context) => {
      if (context?.tempFighterId && onFighterRollback) {
        onFighterRollback(context.tempFighterId, context.cost, context.ratingCost);
      }
      toast.error(error instanceof Error ? error.message : `Failed to add ${noun.toLowerCase()}`);
    },
    onSuccess: (result, variables, context) => {
      if (!context || !result.data) return;
      const data = result.data;

      const selectedType = fighterTypes.find(t => t.id === variables.fighter_type_id);
      const realFighter = {
        ...buildFighterFromServerData(
          data as AddFighterServerData,
          variables.fighter_type_id,
          selectedType?.specialisation?.specialisation_name
        ),
        edition_slug: selectedType?.edition_slug ?? null,
        is_vehicle: selectedType?.is_vehicle ?? false
      };

      if (context.tempFighterId && onFighterReconcile) {
        onFighterReconcile(context.tempFighterId, realFighter);
      } else if (!context.tempFighterId) {
        onFighterAdded(realFighter, variables.cost);
      }

      if (data.created_beasts && data.created_beasts.length > 0) {
        data.created_beasts.forEach((beast: ExoticBeastServerData) => {
          const beastFighter = buildBeastFromServerData(beast);
          onFighterAdded(beastFighter, 0);
        });
      }

      if (result.warning) {
        toast.error(result.warning);
        return;
      }

      toast.success(`${data.fighter_name} added successfully${data.created_beasts?.length ? ` with ${data.created_beasts.length} ${beastSubtypeName(editionSlug).toLowerCase()}(s)` : ''}`);
    },
  });

  const handleAddFighter = async () => {
    if (!fighterName || !fighterCost) {
      setFetchError('Please fill in all fields');
      return false;
    }

    const fighterTypeIdToUse = selectedSpecialisationId || selectedFighterTypeId;
    if (!fighterTypeIdToUse) {
      setFetchError(`Please select a ${noun.toLowerCase()} type`);
      return false;
    }

    const enteredCost = parseInt(fighterCost);
    if (enteredCost > 0 && initialCredits < enteredCost) {
      setFetchError(`Not enough credits to add this ${noun.toLowerCase()}`);
      return false;
    }

    const fighterTypeForEquipment = fighterTypes.find(t => t.id === fighterTypeIdToUse);
    const defaultEquipment: SelectedEquipmentItem[] = fighterTypeForEquipment?.default_equipment?.map((item: any) => ({
      equipment_id: item.id,
      cost: item.cost || 0,
      quantity: 1,
      is_editable: item.is_editable || false,
    })) || [];

    addFighterMutation.mutate({
      fighter_name: fighterName,
      fighter_type_id: fighterTypeIdToUse,
      gang_id: gangId,
      cost: enteredCost,
      selected_equipment: selectedEquipment,
      default_equipment: defaultEquipment,
      use_base_cost_for_rating: useBaseCostForRating,
      use_delegation_cost: useDelegationCost,
      fighter_gang_legacy_id: selectedLegacyId || undefined,
      selected_archetype_id: canUseArchetypes ? (selectedArchetypeId || undefined) : undefined,
    });

    return true;
  };

  const closeModal = () => {
    setShowModal(false);
    setFighterName('');
    setSelectedFighterTypeId('');
    setSelectedSubtype('');
    setSelectedSpecialisationId('');
    setAvailableSpecialisations([]);
    setFighterCost('');
    setSelectedEquipmentIds([]);
    setSelectedEquipment([]);
    setSelectedLegacyId('');
    setSelectedArchetypeId('');
    setUseBaseCostForRating(true);
    setUseDelegationCost(false);
    setIncludeCustomFighters(false);
    setIncludeAllFighterTypes(false);
    setFetchError(null);
  };

  const availableLegacies = currentFighterType?.available_legacies || [];
  const delegationType = fighterTypes.find(t => t.id === (selectedSpecialisationId || selectedFighterTypeId));
  const selectedEquipmentCost = selectedEquipment.reduce((sum, item) => sum + item.cost * item.quantity, 0);

  // A `single` category with no default requires an explicit selection.
  const requiredSelectionMissing = (() => {
    const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
    if (!selectedType?.equipment_selection) return false;
    const normalized: NormalizedEquipmentSelection = normalizeEquipmentSelection(selectedType.equipment_selection);
    for (const [categoryId, categoryData] of Object.entries(normalized)) {
      const selectType = categoryData.select_type || 'optional';
      if (selectType === 'single' &&
          (!categoryData.default || categoryData.default.length === 0) &&
          categoryData.options && categoryData.options.length > 0) {
        const selectedFromCategory = selectedEquipmentIds.some(id =>
          categoryData.options?.some((opt: EquipmentOption) => `${categoryId}-${opt.id}` === id)
        );
        if (!selectedFromCategory) return true;
      }
    }
    return false;
  })();

  const buildCategoryOptions = () => {
    const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

    for (const category of N26_ADDITION_CATEGORIES) {
      const hasTypes = fighterTypes.some((type) => matchesAdditionCategory(type, category.value));
      if (!hasTypes) continue;
      options.push({
        value: category.value,
        label: category.label,
        displayValue: category.label,
      });
    }

    const hasMisc = fighterTypes.some((type) => matchesAdditionCategory(type, 'misc'));
    if (hasMisc) {
      options.push({
        value: 'misc',
        label: 'Misc.',
        displayValue: 'Misc.',
      });
    }

    groupAlliancesByType(alliances, editionSlug).forEach(({ group, alliances: alliancesInGroup }) => {
      const header = `Alliances: ${group}`;
      options.push({
        value: `header-${header}`,
        label: <span className="font-bold">{header}</span>,
        displayValue: header,
        disabled: true,
      });
      alliancesInGroup.forEach((alliance) => {
        const label = alliance.alliance_crew_name || alliance.alliance_name;
        options.push({
          value: `alliance:${alliance.id}`,
          label: <span className="ml-3">{label}</span>,
          displayValue: label,
        });
      });
    });

    return options;
  };

  const buildSubtypeOptions = () => {
    if (isCategoryAdditions) return buildCategoryOptions();

    const nonAlliances = fighterTypes.filter(t => !t.alliance_id);
    const allianceFighterTypes = fighterTypes.filter(t => t.alliance_id);

    const groupLabelConfig = [
      { label: 'Hangers-on & Brutes', maxRank: 2, alliance: false },
      { label: 'Vehicle Crews', maxRank: 10, alliance: false },
      { label: 'Hired Guns', maxRank: 29, alliance: false },
      { label: 'Equipment', maxRank: 39, alliance: false },
      { label: 'Misc.', maxRank: Infinity, alliance: false },
      { label: 'Alliances: Criminal Organisations', maxRank: 49, alliance: true },
      { label: 'Alliances: Merchant Guilds', maxRank: 59, alliance: true },
      { label: 'Alliances: Noble Houses', maxRank: 69, alliance: true },
      { label: 'Alliances: Other', maxRank: Infinity, alliance: true },
    ];

    const getGroupLabelFromRank = (rank: number, isAlliance: boolean): string => {
      for (const entry of groupLabelConfig) {
        if (entry.alliance === isAlliance && rank <= entry.maxRank) return entry.label;
      }
      return 'Misc.';
    };

    const groupLabelRank: Record<string, number> = Object.fromEntries(
      groupLabelConfig.map((entry, index) => [entry.label, index + 1])
    );

    const nonAllianceGroups = nonAlliances.reduce((groups, type) => {
      const { label: subtypeName, rank } = bestRankedLabel(type.fighter_subtypes, gangAdditionRank);
      const groupLabel = getGroupLabelFromRank(rank, false);
      if (!groups[groupLabel]) groups[groupLabel] = new Set();
      groups[groupLabel].add(subtypeName);
      return groups;
    }, {} as Record<string, Set<string>>);

    const allianceGroups = allianceFighterTypes.reduce((groups, type) => {
      const crewName = type.alliance_crew_name || 'Unnamed Delegation';
      const rank = gangAdditionRank[crewName.toLowerCase()] ?? Infinity;
      const groupLabel = getGroupLabelFromRank(rank, true);
      if (!groups[groupLabel]) groups[groupLabel] = new Set();
      groups[groupLabel].add(crewName);
      return groups;
    }, {} as Record<string, Set<string>>);

    const mergedGroups: Record<string, Set<string>> = {};
    [nonAllianceGroups, allianceGroups].forEach(source => {
      for (const [label, set] of Object.entries(source)) {
        if (!mergedGroups[label]) mergedGroups[label] = new Set(set);
        else set.forEach(v => mergedGroups[label].add(v));
      }
    });

    const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];
    Object.entries(mergedGroups)
      .sort(([a], [b]) => (groupLabelRank[a] ?? 999) - (groupLabelRank[b] ?? 999))
      .forEach(([groupLabel, subtypeSet]) => {
        options.push({
          value: `header-${groupLabel}`,
          label: <span className="font-bold">{groupLabel}</span>,
          displayValue: groupLabel,
          disabled: true,
        });
        Array.from(subtypeSet)
          .sort((a, b) => (gangAdditionRank[a.toLowerCase()] ?? Infinity) - (gangAdditionRank[b.toLowerCase()] ?? Infinity))
          .forEach(subtypeName => {
            options.push({
              value: subtypeName,
              label: <span className="ml-3">{subtypeName}</span>,
              displayValue: subtypeName,
            });
          });
      });
    return options;
  };

  const buildTypeOptions = () => {
    const typeSubtypeMap = new Map<string, { fighter: FighterType; cost: number }>();
    filteredTypes.forEach(fighter => {
      const key = `${fighter.fighter_type}-${fighter.fighter_subtypes?.join(',')}`;
      if (!typeSubtypeMap.has(key)) {
        typeSubtypeMap.set(key, { fighter, cost: fighter.total_cost });
      } else {
        const current = typeSubtypeMap.get(key)!;
        if (!fighter.specialisation && current.fighter.specialisation) {
          typeSubtypeMap.set(key, { fighter, cost: fighter.total_cost });
        } else if (fighter.total_cost < current.cost) {
          typeSubtypeMap.set(key, { fighter, cost: fighter.total_cost });
        }
      }
    });

    const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

    if (isAdditions) {
      // Group by alignment (Law Abiding / Outlaw / Unaligned)
      const groupedByAlignment = Array.from(typeSubtypeMap.values()).reduce((groups, { fighter, cost }) => {
        const alignment = fighter.alignment?.toLowerCase() ?? 'unaligned';
        if (!groups[alignment]) groups[alignment] = [];
        groups[alignment].push({ fighter, cost });
        return groups;
      }, {} as Record<string, Array<{ fighter: FighterType; cost: number }>>);

      const alignmentOrder: Record<string, number> = { 'law abiding': 1, outlaw: 2, unaligned: 3 };
      const alignmentDisplayNames: Record<string, string> = { 'law abiding': 'Law Abiding', outlaw: 'Outlaw', unaligned: 'Unaligned' };

      Object.keys(groupedByAlignment)
        .sort((a, b) => (alignmentOrder[a] ?? 4) - (alignmentOrder[b] ?? 4))
        .forEach(alignment => {
          const fighters = groupedByAlignment[alignment].sort((a, b) => a.fighter.fighter_type.localeCompare(b.fighter.fighter_type));
          options.push({
            value: `header-${alignment}`,
            label: <span className="font-bold">{alignmentDisplayNames[alignment] ?? alignment}</span>,
            displayValue: alignmentDisplayNames[alignment] ?? alignment,
            disabled: true,
          });
          fighters.forEach(({ fighter, cost }) => {
            const delegationCost = fighter.delegation_cost;
            const costDisplay = delegationCost ? `${cost} / ${delegationCost} credits` : `${cost} credits`;
            const displayName = `${fighter.limitation && fighter.limitation > 0 ? `0-${fighter.limitation} ` : ''}${fighter.fighter_type} - ${costDisplay}`;
            options.push({ value: fighter.id, label: <span className="ml-3">{displayName}</span>, displayValue: displayName });
          });
        });
      return options;
    }

    const sortFighters = (a: { fighter: FighterType; cost: number }, b: { fighter: FighterType; cost: number }) => {
      const subtypeRankA = getFighterSubtypeSortRank(a.fighter.fighter_subtypes, a.fighter.edition_slug);
      const subtypeRankB = getFighterSubtypeSortRank(b.fighter.fighter_subtypes, b.fighter.edition_slug);
      if (subtypeRankA !== subtypeRankB) return subtypeRankA - subtypeRankB;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.fighter.fighter_type.localeCompare(b.fighter.fighter_type);
    };

    if (includeAllFighterTypes) {
      const groupedByGangType = Array.from(typeSubtypeMap.values()).reduce((groups, { fighter, cost }) => {
        const gangTypeName = fighter.gang_type || 'Unknown';
        if (!groups[gangTypeName]) groups[gangTypeName] = [];
        groups[gangTypeName].push({ fighter, cost });
        return groups;
      }, {} as Record<string, Array<{ fighter: FighterType; cost: number }>>);

      Object.keys(groupedByGangType).sort((a, b) => a.localeCompare(b)).forEach(gangTypeName => {
        const fighters = groupedByGangType[gangTypeName].sort(sortFighters);
        options.push({
          value: `header-gang-${gangTypeName}`,
          label: <span className="font-bold">{gangTypeName}</span>,
          displayValue: gangTypeName,
          disabled: true,
        });
        fighters.forEach(({ fighter, cost }) => {
          const displayName = `${fighter.fighter_type} (${fighter.fighter_subtypes?.join(', ')}) - ${cost} credits`;
          options.push({ value: fighter.id, label: <span className="ml-3">{displayName}</span>, displayValue: displayName });
        });
      });
      return options;
    }

    // Default grouping: regular vs custom
    const groupedByType = Array.from(typeSubtypeMap.values()).reduce((groups, { fighter, cost }) => {
      const groupKey = fighter.is_custom_fighter ? 'custom' : 'regular';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({ fighter, cost });
      return groups;
    }, {} as Record<string, Array<{ fighter: FighterType; cost: number }>>);

    const groupDisplayNames: Record<string, string> = { regular: `${noun} Types`, custom: `Custom ${noun} Types` };
    const hasMultipleGroups = Object.keys(groupedByType).length > 1;
    const sortedGroups = Object.keys(groupedByType).sort((a, b) => (fighterTypeRank[a] ?? 999) - (fighterTypeRank[b] ?? 999));

    if (sortedGroups.length === 0) return options;

    if (!hasMultipleGroups) {
      const fighters = (groupedByType[sortedGroups[0]] || []).sort(sortFighters);
      fighters.forEach(({ fighter, cost }) => {
        options.push({ value: fighter.id, label: `${fighter.fighter_type} (${fighter.fighter_subtypes?.join(', ')}) - ${cost} credits` });
      });
      return options;
    }

    sortedGroups.forEach(groupKey => {
      const fighters = (groupedByType[groupKey] || []).sort(sortFighters);
      options.push({
        value: `header-${groupKey}`,
        label: <span className="font-bold">{groupDisplayNames[groupKey]}</span>,
        displayValue: groupDisplayNames[groupKey],
        disabled: true,
      });
      fighters.forEach(({ fighter, cost }) => {
        const displayName = `${fighter.fighter_type} (${fighter.fighter_subtypes?.join(', ')}) - ${cost} credits`;
        options.push({ value: fighter.id, label: <span className="ml-3">{displayName}</span>, displayValue: displayName });
      });
    });
    return options;
  };

  const buildSpecialisationOptions = () => {
    const lowestSpecialisationCost = Math.min(
      ...availableSpecialisations.map(sub => fighterTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity)
    );
    return [...availableSpecialisations]
      .sort((a, b) => {
        const aName = a.specialisation_name.toLowerCase();
        const bName = b.specialisation_name.toLowerCase();
        if (aName === 'default') return -1;
        if (bName === 'default') return 1;
        const aCost = fighterTypes.find(ft => ft.id === a.id)?.total_cost ?? 0;
        const bCost = fighterTypes.find(ft => ft.id === b.id)?.total_cost ?? 0;
        if (aCost !== bCost) return aCost - bCost;
        return aName.localeCompare(bName);
      })
      .map(specialisation => {
        const specialisationCost = fighterTypes.find(ft => ft.id === specialisation.id)?.total_cost ?? 0;
        const diff = specialisationCost - lowestSpecialisationCost;
        const costLabel = diff === 0 ? '(+0 credits)' : (diff > 0 ? `(+${diff} credits)` : `(${diff} credits)`);
        const displayName = specialisation.specialisation_name === 'Default' ? 'Default' : specialisation.specialisation_name;
        return { value: specialisation.id, label: `${displayName} ${costLabel}` };
      });
  };

  const modalContent = (
    <div className="space-y-4">
      {/* Category (N26) / Fighter Subtype (N23) — additions catalog only */}
      {isAdditions && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">
            {isCategoryAdditions ? 'Category *' : 'Fighter Subtype *'}
          </label>
          <Combobox
            value={selectedSubtype}
            onValueChange={(value) => {
              setSelectedSubtype(value);
              setSelectedFighterTypeId('');
              setSelectedSpecialisationId('');
              setAvailableSpecialisations([]);
              setSelectedEquipmentIds([]);
              setSelectedEquipment([]);
              setFighterCost('');
            }}
            placeholder={isCategoryAdditions ? 'Select Category' : 'Select Fighter Subtype'}
            options={buildSubtypeOptions()}
          />
          {/* N23 navigates by raw subtype, N26 by category value. */}
          {(selectedSubtype === 'Exotic Beast' || selectedSubtype === 'pet') && (
            <p className="text-amber-500 text-xs">
              {beastSubtypeName(editionSlug)}s should be acquired by adding them as Equipment to a fighter, which automatically creates their Fighter card. They are listed here to allow flexibility and house rules.
            </p>
          )}
        </div>
      )}

      {/* Fighter Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">{noun} Type *</label>
        <Combobox
          value={selectedFighterTypeId}
          onValueChange={handleSelectFighterType}
          placeholder={`Select ${noun.toLowerCase()} type`}
          disabled={isAdditions && !selectedSubtype}
          options={buildTypeOptions()}
        />

        {/* Include Custom Fighter Types */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-custom-fighters"
            checked={includeCustomFighters}
            onCheckedChange={(checked) => {
              setIncludeCustomFighters(checked as boolean);
              if (isAdditions) {
                setSelectedSubtype('');
                setSelectedFighterTypeId('');
                setSelectedSpecialisationId('');
                setAvailableSpecialisations([]);
                setSelectedEquipmentIds([]);
                setSelectedEquipment([]);
              }
            }}
          />
          <label htmlFor="include-custom-fighters" className="text-sm font-medium text-muted-foreground cursor-pointer">
            Include Custom {noun} Types
          </label>
          <div className="relative group">
            <ImInfo tabIndex={0} className="outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm" />
            <div className="absolute bottom-full mb-2 hidden group-hover:block group-focus-within:block bg-black text-white text-xs p-2 rounded-sm w-72 -left-36 z-50">
              When enabled, your custom {noun.toLowerCase()} types will be included in the {noun.toLowerCase()} type dropdown. Only custom {noun.toLowerCase()}s matching this gang type will be shown.
            </div>
          </div>
        </div>

        {/* Include All Fighter Types (roster catalog only) */}
        {!isAdditions && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-all-fighter-types"
              checked={includeAllFighterTypes}
              onCheckedChange={(checked) => {
                setIncludeAllFighterTypes(checked as boolean);
                setSelectedFighterTypeId('');
                setSelectedSpecialisationId('');
                setSelectedEquipmentIds([]);
                setSelectedEquipment([]);
                setFighterCost('');
              }}
            />
            <label htmlFor="include-all-fighter-types" className="text-sm font-medium text-muted-foreground cursor-pointer">
              Include all {noun} Types
            </label>
            <div className="relative group">
              <ImInfo tabIndex={0} className="outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm" />
              <div className="absolute bottom-full mb-2 hidden group-hover:block group-focus-within:block bg-black text-white text-xs p-2 rounded-sm w-72 -left-36 z-50">
                When enabled, {noun.toLowerCase()} types from all gangs will be shown.{!isVehicles && ' Gang additions are found in the "Gang Additions" menu.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fighter specialisation */}
      {availableSpecialisations.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Fighter Specialisation *</label>
          <Combobox
            value={selectedSpecialisationId}
            onValueChange={handleSelectSpecialisation}
            placeholder="Select fighter specialisation"
            options={buildSpecialisationOptions()}
          />
        </div>
      )}

      {/* Gang Legacy (data-driven) */}
      {availableLegacies.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Gang Legacy</label>
          <Combobox
            value={selectedLegacyId}
            onValueChange={setSelectedLegacyId}
            placeholder="No Legacy"
            options={[
              { value: '', label: 'No Legacy' },
              ...availableLegacies.map((legacy) => ({ value: legacy.id, label: legacy.name })),
            ]}
          />
        </div>
      )}

      {/* Archetype (data-driven) */}
      {canUseArchetypes && (
        <div className="space-y-2">
          <label htmlFor="add-fighter-archetype" className="block text-sm font-medium text-muted-foreground">Archetype</label>
          <Combobox
            id="add-fighter-archetype"
            value={selectedArchetypeId}
            onValueChange={setSelectedArchetypeId}
            placeholder="None"
            clearable
            options={[
              { value: '', label: 'None' },
              ...(archetypesData?.archetypes?.map((archetype: Archetype) => ({ value: archetype.id, label: archetype.name })) || []),
            ]}
          />
          <p className="text-xs text-muted-foreground">Selecting an archetype will set the fighter&apos;s skill access.</p>
        </div>
      )}

      {/* Equipment selection */}
      <EquipmentSelection
        equipmentSelection={fighterTypes.find(t => t.id === selectedFighterTypeId)?.equipment_selection}
        selectedEquipmentIds={selectedEquipmentIds}
        setSelectedEquipmentIds={setSelectedEquipmentIds}
        selectedEquipment={selectedEquipment}
        setSelectedEquipment={setSelectedEquipment}
        setFighterCost={setFighterCost}
        editionSlug={currentEditionSlug}
      />

      {/* Cost */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">Cost (credits) *</label>
        <Input
          type="number"
          placeholder={`Enter ${noun.toLowerCase()} cost`}
          value={fighterCost}
          onChange={(e) => setFighterCost(e.target.value)}
          className="w-full"
          min={0}
        />
        {currentFighterType && (
          <p className="text-sm text-muted-foreground">
            Base cost: {getBaseCost(currentFighterType, useDelegationCost)} credits
            {selectedEquipmentCost > 0 && <> | Equipment cost: {selectedEquipmentCost} credits</>}
          </p>
        )}

        {/* Use Delegation Cost (data-driven) */}
        {delegationType?.delegation_cost ? (
          <div className="flex items-center space-x-2 mb-4 mt-2">
            <Checkbox
              id="use-delegation-cost"
              checked={useDelegationCost}
              onCheckedChange={(checked) => {
                const isDelegation = checked as boolean;
                setUseDelegationCost(isDelegation);
                const baseCost = isDelegation ? delegationType.delegation_cost! : delegationType.total_cost;
                setFighterCost(String(baseCost + selectedEquipmentCost));
              }}
            />
            <label htmlFor="use-delegation-cost" className="text-sm font-medium text-muted-foreground cursor-pointer">
              Use Delegation Cost
            </label>
          </div>
        ) : null}

        {/* Use Listed Cost for Rating */}
        <div className="flex items-center space-x-2 mb-4 mt-2">
          <Checkbox
            id="use-base-cost-for-rating"
            checked={useBaseCostForRating}
            onCheckedChange={(checked) => setUseBaseCostForRating(checked as boolean)}
          />
          <label htmlFor="use-base-cost-for-rating" className="text-sm font-medium text-muted-foreground cursor-pointer">
            Use Listed Cost for Rating
          </label>
          <div className="relative group">
            <ImInfo tabIndex={0} className="outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm" />
            <div className="absolute bottom-full mb-2 hidden group-hover:block group-focus-within:block bg-neutral-900 text-white text-xs p-2 rounded-sm w-72 -left-36 z-50">
              When enabled, the {noun.toLowerCase()}&apos;s rating is calculated using their listed cost, even if you paid a different amount. Disable this if you want the rating to reflect the price actually paid.
            </div>
          </div>
        </div>
      </div>

      {/* Fighter Name */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground">{noun} Name *</label>
        <Input
          type="text"
          placeholder={`Enter ${noun.toLowerCase()} name`}
          value={fighterName}
          onChange={(e) => setFighterName(e.target.value)}
          className="w-full"
        />
      </div>

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  return (
    <Modal
      title={isAdditions ? 'Gang Additions' : `Add ${noun}`}
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">{initialCredits}</span>
        </div>
      }
      content={modalContent}
      onClose={closeModal}
      onConfirm={handleAddFighter}
      confirmText={`Add ${noun}`}
      confirmDisabled={
        addFighterMutation.isPending ||
        !selectedFighterTypeId || !fighterName || !fighterCost ||
        (availableSpecialisations.length > 0 && !selectedSpecialisationId) ||
        requiredSelectionMissing
      }
    />
  );
}
