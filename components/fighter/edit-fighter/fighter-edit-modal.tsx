import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { saveFighterSkillAccessOverrides } from '@/app/actions/fighter-skill-access';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { FighterProps as Fighter, Archetype } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { HiX } from "react-icons/hi";
import { toast } from 'sonner';
import { applySpecialRulesModifiers } from '@/utils/effect-modifiers';
import { fighterSubtypeRank } from '@/utils/fighterSubtypeRank';
import { isArchetypeEligible, mapArchetypeSkillAccessToOverrides } from '@/utils/archetypeEligibility';
import { SkillAccessModal } from './skill-access-modal';
import { FighterCharacteristicTable } from './fighter-characteristic-table';
import { CharacterStatsModal } from './character-stats-modal';

const normalizeSpecialRule = (rule: string) => rule.replace(/^"|"$/g, '');


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
  
  const { data: fetchedFighterTypes } = useQuery({
    queryKey: ['fighter-types-edit', gangId, gangTypeId, customGangTypeId],
    queryFn: async () => {
      const params = new URLSearchParams({
        gang_id: gangId,
        is_gang_addition: 'false'
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
  const [selectedSpecialisationId, setSelectedSpecialisationId] = useState<string>((fighter.fighter_specialisation as any)?.fighter_specialisation_id || '');
  
  // Add state for available specialisations
  const [availableSpecialisations, setAvailableSpecialisations] = useState<Array<{ value: string; label: string; cost?: number; fighterTypeId?: string }>>([]);
  
  // Add state for gang legacy
  const [selectedGangLegacyId, setSelectedGangLegacyId] = useState<string>((fighter as any).fighter_gang_legacy_id || '');
  const [availableLegacies, setAvailableLegacies] = useState<Array<{ id: string; name: string }>>([]);
  
  // Track if fighter type has been explicitly selected in this session
  const [hasExplicitlySelectedType, setHasExplicitlySelectedType] = useState(false);

  // Pending stat adjustments (draft only, persisted on main confirm)
  const [pendingStatAdjustments, setPendingStatAdjustments] = useState<Record<string, number>>({});

  // State for skill access modal
  const [showSkillAccessModal, setShowSkillAccessModal] = useState(false);

  // State for fighter subtype selection
  const [selectedFighterSubtypeId, setSelectedFighterSubtypeId] = useState<string>('');

  // State for archetype selection - initialize from fighter's saved archetype
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(fighter.selected_archetype_id || '');

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

  // Compute the default fighter subtype name from the currently selected fighter type
  const defaultFighterSubtypeName = useMemo(() => {
    if (selectedFighterTypeId && fighterTypes.length > 0) {
      const selectedType = fighterTypes.find(ft => ft.id === selectedFighterTypeId);
      if (selectedType) return selectedType.fighter_subtypes[0] || 'Unknown';
    }
    return fighter.fighter_subtypes?.[0] || 'Unknown';
  }, [selectedFighterTypeId, fighterTypes, fighter.fighter_subtypes]);

  // The effective fighter subtype: override if selected, otherwise default from type
  const effectiveFighterSubtype = useMemo(() => {
    if (selectedFighterSubtypeId && allFighterSubtypes) {
      const overrideSubtype = allFighterSubtypes.find(fc => fc.id === selectedFighterSubtypeId);
      if (overrideSubtype) return overrideSubtype.subtype_name;
    }
    return defaultFighterSubtypeName;
  }, [selectedFighterSubtypeId, allFighterSubtypes, defaultFighterSubtypeName]);

  // Resolve the effective fighter type for default special rules (specialisation aware)
  const effectiveFighterType = useMemo(() => {
    if (!selectedFighterTypeId || fighterTypes.length === 0) return null;

    const selectedFighterType = fighterTypes.find(ft => ft.id === selectedFighterTypeId);
    if (!selectedFighterType) return null;

    if (selectedSpecialisationId !== '') {
      const foundSpecialisation = availableSpecialisations.find(st => st.value === selectedSpecialisationId);
      if (foundSpecialisation?.fighterTypeId) {
        return fighterTypes.find(ft => ft.id === foundSpecialisation.fighterTypeId) ?? selectedFighterType;
      }
    } else if (availableSpecialisations.length > 0) {
      const defaultOption = availableSpecialisations.find(st => st.value === '');
      if (defaultOption?.fighterTypeId) {
        return fighterTypes.find(ft => ft.id === defaultOption.fighterTypeId) ?? selectedFighterType;
      }
    }

    return selectedFighterType;
  }, [selectedFighterTypeId, selectedSpecialisationId, availableSpecialisations, fighterTypes]);

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

  // Determine if this fighter can use archetypes (Outcasts gang + Leader/Champion subtype)
  const canUseArchetypes = isArchetypeEligible({
    gangTypeId,
    fighterSubtype: effectiveFighterSubtype || fighter.fighter_subtypes?.[0],
  });

  // Fetch archetypes using TanStack Query (only if eligible and modal is open)
  const { data: archetypesData } = useQuery({
    queryKey: ['skill-archetypes', selectedFighterSubtypeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedFighterSubtypeId) {
        params.set('fighter_subtype_id', selectedFighterSubtypeId);
      }
      const response = await fetch(`/api/fighters/skill-archetypes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch archetypes');
      return response.json();
    },
    enabled: isOpen && canUseArchetypes,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

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
      return result.data?.fighter;
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
        ...(submit.fighter_type && (submit.fighter_type_id || submit.custom_fighter_type_id)
          ? {
              fighter_type: { fighter_type: submit.fighter_type, fighter_type_id: submit.fighter_type_id ?? null, gang_type_id: (submit as any).gang_type_id ?? null, custom_gang_type_id: (submit as any).custom_gang_type_id ?? null } as any,
              custom_fighter_type_id: submit.custom_fighter_type_id ?? null,
              fighter_type_id: submit.fighter_type_id ?? null,
            }
          : {}),
        ...(submit.fighter_specialisation && submit.fighter_specialisation_id
          ? { fighter_specialisation: { fighter_specialisation: submit.fighter_specialisation, fighter_specialisation_id: submit.fighter_specialisation_id } as any }
          : {}),
        ...(submit.fighter_gang_legacy_id !== undefined
          ? { fighter_gang_legacy_id: submit.fighter_gang_legacy_id as any }
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
    onSuccess: async (serverFighter, submit, ctx) => {
      if (ctx && 'optimistic' in (ctx as any) && 'snapshot' in (ctx as any)) {
        onEditSuccess?.(serverFighter, (ctx as any).optimistic, (ctx as any).snapshot);
      }

      // If archetype changed, save the skill access overrides
      if (submit.selected_archetype_id !== fighter.selected_archetype_id) {
        try {
          if (submit.selected_archetype_id && archetypesData?.archetypes) {
            const archetype = (archetypesData.archetypes as Archetype[]).find(
              (a: Archetype) => a.id === submit.selected_archetype_id
            );
            if (archetype) {
              const overrides = mapArchetypeSkillAccessToOverrides(archetype.skill_access);

              await saveFighterSkillAccessOverrides({ fighter_id: fighter.id, overrides });
            }
          } else if (!submit.selected_archetype_id && fighter.selected_archetype_id) {
            // Archetype removed - clear all overrides (reset to default)
            await saveFighterSkillAccessOverrides({ fighter_id: fighter.id, overrides: [] });
          }
        } catch (error) {
          console.error('Failed to save archetype skill access:', error);
          toast.error('Fighter updated but skill access save failed. Please try again via Customise Skill Set Access.');
          return; // Don't show success toast
        }
      }

      toast.success('Fighter updated successfully');
    }
  });

  // Initialize fighter state and specialisations when fighter or fighter types data changes
  const fighterInitKey = `${fighter.id}-${fighter.selected_archetype_id ?? ''}`;
  const [prevFighterInit, setPrevFighterInit] = useState({ key: fighterInitKey, fighterTypes });
  if (fighterInitKey !== prevFighterInit.key || fighterTypes !== prevFighterInit.fighterTypes) {
    setPrevFighterInit({ key: fighterInitKey, fighterTypes });
    setCurrentFighter(fighter);
    setSelectedFighterTypeId((fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '');
    setSelectedSpecialisationId((fighter.fighter_specialisation as any)?.fighter_specialisation_id || '');
    setSelectedGangLegacyId((fighter as any).fighter_gang_legacy_id || '');
    setSelectedArchetypeId(fighter.selected_archetype_id || '');
    setHasExplicitlySelectedType(false);
    if (fighter.fighter_subtypes?.length && allFighterSubtypes) {
      const subtypeMatch = allFighterSubtypes.find(fc => fighter.fighter_subtypes.includes(fc.subtype_name));
      if (subtypeMatch) setSelectedFighterSubtypeId(subtypeMatch.id);
    }
  }

  // Pre-populate current fighter type and specialisation when fighter types are loaded
  const fighterTypeInitData = useMemo(() => {
    if (fighterTypes.length === 0 || hasExplicitlySelectedType) return null;

    const currentFighterTypeId = (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id;
    if (!currentFighterTypeId) return null;

    const currentType = fighterTypes.find(ft => ft.id === currentFighterTypeId);
    if (!currentType) return null;

    const allVariantsOfType = fighterTypes.filter(ft =>
      ft.fighter_type === currentType.fighter_type &&
      ft.fighter_subtypes[0] === currentType.fighter_subtypes[0]
    );

    let dropdownType = allVariantsOfType.find(ft =>
      !(ft as any).specialisation || Object.keys((ft as any).specialisation).length === 0
    );

    if (!dropdownType && allVariantsOfType.length > 0) {
      dropdownType = allVariantsOfType.reduce((cheapest, current) =>
        current.total_cost < cheapest.total_cost ? current : cheapest
      );
    }

    const dropdownId = dropdownType ? dropdownType.id : currentFighterTypeId;

    const fighterTypeGroup = fighterTypes.filter(t =>
      t.fighter_type === currentType.fighter_type &&
      t.fighter_subtypes[0] === currentType.fighter_subtypes[0]
    );

    const specialisationOptions: Array<{ value: string; label: string; cost: number; fighterTypeId: string }> = [];
    const defaultFighterType = fighterTypeGroup.find(ft => !(ft as any).specialisation || Object.keys((ft as any).specialisation).length === 0);

    if (defaultFighterType) {
      specialisationOptions.push({
        value: '',
        label: 'Default',
        cost: 0,
        fighterTypeId: defaultFighterType.id
      });
    }

    fighterTypeGroup.forEach(ft => {
      const specialisationName = (ft as any).specialisation?.specialisation_name;
      const specialisationId = (ft as any).specialisation?.id;
      if (specialisationName && specialisationId) {
        specialisationOptions.push({
          value: specialisationId,
          label: specialisationName,
          cost: (ft as any).specialisation?.cost || 0,
          fighterTypeId: ft.id
        });
      }
    });

    specialisationOptions.sort((a, b) => {
      if (a.label === 'Default') return -1;
      if (b.label === 'Default') return 1;
      return a.label.localeCompare(b.label);
    });

    let resolvedSpecialisationId = '';
    if (fighter.fighter_specialisation?.fighter_specialisation_id) {
      const matchingFighterType = fighterTypes.find(ft =>
        ft.fighter_specialisation_id === fighter.fighter_specialisation?.fighter_specialisation_id
      );
      if (matchingFighterType) {
        resolvedSpecialisationId = matchingFighterType.fighter_specialisation_id || '';
      }
    }

    return {
      dropdownId,
      formUpdate: {
        fighter_type: currentType.fighter_type,
        fighter_subtypes: currentType.fighter_subtypes,
      },
      legacies: currentType.available_legacies || [],
      specialisationOptions,
      resolvedSpecialisationId,
    };
  }, [fighterTypes, fighter, hasExplicitlySelectedType]);

  const [prevFighterTypeInitData, setPrevFighterTypeInitData] = useState(fighterTypeInitData);
  if (fighterTypeInitData !== prevFighterTypeInitData) {
    setPrevFighterTypeInitData(fighterTypeInitData);
    if (fighterTypeInitData) {
      setSelectedFighterTypeId(fighterTypeInitData.dropdownId);
      setFormValues(prev => ({ ...prev, ...fighterTypeInitData.formUpdate }));
      setAvailableLegacies(fighterTypeInitData.legacies);
      setAvailableSpecialisations(fighterTypeInitData.specialisationOptions);
      setSelectedSpecialisationId(fighterTypeInitData.resolvedSpecialisationId);
    }
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

      // Update available legacies for the selected fighter type
      setAvailableLegacies(selectedType.available_legacies || []);

      // Get all fighters with the same fighter_type name and fighter_subtypes to check for specialisations
      const fighterTypeGroup = fighterTypes.filter(t =>
        t.fighter_type === selectedType.fighter_type &&
        t.fighter_subtypes[0] === selectedType.fighter_subtypes[0]
      );
      
      // If we have multiple entries with the same fighter_type + subtype, they represent different specialisations
      if (fighterTypeGroup.length > 1) {
        // Create specialisation options from all variants
        const specialisationOptions: Array<{ value: string; label: string; cost: number; fighterTypeId: string }> = [];
        
        // Find the default fighter type (the one with no specialisation)
        const defaultFighterType = fighterTypeGroup.find(ft => !(ft as any).specialisation || Object.keys((ft as any).specialisation).length === 0);
        
        // Only add "Default" option if there's actually a default fighter type
        if (defaultFighterType) {
          specialisationOptions.push({
            value: '', // Empty string represents "Default"
            label: 'Default',
            cost: 0,
            fighterTypeId: defaultFighterType.id
          });
        }
        
        fighterTypeGroup.forEach(ft => {
          // Use the actual specialisation data from the API response
          const specialisationName = (ft as any).specialisation?.specialisation_name;
          const specialisationId = (ft as any).specialisation?.id;
          
          if (specialisationName && specialisationId) {
            specialisationOptions.push({
              value: specialisationId,
              label: specialisationName,
              cost: (ft as any).specialisation?.cost || 0,
              fighterTypeId: ft.id
            });
          }
        });
        
        // Sort specialisations alphabetically (Default will always be first if it exists)
        specialisationOptions.sort((a, b) => {
          if (a.label === 'Default') return -1;
          if (b.label === 'Default') return 1;
          return a.label.localeCompare(b.label);
        });
        
        setAvailableSpecialisations(specialisationOptions);

        // Try to find a matching specialisation from the current fighter
        const currentSpecialisationName = fighter.fighter_specialisation?.fighter_specialisation || fighter.fighter_specialisation;
        if (currentSpecialisationName) {
          // Find the specialisation option that matches the current specialisation name
          const matchingSpecialisation = specialisationOptions.find(option => 
            option.label === currentSpecialisationName
          );
          
          if (matchingSpecialisation) {
            // Set the matching specialisation
            setSelectedSpecialisationId(matchingSpecialisation.value);
          } else {
            // No matching specialisation found, select Default
            setSelectedSpecialisationId('');
          }
        } else {
          // No current specialisation, select Default
          setSelectedSpecialisationId('');
        }
      } else {
        // Only one variant, no specialisations to choose from
        setAvailableSpecialisations([]);
        setSelectedSpecialisationId('');
      }
    }
  };
  
  // Add handler for specialisation change
  const handleSpecialisationChange = (specialisationId: string) => {
    setSelectedSpecialisationId(specialisationId);
    setSelectedSpecialRuleOption('');
    setCustomSpecialRule('');
  };

  // Add handler for gang legacy change
  const handleGangLegacyChange = (legacyId: string) => {
    setSelectedGangLegacyId(legacyId);
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
      
      // Get the selected specialisation details (without affecting fighter type)
      type Specialisation = { id: string; fighter_specialisation: string; cost: number; fighterTypeId: string; };
      let selectedSpecialisation: Specialisation | null = null;
      
      if (selectedSpecialisationId !== '') {
        // Find the specialisation in the currently available specialisations only
        const foundSpecialisation = availableSpecialisations.find(st => st.value === selectedSpecialisationId);
        if (foundSpecialisation) {
          selectedSpecialisation = {
            id: foundSpecialisation.value, // This will now be the correct specialisation_id
            fighter_specialisation: foundSpecialisation.label,
            cost: foundSpecialisation.cost || 0,
            fighterTypeId: foundSpecialisation.fighterTypeId || '' // Store the fighter_type_id
          };
        }
      } else if (selectedSpecialisationId === '') {
        // "Default" is selected
        const defaultOption = availableSpecialisations.find(st => st.value === '');
        selectedSpecialisation = {
          id: '',
          fighter_specialisation: 'Default',
          cost: 0,
          fighterTypeId: defaultOption ? defaultOption.fighterTypeId || '' : ''
        };
      }
      
      // Determine which fighter type to use for the update
      let fighterTypeToUse = null;
      let shouldUpdateFighterType = false;
      
      if (hasExplicitlySelectedType && selectedFighterType) {
        // User explicitly selected a new fighter type
        if (selectedSpecialisation && selectedSpecialisation.fighter_specialisation !== 'Default' && selectedSpecialisation.fighterTypeId) {
          // User also selected a specialisation - use the fighter type that contains that specialisation
          const fighterTypeWithSpecialisation = fighterTypes.find(ft => ft.id === selectedSpecialisation!.fighterTypeId);
          if (fighterTypeWithSpecialisation) {
            fighterTypeToUse = fighterTypeWithSpecialisation;
            shouldUpdateFighterType = true;
          }
        } else {
          // No specialisation selected or Default selected - use the selected fighter type
          fighterTypeToUse = selectedFighterType;
          shouldUpdateFighterType = true;
        }
      } else if (selectedSpecialisation) {
        // User changed specialisation (either explicitly or implicitly) - always update fighter type ID
        if (selectedSpecialisation.fighter_specialisation !== 'Default' && selectedSpecialisation.id) {
          // User selected a specific specialisation - find the fighter type with that specialisation
          
          // Get the actual fighter type and subtype values
          const currentFighterType = (fighter.fighter_type as any)?.fighter_type || fighter.fighter_type;
          const currentFighterSubtypes = fighter.fighter_subtypes || [];

          const availableFighterTypes = fighterTypes.filter(ft =>
            ft.fighter_type === currentFighterType && ft.fighter_subtypes[0] === currentFighterSubtypes[0]
          );

          const fighterTypeWithSpecialisation = fighterTypes.find(ft =>
            ft.fighter_specialisation_id === selectedSpecialisation!.id &&
            ft.fighter_type === currentFighterType &&
            ft.fighter_subtypes[0] === currentFighterSubtypes[0]
          );
          if (fighterTypeWithSpecialisation) {
            fighterTypeToUse = fighterTypeWithSpecialisation;
            shouldUpdateFighterType = true;
          }
        } else if (selectedSpecialisation.fighter_specialisation === 'Default' && selectedSpecialisation.fighterTypeId) {
          // User selected Default - use the fighter type ID from the Default option
          const defaultFighterType = fighterTypes.find(ft => ft.id === selectedSpecialisation!.fighterTypeId);
          if (defaultFighterType) {
            fighterTypeToUse = defaultFighterType;
            shouldUpdateFighterType = true;
          }
        }
      }
      
      // Call onSubmit with all values, including specialisation fields
      const submitData: any = {
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        kill_count: formValues.kill_count,
        costAdjustment: formValues.costAdjustment,
        special_rules: formValues.special_rules,
        fighter_gang_legacy_id: selectedGangLegacyId || null,
        selected_archetype_id: selectedArchetypeId || null
      };

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
          submitData.fighter_specialisation = selectedSpecialisation && selectedSpecialisation.fighter_specialisation !== 'Default' ? selectedSpecialisation.fighter_specialisation : null;
          submitData.fighter_specialisation_id = selectedSpecialisation && selectedSpecialisation.fighter_specialisation !== 'Default' ? selectedSpecialisation.id : null;
        }
      }

      // Apply the selected fighter subtype
      if (selectedFighterSubtypeId && allFighterSubtypes) {
        const selectedSubtype = allFighterSubtypes.find(fc => fc.id === selectedFighterSubtypeId);
        if (selectedSubtype) {
          submitData.fighter_subtypes = [selectedSubtype.subtype_name];
        } else {
          submitData.fighter_subtypes = fighter.fighter_subtypes;
        }
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
              <select
                id="fighter_type_id"
                value={selectedFighterTypeId}
                onChange={(e) => handleFighterTypeChange(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={false}
              >
                <option value="">
                  Select a fighter type
                </option>
                {(() => {
                  // Create a map to group fighters by type+subtype and find default version for each
                  const typeSubtypeMap = new Map();
                  
                  fighterTypes.forEach(fighter => {
                    const key = `${fighter.fighter_type}-${fighter.fighter_subtypes.join(',')}`;
                    
                    if (!typeSubtypeMap.has(key)) {
                      typeSubtypeMap.set(key, {
                        fighter: fighter,
                        cost: fighter.total_cost
                      });
                    } else {
                      const current = typeSubtypeMap.get(key);
                      
                      // Prefer fighters with empty specialisation (default version) for the main dropdown
                      const currentHasEmptySpecialisation = !(current.fighter as any).specialisation || Object.keys((current.fighter as any).specialisation).length === 0;
                      const fighterHasEmptySpecialisation = !(fighter as any).specialisation || Object.keys((fighter as any).specialisation).length === 0;
                      
                      if (fighterHasEmptySpecialisation && !currentHasEmptySpecialisation) {
                        // This fighter has empty specialisation, current doesn't - prefer this one
                        typeSubtypeMap.set(key, {
                          fighter: fighter,
                          cost: fighter.total_cost
                        });
                      } else if (currentHasEmptySpecialisation && !fighterHasEmptySpecialisation) {
                        // Current has empty specialisation, this one doesn't - keep current
                        // Do nothing
                      } else {
                        // Both have same specialisation status, take the cheaper option
                        if (fighter.total_cost < current.cost) {
                          typeSubtypeMap.set(key, {
                            fighter: fighter,
                            cost: fighter.total_cost
                          });
                        }
                      }
                    }
                  });
                  
                  // Convert the map values to an array and sort
                  return Array.from(typeSubtypeMap.values())
                    .sort((a, b) => {
                      const subtypeRankA = fighterSubtypeRank[(a.fighter.fighter_subtypes[0] || '').toLowerCase()] ?? Infinity;
                      const subtypeRankB = fighterSubtypeRank[(b.fighter.fighter_subtypes[0] || '').toLowerCase()] ?? Infinity;

                      if (subtypeRankA !== subtypeRankB) {
                        return subtypeRankA - subtypeRankB;
                      }

                      return a.cost - b.cost;
                    })
                    .map(({ fighter }) => {
                      const displayName = `${fighter.fighter_type} (${fighter.fighter_subtypes.join(', ')})`;
                      const gangVariantSuffix = (fighter as any).is_gang_variant ? ` - ${(fighter as any).gang_variant_name}` : '';
                      
                      
                      return (
                        <option key={fighter.id} value={fighter.id}>
                          {displayName}{gangVariantSuffix}
                        </option>
                      );
                    });
                })()}
              </select>
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
            
            {/* Specialisation Dropdown - show when we have specialisations (including Default) */}
            {selectedFighterTypeId && availableSpecialisations.length > 0 && (
              <div>
                <label htmlFor="fighter_specialisation_id" className="block text-sm font-medium mb-1">
                  Fighter Specialisation
                </label>
                <select
                  id="fighter_specialisation_id"
                  value={selectedSpecialisationId}
                  onChange={(e) => handleSpecialisationChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={false}
                >
                  {availableSpecialisations.map((specialisation) => (
                    <option key={specialisation.value} value={specialisation.value}>
                      {specialisation.label}
                    </option>
                  ))}
                </select>
                {(fighter as any).fighter_specialisation ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: {typeof (fighter as any).fighter_specialisation === 'object' 
                      ? (fighter as any).fighter_specialisation.specialisation_name || (fighter as any).fighter_specialisation.fighter_specialisation
                      : (fighter as any).fighter_specialisation}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: Default
                  </div>
                )}
              </div>
            )}
            
            {/* Fighter Subtype Override Dropdown */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Fighter Subtype
              </label>
              <select
                value={selectedFighterSubtypeId}
                onChange={(e) => {
                  setSelectedFighterSubtypeId(e.target.value);
                  setSelectedArchetypeId('');
                }}
                className="w-full p-2 border rounded-md"
              >
                {allFighterSubtypes
                  ?.filter(fc => !['*', 'Others', 'Special Terrain'].includes(fc.subtype_name))
                  ?.filter(fc => fc.subtype_name !== 'Exotic Beast Specialist' || fighter.fighter_subtypes?.includes('Exotic Beast'))
                  .map(fc => (
                    <option key={fc.id} value={fc.id}>{fc.subtype_name}</option>
                  ))}
              </select>
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

            {/* Archetype Selection (only for Underhive Outcasts Leader/Champion) */}
            {canUseArchetypes && (
              <div>
                <label htmlFor="archetype" className="block text-sm font-medium mb-1">
                  Archetype
                </label>
                <Combobox
                  id="archetype"
                  value={selectedArchetypeId}
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
        confirmDisabled={!formValues.name.trim()}
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
      />
    </>
  );
}
