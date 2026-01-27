'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { HiX } from "react-icons/hi";
import { LuTrash2 } from "react-icons/lu";
import { FighterType } from "@/types/fighter";
import { GangType } from "@/types/gang";
import { Equipment } from '@/types/equipment';
import { skillSetRank } from "@/utils/skillSetRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { AdminFighterEquipmentSelection, EquipmentSelection, EquipmentOption, guiToDataModel, dataModelToGui } from "@/components/admin/admin-fighter-equipment-selection";
import Modal from '@/components/ui/modal';
import { AdminFighterTradingPostAccess } from "@/components/admin/admin-fighter-trading-post-access";

interface FighterSubType {
  id: string;
  sub_type_name: string;
  fighterId?: string;
}

interface EquipmentWithId extends Equipment {
  id: string;
}

interface AdminEditFighterTypeModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

interface FighterClass {
  id: string;
  class_name: string;
}

interface SkillType {
  id: string;
  skill_type: string;
}

interface Skill {
  id: string;
  skill_name: string;
  skill_type_id: string;
}

interface Fighter {
  id: string;
  fighter_type: string;
  fighter_class: string;
  gang_type_id: string;
  fighter_sub_type_id?: string | null;
}

interface SubType {
  id: string;
  sub_type_name: string;
}

// Add this interface to track fighter type+class combinations
interface FighterTypeCombo {
  type: string;
  class: string;
  gang_type_id: string;
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
  // Update state to track fighter type+class combinations
  const [selectedFighterTypeCombo, setSelectedFighterTypeCombo] = useState<string>('');
  const [fighterTypeCombos, setFighterTypeCombos] = useState<FighterTypeCombo[]>([]);
  
  // Keep existing state variables
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [fighterType, setFighterType] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [selectedFighterClass, setSelectedFighterClass] = useState<string>('');
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fighterSubTypes, setFighterSubTypes] = useState<FighterSubType[]>([]);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string>('');
  const [availableSubTypes, setAvailableSubTypes] = useState<FighterSubType[]>([]);
  const [isPending, startTransition] = useTransition();

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
  const [specialSkills, setSpecialSkills] = useState('');
  const [freeSkill, setFreeSkill] = useState(false);
  const [isGangAddition, setIsGangAddition] = useState(false);
  const [isSpyrer, setIsSpyrer] = useState(false);
  const [alignment, setAlignment] = useState<string>('');
  const [equipment, setEquipment] = useState<EquipmentWithId[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [gangTypeFilter, setGangTypeFilter] = useState('');
  const [fighterClasses, setFighterClasses] = useState<FighterClass[]>([]);
  const [skillTypes, setSkillTypes] = useState<SkillType[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedEquipmentType, setSelectedEquipmentType] = useState('');
  const [equipmentListSelections, setEquipmentListSelections] = useState<string[]>([]);
  const [equipmentDiscounts, setEquipmentDiscounts] = useState<{
    equipment_id: string;
    adjusted_cost: number;
  }[]>([]);
  const [selectedAdjustedCostEquipment, setSelectedAdjustedCostEquipment] = useState('');
  const [adjustedCostAmount, setAdjustedCostAmount] = useState('');
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [tradingPostEquipment, setTradingPostEquipment] = useState<string[]>([]);
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({});
  const [isEquipmentLoaded, setIsEquipmentLoaded] = useState(false);

  // Add a new state variable to track the sub-type name
  const [subTypeName, setSubTypeName] = useState('');

  // Add new state for gang-specific costs
  const [showGangCostDialog, setShowGangCostDialog] = useState(false);
  const [selectedGangTypeForCost, setSelectedGangTypeForCost] = useState('');
  const [gangTypeCosts, setGangTypeCosts] = useState<FighterTypeGangCost[]>([]);
  const [gangAffiliations, setGangAffiliations] = useState<GangAffiliation[]>([]);
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
  const subTypeNameInputRef = useRef<HTMLInputElement>(null);
  const specialSkillsInputRef = useRef<HTMLInputElement>(null);
  const gangAdjustedCostInputRef = useRef<HTMLInputElement>(null);
  
  // Add a ref to track if equipment categories have been loaded
  const hasLoadedEquipmentCategoriesRef = useRef(false);
  
  // Add a flag ref to prevent duplicate fetches
  const isFetchingFighterClassesRef = useRef(false);
  
  // Add a flag ref to prevent duplicate fetches
  const isFetchingFighterTypeDetailsRef = useRef(false);

  // Only fetch skill sets when needed
  const [hasLoadedSkillTypesRef] = useState<{ current: boolean }>({ current: false });

  // Add a ref to track if a category was manually removed
  const userRemovedCategoryRef = useRef(false);

  // Track which skill IDs we've already fetched details for
  const fetchedSkillDetailsRef = useRef<Set<string>>(new Set());

  // When fighter type or subtype values change from API, update the refs
  useEffect(() => {
    if (fighterTypeInputRef.current) {
      fighterTypeInputRef.current.value = fighterType;
    }
  }, [fighterType]);

  useEffect(() => {
    if (subTypeNameInputRef.current) {
      subTypeNameInputRef.current.value = subTypeName;
    }
  }, [subTypeName]);

  useEffect(() => {
    if (specialSkillsInputRef.current) {
      specialSkillsInputRef.current.value = specialSkills;
    }
  }, [specialSkills]);

  const { toast } = useToast();

  // Memoize filtered skills to avoid recalculating on every render
  const availableSkills = useMemo(() => {
    if (!Array.isArray(skills)) return [];
    return skills.filter(skill => !selectedSkills.includes(skill.id));
  }, [skills, selectedSkills]);

  // Memoize grouped skill types to avoid expensive computation on every render
  const groupedSkillTypes = useMemo(() => {
    return Object.entries(
      skillTypes
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
        }, {} as Record<string, typeof skillTypes>)
    );
  }, [skillTypes]);

  // Preload equipment data when the component mounts
  useEffect(() => {
    // Fetch equipment data right away
    const preloadEquipment = async () => {
      try {
        if (!hasLoadedEquipmentCategoriesRef.current) {
          console.log('Preloading equipment data on mount');
          await fetchEquipmentByCategory();
          setIsEquipmentLoaded(true);
        }
      } catch (error) {
        console.error('Error preloading equipment:', error);
      }
    };
    
    preloadEquipment();
  }, []);

  // Only fetch gang types when the modal opens
  useEffect(() => {
    const fetchGangTypes = async () => {
      try {
        const response = await fetch('/api/admin/gang-types');
        if (!response.ok) throw new Error('Failed to fetch gang types');
        const data = await response.json();
        setGangTypes(data);
      } catch (error) {
        console.error('Error fetching gang types:', error);
        toast({
          description: 'Failed to load gang types',
          variant: "destructive"
        });
      }
    };

    fetchGangTypes();
  }, [toast]);

  // Fetch gang affiliations when the modal opens
  useEffect(() => {
    const fetchGangAffiliations = async () => {
      try {
        const response = await fetch('/api/admin/gang-lineages?type=affiliation');
        if (!response.ok) throw new Error('Failed to fetch gang affiliations');
        const data = await response.json();
        setGangAffiliations(data);
      } catch (error) {
        console.error('Error fetching gang affiliations:', error);
        toast({
          description: 'Failed to load gang affiliations',
          variant: "destructive"
        });
      }
    };

    fetchGangAffiliations();
  }, [toast]);

  // New useEffect to fetch fighter classes
  useEffect(() => {
    const fetchFighterClasses = async () => {
      try {
        console.log('Fetching all fighter classes');
        const response = await fetch('/api/admin/fighter-classes');
        if (!response.ok) throw new Error('Failed to fetch fighter classes');
        const data = await response.json();
        console.log('Loaded fighter classes:', data);
        setFighterClasses(data);
      } catch (error) {
        console.error('Error fetching fighter classes:', error);
        toast({
          description: 'Failed to load fighter classes',
          variant: "destructive"
        });
      }
    };

    fetchFighterClasses();
  }, [toast]);

  // Modify fighter types fetch to extract unique combinations
  useEffect(() => {
    if (!gangTypeFilter) return; // Only fetch if gang type is selected
    
    const fetchFighterTypes = async () => {
      try {
        console.log('Fetching fighter types for gang type:', gangTypeFilter);
        // Add explicit filter parameter in the URL
        const response = await fetch(`/api/admin/fighter-types?gang_type_id=${gangTypeFilter}&filter_by_gang=true`);
        if (!response.ok) throw new Error('Failed to fetch fighter types');
        const data = await response.json();
        
        // Log the count of retrieved fighter types
        console.log(`Retrieved ${Array.isArray(data) ? data.length : 0} fighter types for this gang`);
        
        // Store the full fighter type data
        setFighterTypes(Array.isArray(data) ? data : []);
        
        // Extract unique fighter type + class combinations
        const uniqueCombinations: FighterTypeCombo[] = [];
        
        if (Array.isArray(data)) {
          data.forEach(fighter => {
            // Check if this combination already exists in our array
            const existingCombo = uniqueCombinations.find(
              combo => combo.type === fighter.fighter_type && 
                      combo.class === fighter.fighter_class &&
                      combo.gang_type_id === fighter.gang_type_id
            );
            
            // If not, add it
            if (!existingCombo) {
              uniqueCombinations.push({
                type: fighter.fighter_type,
                class: fighter.fighter_class,
                gang_type_id: fighter.gang_type_id
              });
            }
          });
        }
        
        // Sort combinations by type and then class
        uniqueCombinations.sort((a, b) => {
          // First sort by type
          const typeCompare = a.type.localeCompare(b.type);
          if (typeCompare !== 0) return typeCompare;
          
          // If types are the same, sort by class
          return a.class.localeCompare(b.class);
        });
        
        setFighterTypeCombos(uniqueCombinations);
      } catch (error) {
        console.error('Error fetching fighter types:', error);
        toast({
          description: 'Failed to load fighter types',
          variant: "destructive"
        });
      }
    };

    fetchFighterTypes();
  }, [toast, gangTypeFilter]);

  // NOTE: We've removed the automatic equipment fetching, it will be loaded on-demand 
  // when needed (e.g., when opening dialogs that need equipment data)

  const fetchSkillTypes = async () => {
    // Only fetch if we haven't already loaded the data
    if (hasLoadedSkillTypesRef.current) {
      console.log('Using cached skill sets');
        return;
      }
      
    console.log('Fetching skill sets...');
    try {
        const response = await fetch('/api/admin/skill-types');
      if (!response.ok) {
        throw new Error(`Failed to fetch skill sets: ${response.status} ${response.statusText}`);
      }
      
        const data = await response.json();
      console.log(`Loaded ${data.length} skill sets`);
        setSkillTypes(data);
      hasLoadedSkillTypesRef.current = true;
      return data;
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
        description: 'Failed to load skill sets. Some features may be limited.',
          variant: "destructive"
        });
      // Don't throw, just report the error and continue
      return null;
      }
    };

  useEffect(() => {
    const fetchSkills = async () => {
      if (!selectedSkillType) {
        setSkills([]);
        return;
      }

      try {
        const response = await fetch(`/api/admin/skills?skill_type_id=${selectedSkillType}`);
        if (!response.ok) throw new Error('Failed to fetch skills');
        const data = await response.json();
        // API returns {skills: [], effect_categories: []} when filtered by skill_type_id
        const skillsArray = Array.isArray(data) ? data : data.skills || [];
        setSkills(skillsArray);
      } catch (error) {
        console.error('Error fetching skills:', error);
        toast({
          description: 'Failed to load skills',
          variant: "destructive"
        });
      }
    };

    fetchSkills();
  }, [selectedSkillType, toast]);

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
          setSkills(prevSkills => [...prevSkills, ...missingSkills]);
          // Mark these skills as fetched
          missingSkillIds.forEach(id => fetchedSkillDetailsRef.current.add(id));
        }
      } catch (error) {
        console.error('Error fetching selected skill details:', error);
      }
    };

    fetchSelectedSkillDetails();
  }, [selectedSkills, selectedFighterTypeId]);

  // Only fetch fighter sub-types when needed
  useEffect(() => {
    if (!selectedFighterTypeId) return; // Only fetch if fighter type is selected
    
    const fetchFighterSubTypes = async () => {
      try {
        const response = await fetch('/api/admin/fighter-sub-types');
        if (!response.ok) throw new Error('Failed to fetch fighter sub-types');
        const data = await response.json();
        setFighterSubTypes(data);
      } catch (error) {
        console.error('Error fetching fighter sub-types:', error);
        toast({
          description: 'Failed to load fighter sub-types',
          variant: "destructive"
        });
      }
    };

    fetchFighterSubTypes();
  }, [toast, selectedFighterTypeId]);

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

      // Force override fighter_sub_type_id to null if we're in "default" mode
      if (selectedSubTypeId === "default") {
        console.log('Forcing fighter_sub_type_id to null since Default is selected');
        data = { ...data, fighter_sub_type_id: null };
      }

      // Set the form data
      setFighterType(data.fighter_type || '');
      setBaseCost(data.cost?.toString() || '0');
      setSelectedFighterClass(data.fighter_class || '');
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
      setSpecialSkills(data.special_rules?.join(', ') || '');
      setFreeSkill(!!data.free_skill);
      setIsGangAddition(!!data.is_gang_addition);
      setIsSpyrer(!!data.is_spyrer);
      setAlignment(data.alignment || '');
      setSelectedEquipment(data.default_equipment || []);
      setSelectedSkills(data.default_skills || []);
      // Reset fetched skills tracking when loading a new fighter type
      fetchedSkillDetailsRef.current.clear();
      setEquipmentListSelections(data.equipment_list || []);
      setEquipmentDiscounts(data.equipment_discounts || []);
      setTradingPostEquipment(data.trading_post_equipment || []);
      
      // Set gang-specific costs if they exist
      if (data.gang_type_costs && Array.isArray(data.gang_type_costs)) {
        setGangTypeCosts(data.gang_type_costs);
      } else {
        setGangTypeCosts([]);
      }

      // Only set subTypeName if NOT explicitly handling a "default" selection
      // and there's a fighter_sub_type_id in the response
      if (selectedSubTypeId !== "default" && data.fighter_sub_type_id) {
        // First look in our available sub-types
        let subType = availableSubTypes.find(st => st.id === data.fighter_sub_type_id);
        
        // If we couldn't find it there, look in the full fighterSubTypes array
        if (!subType && fighterSubTypes.length > 0) {
          subType = fighterSubTypes.find(st => st.id === data.fighter_sub_type_id);
        }
        
        // If we found the sub-type, set its name
        if (subType) {
          console.log(`Found sub-type name: ${subType.sub_type_name} for ID: ${data.fighter_sub_type_id}`);
          setSubTypeName(subType.sub_type_name);
          
          // Update the input field directly as well for immediate feedback
          if (subTypeNameInputRef.current) {
            subTypeNameInputRef.current.value = subType.sub_type_name;
          }
        } else {
          // If we couldn't find the sub-type info, fetch it directly
          try {
            const subTypeResponse = await fetch(`/api/admin/fighter-sub-types?id=${data.fighter_sub_type_id}`);
            if (subTypeResponse.ok) {
              const subTypeData = await subTypeResponse.json();
              console.log(`Fetched sub-type data:`, subTypeData);
              if (subTypeData && subTypeData.sub_type_name) {
                setSubTypeName(subTypeData.sub_type_name);
                
                // Update the input field directly as well
                if (subTypeNameInputRef.current) {
                  subTypeNameInputRef.current.value = subTypeData.sub_type_name;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching sub-type details:', error);
          }
        }
      } 
      // Remove the problematic code block starting here
      else if (selectedSubTypeId === "default") {
        // Just clear the subtype name field when "Default" is selected
        setSubTypeName('');
        if (subTypeNameInputRef.current) {
          subTypeNameInputRef.current.value = '';
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
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch fighter type details",
        variant: "destructive",
      });
      return null;
    } finally {
      isFetchingFighterTypeDetailsRef.current = false;
    }
  };

  const handleFighterTypeComboChange = (comboString: string) => {
    console.log('handleFighterTypeComboChange called with:', comboString);
    
    setSelectedFighterTypeCombo(comboString);
    setSelectedFighterTypeId('');
    setSelectedSubTypeId('');
    setAvailableSubTypes([]);
    setSubTypeName('');
    
    // Clear the sub-type input field directly
    if (subTypeNameInputRef.current) {
      subTypeNameInputRef.current.value = '';
    }
    
    if (!comboString) return;
    
    try {
      // Parse the combo string to get type, class, and gang_type_id
      const [fighterType, fighterClass, gangTypeId] = comboString.split('|');
      
      if (!fighterType || !fighterClass || !gangTypeId) {
        console.error('Invalid fighter type combo string:', comboString);
        return;
      }
      
      // Find all fighters that match this type+class+gang_type
      const matchingFighters = fighterTypes.filter(f => 
        f.fighter_type === fighterType && 
        f.fighter_class === fighterClass && 
        f.gang_type_id === gangTypeId
      );
      
      console.log(`Found ${matchingFighters.length} fighters matching ${fighterType} (${fighterClass})`);
      
      // Prepare sub-type options, including a "Default" option
      const subTypeOptions: FighterSubType[] = [];
      
      // First add default option (fighters without sub-type)
      const defaultFighters = matchingFighters.filter(f => 
        !f.fighter_sub_type_id || 
        f.fighter_sub_type_id === null || 
        f.fighter_sub_type_id === "" || 
        f.fighter_sub_type_id === "null"
      );
      
      if (defaultFighters.length > 0) {
        // Use the first default fighter's ID
        const defaultFighter = defaultFighters[0];
        subTypeOptions.push({
          id: "default",
          sub_type_name: "Default",
          fighterId: defaultFighter.id
        });
      }
      
      // Get all fighters with sub-types
      const subtypedFighters = matchingFighters.filter(f => 
        f.fighter_sub_type_id && 
        f.fighter_sub_type_id !== null && 
        f.fighter_sub_type_id !== "" && 
        f.fighter_sub_type_id !== "null"
      );
      
      // We need to fetch sub-type names for these fighters
      if (subtypedFighters.length > 0) {
        // Collect unique sub-type IDs - using Array.from for broader compatibility
        const subTypeIds = Array.from(
          new Set(
            subtypedFighters
              .map(f => f.fighter_sub_type_id)
              .filter(id => id !== null && id !== undefined)
          )
        ) as string[];
        
        if (subTypeIds.length > 0) {
          // For each fighter with a sub-type, create an option
          subtypedFighters.forEach(fighter => {
            if (!fighter.fighter_sub_type_id) return;
            
            // Just use a placeholder name for now, it will be updated later
            const placeholderName = "Loading...";
            
            subTypeOptions.push({
              id: fighter.fighter_sub_type_id,
              sub_type_name: placeholderName,
              fighterId: fighter.id
            });
          });
          
          // Fetch the actual sub-type names
          fetchSubTypeNames(subTypeOptions);
        }
      }
      
      // Sort sub-types by name (keeping Default first)
      subTypeOptions.sort((a, b) => {
        if (a.id === "default") return -1;
        if (b.id === "default") return 1;
        return a.sub_type_name.localeCompare(b.sub_type_name);
      });
      
      // Update available sub-types
      setAvailableSubTypes(subTypeOptions);
      
      // Setup basic fighter type info
      if (matchingFighters.length > 0) {
        // Use any fighter from the matching set to get basic type info
        const fighter = matchingFighters[0];
        setFighterType(fighter.fighter_type);
        setSelectedFighterClass(fighter.fighter_class);
        
        // Don't overwrite the full list of fighter classes, just ensure the current one is selected
        // Comment out this code that's overwriting all fighter classes
        /*
        if (fighter.fighter_class && fighter.fighter_class_id) {
          setFighterClasses([{
            id: fighter.fighter_class_id,
            class_name: fighter.fighter_class
          }]);
        }
        */
      }
    } catch (error) {
      console.error('Error processing fighter type combo:', error);
    }
  };
  
  // Add a new function to fetch sub-type names
  const fetchSubTypeNames = async (subTypeOptions: FighterSubType[]) => {
    try {
      const response = await fetch('/api/admin/fighter-sub-types');
      if (!response.ok) throw new Error('Failed to fetch fighter sub-types');
      const subTypesData = await response.json();
      
      // Update the sub-type names in our options
      const updatedOptions = subTypeOptions.map(option => {
        if (option.id === "default") return option;
        
        const subType = subTypesData.find((st: SubType) => st.id === option.id);
        if (subType) {
          return {
            ...option,
            sub_type_name: subType.sub_type_name
          };
        }
        return option;
      });
      
      // Sort again with the updated names (keeping Default first)
      updatedOptions.sort((a, b) => {
        if (a.id === "default") return -1;
        if (b.id === "default") return 1;
        return a.sub_type_name.localeCompare(b.sub_type_name);
      });
      
      setAvailableSubTypes(updatedOptions);
    } catch (error) {
      console.error('Error fetching sub-type names:', error);
    }
  };

  const handleSubTypeChange = async (subTypeId: string) => {
    console.log('handleSubTypeChange called with subTypeId:', subTypeId);
    
    // Update selected sub-type ID
    setSelectedSubTypeId(subTypeId);
    
    if (!subTypeId) {
      // Clear sub-type name when no selection
      setSubTypeName('');
      if (subTypeNameInputRef.current) {
        subTypeNameInputRef.current.value = '';
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
      
      // If we need to load skill sets, do it now
      if (!hasLoadedSkillTypesRef.current) {
        console.log('Skill types not yet loaded, loading now...');
        await fetchSkillTypes();
      }
      
      // Find the option in available sub-types
      const selectedOption = availableSubTypes.find(st => st.id === subTypeId);
      
      // If we have an option and it has a fighterId, fetch details
      if (selectedOption && selectedOption.fighterId) {
        setSelectedFighterTypeId(selectedOption.fighterId);
        // Set sub-type name if it's not the default option, otherwise clear it
        if (subTypeId !== "default") {
          setSubTypeName(selectedOption.sub_type_name);
          if (subTypeNameInputRef.current) {
            subTypeNameInputRef.current.value = selectedOption.sub_type_name;
          }
        } else {
          // For default, start with an empty field that can be edited
          setSubTypeName('');
          if (subTypeNameInputRef.current) {
            subTypeNameInputRef.current.value = '';
          }
        }
        
        // Fetch the fighter details
        console.log(`Fetching details for fighter ID: ${selectedOption.fighterId}`);
        await fetchFighterTypeDetails(selectedOption.fighterId);
      } else {
        toast({
          description: 'Could not find fighter data for the selected sub-type',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error in handleSubTypeChange:', error);
      toast({
        description: 'Failed to load fighter sub-type details',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Add a useEffect to validate equipment selection
  useEffect(() => {
    if (Object.keys(equipmentSelection).length > 0) {
      console.log('Current equipment selection:', equipmentSelection);
      // Validate structure of each category
      Object.entries(equipmentSelection).forEach(([key, category]) => {
        if (!category.select_type) {
          console.warn(`Category ${key} missing select_type, fixing...`);
          setEquipmentSelection(prev => ({
            ...prev,
            [key]: {
              ...prev[key],
              select_type: 'optional'
            }
          }));
        }
        
        if (!category.options) {
          console.warn(`Category ${key} missing options array, fixing...`);
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

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Check if we have a valid sub-type selection
      if (!selectedSubTypeId) {
        throw new Error('Please select a fighter sub-type to edit');
      }
      
      // Get the fighter ID associated with the selected sub-type
      const selectedSubType = availableSubTypes.find(st => st.id === selectedSubTypeId);
      if (!selectedSubType || !selectedSubType.fighterId) {
        throw new Error('Could not find the fighter ID for the selected sub-type');
      }
      
      // The actual fighter ID we need to update comes from the sub-type selection
      const fighterIdToUpdate = selectedSubType.fighterId;
      console.log(`Updating fighter ID: ${fighterIdToUpdate}`);
      
      // Get the base fighter to determine gang type
      const fighterToUpdate = fighterTypes.find(f => f.id === fighterIdToUpdate);
      if (!fighterToUpdate) {
        throw new Error('Selected fighter not found');
      }
      
      console.log('Current selection state:', {
        selectedFighterTypeCombo,
        selectedSubTypeId,
        subTypeName,
        fighterIdToUpdate
      });
      
      const specialRulesArray = specialSkills
        .split(',')
        .map(rule => rule.trim())
        .filter(rule => rule.length > 0);

      const fighterClass = fighterClasses.find(fc => fc.class_name === selectedFighterClass);

      // Validate required fields
      if (!fighterType || !fighterToUpdate?.gang_type_id) {
        throw new Error('Missing required fields');
      }

      // Special handling for subTypeId and subTypeName
      let finalSubTypeId: string | null = null;
      let finalSubTypeName: string | null = null;
      
      // Get the original fighter data to see what subtype it currently has
      const originalFighter = fighterTypes.find(f => f.id === fighterIdToUpdate);
      const originalSubTypeId = originalFighter?.fighter_sub_type_id;
      
      // Get the current subtype name from the input field (might be more up-to-date than state)
      const currentSubTypeName = subTypeNameInputRef.current?.value || subTypeName;
      
      // Get the original subtype name if we need to preserve it
      let originalSubTypeName: string | null = null;
      if (originalSubTypeId) {
        const originalSubType = fighterSubTypes.find(st => st.id === originalSubTypeId);
        originalSubTypeName = originalSubType?.sub_type_name || null;
      }
      
      console.log('Subtype logic - Current state:', {
        selectedSubTypeId,
        subTypeName,
        currentSubTypeName,
        originalSubTypeId,
        originalSubTypeName,
        originalFighterSubTypeId: originalFighter?.fighter_sub_type_id
      });
      
      // Case 1: User selected "default" - Convert to default fighter
      if (selectedSubTypeId === "default") {
        // Check if user added a name to create a new subtype
        if (currentSubTypeName && currentSubTypeName.trim()) {
          try {
            const formattedName = currentSubTypeName.trim().charAt(0).toUpperCase() + currentSubTypeName.trim().slice(1);
            console.log(`Creating new sub-type: "${formattedName}" from default fighter`);
              
            const createResponse = await fetch('/api/admin/fighter-sub-types', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sub_type_name: formattedName }),
            });
              
            if (createResponse.ok) {
              const newSubType = await createResponse.json();
              finalSubTypeId = newSubType.id;
              finalSubTypeName = newSubType.sub_type_name;
              console.log(`Created new sub-type with ID: ${finalSubTypeId}`);
            } else {
              console.error('Failed to create sub-type:', await createResponse.text());
              throw new Error('Failed to create new sub-type');
            }
          } catch (error) {
            console.error('Error creating sub-type:', error);
            throw new Error('Failed to create new sub-type');
          }
        } else {
          // No name provided, keep as default fighter
          finalSubTypeId = null;
          finalSubTypeName = null;
          console.log(`Converting fighter ${fighterIdToUpdate} to default (null sub-type)`);
        }
      }
      // Case 2: User selected an existing subtype - Use that subtype
      else if (selectedSubTypeId && selectedSubTypeId !== "default") {
        finalSubTypeId = selectedSubTypeId;
        
        // If user provided a name in the input, use that; otherwise preserve the original name
        if (currentSubTypeName && currentSubTypeName.trim()) {
          finalSubTypeName = currentSubTypeName.trim();
        } else {
          // No input provided, find and preserve the original subtype name
          const selectedSubType = fighterSubTypes.find(st => st.id === selectedSubTypeId);
          finalSubTypeName = selectedSubType?.sub_type_name || null;
        }
        
        console.log(`Using selected sub-type with ID: ${finalSubTypeId}, name: ${finalSubTypeName}`);
        
        // If user changed the subtype name, update it
        if (currentSubTypeName && currentSubTypeName.trim()) {
          const existingSubType = fighterSubTypes.find(st => st.id === finalSubTypeId);
          if (existingSubType && existingSubType.sub_type_name !== currentSubTypeName.trim()) {
            try {
              console.log(`Updating sub-type name from "${existingSubType.sub_type_name}" to "${currentSubTypeName.trim()}"`);
              const updateResponse = await fetch(`/api/admin/fighter-sub-types?id=${finalSubTypeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sub_type_name: currentSubTypeName.trim() }),
              });
              
              if (!updateResponse.ok) {
                console.error('Failed to update sub-type name:', await updateResponse.text());
              } else {
                finalSubTypeName = currentSubTypeName.trim();
              }
            } catch (error) {
              console.error('Error updating sub-type name:', error);
            }
          }
        }
      }
      // Case 3: No subtype selected but fighter originally had one - preserve original
      else if (!selectedSubTypeId && originalSubTypeId) {
        finalSubTypeId = originalSubTypeId;
        finalSubTypeName = originalSubTypeName;
        console.log(`No subtype selection made, preserving original sub-type ID: ${finalSubTypeId} with name: ${finalSubTypeName}`);
      }
      // Case 4: No subtype selected and fighter was originally default - keep as default
      else {
        finalSubTypeId = null;
        finalSubTypeName = null;
        console.log(`No subtype selection made and fighter was originally default, keeping as default`);
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
        fighter_class: selectedFighterClass,
        fighter_class_id: fighterClass?.id,
        fighter_sub_type_id: finalSubTypeId,
        fighter_sub_type: finalSubTypeName,
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
        special_rules: specialRulesArray,
        free_skill: freeSkill,
        is_gang_addition: isGangAddition,
        is_spyrer: isSpyrer,
        alignment: alignment || null,
        default_equipment: selectedEquipment,
        default_skills: selectedSkills,
        equipment_list: equipmentListSelections,
        equipment_discounts: equipmentDiscounts,
        trading_post_equipment: tradingPostEquipment,
        equipment_selection: guiToDataModel(equipmentSelection),
        gang_type_costs: gangTypeCosts, // Add gang-specific costs
        updated_at: new Date().toISOString(),
        skill_access: skillAccess
      };

      console.log('Sending update data:', updateData);
      console.log('Equipment selection in update data:', updateData.equipment_selection);
      console.log('Selected sub-type and final fighter_sub_type_id:', {
        selectedSubTypeId,
        submittingSubTypeId: updateData.fighter_sub_type_id,
        originalSubTypeId: finalSubTypeId
      });

      // Check if equipment selection is being properly included
      const jsonData = JSON.stringify(updateData);
      console.log('JSON data includes equipment_selection:', 
        jsonData.includes('equipment_selection') && 
        jsonData.includes(Object.keys(equipmentSelection)[0] || '')
      );

      const response = await fetch(`/api/admin/fighter-types?id=${fighterIdToUpdate}`, {
        method: 'PUT',
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

      toast({
        description: "Fighter type updated successfully",
        variant: "default"
      });
      
      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true;
    } catch (error) {
      console.error('Error updating fighter type:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to update fighter type',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAdjustedCost = () => {
    if (!selectedAdjustedCostEquipment || !adjustedCostAmount) return;
    
    const newAdjustedCost = {
      equipment_id: selectedAdjustedCostEquipment,
      adjusted_cost: parseInt(adjustedCostAmount)
    };

    setEquipmentDiscounts([...equipmentDiscounts, newAdjustedCost]);
    setSelectedAdjustedCostEquipment('');
    setAdjustedCostAmount('');
  };

  const handleRemoveAdjustedCost = (equipmentId: string) => {
    setEquipmentDiscounts(equipmentDiscounts.filter(
      adjusted_cost => adjusted_cost.equipment_id !== equipmentId
    ));
  };

  const fetchEquipmentByCategory = async () => {
    // Only fetch if we haven't already loaded the data
    if (hasLoadedEquipmentCategoriesRef.current && equipment.length > 0) {
      console.log('Using cached equipment data');
      return;
    }

    console.log('Starting to fetch equipment data');
    // Track our loading state locally to ensure we don't conflict with other operations
    const wasLoading = isLoading;
    if (!wasLoading) {
      setIsLoading(true);
    }

    try {
      console.log('Fetching equipment data from API...');
      
      // Fetch all equipment from the API
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) {
        throw new Error(`Failed to fetch equipment: ${response.status} ${response.statusText}`);
      }
      
      const equipmentData = await response.json();
      console.log(`Fetched ${equipmentData.length} equipment items`);
      
      // Cast the data for the main equipment state
      const equipmentWithIds = equipmentData.map((item: any) => ({
        ...item,
        id: item.id,
        equipment_id: item.id  // Make sure both properties exist
      })) as EquipmentWithId[];
      
      // Update main equipment state
      setEquipment(equipmentWithIds);
      hasLoadedEquipmentCategoriesRef.current = true;
      console.log('Equipment data successfully loaded');
      
      // Also pre-load skill types
      if (!hasLoadedSkillTypesRef.current) {
        console.log('Loading skill types alongside equipment');
        await fetchSkillTypes();
      }
      
      return equipmentWithIds;
    } catch (error) {
      console.error('Error fetching equipment data:', error);
      toast({
        description: 'Failed to load equipment data. Please try again.',
        variant: "destructive"
      });
      // Re-throw to allow caller to handle the error
      throw error;
    } finally {
      // Only reset loading state if we set it
      if (!wasLoading) {
        setIsLoading(false);
      }
      console.log('Equipment fetch process completed');
    }
  };

  // Add this function at the component level
  const handleInputTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    // This function exists just to satisfy the React onChange prop
    // The actual value is read from the ref on blur
    // This is deliberately empty to avoid any performance overhead
  };

  // Add this useEffect after the existing useEffects to handle backward compatibility


  const handleAddGangCost = () => {
    // Get the cost from the ref instead of state
    const costValue = gangAdjustedCostInputRef.current?.value || '';
    
    if (!selectedGangTypeForCost || !costValue) {
      toast({
        description: 'Please select a gang type and enter a cost',
        variant: "destructive"
      });
      return false;
    }
    
    // Convert cost to number
    const cost = parseInt(costValue);
    if (isNaN(cost) || cost < 0) {
      toast({
        description: 'Please enter a valid cost (must be 0 or greater)',
        variant: "destructive"
      });
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

        <div className="px-[10px] py-4 overflow-y-auto flex-grow">
          <div className="space-y-4">
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
                  setSelectedSubTypeId('');
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">All Gang Types</option>
                {gangTypes.map((type) => (
                  <option key={type.gang_type_id} value={type.gang_type_id}>
                    {type.gang_type}
                  </option>
                ))}
              </select>
            </div>

            {/* First row: Fighter Type selection and Sub-type selection */}
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
                    <option key={`${combo.type}-${combo.class}-${combo.gang_type_id}`} value={`${combo.type}|${combo.class}|${combo.gang_type_id}`}>
                      {`${combo.type} (${combo.class || "Unknown Class"})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Select Fighter Sub-type to Edit
                </label>
                <select
                  value={selectedSubTypeId}
                  onChange={(e) => handleSubTypeChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeCombo || availableSubTypes.length === 0}
                >
                  <option value="">
                    {!selectedFighterTypeCombo 
                      ? "Select a fighter type first" 
                      : availableSubTypes.length === 0 
                        ? "Loading sub-types..." 
                        : "Select a sub-type"
                    }
                  </option>
                  {availableSubTypes.map((subType) => (
                    <option key={subType.id} value={subType.id}>
                      {subType.sub_type_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Second row: Fighter Type name and Fighter Sub-type input */}
            {selectedSubTypeId && !isLoading && (
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
                    Fighter Sub-type
                  </label>
                  <Input
                    ref={subTypeNameInputRef}
                    type="text"
                    defaultValue={subTypeName}
                    onChange={handleInputTyping}
                    onBlur={(e) => {
                      const newName = e.target.value;
                      setSubTypeName(newName);
                      
                      // Also update the name in our availableSubTypes array
                      if (selectedSubTypeId && selectedSubTypeId !== "default") {
                        setAvailableSubTypes(prev => 
                          prev.map(st => 
                            st.id === selectedSubTypeId 
                              ? { ...st, sub_type_name: newName } 
                              : st
                          )
                        );
                      }
                    }}
                    placeholder="e.g. Subjugator"
                    className="w-full"
                    disabled={!selectedSubTypeId}
                  />
                  {selectedSubTypeId === "default" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      You can add a sub-type name to create a new variant of this fighter.
                    </p>
                  )}
                </div>
              </div>

              {/* Third row: Fighter Class and Base Cost */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Fighter Class *
                  </label>
                  <select
                    value={selectedFighterClass}
                    onChange={(e) => {
                      console.log('Selected fighter class:', e.target.value);
                      setSelectedFighterClass(e.target.value);
                    }}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select fighter class</option>
                    {fighterClasses.map((fighterClass) => (
                      <option key={fighterClass.id} value={fighterClass.class_name}>
                        {fighterClass.class_name}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4">
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
                </div>

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
                <Input
                  ref={specialSkillsInputRef}
                  type="text"
                  defaultValue={specialSkills}
                  onChange={handleInputTyping}
                  onBlur={(e) => setSpecialSkills(e.target.value)}
                  placeholder="Enter special rules (comma-separated)"
                  className="w-full"
                />
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
                    onFocus={() => {
                      // Load skill sets when the dropdown gets focus
                      if (!hasLoadedSkillTypesRef.current) {
                        fetchSkillTypes();
                      }
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
                            className="hover:text-red-500 focus:outline-none"
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
                    className="p-1 border rounded"
                  >
                    <option value="">Add Skill Set</option>
                    {skillTypes
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
                  {equipment
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
                          className="hover:text-red-500 focus:outline-none"
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
                  Fighter's Equipment List
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
                  {equipment
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

                        const rankA = equipmentCategoryRank[(a!.equipment_category || '').toLowerCase()] ?? Infinity;
                        const rankB = equipmentCategoryRank[(b!.equipment_category || '').toLowerCase()] ?? Infinity;

                        // First, sort by equipment category rank
                        if (rankA !== rankB) return rankA - rankB;

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
                                className="hover:text-red-500 focus:outline-none"
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
                            className="hover:text-red-500 focus:outline-none"
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
                            {equipment
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
                            className="bg-neutral-900 text-white rounded hover:bg-gray-800"
                          >
                            Save Adjusted Cost
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                {isEquipmentLoaded && (
                  <AdminFighterTradingPostAccess
                    equipment={equipment}
                    tradingPostEquipment={tradingPostEquipment}
                    setTradingPostEquipment={setTradingPostEquipment}
                    disabled={!gangTypeFilter || !selectedFighterTypeId}
                  />
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
                            className="hover:text-red-500 focus:outline-none"
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
                  equipment={equipment}
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
            disabled={!selectedSubTypeId || isLoading}
            className="px-4 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Updating...' : 'Update Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
} 
