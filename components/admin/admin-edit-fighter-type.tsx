'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { HiX } from "react-icons/hi";
import { LuTrash2 } from "react-icons/lu";
import { FighterType } from "@/types/fighter";
import { GangType } from "@/types/gang";
import { Equipment } from '@/types/equipment';
import { getSkillSetRank } from "@/utils/skillSetRank";
import { compareEquipmentCategories } from "@/utils/getEquipmentCategoryRank";
import { AdminFighterEquipmentSelection, EquipmentSelection, guiToDataModel, dataModelToGui } from "@/components/admin/admin-fighter-equipment-selection";
import { EditionSelect, useEditions } from '@/components/edition-select';
import { hasAlignment, hasSaveCharacteristic, allowsMultipleSubtypes, hasStartingXp, hasVehicles } from '@/types/edition';
import { toggleFighterSubtype } from '@/utils/fighter-subtype-picker';
import Modal from '@/components/ui/modal';

interface FighterSpecialisation {
  id: string;
  specialisation_name: string;
  fighterId?: string;
}

interface EquipmentWithId extends Equipment {
  id: string;
  edition_id?: string | null;
}

interface AdminEditFighterTypeModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

interface FighterSubtype {
  id: string;
  subtype_name: string;
  edition_id?: string | null;
}

interface SkillType {
  id: string;
  skill_type: string;
  edition_id?: string | null;
}

interface Skill {
  id: string;
  skill_name: string;
  skill_type_id: string;
}

/**
 * Folds newly fetched skills into the ones already held, keyed by id. The
 * skills list accumulates across every fighter type opened in the modal, so
 * appending blindly repeats a skill once per fighter type that carries it as a
 * default. Later entries win, keeping the freshest copy of a skill's metadata.
 */
function mergeSkillsById(previous: Skill[], incoming: Skill[]): Skill[] {
  const merged = new Map([...previous, ...incoming].map(skill => [skill.id, skill]));
  return Array.from(merged.values());
}

interface Specialisation {
  id: string;
  specialisation_name: string;
}

// Add this interface to track fighter type+subtype combinations
interface FighterTypeCombo {
  type: string;
  subtype: string;
  gang_type_id: string;
}

/**
 * Renders a fighter type's subtypes as the single string that identifies it in
 * the "Select Fighter Type to Edit" dropdown. Combos are packed into a
 * `type|subtype|gang_type_id` string, and "|" never appears in a subtype name, so
 * joining on ", " keeps the combo parseable while distinguishing fighter types
 * that share a first subtype but differ later in the list.
 */
function formatFighterSubtypes(fighterSubtypes?: string[] | null): string {
  return (fighterSubtypes ?? []).join(', ');
}

interface FighterTypeGangCost {
  id?: string;
  fighter_type_id: string;
  gang_type_id: string;
  adjusted_cost: number;
  gang_affiliation_id?: string | null;
}

interface GangAffiliation {
  id: string;
  name: string;
  fighter_type_id: string;
}

export function AdminEditFighterTypeModal({ onClose, onSubmit }: AdminEditFighterTypeModalProps) {
  const queryClient = useQueryClient();
  // Update state to track fighter type+subtype combinations
  const [selectedFighterTypeCombo, setSelectedFighterTypeCombo] = useState<string>('');

  // Keep existing state variables
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterType, setFighterType] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [delegationCost, setDelegationCost] = useState('');
  const [selectedFighterSubtypes, setSelectedFighterSubtypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSpecialisationId, setSelectedSpecialisationId] = useState<string>('');
  const [availableSpecialisations, setAvailableSpecialisations] = useState<FighterSpecialisation[]>([]);
  const [, startTransition] = useTransition();

  const [movement, setMovement] = useState('');
  const [weaponSkill, setWeaponSkill] = useState('');
  const [ballisticSkill, setBallisticSkill] = useState('');
  const [strength, setStrength] = useState('');
  const [toughness, setToughness] = useState('');
  const [wounds, setWounds] = useState('');
  const [initiative, setInitiative] = useState('');
  const [leadership, setLeadership] = useState('');
  const [cool, setCool] = useState('');
  const [willpower, setWillpower] = useState('');
  const [intelligence, setIntelligence] = useState('');
  const [attacks, setAttacks] = useState('');
  const [save, setSave] = useState('');
  const [startingXp, setStartingXp] = useState('');
  const [specialRules, setSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');
  const [freeSkill, setFreeSkill] = useState(false);
  const [isGangAddition, setIsGangAddition] = useState(false);
  const [isDramatisPersonae, setIsDramatisPersonae] = useState(false);
  const [isSpyrer, setIsSpyrer] = useState(false);
  const [isVehicle, setIsVehicle] = useState(false);
  const [alignment, setAlignment] = useState<string>('');
  const [equipment, setEquipment] = useState<EquipmentWithId[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [gangTypeFilter, setGangTypeFilter] = useState('');
  const [editionId, setEditionId] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [_selectedEquipmentType, _setSelectedEquipmentType] = useState('');
  const [equipmentListSelections, setEquipmentListSelections] = useState<string[]>([]);
  const [equipmentDiscounts, setEquipmentDiscounts] = useState<{
    equipment_id: string;
    adjusted_cost: number;
  }[]>([]);
  const [selectedAdjustedCostEquipment, setSelectedAdjustedCostEquipment] = useState('');
  const [adjustedCostAmount, setAdjustedCostAmount] = useState('');
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({});
  const [, setIsEquipmentLoaded] = useState(false);

  // Add a new state variable to track the specialisation name
  const [specialisationName, setSpecialisationName] = useState('');

  // Add new state for gang-specific costs
  const [showGangCostDialog, setShowGangCostDialog] = useState(false);
  const [selectedGangTypeForCost, setSelectedGangTypeForCost] = useState('');
  const [gangTypeCosts, setGangTypeCosts] = useState<FighterTypeGangCost[]>([]);
  const [selectedGangAffiliationForCost, setSelectedGangAffiliationForCost] = useState<string>('');
  
  // Add at the top of the AdminEditFighterTypeModal component, after other state declarations
  const [skillAccess, setSkillAccess] = useState<{
    skill_type_id: string;
    access_level: 'primary' | 'secondary' | 'allowed';
  }[]>([]);
  const [skillTypeToAdd, setSkillTypeToAdd] = useState<string>('');

  // IMPORTANT: We use uncontrolled inputs with refs for text fields to completely bypass React's
  // rendering cycle during typing, which dramatically improves performance. This prevents the
  // severe lag (1000ms+ per keystroke) that was happening with controlled inputs.
  // The main state is only updated on blur, significantly reducing unnecessary re-renders.

  // Add refs for the problematic input fields
  const fighterTypeInputRef = useRef<HTMLInputElement>(null);
  const specialisationNameInputRef = useRef<HTMLInputElement>(null);
  const gangAdjustedCostInputRef = useRef<HTMLInputElement>(null);
  
  // Add a ref to track if equipment categories have been loaded
  const hasLoadedEquipmentCategoriesRef = useRef(false);
  
  // Add a flag ref to prevent duplicate fetches
  const isFetchingFighterTypeDetailsRef = useRef(false);


  // Add a ref to track if a category was manually removed
  const userRemovedCategoryRef = useRef(false);

  // Track which skill IDs we've already fetched details for
  const fetchedSkillDetailsRef = useRef<Set<string>>(new Set());

  // When fighter type or specialisation values change from API, update the refs
  useEffect(() => {
    if (fighterTypeInputRef.current) {
      fighterTypeInputRef.current.value = fighterType;
    }
  }, [fighterType]);

  useEffect(() => {
    if (specialisationNameInputRef.current) {
      specialisationNameInputRef.current.value = specialisationName;
    }
  }, [specialisationName]);

  const { data: skillTypes = [] } = useQuery<SkillType[]>({
    queryKey: ['admin-skill-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/skill-types');
      if (!response.ok) throw new Error('Failed to fetch skill sets');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Memoize filtered skills to avoid recalculating on every render
  const availableSkills = useMemo(() => {
    if (!Array.isArray(skills)) return [];
    return skills.filter(skill =>
      skill.skill_type_id === selectedSkillType && !selectedSkills.includes(skill.id)
    );
  }, [skills, selectedSkills, selectedSkillType]);

  const fetchEquipmentByCategory = async () => {
    if (hasLoadedEquipmentCategoriesRef.current && equipment.length > 0) {
      return;
    }

    const wasLoading = isLoading;
    if (!wasLoading) {
      setIsLoading(true);
    }

    try {
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) {
        throw new Error(`Failed to fetch equipment: ${response.status} ${response.statusText}`);
      }

      const equipmentData = await response.json();

      const equipmentWithIds = equipmentData.map((item: any) => ({
        ...item,
        id: item.id,
        equipment_id: item.id
      })) as EquipmentWithId[];

      setEquipment(equipmentWithIds);
      hasLoadedEquipmentCategoriesRef.current = true;

      return equipmentWithIds;
    } catch (error) {
      console.error('Error fetching equipment data:', error);
      toast.error('Failed to load equipment data. Please try again.');
      throw error;
    } finally {
      if (!wasLoading) {
        setIsLoading(false);
      }
    }
  };

  // Preload equipment data when the component mounts
  useEffect(() => {
    if (hasLoadedEquipmentCategoriesRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/equipment');
        if (!response.ok || cancelled) return;
        const equipmentData = await response.json();
        if (cancelled) return;
        const equipmentWithIds = equipmentData.map((item: any) => ({
          ...item, id: item.id, equipment_id: item.id
        })) as EquipmentWithId[];
        setEquipment(equipmentWithIds);
        hasLoadedEquipmentCategoriesRef.current = true;
        setIsEquipmentLoaded(true);
      } catch {
        // Will retry when needed via fetchEquipmentByCategory
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { data: gangTypes = [] } = useQuery<GangType[]>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Edition filters gang types, fighter subtypes, equipment, and skill sets;
  // the fighter type's edition is still derived server-side from its gang type
  const { data: editions = [] } = useEditions();
  const editionSlug = editions.find(edition => edition.id === editionId)?.slug;
  const showSave = hasSaveCharacteristic(editionSlug);
  const allowMultipleSubtypes = allowsMultipleSubtypes(editionSlug);
  const showStartingXp = hasStartingXp(editionSlug);
  const showAlignment = hasAlignment(editionSlug);

  const { data: gangAffiliations = [] } = useQuery<GangAffiliation[]>({
    queryKey: ['admin-lineages', 'affiliation'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-lineages?type=affiliation');
      if (!response.ok) throw new Error('Failed to fetch gang affiliations');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: fighterSubtypes = [] } = useQuery<FighterSubtype[]>({
    queryKey: ['admin-fighter-subtypes'],
    queryFn: async () => {
      const response = await fetch('/api/admin/fighter-subtypes');
      if (!response.ok) throw new Error('Failed to fetch fighter subtypes');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredGangTypes = useMemo(
    () => editionId ? gangTypes.filter(type => type.edition_id === editionId) : gangTypes,
    [gangTypes, editionId]
  );

  const filteredFighterSubtypes = useMemo(
    () => editionId ? fighterSubtypes.filter(fc => fc.edition_id === editionId) : fighterSubtypes,
    [fighterSubtypes, editionId]
  );

  const fighterSubtypesForDisplay = useMemo(
    () => [...filteredFighterSubtypes].sort((a, b) => a.subtype_name.localeCompare(b.subtype_name)),
    [filteredFighterSubtypes]
  );

  const filteredSkillTypes = useMemo(
    () => editionId ? skillTypes.filter(type => type.edition_id === editionId) : skillTypes,
    [skillTypes, editionId]
  );

  const filteredEquipment = useMemo(
    () => editionId ? equipment.filter(item => item.edition_id === editionId) : equipment,
    [equipment, editionId]
  );

  // Memoize grouped skill types to avoid expensive computation on every render
  const groupedSkillTypes = useMemo(() => {
    const skillSetRank = getSkillSetRank(editionSlug);
    return Object.entries(
      [...filteredSkillTypes]
        .sort((a, b) => {
          const rankA = skillSetRank[a.skill_type.toLowerCase()] ?? Infinity;
          const rankB = skillSetRank[b.skill_type.toLowerCase()] ?? Infinity;
          return rankA - rankB;
        })
        .reduce((groups, type) => {
          const rank = skillSetRank[type.skill_type.toLowerCase()] ?? Infinity;
          let groupLabel = "Misc.";

          if (rank <= 19) groupLabel = "Universal Skills";
          else if (rank <= 39) groupLabel = "Gang-specific Skills";
          else if (rank <= 59) groupLabel = "Wyrd Powers";
          else if (rank <= 69) groupLabel = "Cult Wyrd Powers";
          else if (rank <= 79) groupLabel = "Psychoteric Whispers";
          else if (rank <= 89) groupLabel = "Legendary Names";
          else if (rank <= 99) groupLabel = "Ironhead Squat Mining Clans";

          if (!groups[groupLabel]) groups[groupLabel] = [];
          groups[groupLabel].push(type);
          return groups;
        }, {} as Record<string, SkillType[]>)
    );
  }, [filteredSkillTypes, editionSlug]);

  const handleToggleFighterSubtype = (subtypeName: string, checked: boolean) => {
    setSelectedFighterSubtypes(
      toggleFighterSubtype(selectedFighterSubtypes, filteredFighterSubtypes, subtypeName, checked)
    );
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    // Keep loaded metadata for rendering saved skills, but remove any selection
    // that cannot be proved to belong to the newly selected edition.
    setSelectedSkills(prev => prev.filter(skillId => {
      const skill = skills.find(candidate => candidate.id === skillId);
      const skillType = skillTypes.find(type => type.id === skill?.skill_type_id);
      return !!skillType && (!newEditionId || skillType.edition_id === newEditionId);
    }));

    const newEditionSlug = editions.find(edition => edition.id === newEditionId)?.slug;

    if (!hasVehicles(newEditionSlug)) {
      setIsVehicle(false);
    }

    if (!hasAlignment(newEditionSlug)) {
      setAlignment('');
    }

    const subtypesForEdition = newEditionId
      ? fighterSubtypes.filter(fc => fc.edition_id === newEditionId)
      : fighterSubtypes;
    const subtypeNames = new Set(subtypesForEdition.map(fc => fc.subtype_name));
    let nextSubtypes = selectedFighterSubtypes.filter(name => subtypeNames.has(name));
    // A single-subtype edition must not leave extra subtypes selected but hidden
    // behind the dropdown, where they would still be submitted
    if (!allowsMultipleSubtypes(newEditionSlug)) {
      nextSubtypes = nextSubtypes.slice(0, 1);
    }
    setSelectedFighterSubtypes(nextSubtypes);

    if (newEditionId && gangTypeFilter) {
      const gangType = gangTypes.find(type => type.gang_type_id === gangTypeFilter);
      if (gangType && gangType.edition_id !== newEditionId) {
        setGangTypeFilter('');
        setSelectedFighterTypeId('');
        setSelectedSpecialisationId('');
      }
    }

    const equipmentIds = new Set(
      (newEditionId
        ? equipment.filter(item => item.edition_id === newEditionId)
        : equipment
      ).map(item => item.id)
    );
    setSelectedEquipment(prev => prev.filter(id => equipmentIds.has(id)));
    setEquipmentListSelections(prev => prev.filter(id => equipmentIds.has(id)));
    setEquipmentDiscounts(prev => prev.filter(d => equipmentIds.has(d.equipment_id)));
    if (selectedAdjustedCostEquipment && !equipmentIds.has(selectedAdjustedCostEquipment)) {
      setSelectedAdjustedCostEquipment('');
    }

    if (selectedSkillType) {
      const skillType = skillTypes.find(type => type.id === selectedSkillType);
      if (skillType && newEditionId && skillType.edition_id !== newEditionId) {
        setSelectedSkillType('');
      }
    }

    if (skillTypeToAdd) {
      const skillType = skillTypes.find(type => type.id === skillTypeToAdd);
      if (skillType && newEditionId && skillType.edition_id !== newEditionId) {
        setSkillTypeToAdd('');
      }
    }

    setSkillAccess(prev =>
      prev.filter(row => {
        const skillType = skillTypes.find(type => type.id === row.skill_type_id);
        return !newEditionId || !skillType || skillType.edition_id === newEditionId;
      })
    );
  };

  const { data: fighterTypes = [] } = useQuery<FighterType[]>({
    queryKey: ['admin-fighter-types', gangTypeFilter],
    queryFn: async () => {
      const response = await fetch(`/api/admin/fighter-types?gang_type_id=${gangTypeFilter}&filter_by_gang=true`);
      if (!response.ok) throw new Error('Failed to fetch fighter types');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!gangTypeFilter,
    staleTime: 5 * 60 * 1000,
  });

  const fighterTypeCombos = useMemo(() => {
    const uniqueCombinations: FighterTypeCombo[] = [];
    fighterTypes.forEach(fighter => {
      const subtypeLabel = formatFighterSubtypes(fighter.fighter_subtypes);
      const existingCombo = uniqueCombinations.find(
        combo => combo.type === fighter.fighter_type &&
                combo.subtype === subtypeLabel &&
                combo.gang_type_id === fighter.gang_type_id
      );
      if (!existingCombo) {
        uniqueCombinations.push({
          type: fighter.fighter_type,
          subtype: subtypeLabel,
          gang_type_id: fighter.gang_type_id
        });
      }
    });
    uniqueCombinations.sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;
      return a.subtype.localeCompare(b.subtype);
    });
    return uniqueCombinations;
  }, [fighterTypes]);

  useEffect(() => {
    const fetchSkills = async () => {
      if (!selectedSkillType) {
        return;
      }

      try {
        const params = new URLSearchParams({ skill_type_id: selectedSkillType });
        if (editionId) params.set('edition_id', editionId);
        const response = await fetch(`/api/admin/skills?${params}`);
        if (!response.ok) throw new Error('Failed to fetch skills');
        const data = await response.json();
        // API returns {skills: [], effect_categories: []} when filtered by skill_type_id
        const skillsArray = Array.isArray(data) ? data : data.skills || [];
        // Preserve metadata for saved selections while the fighter record is
        // loading so their chips can still be rendered.
        setSkills(previous => mergeSkillsById(previous, skillsArray));
      } catch (error) {
        console.error('Error fetching skills:', error);
        toast.error('Failed to load skills');
      }
    };

    fetchSkills();
  }, [selectedSkillType, editionId]);

  // Fetch full skill details for selected skills when loading a fighter type
  useEffect(() => {
    const fetchSelectedSkillDetails = async () => {
      if (!selectedSkills.length || !selectedFighterTypeId) return;

      // Check which skills we haven't fetched yet
      const missingSkillIds = selectedSkills.filter(
        skillId => !fetchedSkillDetailsRef.current.has(skillId)
      );

      if (missingSkillIds.length === 0) return;

      try {
        // Fetch all skills to get the names of selected skills
        const response = await fetch('/api/admin/skills');
        if (!response.ok) throw new Error('Failed to fetch skills');
        const allSkills = await response.json();

        // Add only the missing selected skills to our skills array
        const missingSkills = allSkills.filter((skill: Skill) =>
          missingSkillIds.includes(skill.id)
        );

        if (missingSkills.length > 0) {
          setSkills(previous => mergeSkillsById(previous, missingSkills));
        }

        // Mark these skills as fetched even when the lookup returned nothing
        // for them, so it is not retried on every selection change.
        missingSkillIds.forEach(id => fetchedSkillDetailsRef.current.add(id));
      } catch (error) {
        console.error('Error fetching selected skill details:', error);
      }
    };

    fetchSelectedSkillDetails();
  }, [selectedSkills, selectedFighterTypeId]);

  const { data: fighterSpecialisations = [] } = useQuery<FighterSpecialisation[]>({
    queryKey: ['admin-fighter-specialisations'],
    queryFn: async () => {
      const response = await fetch('/api/admin/fighter-specialisations');
      if (!response.ok) throw new Error('Failed to fetch fighter specialisations');
      return response.json();
    },
    enabled: !!selectedFighterTypeId,
    staleTime: 5 * 60 * 1000,
  });

  const fetchFighterTypeDetails = async (fighterId: string) => {
    if (!fighterId) return;
    
    // Prevent duplicate fetches
    if (isFetchingFighterTypeDetailsRef.current) {
      return;
    }
    
    isFetchingFighterTypeDetailsRef.current = true;

    try {
      console.log('Fetching fighter type details for ID:', fighterId);
      const response = await fetch(`/api/admin/fighter-types?id=${fighterId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch fighter type details: ${response.status}`);
      }

      let data = await response.json();
      console.log('Received fighter type data:', data);

      if (!data) {
        throw new Error('No data received from server');
      }

      // Force override fighter_specialisation_id to null if we're in "default" mode
      if (selectedSpecialisationId === "default") {
        console.log('Forcing fighter_specialisation_id to null since Default is selected');
        data = { ...data, fighter_specialisation_id: null };
      }

      // Set the form data
      setFighterType(data.fighter_type || '');
      setBaseCost(data.cost?.toString() || '0');
      setDelegationCost(data.delegation_cost?.toString() || '');
      if (data.edition_id) {
        setEditionId(data.edition_id);
      }
      setSelectedFighterSubtypes(Array.isArray(data.fighter_subtypes) ? data.fighter_subtypes : []);
      setMovement(data.movement?.toString() || '0');
      setWeaponSkill(data.weapon_skill?.toString() || '0');
      setBallisticSkill(data.ballistic_skill?.toString() || '0');
      setStrength(data.strength?.toString() || '0');
      setToughness(data.toughness?.toString() || '0');
      setWounds(data.wounds?.toString() || '0');
      setInitiative(data.initiative?.toString() || '0');
      setLeadership(data.leadership?.toString() || '0');
      setCool(data.cool?.toString() || '0');
      setWillpower(data.willpower?.toString() || '0');
      setIntelligence(data.intelligence?.toString() || '0');
      setAttacks(data.attacks?.toString() || '0');
      setSave(data.save != null ? data.save.toString() : '');
      // Blank, not '0' — a stored null is N/A, and loading it as 0 would turn
      // it into a real starting value on the next save.
      setStartingXp(data.starting_xp != null ? data.starting_xp.toString() : '');
      setSpecialRules(data.special_rules || []);
      setNewSpecialRule('');
      setFreeSkill(!!data.free_skill);
      setIsGangAddition(!!data.is_gang_addition);
      setIsDramatisPersonae(!!data.is_dramatis_personae);
      setIsSpyrer(!!data.is_spyrer);
      setIsVehicle(data.is_vehicle ?? false);
      setAlignment(data.alignment || '');
      setSelectedEquipment(data.default_equipment || []);
      setSelectedSkills(data.default_skills || []);
      // Reset fetched skills tracking when loading a new fighter type
      fetchedSkillDetailsRef.current.clear();
      setEquipmentListSelections(data.equipment_list || []);
      setEquipmentDiscounts(data.equipment_discounts || []);
      // Set gang-specific costs if they exist
      if (data.gang_type_costs && Array.isArray(data.gang_type_costs)) {
        setGangTypeCosts(data.gang_type_costs);
      } else {
        setGangTypeCosts([]);
      }

      // Only set specialisationName if NOT explicitly handling a "default" selection
      // and there's a fighter_specialisation_id in the response
      if (selectedSpecialisationId !== "default" && data.fighter_specialisation_id) {
        // First look in our available specialisations
        let specialisation = availableSpecialisations.find(st => st.id === data.fighter_specialisation_id);
        
        // If we couldn't find it there, look in the full fighterSpecialisations array
        if (!specialisation && fighterSpecialisations.length > 0) {
          specialisation = fighterSpecialisations.find(st => st.id === data.fighter_specialisation_id);
        }
        
        // If we found the specialisation, set its name
        if (specialisation) {
          console.log(`Found specialisation name: ${specialisation.specialisation_name} for ID: ${data.fighter_specialisation_id}`);
          setSpecialisationName(specialisation.specialisation_name);
          
          // Update the input field directly as well for immediate feedback
          if (specialisationNameInputRef.current) {
            specialisationNameInputRef.current.value = specialisation.specialisation_name;
          }
        } else {
          // If we couldn't find the specialisation info, fetch it directly
          try {
            const specialisationResponse = await fetch(`/api/admin/fighter-specialisations?id=${data.fighter_specialisation_id}`);
            if (specialisationResponse.ok) {
              const specialisationData = await specialisationResponse.json();
              console.log(`Fetched specialisation data:`, specialisationData);
              if (specialisationData && specialisationData.specialisation_name) {
                setSpecialisationName(specialisationData.specialisation_name);
                
                // Update the input field directly as well
                if (specialisationNameInputRef.current) {
                  specialisationNameInputRef.current.value = specialisationData.specialisation_name;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching specialisation details:', error);
          }
        }
      } 
      // Remove the problematic code block starting here
      else if (selectedSpecialisationId === "default") {
        // Just clear the specialisation name field when "Default" is selected
        setSpecialisationName('');
        if (specialisationNameInputRef.current) {
          specialisationNameInputRef.current.value = '';
        }
      }
      // End of removing problematic code

      // Set equipment selection
      if (data.equipment_selection) {
        // Add logging to debug equipment selection loading
        console.log('Loaded equipment_selection from API:', data.equipment_selection);
        
        // Use the dataModelToGui function to properly convert the new format
        const convertedEquipmentSelection = dataModelToGui(data.equipment_selection);
        console.log('Converted equipment selection:', convertedEquipmentSelection);
        setEquipmentSelection(convertedEquipmentSelection);
      } else {
        // Reset to empty object if no equipment selection
        setEquipmentSelection({});
      }

      // Set skill access if present
      if (data.skill_access) {
        setSkillAccess(data.skill_access);
      } else {
        setSkillAccess([]);
      }

      return data;
    } catch (error) {
      console.error('Detailed error in fetchFighterTypeDetails:', error);
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to fetch fighter type details" });
      return null;
    } finally {
      isFetchingFighterTypeDetailsRef.current = false;
    }
  };

  const handleFighterTypeComboChange = (comboString: string) => {
    console.log('handleFighterTypeComboChange called with:', comboString);
    
    setSelectedFighterTypeCombo(comboString);
    setSelectedFighterTypeId('');
    setSelectedSpecialisationId('');
    setAvailableSpecialisations([]);
    setSpecialisationName('');
    
    // Clear the specialisation input field directly
    if (specialisationNameInputRef.current) {
      specialisationNameInputRef.current.value = '';
    }
    
    if (!comboString) return;
    
    try {
      // Parse the combo string to get type, subtype, and gang_type_id
      const [fighterType, fighterSubtype, gangTypeId] = comboString.split('|');
      
      if (!fighterType || !fighterSubtype || !gangTypeId) {
        console.error('Invalid fighter type combo string:', comboString);
        return;
      }
      
      // Find all fighters that match this type+subtype+gang_type. The whole subtype
      // list has to match, not just contain the first one: with multi-subtype
      // fighter types a "Ganger" combo would otherwise also swallow every
      // "Ganger, Specialist" type and mix their specialisations together.
      const matchingFighters = fighterTypes.filter(f =>
        f.fighter_type === fighterType &&
        formatFighterSubtypes(f.fighter_subtypes) === fighterSubtype &&
        f.gang_type_id === gangTypeId
      );
      
      console.log(`Found ${matchingFighters.length} fighters matching ${fighterType} (${fighterSubtype})`);
      
      // Prepare specialisation options, including a "Default" option
      const specialisationOptions: FighterSpecialisation[] = [];
      
      // First add default option (fighters without specialisation)
      const defaultFighters = matchingFighters.filter(f => 
        !f.fighter_specialisation_id || 
        f.fighter_specialisation_id === null || 
        f.fighter_specialisation_id === "" || 
        f.fighter_specialisation_id === "null"
      );
      
      if (defaultFighters.length > 0) {
        // Use the first default fighter's ID
        const defaultFighter = defaultFighters[0];
        specialisationOptions.push({
          id: "default",
          specialisation_name: "Default",
          fighterId: defaultFighter.id
        });
      }
      
      // Get all fighters with specialisations
      const specialisedFighters = matchingFighters.filter(f => 
        f.fighter_specialisation_id && 
        f.fighter_specialisation_id !== null && 
        f.fighter_specialisation_id !== "" && 
        f.fighter_specialisation_id !== "null"
      );
      
      // We need to fetch specialisation names for these fighters
      if (specialisedFighters.length > 0) {
        // Collect unique specialisation IDs - using Array.from for broader compatibility
        const specialisationIds = Array.from(
          new Set(
            specialisedFighters
              .map(f => f.fighter_specialisation_id)
              .filter(id => id !== null && id !== undefined)
          )
        ) as string[];
        
        if (specialisationIds.length > 0) {
          // For each fighter with a specialisation, create an option
          specialisedFighters.forEach(fighter => {
            if (!fighter.fighter_specialisation_id) return;
            
            // Just use a placeholder name for now, it will be updated later
            const placeholderName = "Loading...";
            
            specialisationOptions.push({
              id: fighter.fighter_specialisation_id,
              specialisation_name: placeholderName,
              fighterId: fighter.id
            });
          });
          
          // Fetch the actual specialisation names
          fetchSpecialisationNames(specialisationOptions);
        }
      }
      
      // Sort specialisations by name (keeping Default first)
      specialisationOptions.sort((a, b) => {
        if (a.id === "default") return -1;
        if (b.id === "default") return 1;
        return a.specialisation_name.localeCompare(b.specialisation_name);
      });
      
      // Update available specialisations
      setAvailableSpecialisations(specialisationOptions);
      
      // Setup basic fighter type info
      if (matchingFighters.length > 0) {
        // Use any fighter from the matching set to get basic type info
        const fighter = matchingFighters[0];
        setFighterType(fighter.fighter_type);
        setSelectedFighterSubtypes(fighter.fighter_subtypes ?? []);
      }
    } catch (error) {
      console.error('Error processing fighter type combo:', error);
    }
  };
  
  // Add a new function to fetch specialisation names
  const fetchSpecialisationNames = async (specialisationOptions: FighterSpecialisation[]) => {
    try {
      const response = await fetch('/api/admin/fighter-specialisations');
      if (!response.ok) throw new Error('Failed to fetch fighter specialisations');
      const specialisationsData = await response.json();
      
      // Update the specialisation names in our options
      const updatedOptions = specialisationOptions.map(option => {
        if (option.id === "default") return option;
        
        const specialisation = specialisationsData.find((st: Specialisation) => st.id === option.id);
        if (specialisation) {
          return {
            ...option,
            specialisation_name: specialisation.specialisation_name
          };
        }
        return option;
      });
      
      // Sort again with the updated names (keeping Default first)
      updatedOptions.sort((a, b) => {
        if (a.id === "default") return -1;
        if (b.id === "default") return 1;
        return a.specialisation_name.localeCompare(b.specialisation_name);
      });
      
      setAvailableSpecialisations(updatedOptions);
    } catch (error) {
      console.error('Error fetching specialisation names:', error);
    }
  };

  const handleSpecialisationChange = async (specialisationId: string) => {
    console.log('handleSpecialisationChange called with specialisationId:', specialisationId);
    
    // Update selected specialisation ID
    setSelectedSpecialisationId(specialisationId);
    
    if (!specialisationId) {
      // Clear specialisation name when no selection
      setSpecialisationName('');
      if (specialisationNameInputRef.current) {
        specialisationNameInputRef.current.value = '';
      }
      return;
    }
    
    // If we're already loading, don't start another request
    if (isLoading || isFetchingFighterTypeDetailsRef.current) {
      console.log('Already loading or fetching data, skipping request');
      return;
    }

    setIsLoading(true);
    
    try {
      // Equipment data should already be loaded by now, but check just in case
      if (!hasLoadedEquipmentCategoriesRef.current) {
        console.log('Equipment data not yet loaded, loading now...');
        await fetchEquipmentByCategory();
      }
      
      // Find the option in available specialisations
      const selectedOption = availableSpecialisations.find(st => st.id === specialisationId);
      
      // If we have an option and it has a fighterId, fetch details
      if (selectedOption && selectedOption.fighterId) {
        setSelectedFighterTypeId(selectedOption.fighterId);
        // Set specialisation name if it's not the default option, otherwise clear it
        if (specialisationId !== "default") {
          setSpecialisationName(selectedOption.specialisation_name);
          if (specialisationNameInputRef.current) {
            specialisationNameInputRef.current.value = selectedOption.specialisation_name;
          }
        } else {
          // For default, start with an empty field that can be edited
          setSpecialisationName('');
          if (specialisationNameInputRef.current) {
            specialisationNameInputRef.current.value = '';
          }
        }
        
        // Fetch the fighter details
        console.log(`Fetching details for fighter ID: ${selectedOption.fighterId}`);
        await fetchFighterTypeDetails(selectedOption.fighterId);
      } else {
        toast.error('Could not find fighter data for the selected specialisation');
      }
    } catch (error) {
      console.error('Error in handleSpecialisationChange:', error);
      toast.error('Failed to load fighter specialisation details');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate equipment selection structure
  useEffect(() => {
    if (Object.keys(equipmentSelection).length > 0) {
      Object.entries(equipmentSelection).forEach(([key, category]) => {
        if (!category.select_type) {
          setEquipmentSelection(prev => ({
            ...prev,
            [key]: {
              ...prev[key],
              select_type: 'optional'
            }
          }));
        }

        if (!category.options) {
          setEquipmentSelection(prev => ({
            ...prev,
            [key]: {
              ...prev[key],
              options: []
            }
          }));
        }
      });
    }
  }, [equipmentSelection]);

  const handleAddSpecialRule = () => {
    if (!newSpecialRule.trim()) return;

    if (specialRules.includes(newSpecialRule.trim())) {
      setNewSpecialRule('');
      return;
    }

    setSpecialRules(prev => [...prev, newSpecialRule.trim()]);
    setNewSpecialRule('');
  };

  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setSpecialRules(prev => prev.filter(rule => rule !== ruleToRemove));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Check if we have a valid specialisation selection
      if (!selectedSpecialisationId) {
        throw new Error('Please select a fighter specialisation to edit');
      }
      
      // Get the fighter ID associated with the selected specialisation
      const selectedSpecialisation = availableSpecialisations.find(st => st.id === selectedSpecialisationId);
      if (!selectedSpecialisation || !selectedSpecialisation.fighterId) {
        throw new Error('Could not find the fighter ID for the selected specialisation');
      }
      
      // The actual fighter ID we need to update comes from the specialisation selection
      const fighterIdToUpdate = selectedSpecialisation.fighterId;
      console.log(`Updating fighter ID: ${fighterIdToUpdate}`);
      
      // Get the base fighter to determine gang type
      const fighterToUpdate = fighterTypes.find(f => f.id === fighterIdToUpdate);
      if (!fighterToUpdate) {
        throw new Error('Selected fighter not found');
      }
      
      console.log('Current selection state:', {
        selectedFighterTypeCombo,
        selectedSpecialisationId,
        specialisationName,
        fighterIdToUpdate
      });

      // Validate required fields
      if (!fighterType || !fighterToUpdate?.gang_type_id) {
        throw new Error('Missing required fields');
      }

      // Nothing downstream rejects an empty array — the column defaults to '[]'
      // and the API passes it straight through — so a subtypeless fighter type
      // would silently reach the SQL functions that branch on subtype name.
      if (selectedFighterSubtypes.length === 0) {
        throw new Error('Please select at least one fighter subtype');
      }

      // Special handling for specialisationId and specialisationName
      let finalSpecialisationId: string | null = null;
      let finalSpecialisationName: string | null = null;
      
      // Get the original fighter data to see what specialisation it currently has
      const originalFighter = fighterTypes.find(f => f.id === fighterIdToUpdate);
      const originalSpecialisationId = originalFighter?.fighter_specialisation_id;
      
      // Get the current specialisation name from the input field (might be more up-to-date than state)
      const currentSpecialisationName = specialisationNameInputRef.current?.value || specialisationName;
      
      // Get the original specialisation name if we need to preserve it
      let originalSpecialisationName: string | null = null;
      if (originalSpecialisationId) {
        const originalSpecialisation = fighterSpecialisations.find(st => st.id === originalSpecialisationId);
        originalSpecialisationName = originalSpecialisation?.specialisation_name || null;
      }
      
      console.log('Specialisation logic - Current state:', {
        selectedSpecialisationId,
        specialisationName,
        currentSpecialisationName,
        originalSpecialisationId,
        originalSpecialisationName,
        originalFighterSpecialisationId: originalFighter?.fighter_specialisation_id
      });
      
      // Case 1: User selected "default" - Convert to default fighter
      if (selectedSpecialisationId === "default") {
        // Check if user added a name to create a new specialisation
        if (currentSpecialisationName && currentSpecialisationName.trim()) {
          try {
            const formattedName = currentSpecialisationName.trim().charAt(0).toUpperCase() + currentSpecialisationName.trim().slice(1);
            console.log(`Creating new specialisation: "${formattedName}" from default fighter`);
              
            const createResponse = await fetch('/api/admin/fighter-specialisations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ specialisation_name: formattedName }),
            });
              
            if (createResponse.ok) {
              const newSpecialisation = await createResponse.json();
              finalSpecialisationId = newSpecialisation.id;
              finalSpecialisationName = newSpecialisation.specialisation_name;
              console.log(`Created new specialisation with ID: ${finalSpecialisationId}`);
            } else {
              console.error('Failed to create specialisation:', await createResponse.text());
              throw new Error('Failed to create new specialisation');
            }
          } catch (error) {
            console.error('Error creating specialisation:', error);
            throw new Error('Failed to create new specialisation');
          }
        } else {
          // No name provided, keep as default fighter
          finalSpecialisationId = null;
          finalSpecialisationName = null;
          console.log(`Converting fighter ${fighterIdToUpdate} to default (null specialisation)`);
        }
      }
      // Case 2: User selected an existing specialisation - Use that specialisation
      else if (selectedSpecialisationId && selectedSpecialisationId !== "default") {
        finalSpecialisationId = selectedSpecialisationId;
        
        // If user provided a name in the input, use that; otherwise preserve the original name
        if (currentSpecialisationName && currentSpecialisationName.trim()) {
          finalSpecialisationName = currentSpecialisationName.trim();
        } else {
          // No input provided, find and preserve the original specialisation name
          const selectedSpecialisation = fighterSpecialisations.find(st => st.id === selectedSpecialisationId);
          finalSpecialisationName = selectedSpecialisation?.specialisation_name || null;
        }
        
        console.log(`Using selected specialisation with ID: ${finalSpecialisationId}, name: ${finalSpecialisationName}`);
        
        // If user changed the specialisation name, update it
        if (currentSpecialisationName && currentSpecialisationName.trim()) {
          const existingSpecialisation = fighterSpecialisations.find(st => st.id === finalSpecialisationId);
          if (existingSpecialisation && existingSpecialisation.specialisation_name !== currentSpecialisationName.trim()) {
            try {
              console.log(`Updating specialisation name from "${existingSpecialisation.specialisation_name}" to "${currentSpecialisationName.trim()}"`);
              const updateResponse = await fetch(`/api/admin/fighter-specialisations?id=${finalSpecialisationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specialisation_name: currentSpecialisationName.trim() }),
              });
              
              if (!updateResponse.ok) {
                console.error('Failed to update specialisation name:', await updateResponse.text());
              } else {
                finalSpecialisationName = currentSpecialisationName.trim();
              }
            } catch (error) {
              console.error('Error updating specialisation name:', error);
            }
          }
        }
      }
      // Case 3: No specialisation selected but fighter originally had one - preserve original
      else if (!selectedSpecialisationId && originalSpecialisationId) {
        finalSpecialisationId = originalSpecialisationId;
        finalSpecialisationName = originalSpecialisationName;
        console.log(`No specialisation selection made, preserving original specialisation ID: ${finalSpecialisationId} with name: ${finalSpecialisationName}`);
      }
      // Case 4: No specialisation selected and fighter was originally default - keep as default
      else {
        finalSpecialisationId = null;
        finalSpecialisationName = null;
        console.log(`No specialisation selection made and fighter was originally default, keeping as default`);
      }

      // Log equipment selection state before preparing update data
      console.log('Equipment selection before update:', equipmentSelection);
      console.log('Equipment selection keys:', Object.keys(equipmentSelection));
      console.log('Equipment selection values sample:', 
        Object.keys(equipmentSelection).length > 0 ? 
          Object.entries(equipmentSelection)[0] : 
          'No equipment selection data'
      );

      // Prepare the equipment selection data for the update
      const formattedEquipmentSelection = Object.keys(equipmentSelection).length > 0 ? 
        Object.entries(equipmentSelection).reduce<Record<string, any>>((acc, [key, category]) => {
          console.log(`Processing category ${key} with type ${category.select_type}`);
          return {
            ...acc,
            [key]: {
              select_type: category.select_type,
              name: category.name,
              default: category.default,
              options: category.options?.map(option => ({
                id: option.id,
                cost: option.cost,
                max_quantity: option.max_quantity,
                replaces: option.replaces,
                max_replace: option.max_replace
              }))
            }
          };
        }, {}) : 
        null;

      console.log('Formatted equipment selection:', formattedEquipmentSelection);
      
      // Ensure equipment selection format is compatible with the server's expectations
      // by adding a weapons key if it doesn't exist
      let finalEquipmentSelection = formattedEquipmentSelection;
      if (finalEquipmentSelection && Object.keys(finalEquipmentSelection).length > 0) {
        if (!('weapons' in finalEquipmentSelection)) {
          console.log('Adding weapons key to ensure compatibility with server');
          // Use the first category as the "weapons" category
          const firstKey = Object.keys(finalEquipmentSelection)[0];
          const firstCategory = finalEquipmentSelection[firstKey];
          finalEquipmentSelection = {
            ...finalEquipmentSelection,
            weapons: {
              select_type: firstCategory?.select_type || 'optional',
              name: 'Weapons',
              default: firstCategory?.default || [],
              options: []
            }
          };
        }
      }

      const updateData = {
        id: fighterIdToUpdate,
        fighter_type: fighterType,
        cost: parseInt(baseCost),
        gang_type_id: fighterToUpdate.gang_type_id,
        fighter_subtypes: selectedFighterSubtypes,
        fighter_specialisation_id: finalSpecialisationId,
        fighter_specialisation: finalSpecialisationName,
        movement: parseInt(movement),
        weapon_skill: parseInt(weaponSkill),
        ballistic_skill: parseInt(ballisticSkill),
        strength: parseInt(strength),
        toughness: parseInt(toughness),
        wounds: parseInt(wounds),
        initiative: parseInt(initiative),
        leadership: parseInt(leadership),
        cool: parseInt(cool),
        willpower: parseInt(willpower),
        intelligence: parseInt(intelligence),
        attacks: parseInt(attacks),
        save: showSave && save ? parseInt(save) : null,
        // Blank means N/A and is sent as an explicit null, as in
        // admin-create-fighter-type. Sending nothing instead would leave the
        // stored value in place, making N/A impossible to set on a type that
        // already has a number. Editions without Starting XP pin 0.
        starting_xp: showStartingXp ? (startingXp === '' ? null : parseInt(startingXp)) : 0,
        special_rules: specialRules,
        free_skill: freeSkill,
        is_gang_addition: isGangAddition,
        is_dramatis_personae: isDramatisPersonae,
        is_spyrer: isSpyrer,
        is_vehicle: isVehicle,
        alignment: showAlignment ? (alignment || null) : null,
        delegation_cost: delegationCost ? parseInt(delegationCost) : null,
        default_equipment: selectedEquipment,
        default_skills: selectedSkills,
        equipment_list: equipmentListSelections,
        equipment_discounts: equipmentDiscounts,
        equipment_selection: guiToDataModel(equipmentSelection),
        gang_type_costs: gangTypeCosts, // Add gang-specific costs
        updated_at: new Date().toISOString(),
        skill_access: skillAccess
      };

      console.log('Sending update data:', updateData);
      console.log('Equipment selection in update data:', updateData.equipment_selection);
      console.log('Selected specialisation and final fighter_specialisation_id:', {
        selectedSpecialisationId,
        submittingSpecialisationId: updateData.fighter_specialisation_id,
        originalSpecialisationId: finalSpecialisationId
      });

      // Check if equipment selection is being properly included
      const jsonData = JSON.stringify(updateData);
      console.log('JSON data includes equipment_selection:', 
        jsonData.includes('equipment_selection') && 
        jsonData.includes(Object.keys(equipmentSelection)[0] || '')
      );

      const response = await fetch(`/api/admin/fighter-types?id=${fighterIdToUpdate}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || 'Failed to update fighter type';
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Update successful:', data);

      toast.success("Fighter type updated successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-fighter-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-fighter-subtypes'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-skill-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-lineages'] }),
      ]);

      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true;
    } catch (error) {
      console.error('Error updating fighter type:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update fighter type');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const _handleAddAdjustedCost = () => {
    if (!selectedAdjustedCostEquipment || !adjustedCostAmount) return;
    
    const newAdjustedCost = {
      equipment_id: selectedAdjustedCostEquipment,
      adjusted_cost: parseInt(adjustedCostAmount)
    };

    setEquipmentDiscounts([...equipmentDiscounts, newAdjustedCost]);
    setSelectedAdjustedCostEquipment('');
    setAdjustedCostAmount('');
  };

  const _handleRemoveAdjustedCost = (equipmentId: string) => {
    setEquipmentDiscounts(equipmentDiscounts.filter(
      adjusted_cost => adjusted_cost.equipment_id !== equipmentId
    ));
  };

  const handleInputTyping = (_e: React.ChangeEvent<HTMLInputElement>) => {
    // This function exists just to satisfy the React onChange prop
    // The actual value is read from the ref on blur
    // This is deliberately empty to avoid any performance overhead
  };

  // Add this useEffect after the existing useEffects to handle backward compatibility


  const handleAddGangCost = () => {
    // Get the cost from the ref instead of state
    const costValue = gangAdjustedCostInputRef.current?.value || '';
    
    if (!selectedGangTypeForCost || !costValue) {
      toast.error('Please select a gang type and enter a cost');
      return false;
    }
    
    // Convert cost to number
    const cost = parseInt(costValue);
    if (isNaN(cost) || cost < 0) {
      toast.error('Please enter a valid cost (must be 0 or greater)');
      return false;
    }
    
    // Create new gang cost
    const newGangCost: FighterTypeGangCost = {
      fighter_type_id: selectedFighterTypeId,
      gang_type_id: selectedGangTypeForCost,
      adjusted_cost: cost,
      gang_affiliation_id: selectedGangAffiliationForCost || null
    };
    
    // Check if this gang type and affiliation combination already has a cost set
    const existingIndex = gangTypeCosts.findIndex(
      item => item.gang_type_id === selectedGangTypeForCost &&
              item.gang_affiliation_id === (selectedGangAffiliationForCost || null)
    );
    
    if (existingIndex >= 0) {
      // Update existing cost
      const updatedCosts = [...gangTypeCosts];
      updatedCosts[existingIndex] = newGangCost;
      setGangTypeCosts(updatedCosts);
    } else {
      // Add new cost
      setGangTypeCosts([...gangTypeCosts, newGangCost]);
    }
    
    // Reset form
    setSelectedGangTypeForCost('');
    setSelectedGangAffiliationForCost('');
    if (gangAdjustedCostInputRef.current) {
      gangAdjustedCostInputRef.current.value = '';
    }
    setShowGangCostDialog(false);
    
    return true; // Return true to close the modal
  };
  

  // Create gang cost modal content
  const gangCostModalContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select a gang type, optionally select an affiliation, and enter an adjusted cost for this fighter</p>
      
      <div>
        <label className="block text-sm font-medium mb-1">Gang Type *</label>
        <select
          value={selectedGangTypeForCost}
          onChange={(e) => setSelectedGangTypeForCost(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Select a gang type</option>
          {gangTypes.map((gangType) => (
            <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
              {gangType.gang_type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Gang Affiliation (Optional)</label>
        <select
          value={selectedGangAffiliationForCost}
          onChange={(e) => setSelectedGangAffiliationForCost(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">None (applies to all gangs of this type)</option>
          {gangAffiliations.map((affiliation) => (
            <option key={affiliation.id} value={affiliation.id}>
              {affiliation.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          If no affiliation is selected, this cost applies to all gangs of the selected type. If an affiliation is selected, this cost only applies to gangs with that specific affiliation.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Adjusted Cost (credits) *</label>
        <Input
          ref={gangAdjustedCostInputRef}
          type="number"
          defaultValue=""
          placeholder="Enter adjusted cost in credits"
          min="0"
          onKeyDown={(e) => {
            if (e.key === '-') {
              e.preventDefault();
            }
          }}
        />
      </div>
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Edit Fighter Type</h3>
            <p className="text-sm text-muted-foreground">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto grow">
          <div className="space-y-4">
            <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Filter by Gang Type
              </label>
              <select
                value={gangTypeFilter}
                onChange={(e) => {
                  setGangTypeFilter(e.target.value);
                  // Reset downstream selections when gang type changes
                  setSelectedFighterTypeId('');
                  setSelectedSpecialisationId('');
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">All Gang Types</option>
                {filteredGangTypes.map((type) => (
                  <option key={type.gang_type_id} value={type.gang_type_id}>
                    {type.gang_type}
                  </option>
                ))}
              </select>
            </div>

            {/* First row: Fighter Type selection and Specialisation selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Select Fighter Type to Edit
                </label>
                <select
                  value={selectedFighterTypeCombo}
                  onChange={(e) => handleFighterTypeComboChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={!gangTypeFilter}
                >
                  <option value="">
                    {!gangTypeFilter 
                      ? "Select a gang type first" 
                      : "Select a fighter type"
                    }
                  </option>
                  {fighterTypeCombos.map((combo) => (
                    <option key={`${combo.type}-${combo.subtype}-${combo.gang_type_id}`} value={`${combo.type}|${combo.subtype}|${combo.gang_type_id}`}>
                      {`${combo.type} (${combo.subtype || "Unknown Subtype"})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Select Fighter Specialisation to Edit
                </label>
                <select
                  value={selectedSpecialisationId}
                  onChange={(e) => handleSpecialisationChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeCombo || availableSpecialisations.length === 0}
                >
                  <option value="">
                    {!selectedFighterTypeCombo 
                      ? "Select a fighter type first" 
                      : availableSpecialisations.length === 0 
                        ? "Loading specialisations..." 
                        : "Select a specialisation"
                    }
                  </option>
                  {availableSpecialisations.map((specialisation) => (
                    <option key={specialisation.id} value={specialisation.id}>
                      {specialisation.specialisation_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Second row: Fighter Type name and Fighter Specialisation input */}
            {selectedSpecialisationId && !isLoading && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter Type *
                </label>
                <Input
                  ref={fighterTypeInputRef}
                  type="text"
                  defaultValue={fighterType}
                  onChange={handleInputTyping}
                  onBlur={(e) => setFighterType(e.target.value)}
                  placeholder="e.g. Stimmer"
                  className="w-full"
                  disabled={!selectedFighterTypeId}
                />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Fighter Specialisation
                  </label>
                  <Input
                    ref={specialisationNameInputRef}
                    type="text"
                    defaultValue={specialisationName}
                    onChange={handleInputTyping}
                    onBlur={(e) => {
                      const newName = e.target.value;
                      setSpecialisationName(newName);
                      
                      // Also update the name in our availableSpecialisations array
                      if (selectedSpecialisationId && selectedSpecialisationId !== "default") {
                        setAvailableSpecialisations(prev => 
                          prev.map(st => 
                            st.id === selectedSpecialisationId 
                              ? { ...st, specialisation_name: newName } 
                              : st
                          )
                        );
                      }
                    }}
                    placeholder="e.g. Subjugator"
                    className="w-full"
                    disabled={!selectedSpecialisationId}
                  />
                  {selectedSpecialisationId === "default" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      You can add a specialisation name to create a new variant of this fighter.
                    </p>
                  )}
                </div>
              </div>

              {/* Fighter Subtype — full width when multi-select (n26) */}
              {allowMultipleSubtypes ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Fighter Subtype *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                    {fighterSubtypesForDisplay.map((fighterSubtype) => (
                      <label key={fighterSubtype.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedFighterSubtypes.includes(fighterSubtype.subtype_name)}
                          onCheckedChange={(checked) => handleToggleFighterSubtype(fighterSubtype.subtype_name, checked === true)}
                        />
                        <span>{fighterSubtype.subtype_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Base Cost, Alignment, Delegation Cost, Starting XP (+ single-select
                  subtype). Always 2 columns: single-select editions show 4 items
                  (subtype, base cost, alignment, delegation cost), multi-select
                  editions show 4 items too (subtype moved above, but Starting XP
                  fills the slot) -- either way the grid fills evenly. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {!allowMultipleSubtypes && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Fighter Subtype *
                    </label>
                    <select
                      value={selectedFighterSubtypes[0] ?? ''}
                      onChange={(e) => setSelectedFighterSubtypes(e.target.value ? [e.target.value] : [])}
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Select fighter subtype</option>
                      {fighterSubtypesForDisplay.map((fighterSubtype) => (
                        <option key={fighterSubtype.id} value={fighterSubtype.subtype_name}>
                          {fighterSubtype.subtype_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Base Cost *
                  </label>
                  <Input
                    type="number"
                    value={baseCost}
                    onChange={(e) => setBaseCost(e.target.value)}
                    placeholder="e.g. 125"
                    className="w-full"
                    min="0"
                  />
                </div>

                {showAlignment && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Alignment
                    </label>
                    <select
                      value={alignment}
                      onChange={(e) => setAlignment(e.target.value)}
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Select Alignment</option>
                      <option value="Law Abiding">Law Abiding</option>
                      <option value="Outlaw">Outlaw</option>
                      <option value="Unaligned">Unaligned</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Delegation Cost
                  </label>
                  <Input
                    type="number"
                    value={delegationCost}
                    onChange={(e) => setDelegationCost(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full"
                    min="0"
                  />
                </div>

                {showStartingXp && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Starting XP
                    </label>
                    <Input
                      type="number"
                      value={startingXp}
                      onChange={(e) => setStartingXp(e.target.value)}
                      placeholder="Leave blank for N/A"
                      className="w-full"
                      min="0"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Blank means this type can never gain XP.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2 md:gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    M *
                  </label>
                  <Input
                    type="text"
                    value={movement}
                    onChange={(e) => setMovement(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    WS *
                  </label>
                  <Input
                    type="text"
                    value={weaponSkill}
                    onChange={(e) => setWeaponSkill(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    BS *
                  </label>
                  <Input
                    type="text"
                    value={ballisticSkill}
                    onChange={(e) => setBallisticSkill(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    S *
                  </label>
                  <Input
                    type="text"
                    value={strength}
                    onChange={(e) => setStrength(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    T *
                  </label>
                  <Input
                    type="text"
                    value={toughness}
                    onChange={(e) => setToughness(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    W *
                  </label>
                  <Input
                    type="text"
                    value={wounds}
                    onChange={(e) => setWounds(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    I *
                  </label>
                  <Input
                    type="text"
                    value={initiative}
                    onChange={(e) => setInitiative(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    A *
                  </label>
                  <Input
                    type="text"
                    value={attacks}
                    onChange={(e) => setAttacks(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                {showSave && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Sv
                    </label>
                    <Input
                      type="text"
                      value={save}
                      onChange={(e) => setSave(e.target.value)}
                      className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Ld *
                  </label>
                  <Input
                    type="text"
                    value={leadership}
                    onChange={(e) => setLeadership(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Cl *
                  </label>
                  <Input
                    type="text"
                    value={cool}
                    onChange={(e) => setCool(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Wil *
                  </label>
                  <Input
                    type="text"
                    value={willpower}
                    onChange={(e) => setWillpower(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Int *
                  </label>
                  <Input
                    type="text"
                    value={intelligence}
                    onChange={(e) => setIntelligence(e.target.value)}
                    className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Special Rules
                </label>
                <div className="flex space-x-2 mb-2">
                  <Input
                    type="text"
                    value={newSpecialRule}
                    onChange={(e) => setNewSpecialRule(e.target.value)}
                    placeholder="Add a Special Rule"
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
                <div className="flex flex-wrap gap-2 mt-2">
                  {specialRules.map((rule, index) => (
                    <div
                      key={index}
                      className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                    >
                      <span>{rule}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialRule(rule)}
                        className="ml-2 text-muted-foreground hover:text-foreground focus:outline-hidden"
                      >
                        <HiX className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="free-skill"
                    checked={freeSkill}
                    onCheckedChange={(checked) => setFreeSkill(checked === true)}
                  />
                  <label
                    htmlFor="free-skill"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Free Skill
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="gang-addition"
                    checked={isGangAddition}
                    onCheckedChange={(checked) => setIsGangAddition(checked === true)}
                  />
                  <label
                    htmlFor="gang-addition"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Gang Addition
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dramatis-personae"
                    checked={isDramatisPersonae}
                    onCheckedChange={(checked) => setIsDramatisPersonae(checked === true)}
                  />
                  <label
                    htmlFor="dramatis-personae"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Dramatis Personae
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="spyrer"
                    checked={isSpyrer}
                    onCheckedChange={(checked) => setIsSpyrer(checked === true)}
                  />
                  <label
                    htmlFor="spyrer"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Spyrer
                  </label>
                </div>

                {hasVehicles(editionSlug) && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="vehicle"
                      checked={isVehicle}
                      onCheckedChange={(checked) => setIsVehicle(checked === true)}
                    />
                    <label
                      htmlFor="vehicle"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Vehicle
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Default Skills
                </label>
                <div className="space-y-2">
                  <select
                    value={selectedSkillType}
                    onChange={(e) => {
                      const value = e.target.value;
                      startTransition(() => {
                        setSelectedSkillType(value);
                      });
                    }}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select a skill set</option>

                    {groupedSkillTypes.map(([groupLabel, skillList]) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {skillList.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.skill_type}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value && !selectedSkills.includes(value)) {
                        setSelectedSkills([...selectedSkills, value]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={!selectedSkillType || !selectedFighterTypeId}
                  >
                    <option value="">Select a skill to add</option>
                    {availableSkills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.skill_name}
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedSkills.map((skillId) => {
                      const skill = skills.find(s => s.id === skillId);
                      if (!skill) return null;

                      return (
                        <div
                          key={skill.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                            selectedFighterTypeId ? 'bg-muted' : 'bg-muted'
                          }`}
                        >
                          <span>{skill.skill_name}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedSkills(selectedSkills.filter(id => id !== skill.id))}
                            className="hover:text-red-500 focus:outline-hidden"
                            disabled={!selectedFighterTypeId}
                          >
                            <HiX className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Skill Access
                </label>
                <div className="overflow-hidden rounded-md border mb-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted border-b">
                        <th className="px-4 py-2 text-left font-medium">Skill Set</th>
                        <th className="px-4 py-2 text-left font-medium">Access Level</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skillAccess.map((row, idx) => {
                        const skillType = skillTypes.find(st => st.id === row.skill_type_id);
                        return (
                          <tr key={row.skill_type_id} className="border-b last:border-0">
                            <td className="px-4 py-2">{skillType?.skill_type || 'Unknown'}</td>
                            <td className="px-4 py-2">
                              <select
                                value={row.access_level}
                                onChange={e => {
                                  const newLevel = e.target.value as 'primary' | 'secondary' | 'allowed';
                                  setSkillAccess(prev =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, access_level: newLevel } : r
                                    )
                                  );
                                }}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground"
                              >
                                <option value="primary">Primary</option>
                                <option value="secondary">Secondary</option>
                                <option value="allowed">Allowed</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setSkillAccess(prev =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                className="text-gray-400 hover:text-red-600 transition-colors"
                                title="Remove"
                              >
                                <LuTrash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={skillTypeToAdd}
                    onChange={e => setSkillTypeToAdd(e.target.value)}
                    className="p-1 border rounded-sm"
                  >
                    <option value="">Add Skill Set</option>
                    {filteredSkillTypes
                      .filter(st => !skillAccess.some(sa => sa.skill_type_id === st.id))
                      .map(st => (
                        <option key={st.id} value={st.id}>
                          {st.skill_type}
                        </option>
                      ))}
                  </select>
                  <Button
                    type="button"
                    onClick={() => {
                      if (
                        skillTypeToAdd &&
                        !skillAccess.some(sa => sa.skill_type_id === skillTypeToAdd)
                      ) {
                        setSkillAccess(prev => [
                          ...prev,
                          { skill_type_id: skillTypeToAdd, access_level: 'allowed' }
                        ]);
                        setSkillTypeToAdd('');
                      }
                    }}
                    disabled={!skillTypeToAdd}
                    size="sm"
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Default Equipment
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      setSelectedEquipment([...selectedEquipment, value]);
                    }
                    e.target.value = "";
                  }}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeId}
                >
                  <option value="">Select equipment to add</option>
                  {filteredEquipment
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.equipment_name}
                      </option>
                    ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedEquipment.map((equipId, index) => {
                    const item = equipment.find(e => e.id === equipId);
                    if (!item) return null;

                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                          selectedFighterTypeId ? 'bg-muted' : 'bg-muted'
                        }`}
                      >
                        <span>{item.equipment_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEquipment(selectedEquipment.filter((_, i) => i !== index))}
                          className="hover:text-red-500 focus:outline-hidden"
                          disabled={!selectedFighterTypeId}
                        >
                          <HiX className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter&apos;s Equipment List
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && !equipmentListSelections.includes(value)) {
                      setEquipmentListSelections([...equipmentListSelections, value]);
                    }
                    e.target.value = "";
                  }}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeId}
                >
                  <option value="">Available equipment</option>
                  {[...filteredEquipment]
                    .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.equipment_name} ({item.equipment_category})
                      </option>
                    ))}
                </select>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Object.entries(
                    equipmentListSelections
                      .map(equipId => equipment.find(e => e.id === equipId))
                      .filter(item => item !== undefined) // Remove null values
                      .sort((a, b) => {
                        if (!a || !b) return 0; // Handle undefined items

                        const categoryCompare = compareEquipmentCategories(
                          a.equipment_category || '',
                          b.equipment_category || '',
                          editionSlug
                        );
                        if (categoryCompare !== 0) return categoryCompare;

                        // If same category, sort alphabetically by equipment name
                        return a.equipment_name.localeCompare(b.equipment_name);
                      })
                      .reduce((groups, item) => {
                        if (!item || !item.equipment_category) return groups; // Ensure item is defined and has a category

                        const category = item.equipment_category;
                        if (!groups[category]) groups[category] = []; // Initialize category group if not present
                        groups[category].push(item);

                        return groups;
                      }, {} as Record<string, EquipmentWithId[]>)
                  ).map(([category, items]) => (
                    <div key={category} className="flex flex-col gap-1 p-1">
                      {/* Category Title */}
                      <div className="text-sm font-bold text-muted-foreground">{category}</div>

                      {/* Items under this category */}
                      {items.map(item => {
                        // Check if there's an adjusted cost for this equipment
                        const adjustedCost = equipmentDiscounts.find(discount => discount.equipment_id === item!.id);
                        const displayCost = adjustedCost ? adjustedCost.adjusted_cost : item!.cost;
                        const isAdjusted = !!adjustedCost;
                        
                        return (
                          <div
                            key={item!.id}
                            className="flex justify-between items-center gap-2 rounded-full text-sm bg-muted px-2 py-1"
                          >
                            <span>{item!.equipment_name}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-right ${isAdjusted ? 'font-bold' : ''}`}>{displayCost}</span>
                              <button
                                type="button"
                                onClick={() => setEquipmentListSelections(equipmentListSelections.filter(id => id !== item!.id))}
                                className="hover:text-red-500 focus:outline-hidden"
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Adjusted Costs
                </label>
                <Button
                  onClick={() => setShowAdjustedCostDialog(true)}
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  disabled={!gangTypeFilter || !selectedFighterTypeId}
                >
                  Add Equipment Adjusted Cost
                </Button>
                {(!gangTypeFilter || !selectedFighterTypeId) && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Select a gang type and fighter type to add equipment adjusted costs
                  </p>
                )}

                {equipmentDiscounts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {equipmentDiscounts.map((adjusted_cost) => {
                      const item = equipment.find(e => e.id === adjusted_cost.equipment_id);
                      if (!item) return null;

                      return (
                        <div
                          key={adjusted_cost.equipment_id}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                        >
                          <span>{item.equipment_name} ({adjusted_cost.adjusted_cost} credits)</span>
                          <button
                            onClick={() => setEquipmentDiscounts(prev =>
                              prev.filter(d => d.equipment_id !== adjusted_cost.equipment_id)
                            )}
                            className="hover:text-red-500 focus:outline-hidden"
                          >
                            <HiX className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showAdjustedCostDialog && (
                  <div
                    className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex items-center justify-center z-50"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowAdjustedCostDialog(false);
                        setSelectedAdjustedCostEquipment("");
                        setAdjustedCostAmount("");
                      }
                    }}
                  >
                    <div className="bg-card p-6 rounded-lg shadow-lg w-[400px]">
                      <h3 className="text-xl font-bold mb-4">Equipment Adjusted Cost Menu</h3>
                      <p className="text-sm text-muted-foreground mb-4">Select equipment and enter an adjusted cost</p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Equipment</label>
                          <select
                            value={selectedAdjustedCostEquipment}
                            onChange={(e) => setSelectedAdjustedCostEquipment(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option value="">Select equipment</option>
                            {filteredEquipment
                              .filter(item => !equipmentDiscounts.some(
                                adjusted_cost => adjusted_cost.equipment_id === item.id
                              ))
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.equipment_name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Adjusted Cost (credits)</label>
                          <Input
                            type="number"
                            value={adjustedCostAmount}
                            onChange={(e) => setAdjustedCostAmount(e.target.value)}
                            placeholder="Enter adjusted cost in credits"
                            min="0"
                            onKeyDown={(e) => {
                              if (e.key === '-') {
                                e.preventDefault();
                              }
                            }}
                          />
                        </div>

                        <div className="flex gap-2 justify-end mt-6">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowAdjustedCostDialog(false);
                              setSelectedAdjustedCostEquipment("");
                              setAdjustedCostAmount("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              if (selectedAdjustedCostEquipment && adjustedCostAmount) {
                                const adjusted_cost = parseInt(adjustedCostAmount);
                                if (adjusted_cost >= 0) {
                                  setEquipmentDiscounts(prev => [
                                    ...prev,
                                    {
                                      equipment_id: selectedAdjustedCostEquipment,
                                      adjusted_cost
                                    }
                                  ]);
                                  setShowAdjustedCostDialog(false);
                                  setSelectedAdjustedCostEquipment("");
                                  setAdjustedCostAmount("");
                                }
                              }
                            }}
                            disabled={!selectedAdjustedCostEquipment || !adjustedCostAmount || parseInt(adjustedCostAmount) < 0}
                            className="bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
                          >
                            Save Adjusted Cost
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Gang-Specific Costs section */}
              <div className="col-span-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Gang-Specific Costs
                </label>
                <Button
                  onClick={() => setShowGangCostDialog(true)}
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  disabled={!selectedFighterTypeId}
                >
                  Add Gang-Specific Cost
                </Button>
                {!selectedFighterTypeId && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Select a fighter type to add gang-specific costs
                  </p>
                )}

                {gangTypeCosts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {gangTypeCosts.map((gangCost, index) => {
                      const gangType = gangTypes.find(g => g.gang_type_id === gangCost.gang_type_id);
                      const affiliation = gangCost.gang_affiliation_id 
                        ? gangAffiliations.find(a => a.id === gangCost.gang_affiliation_id)
                        : null;
                      
                      const displayText = affiliation
                        ? `${gangType?.gang_type || 'Unknown Gang'} (${affiliation.name}) - ${gangCost.adjusted_cost} credits`
                        : `${gangType?.gang_type || 'Unknown Gang'} - ${gangCost.adjusted_cost} credits`;
                      
                      return (
                        <div
                          key={`${gangCost.gang_type_id}-${gangCost.gang_affiliation_id || 'none'}-${index}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                        >
                          <span>{displayText}</span>
                          <button
                            onClick={() => {
                              setGangTypeCosts(gangTypeCosts.filter((_, i) => i !== index));
                            }}
                            className="hover:text-red-500 focus:outline-hidden"
                          >
                            <HiX className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Use the standard Modal component for Gang Cost dialog */}
                {showGangCostDialog && (
                  <Modal
                    title="Gang-Specific Cost"
                    content={gangCostModalContent}
                    onClose={() => {
                      setShowGangCostDialog(false);
                      setSelectedGangTypeForCost("");
                      setSelectedGangAffiliationForCost("");
                      if (gangAdjustedCostInputRef.current) {
                        gangAdjustedCostInputRef.current.value = '';
                      }
                    }}
                    onConfirm={handleAddGangCost}
                    confirmText="Save Cost"
                    confirmDisabled={!selectedGangTypeForCost}
                  />
                )}
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Selection
                </label>
                <AdminFighterEquipmentSelection
                  key={`equipment-selection-${selectedFighterTypeId}`}
                  equipment={filteredEquipment}
                  equipmentSelection={equipmentSelection}
                  setEquipmentSelection={(newSelection) => {
                    // Check if this is a removal operation (fewer categories than before)
                    if (Object.keys(newSelection).length < Object.keys(equipmentSelection).length) {
                      console.log('Category removal detected, setting flag to prevent API refetch');
                      userRemovedCategoryRef.current = true;
                    }
                    setEquipmentSelection(newSelection);
                  }}
                      disabled={!selectedFighterTypeId}
                />
              </div>
            </>
          )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedSpecialisationId || selectedFighterSubtypes.length === 0 || isLoading}
            className="px-4 py-2 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Updating...' : 'Update Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
} 
