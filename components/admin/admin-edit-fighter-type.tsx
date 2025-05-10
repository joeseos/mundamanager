'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X, Plus, Minus } from "lucide-react";
import { FighterType } from "@/types/fighter";
import { GangType } from "@/types/gang";
import { Equipment } from '@/types/equipment';
import { skillSetRank } from "@/utils/skillSetRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";

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

interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity: number;
  equipment_name?: string;
  replaces?: string[];
  max_replace?: number;
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
    discount: number;
  }[]>([]);
  const [selectedDiscountEquipment, setSelectedDiscountEquipment] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showTradingPostDialog, setShowTradingPostDialog] = useState(false);
  const [tradingPostEquipment, setTradingPostEquipment] = useState<string[]>([]);
  const [equipmentByCategory, setEquipmentByCategory] = useState<Record<string, EquipmentWithId[]>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [equipmentSelection, setEquipmentSelection] = useState<{
    weapons?: {
      default?: Array<{ id: string; quantity: number }>;
      options?: EquipmentOption[];
      select_type: 'optional' | 'single' | 'multiple';
    };
  }>({ weapons: { select_type: 'optional' } });

  // Add a new state variable to track the sub-type name
  const [subTypeName, setSubTypeName] = useState('');

  // IMPORTANT: We use uncontrolled inputs with refs for text fields to completely bypass React's
  // rendering cycle during typing, which dramatically improves performance. This prevents the
  // severe lag (1000ms+ per keystroke) that was happening with controlled inputs.
  // The main state is only updated on blur, significantly reducing unnecessary re-renders.

  // Add refs for the problematic input fields
  const fighterTypeInputRef = useRef<HTMLInputElement>(null);
  const subTypeNameInputRef = useRef<HTMLInputElement>(null);
  const specialSkillsInputRef = useRef<HTMLInputElement>(null);

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

  // Add a flag ref to prevent duplicate fetches
  const isFetchingFighterClassesRef = useRef(false);

  // Only fetch skill sets when needed
  const [hasLoadedSkillTypesRef] = useState<{ current: boolean }>({ current: false });

  const fetchSkillTypes = async () => {
    // Only fetch if we haven't already loaded the data
    if (hasLoadedSkillTypesRef.current) {
      console.log('Using cached skill sets');
        return;
      }
      
    try {
      console.log('Fetching skill sets');
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch skill sets');
        const data = await response.json();
        setSkillTypes(data);
      hasLoadedSkillTypesRef.current = true;
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
          description: 'Failed to load skill sets',
          variant: "destructive"
        });
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
        setSkills(data);
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

  useEffect(() => {
    const fetchSkillNames = async () => {
      if (!selectedSkills.length || !selectedFighterTypeId) return;

      try {
        const response = await fetch('/api/admin/skills');
        if (!response.ok) throw new Error('Failed to fetch skills');
        const allSkills = await response.json();
        
        const relevantSkills = allSkills.filter((skill: Skill) => selectedSkills.includes(skill.id));
        setSkills(prevSkills => {
          const existingSkills = prevSkills.filter(skill => !selectedSkills.includes(skill.id));
          return [...existingSkills, ...relevantSkills];
        });
      } catch (error) {
        console.error('Error fetching skill names:', error);
        toast({
          description: 'Failed to load skill names',
          variant: "destructive"
        });
      }
    };

    fetchSkillNames();
  }, [selectedSkills, toast, selectedFighterTypeId]);

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

  // Add another ref flag for fighter type details fetch
  const isFetchingFighterTypeDetailsRef = useRef(false);

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
      setSelectedEquipment(data.default_equipment || []);
      setSelectedSkills(data.default_skills || []);
      setEquipmentListSelections(data.equipment_list || []);
      setEquipmentDiscounts(data.equipment_discounts || []);
      setTradingPostEquipment(data.trading_post_equipment || []);

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
        setEquipmentSelection({
          weapons: {
            select_type: data.equipment_selection.weapons?.select_type || 'optional',
            default: data.equipment_selection.weapons?.default || [],
            options: data.equipment_selection.weapons?.options?.map((option: any) => ({
              id: option.id,
              cost: option.cost,
              max_quantity: option.max_quantity,
              replaces: option.replaces,
              max_replace: option.max_replace
            })) || []
          }
        });
      } else {
        // Reset to default state if no equipment selection
        setEquipmentSelection({ 
          weapons: { 
            select_type: 'optional',
            default: [],
            options: []
          } 
        });
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
        
        // Extract and populate fighter classes if needed
        if (fighter.fighter_class && fighter.fighter_class_id) {
          setFighterClasses([{
            id: fighter.fighter_class_id,
            class_name: fighter.fighter_class
          }]);
        }
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
      // When a sub-type is selected, load equipment data if needed
      if (!hasLoadedEquipmentCategoriesRef.current) {
        fetchEquipmentByCategory();
      }
      
      // If we need to load skill sets, do it now
      if (!hasLoadedSkillTypesRef.current) {
        fetchSkillTypes();
      }
      
      // Find the option in available sub-types
      const selectedOption = availableSubTypes.find(st => st.id === subTypeId);
      
      // If we have an option and it has a fighterId, fetch details
      if (selectedOption && selectedOption.fighterId) {
        setSelectedFighterTypeId(selectedOption.fighterId); // <-- Add this line
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
      
      // Case 1: Empty sub-type name - Always make it a default fighter
      if (!subTypeName.trim()) {
        finalSubTypeId = null;
        console.log(`No sub-type name provided, setting fighter ${fighterIdToUpdate} as default (null sub-type)`);
      } 
      // Case 2: Editing default fighter and adding a name - Create new sub-type
      else if (selectedSubTypeId === "default") {
        try {
          const formattedName = subTypeName.trim().charAt(0).toUpperCase() + subTypeName.trim().slice(1);
          console.log(`Creating new sub-type: "${formattedName}" from default fighter`);
            
          const createResponse = await fetch('/api/admin/fighter-sub-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sub_type_name: formattedName }),
          });
            
          if (createResponse.ok) {
            const newSubType = await createResponse.json();
            finalSubTypeId = newSubType.id;
            console.log(`Created new sub-type with ID: ${finalSubTypeId}`);
          } else {
            console.error('Failed to create sub-type:', await createResponse.text());
            throw new Error('Failed to create new sub-type');
          }
        } catch (error) {
          console.error('Error creating sub-type:', error);
          throw new Error('Failed to create new sub-type');
        }
      } 
      // Case 3: Editing existing sub-type - Use existing ID but update name if changed
      else {
        finalSubTypeId = selectedSubTypeId;
        console.log(`Using existing sub-type with ID: ${finalSubTypeId}`);
        
        // If we're using an existing sub-type but changed the name, update it
        const existingSubType = fighterSubTypes.find(st => st.id === finalSubTypeId);
        if (existingSubType && existingSubType.sub_type_name !== subTypeName) {
          try {
            console.log(`Updating sub-type name from "${existingSubType.sub_type_name}" to "${subTypeName}"`);
            const updateResponse = await fetch(`/api/admin/fighter-sub-types?id=${finalSubTypeId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sub_type_name: subTypeName }),
            });
            
            if (!updateResponse.ok) {
              console.error('Failed to update sub-type name:', await updateResponse.text());
            }
          } catch (error) {
            console.error('Error updating sub-type name:', error);
          }
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
        fighter_sub_type: subTypeName.trim() || null,
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
        default_equipment: selectedEquipment,
        default_skills: selectedSkills,
        equipment_list: equipmentListSelections,
        equipment_discounts: equipmentDiscounts,
        trading_post_equipment: tradingPostEquipment,
        equipment_selection: equipmentSelection.weapons ? {
          weapons: {
            select_type: equipmentSelection.weapons.select_type,
            default: equipmentSelection.weapons.default,
            options: equipmentSelection.weapons.options?.map(option => ({
              id: option.id,
              cost: option.cost,
              max_quantity: option.max_quantity,
              replaces: option.replaces,
              max_replace: option.max_replace
            }))
          }
        } : null,
        updated_at: new Date().toISOString()
      };

      console.log('Sending update data:', updateData);
      console.log('Selected sub-type and final fighter_sub_type_id:', {
        selectedSubTypeId,
        submittingSubTypeId: updateData.fighter_sub_type_id,
        originalSubTypeId: finalSubTypeId
      });

      const response = await fetch(`/api/admin/fighter-types?id=${fighterIdToUpdate}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
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

  const handleAddDiscount = () => {
    if (!selectedDiscountEquipment || !discountAmount) return;
    
    const newDiscount = {
      equipment_id: selectedDiscountEquipment,
      discount: parseInt(discountAmount)
    };

    setEquipmentDiscounts([...equipmentDiscounts, newDiscount]);
    setSelectedDiscountEquipment('');
    setDiscountAmount('');
  };

  const handleRemoveDiscount = (equipmentId: string) => {
    setEquipmentDiscounts(equipmentDiscounts.filter(
      discount => discount.equipment_id !== equipmentId
    ));
  };

  // Add a ref to track if equipment categories have been loaded
  const hasLoadedEquipmentCategoriesRef = useRef(false);

  const fetchEquipmentByCategory = async () => {
    // Only fetch if we haven't already loaded the data
    if (hasLoadedEquipmentCategoriesRef.current && Object.keys(equipmentByCategory).length > 0) {
      console.log('Using cached equipment categories');
      return;
    }

    try {
      console.log('Fetching equipment categories');
      // Fetch all equipment from the API
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      const equipmentData = await response.json();
      
      // Cast the data for the main equipment state
      const equipmentWithIds = equipmentData.map((item: any) => ({
        ...item,
        id: item.id,
        equipment_id: item.id  // Make sure both properties exist
      })) as EquipmentWithId[];
      
      // Update main equipment state
      setEquipment(equipmentWithIds);
      
      // Group equipment by category
      const groupedByCategory: Record<string, EquipmentWithId[]> = {};
      
      equipmentData.forEach((item: any) => {
        const category = item.equipment_category || item.equipment_type || 'Uncategorized';
        if (!groupedByCategory[category]) {
          groupedByCategory[category] = [];
        }
        
        // Create an object with the necessary properties
        const equipmentItem: EquipmentWithId = {
          ...item,
          id: item.id,
          equipment_id: item.id,  // Ensure equipment_id exists
          fighter_equipment_id: item.fighter_equipment_id || '',
          equipment_name: item.equipment_name,
          equipment_type: item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade',
          cost: item.cost || 0,
          availability: item.availability,
          equipment_category: item.equipment_category
        };
        
        groupedByCategory[category].push(equipmentItem);
      });
      
      // Sort equipment within each category by name
      Object.keys(groupedByCategory).forEach(category => {
        groupedByCategory[category].sort((a, b) => 
          a.equipment_name.localeCompare(b.equipment_name)
        );
      });
      
      setEquipmentByCategory(groupedByCategory);
      hasLoadedEquipmentCategoriesRef.current = true;
    } catch (error) {
      console.error('Error fetching equipment categories:', error);
      toast({
        description: 'Failed to load equipment categories',
        variant: "destructive"
      });
    }
  };

  // Add this function at the component level
  const handleInputTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    // This function exists just to satisfy the React onChange prop
    // The actual value is read from the ref on blur
    // This is deliberately empty to avoid any performance overhead
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">Edit Fighter Type</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto flex-grow">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    placeholder="e.g. Vatborn"
                    className="w-full"
                    disabled={!selectedSubTypeId}
                  />
                  {selectedSubTypeId === "default" && (
                    <p className="text-xs text-gray-500 mt-1">
                      You can add a sub-type name to create a new variant of this fighter.
                    </p>
                  )}
                </div>
              </div>

              {/* Third row: Fighter Class and Base Cost */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fighter Class *
                  </label>
                  <select
                    value={selectedFighterClass}
                    onChange={(e) => setSelectedFighterClass(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select fighter class</option>
                    {fighterClasses.map((fighterClass) => (
                      <option key={fighterClass.id} value={fighterClass.class_name}>
                        {fighterClass.class_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={freeSkill}
                    onChange={(e) => setFreeSkill(e.target.checked)}
                    className="h-4 w-4 text-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">
                    Free Skill
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isGangAddition}
                    onChange={(e) => setIsGangAddition(e.target.checked)}
                    className="h-4 w-4 text-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">
                    Gang Addition
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Skills
                </label>
                <div className="space-y-2">
                  <select
                    value={selectedSkillType}
                    onChange={(e) => setSelectedSkillType(e.target.value)}
                    onFocus={() => {
                      // Load skill sets when the dropdown gets focus
                      if (!hasLoadedSkillTypesRef.current) {
                        fetchSkillTypes();
                      }
                    }}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select a skill set</option>

                    {Object.entries(
                      skillTypes
                        .sort((a, b) => {
                          const rankA = skillSetRank[a.skill_type.toLowerCase()] ?? Infinity;
                          const rankB = skillSetRank[b.skill_type.toLowerCase()] ?? Infinity;
                          return rankA - rankB;
                        })
                        .reduce((groups, type) => {
                          const rank = skillSetRank[type.skill_type.toLowerCase()] ?? Infinity;
                          let groupLabel = "Misc."; // Default category for unlisted skills

                          if (rank <= 19) groupLabel = "Universal Skills";
                          else if (rank <= 39) groupLabel = "Gang-specific Skills";
                          else if (rank <= 59) groupLabel = "Wyrd Powers";
                          else if (rank <= 69) groupLabel = "Cult Wyrd Powers";
                          else if (rank <= 79) groupLabel = "Psychoteric Whispers";
                          else if (rank <= 89) groupLabel = "Legendary Names";

                          if (!groups[groupLabel]) groups[groupLabel] = [];
                          groups[groupLabel].push(type);
                          return groups;
                        }, {} as Record<string, typeof skillTypes>)
                    ).map(([groupLabel, skillList]) => (
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
                      const skill = skills.find(s => s.id === skillId);
                      if (!skill) return null;

                      return (
                        <div
                          key={skill.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                            selectedFighterTypeId ? 'bg-gray-100' : 'bg-gray-50'
                          }`}
                        >
                          <span>{skill.skill_name}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedSkills(selectedSkills.filter(id => id !== skill.id))}
                            className="hover:text-red-500 focus:outline-none"
                            disabled={!selectedFighterTypeId}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Equipment
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && !selectedEquipment.includes(value)) {
                      setSelectedEquipment([...selectedEquipment, value]);
                    }
                    e.target.value = "";
                  }}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeId}
                >
                  <option value="">Select equipment to add</option>
                  {equipment
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
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                          selectedFighterTypeId ? 'bg-gray-100' : 'bg-gray-50'
                        }`}
                      >
                        <span>{item.equipment_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEquipment(selectedEquipment.filter(id => id !== item.id))}
                          className="hover:text-red-500 focus:outline-none"
                          disabled={!selectedFighterTypeId}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                      <div className="text-sm font-bold text-gray-700">{category}</div>

                      {/* Items under this category */}
                      {items.map(item => (
                        <div
                          key={item!.id}
                          className="flex justify-between items-center gap-2 rounded-full text-sm bg-gray-100 px-2 py-1"
                        >
                          <span>{item!.equipment_name}</span>
                          <button
                            type="button"
                            onClick={() => setEquipmentListSelections(equipmentListSelections.filter(id => id !== item!.id))}
                            className="hover:text-red-500 focus:outline-none"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Discounts
                </label>
                <Button
                  onClick={() => setShowDiscountDialog(true)}
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  disabled={!gangTypeFilter || !selectedFighterTypeId}
                >
                  Add Equipment Discount
                </Button>
                {(!gangTypeFilter || !selectedFighterTypeId) && (
                  <p className="text-sm text-gray-500 mb-2">
                    Select a gang type and fighter type to add equipment discounts
                  </p>
                )}

                {equipmentDiscounts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {equipmentDiscounts.map((discount) => {
                      const item = equipment.find(e => e.id === discount.equipment_id);
                      if (!item) return null;

                      return (
                        <div
                          key={discount.equipment_id}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                        >
                          <span>{item.equipment_name} (-{discount.discount} credits)</span>
                          <button
                            onClick={() => setEquipmentDiscounts(prev =>
                              prev.filter(d => d.equipment_id !== discount.equipment_id)
                            )}
                            className="hover:text-red-500 focus:outline-none"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showDiscountDialog && (
                  <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowDiscountDialog(false);
                        setSelectedDiscountEquipment("");
                        setDiscountAmount("");
                      }
                    }}
                  >
                    <div className="bg-white p-6 rounded-lg shadow-lg w-[400px]">
                      <h3 className="text-xl font-bold mb-4">Equipment Discount Menu</h3>
                      <p className="text-sm text-gray-500 mb-4">Select equipment and enter a discount</p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Equipment</label>
                          <select
                            value={selectedDiscountEquipment}
                            onChange={(e) => setSelectedDiscountEquipment(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option value="">Select equipment</option>
                            {equipment
                              .filter(item => !equipmentDiscounts.some(
                                discount => discount.equipment_id === item.id
                              ))
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.equipment_name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Discount (credits)</label>
                          <Input
                            type="number"
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(e.target.value)}
                            placeholder="Enter discount in credits"
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
                              setShowDiscountDialog(false);
                              setSelectedDiscountEquipment("");
                              setDiscountAmount("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              if (selectedDiscountEquipment && discountAmount) {
                                const discount = parseInt(discountAmount);
                                if (discount >= 0) {
                                  setEquipmentDiscounts(prev => [
                                    ...prev,
                                    {
                                      equipment_id: selectedDiscountEquipment,
                                      discount
                                    }
                                  ]);
                                  setShowDiscountDialog(false);
                                  setSelectedDiscountEquipment("");
                                  setDiscountAmount("");
                                }
                              }
                            }}
                            disabled={!selectedDiscountEquipment || !discountAmount || parseInt(discountAmount) < 0}
                            className="bg-black hover:bg-gray-800 text-white"
                          >
                            Save Discount
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trading Post
                </label>
                <Button
                  onClick={() => {
                    // Only fetch equipment categories if we're showing the dialog
                    setShowTradingPostDialog(true);
                    // Only fetch equipment if needed - cached data will be used if available
                    if (selectedFighterTypeId) {
                    fetchEquipmentByCategory();
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="mb-2"
                  disabled={!gangTypeFilter || !selectedFighterTypeId}
                >
                  Open Trading Post Menu
                </Button>
                {(!gangTypeFilter || !selectedFighterTypeId) && (
                  <p className="text-sm text-gray-500 mb-2">
                    Select a gang type and fighter type to configure trading post options
                  </p>
                )}

                {showTradingPostDialog && (
                  <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowTradingPostDialog(false);
                      }
                    }}
                  >
                    <div className="bg-white p-6 rounded-lg shadow-lg w-[700px] max-h-[80vh] overflow-y-auto">
                      <h3 className="text-xl font-bold mb-4">Trading Post Options</h3>
                      <p className="text-sm text-gray-500 mb-4">Select equipment items that should be available in the Trading Post for this fighter type.</p>

                      <div className="border rounded-lg overflow-hidden">
                        {/* Table header */}
                        <div className="bg-gray-50 border-b px-4 py-2 font-medium">
                          Equipment
                        </div>

                        {/* Equipment categories and list */}
                        <div className="max-h-[50vh] overflow-y-auto">
                          {Object.keys(equipmentByCategory).length === 0 ? (
                            <div className="p-4 text-center text-gray-500">Loading equipment categories...</div>
                          ) : (
                            Object.entries(equipmentByCategory)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([category, items]) => {
                                // Check if all items in category are selected
                                const allSelected = items.every(item =>
                                  tradingPostEquipment.includes(item.id)
                                );

                                // Check if some items in category are selected
                                const someSelected = items.some(item =>
                                  tradingPostEquipment.includes(item.id)
                                );

                                return (
                                  <div key={category} className="border-b last:border-b-0">
                                    {/* Category header with checkbox */}
                                    <div
                                      className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                      onClick={() => setExpandedCategory(
                                        expandedCategory === category ? null : category
                                      )}
                                    >
                                      <div className="flex items-center">
                                        <input
                                          type="checkbox"
                                          id={`category-${category}`}
                                          checked={allSelected}
                                          className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            const itemIds = items.map(item => item.id);

                                            if (e.target.checked) {
                                              // Add all items in category
                                              setTradingPostEquipment(prev =>
                                                Array.from(new Set([...prev, ...itemIds]))
                                              );
                                            } else {
                                              // Remove all items in category
                                              setTradingPostEquipment(prev =>
                                                prev.filter(id => !itemIds.includes(id))
                                              );
                                            }
                                          }}
                                        />
                                        <label
                                          htmlFor={`category-${category}`}
                                          className="ml-2 text-sm font-medium"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {category} ({items.length})
                                        </label>
                                      </div>
                                      <div className="flex items-center">
                                        {someSelected && !allSelected && (
                                          <span className="text-xs mr-2 text-gray-500">
                                            {items.filter(item => tradingPostEquipment.includes(item.id)).length} selected
                                          </span>
                                        )}
                                        <svg
                                          className={`h-5 w-5 transition-transform ${expandedCategory === category ? 'rotate-90' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </div>
                                    </div>

                                    {/* Expanded equipment list */}
                                    {expandedCategory === category && (
                                      <div>
                                        {items.map(item => (
                                          <div
                                            key={item.id}
                                            className="border-t px-4 py-2 flex items-center justify-between"
                                          >
                                            <div className="flex items-center flex-1">
                                              <input
                                                type="checkbox"
                                                id={`trading-post-${item.id}`}
                                                className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                                                checked={tradingPostEquipment.includes(item.id)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setTradingPostEquipment([...tradingPostEquipment, item.id]);
                                                  } else {
                                                    setTradingPostEquipment(tradingPostEquipment.filter(id => id !== item.id));
                                                  }
                                                }}
                                              />
                                              <label htmlFor={`trading-post-${item.id}`} className="ml-2 block text-sm">
                                                {item.equipment_name}
                                              </label>
                                            </div>

                                            {/* Use type assertion for availability */}
                                            {item.availability && (
                                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-sky-500 text-white">
                                                <span className="text-[10px] font-medium">{item.availability}</span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end mt-6">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowTradingPostDialog(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            setShowTradingPostDialog(false);
                            // Trading post options are already saved in state
                            toast({
                              description: "Trading Post options saved. Remember to update the fighter type to apply changes.",
                              variant: "default"
                            });
                          }}
                          className="bg-black hover:bg-gray-800 text-white"
                        >
                          Save Options
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Selection
                </label>
                <div className="space-y-4 border rounded-lg p-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Selection Type
                    </label>
                    <select
                      value={equipmentSelection?.weapons?.select_type || ''}
                      onChange={(e) => {
                        const value = e.target.value as 'optional' | 'single' | 'multiple';
                        setEquipmentSelection(prev => ({
                          weapons: {
                            select_type: value,
                            default: value === 'optional' ? [] : undefined,
                            options: []
                          }
                        }));
                      }}
                      className="w-full p-2 border rounded-md"
                      disabled={!selectedFighterTypeId}
                    >
                      <option value="">Select type</option>
                      <option value="optional">Optional (Replace Default)</option>
                      <option value="single">Single Selection</option>
                      <option value="multiple">Multiple Selection</option>
                    </select>
                  </div>

                  {equipmentSelection?.weapons?.select_type === 'optional' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Equipment
                      </label>
                      <div className="flex gap-2 mb-2">
                        <select
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;

                            setEquipmentSelection(prev => ({
                              weapons: {
                                ...prev.weapons!,
                                default: [
                                  ...(prev.weapons?.default || []),
                                  { id: value, quantity: 1 }
                                ]
                              }
                            }));
                            e.target.value = "";
                          }}
                          className="w-full p-2 border rounded-md"
                          disabled={!selectedFighterTypeId}
                        >
                          <option value="">Add default equipment</option>
                          {equipment
                            .filter(item => !equipmentSelection?.weapons?.default?.some(d => d.id === item.id))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.equipment_name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        {equipmentSelection?.weapons?.default?.map((item, index) => {
                          const equip = equipment.find(e => e.id === item.id);
                          return (
                            <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                              <div className="flex items-center gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500">Number</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const quantity = parseInt(e.target.value) || 1;
                                      setEquipmentSelection(prev => ({
                                        weapons: {
                                          ...prev.weapons!,
                                          default: prev.weapons?.default?.map((d, i) =>
                                            i === index ? { ...d, quantity } : d
                                          )
                                        }
                                      }));
                                    }}
                                    min="1"
                                    className="w-16 p-1 border rounded"
                                  />
                                </div>
                                <span>x {equip?.equipment_name}</span>
                              </div>
                              <button
                                onClick={() => {
                                  setEquipmentSelection(prev => ({
                                    weapons: {
                                      ...prev.weapons!,
                                      default: prev.weapons?.default?.filter((_, i) => i !== index)
                                    }
                                  }));
                                }}
                                className="ml-auto hover:bg-gray-100 p-1 rounded"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {equipmentSelection?.weapons?.select_type && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {equipmentSelection.weapons.select_type === 'optional' ? 'Optional Equipment' : 'Available Equipment'}
                      </label>
                      <div className="flex gap-2 mb-2">
                        <select
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;

                            setEquipmentSelection(prev => ({
                              weapons: {
                                ...prev.weapons!,
                                options: [
                                  ...(prev?.weapons?.options || []),
                                  { id: value, cost: 0, max_quantity: 1 }
                                ]
                              }
                            }));
                            e.target.value = "";
                          }}
                          className="w-full p-2 border rounded-md"
                          disabled={!selectedFighterTypeId}
                        >
                          <option value="">Add equipment option</option>
                          {equipment
                            .filter(item => !equipmentSelection?.weapons?.options?.some(o => o.id === item.id))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.equipment_name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        {equipmentSelection?.weapons?.options?.map((item, index) => {
                          const equip = equipment.find(e => e.id === item.id);
                          return (
                            <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                              <span>{equip?.equipment_name}</span>
                              <div className="ml-auto flex items-center gap-4">
                                <div>
                                  <label className="block text-xs text-gray-500">Cost</label>
                                  <input
                                    type="number"
                                    value={item.cost}
                                    onChange={(e) => {
                                      const cost = parseInt(e.target.value) || 0;
                                      setEquipmentSelection(prev => ({
                                        weapons: {
                                          ...prev.weapons!,
                                          options: prev?.weapons?.options?.map((o, i) =>
                                            i === index ? { ...o, cost } : o
                                          )
                                        }
                                      }));
                                    }}
                                    placeholder="Cost"
                                    className="w-20 p-1 border rounded"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500">Max Number</label>
                                  <input
                                    type="number"
                                    value={item.max_quantity}
                                    onChange={(e) => {
                                      const max_quantity = parseInt(e.target.value) || 1;
                                      setEquipmentSelection(prev => ({
                                        weapons: {
                                          ...prev.weapons!,
                                          options: prev?.weapons?.options?.map((o, i) =>
                                            i === index ? { ...o, max_quantity } : o
                                          )
                                        }
                                      }));
                                    }}
                                    placeholder="Max"
                                    min="1"
                                    className="w-16 p-1 border rounded"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    setEquipmentSelection(prev => ({
                                      weapons: {
                                        ...prev.weapons!,
                                        options: prev?.weapons?.options?.filter((_, i) => i !== index)
                                      }
                                    }));
                                  }}
                                  className="hover:bg-gray-100 p-1 rounded self-end"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Updating...' : 'Update Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
} 