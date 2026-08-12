'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { HiX } from "react-icons/hi";
import { GangType, Equipment } from "@/types/gang";
import { EditionSelect, useEditions } from '@/components/edition-select';
import { hasAlignment, hasSaveCharacteristic, allowsMultipleSubtypes, hasStartingXp, hasVehicles } from '@/types/edition';
import { toggleFighterSubtype } from '@/utils/allowedFighterSubtypes';
import { getSkillSetRank } from "@/utils/skillSetRank";
import { compareEquipmentCategories } from "@/utils/getEquipmentCategoryRank";

interface AdminCreateFighterTypeModalProps {
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

interface EquipmentWithId extends Equipment {
  id: string;
  equipment_id: string;
  fighter_equipment_id: string;
  equipment_name: string;
  equipment_type: 'weapon' | 'wargear' | 'vehicle_upgrade';
  cost: number;
  availability?: string | null;
  equipment_category: string;
  edition_id?: string | null;
}

export function AdminCreateFighterTypeModal({ onClose, onSubmit }: AdminCreateFighterTypeModalProps) {
  const queryClient = useQueryClient();
  const [fighterType, setFighterType] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [delegationCost, setDelegationCost] = useState('');
  const [startingXp, setStartingXp] = useState('');
  const [selectedGangType, setSelectedGangType] = useState('');
  const [editionId, setEditionId] = useState('');
  const [selectedFighterSubtypes, setSelectedFighterSubtypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
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
  const [specialRules, setSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');
  const [freeSkill, setFreeSkill] = useState(false);
  const [isGangAddition, setIsGangAddition] = useState(false);
  const [isDramatisPersonae, setIsDramatisPersonae] = useState(false);
  const [isSpyrer, setIsSpyrer] = useState(false);
  const [isVehicle, setIsVehicle] = useState(false);
  const [alignment, setAlignment] = useState<string>('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loadedSkills, setLoadedSkills] = useState<Skill[]>([]);
  const [equipmentListSelections, setEquipmentListSelections] = useState<string[]>([]);
  const [equipmentDiscounts, setEquipmentDiscounts] = useState<{
    equipment_id: string;
    adjusted_cost: number;
  }[]>([]);
  const [selectedAdjustedCostEquipment, setSelectedAdjustedCostEquipment] = useState('');
  const [adjustedCostAmount, setAdjustedCostAmount] = useState('');
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [specialisationName, setSpecialisationName] = useState('');

  

  const isCrew = selectedFighterSubtypes.includes('Crew');

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

  const { data: equipment = [] } = useQuery<EquipmentWithId[]>({
    queryKey: ['admin-equipment-list'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      const data = await response.json();
      return data.map((item: any) => ({
        ...item,
        id: item.id,
        equipment_id: item.id,
      })) as EquipmentWithId[];
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

  const { data: skillTypes = [] } = useQuery<SkillType[]>({
    queryKey: ['admin-skill-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/skill-types');
      if (!response.ok) throw new Error('Failed to fetch skill sets');
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
          let groupLabel = "Misc."; // Default category for unranked skills

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

  const filteredEquipment = useMemo(
    () => editionId ? equipment.filter(item => item.edition_id === editionId) : equipment,
    [equipment, editionId]
  );

  const handleToggleFighterSubtype = (subtypeName: string, checked: boolean) => {
    setSelectedFighterSubtypes(
      toggleFighterSubtype(selectedFighterSubtypes, filteredFighterSubtypes, subtypeName, checked)
    );
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    // Skills are edition-owned through their skill set. Unknown skill metadata
    // is discarded as well so a stale selection can never be submitted after
    // the user explicitly changes edition.
    setSelectedSkills(prev => prev.filter(skillId => {
      const skill = loadedSkills.find(candidate => candidate.id === skillId);
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

    if (newEditionId && selectedGangType) {
      const gangType = gangTypes.find(type => type.gang_type_id === selectedGangType);
      if (gangType && gangType.edition_id !== newEditionId) {
        setSelectedGangType('');
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
  };

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ['admin-skills', selectedSkillType, editionId],
    queryFn: async () => {
      const params = new URLSearchParams({ skill_type_id: selectedSkillType });
      if (editionId) params.set('edition_id', editionId);
      const response = await fetch(`/api/admin/skills?${params}`);
      if (!response.ok) throw new Error('Failed to fetch skills');
      const data = await response.json();
      return Array.isArray(data) ? data : data.skills || [];
    },
    enabled: !!selectedSkillType,
    staleTime: 5 * 60 * 1000,
  });

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
    // Check if selected fighter subtype is Crew
    const isCrew = selectedFighterSubtypes.includes('Crew');

    // Modify validation for Crew subtype
    if (!selectedGangType || selectedFighterSubtypes.length === 0 || !fighterType) {
      toast.error("Please fill in all required fields");
      return false;
    }

    // For Crew, only validate BS
    if (isCrew && !ballisticSkill) {
      toast.error("Please fill in Ballistic Skill (BS)");
      return false;
    }

    // For non-Crew fighters, validate all combat stats
    if (!isCrew && (!movement || !weaponSkill || !strength || !toughness || !wounds || !initiative || !attacks)) {
      toast.error("Please fill in all required stats");
      return false;
    }

    setIsLoading(true);
    try {
      // Handle specialisation if provided
      let specialisationId = null;
      if (specialisationName.trim()) {
        try {
          // First, check if a specialisation with this name (case insensitive) already exists
          const checkResponse = await fetch('/api/admin/fighter-specialisations');
          if (!checkResponse.ok) throw new Error('Failed to fetch specialisations');
          
          const existingSpecialisations = await checkResponse.json();
          const matchingSpecialisation = existingSpecialisations.find(
            (st: any) => st.specialisation_name.toLowerCase() === specialisationName.trim().toLowerCase()
          );
          
          if (matchingSpecialisation) {
            // Use existing specialisation
            specialisationId = matchingSpecialisation.id;
            
            // Show toast notification
            toast.success(`Using existing specialisation "${matchingSpecialisation.specialisation_name}" instead of creating a duplicate`);
          } else {
            // Create new specialisation with proper capitalization
            const formattedName = specialisationName.trim().charAt(0).toUpperCase() + specialisationName.trim().slice(1);
            
            const specialisationResponse = await fetch('/api/admin/fighter-specialisations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ specialisation_name: formattedName }),
            });
            
            if (!specialisationResponse.ok) throw new Error('Failed to create fighter specialisation');
            
            const newSpecialisation = await specialisationResponse.json();
            specialisationId = newSpecialisation.id;
          }
        } catch (error) {
          console.error('Error handling specialisation:', error);
          toast.error('Failed to process fighter specialisation');
          return false;
        }
      }

      const requestData = {
        fighterType,
        baseCost: parseInt(baseCost),
        gangTypeId: selectedGangType,
        fighterSubtypes: selectedFighterSubtypes,
        fighterSpecialisationId: specialisationId,
        fighterSpecialisation: specialisationName.trim() || null,
        movement: movement ? parseInt(movement) : null,
        weapon_skill: weaponSkill ? parseInt(weaponSkill) : null,
        ballistic_skill: ballisticSkill ? parseInt(ballisticSkill) : null,
        strength: strength ? parseInt(strength) : null,
        toughness: toughness ? parseInt(toughness) : null,
        wounds: wounds ? parseInt(wounds) : null,
        initiative: initiative ? parseInt(initiative) : null,
        leadership: leadership ? parseInt(leadership) : null,
        cool: cool ? parseInt(cool) : null,
        willpower: willpower ? parseInt(willpower) : null,
        intelligence: intelligence ? parseInt(intelligence) : null,
        attacks: attacks ? parseInt(attacks) : null,
        save: showSave && save ? parseInt(save) : null,
        special_rules: specialRules,
        free_skill: freeSkill,
        is_gang_addition: isGangAddition,
        is_dramatis_personae: isDramatisPersonae,
        is_spyrer: isSpyrer,
        is_vehicle: isVehicle,
        alignment: showAlignment ? (alignment || null) : null,
        delegation_cost: delegationCost ? parseInt(delegationCost) : null,
        // Blank means N/A — a type that can never gain XP — and stores null.
        // Editions without the concept send an explicit 0 instead: the field is
        // hidden for them, and their fighters do gain XP, starting from none.
        starting_xp: showStartingXp ? (startingXp === '' ? null : parseInt(startingXp)) : 0,
        default_equipment: selectedEquipment,
        default_skills: selectedSkills,
        equipment_list: equipmentListSelections,
        equipment_discounts: equipmentDiscounts
      };


      const response = await fetch('/api/admin/fighter-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Failed to create fighter type');
      }

      toast.success("Fighter type created successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-fighter-subtypes'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-skill-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-skills'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-fighter-types'] }),
      ]);

      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true;
    } catch (error) {
      console.error('Error creating fighter type:', error);
      toast.error('Failed to create fighter type');
      return false;
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Add Fighter Type</h3>
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
                Gang Type *
              </label>
              <select
                value={selectedGangType}
                onChange={(e) => setSelectedGangType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select gang type</option>
                {filteredGangTypes.map((type) => (
                  <option key={type.gang_type_id} value={type.gang_type_id}>
                    {type.gang_type}
                  </option>
                ))}
              </select>
            </div>

            <div className={`grid grid-cols-1 ${allowMultipleSubtypes ? '' : 'md:grid-cols-2'} gap-4`}>
              <div className={allowMultipleSubtypes ? '' : 'md:col-span-1'}>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter Type *
                </label>
                <Input
                  type="text"
                  value={fighterType}
                  onChange={(e) => setFighterType(e.target.value)}
                  placeholder="e.g. Stimmer"
                  className="w-full"
                />
              </div>

              {!allowMultipleSubtypes && (
                <div className="md:col-span-1">
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
            </div>

            {allowMultipleSubtypes && (
              <div>
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
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter Specialisation
                </label>
                <Input
                  type="text"
                  value={specialisationName}
                  onChange={(e) => setSpecialisationName(e.target.value)}
                  placeholder="e.g. Subjugator (leave blank to use the Default specialisation)"
                  className="w-full"
                />
              </div>

              <div className="md:col-span-1">
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

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  M {!isCrew && '*'}
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
                  WS {!isCrew && '*'}
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
                  S {!isCrew && '*'}
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
                  T {!isCrew && '*'}
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
                  W {!isCrew && '*'}
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
                  I {!isCrew && '*'}
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
                  A {!isCrew && '*'}
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

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Default Equipment
              </label>
              <select
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && !selectedEquipment.includes(value)) {
                    setSelectedEquipment([...selectedEquipment, value]);
                  }
                  // Reset the select to empty after selection
                  e.target.value = "";
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select equipment to add</option>
                {filteredEquipment
                  .filter(item => !selectedEquipment.includes(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>

              <div className="mt-2 flex flex-wrap gap-2">
                {selectedEquipment.map((equipId) => {
                  const item = equipment.find(e => e.id === equipId);
                  if (!item) return null;
                  
                  return (
                    <div 
                      key={item.id}
                      className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-sm"
                    >
                      <span>{item.equipment_name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedEquipment(selectedEquipment.filter(id => id !== item.id))}
                        className="hover:text-red-500 focus:outline-hidden"
                      >
                          <HiX className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Default Skills
              </label>
              <div className="space-y-2">
                <select
                  value={selectedSkillType}
                  onChange={(e) => setSelectedSkillType(e.target.value)}
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
                      const selectedSkill = skills.find(skill => skill.id === value);
                      if (selectedSkill) {
                        setLoadedSkills(previous => {
                          const merged = new Map(previous.map(skill => [skill.id, skill]));
                          merged.set(selectedSkill.id, selectedSkill);
                          return Array.from(merged.values());
                        });
                      }
                      setSelectedSkills([...selectedSkills, value]);
                    }
                    e.target.value = "";
                  }}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedSkillType}
                >
                  <option value="">Select a skill to add</option>
                  {skills
                    .filter(skill => !selectedSkills.includes(skill.id))
                    .map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.skill_name}
                      </option>
                    ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedSkills.map((skillId) => {
                    const skill = loadedSkills.find(s => s.id === skillId);
                    if (!skill) return null;
                    
                    return (
                      <div 
                        key={skill.id}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-sm"
                      >
                        <span>{skill.skill_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSkills(selectedSkills.filter(id => id !== skill.id))}
                          className="hover:text-red-500 focus:outline-hidden"
                        >
                          <HiX className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
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
              >
                <option value="">Available equipment</option>
                {[...filteredEquipment]
                  .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(
                  equipmentListSelections
                    .map(equipId => equipment.find(e => e.id === equipId))
                    .filter(item => item !== undefined) // Remove null values
                    .sort((a, b) => {
                      const categoryCompare = compareEquipmentCategories(
                        a!.equipment_category,
                        b!.equipment_category,
                        editionSlug
                      );
                      if (categoryCompare !== 0) return categoryCompare;

                      // If same category, sort alphabetically by equipment name
                      return a!.equipment_name.localeCompare(b!.equipment_name);
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
                disabled={!selectedGangType}
              >
                Add Equipment Adjusted Cost
              </Button>

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
            disabled={
              !baseCost ||
              !selectedGangType ||
              selectedFighterSubtypes.length === 0 ||
              !fighterType ||
              !ballisticSkill ||
              !isCrew && (
                !movement ||
                !weaponSkill ||
                !strength ||
                !toughness ||
                !wounds ||
                !initiative ||
                !attacks ||
                !leadership ||
                !cool ||
                !willpower ||
                !intelligence
              ) ||
              isLoading
            }
            className="bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
}
