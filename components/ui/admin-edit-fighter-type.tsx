'use client';

import { useState, useEffect } from 'react';
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

export function AdminEditFighterTypeModal({ onClose, onSubmit }: AdminEditFighterTypeModalProps) {
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

  const { toast } = useToast();

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

  useEffect(() => {
    const fetchFighterTypes = async () => {
      try {
        const response = await fetch('/api/admin/fighter-types');
        if (!response.ok) throw new Error('Failed to fetch fighter types');
        const data = await response.json();
        setFighterTypes(data);
      } catch (error) {
        console.error('Error fetching fighter types:', error);
        toast({
          description: 'Failed to load fighter types',
          variant: "destructive"
        });
      }
    };

    fetchFighterTypes();
  }, [toast]);

  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const response = await fetch('/api/admin/equipment');
        if (!response.ok) throw new Error('Failed to fetch equipment');
        const data = await response.json();
        
        // Cast the data to include the id property
        const equipmentWithIds = data.map((item: any) => ({
          ...item,
          id: item.id,
          equipment_id: item.id  // Make sure both properties exist
        })) as EquipmentWithId[];
        
        setEquipment(equipmentWithIds);
      } catch (error) {
        console.error('Error fetching equipment:', error);
        toast({
          description: 'Failed to load equipment',
          variant: "destructive"
        });
      }
    };

    fetchEquipment();
  }, [toast]);

  useEffect(() => {
    const fetchFighterClasses = async () => {
      console.log('Fetching fighter classes...');
      try {
        const response = await fetch('/api/admin/fighter-classes', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log('API response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`Failed to fetch fighter classes: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Fighter classes data in component:', data);
        
        if (!data || data.length === 0) {
          console.log('No fighter classes received from API');
        }
        
        if (Array.isArray(data)) {
          setFighterClasses(data);
        } else {
          console.error('Unexpected data format:', data);
          throw new Error('Invalid data format received');
        }
      } catch (error) {
        console.error('Error fetching fighter classes:', error);
        toast({
          description: `Failed to load fighter classes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive"
        });
      }
    };

    fetchFighterClasses();
  }, [toast]);

  useEffect(() => {
    const fetchSkillTypes = async () => {
      try {
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch skill sets');
        const data = await response.json();
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
          description: 'Failed to load skill sets',
          variant: "destructive"
        });
      }
    };

    fetchSkillTypes();
  }, [toast]);

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
      if (!selectedSkills.length) return;

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
  }, [selectedSkills, toast]);

  useEffect(() => {
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
  }, [toast]);

  const handleFighterTypeChange = (typeId: string) => {
    // Always update the selected fighter type ID for the dropdown
    setSelectedFighterTypeId(typeId);
    // Reset sub-type selection when fighter type changes
    setSelectedSubTypeId('');

    if (!typeId) {
      // Clear form if no fighter type selected
      setFighterType('');
      setSelectedFighterClass('');
      setAvailableSubTypes([]);
      return;
    }

    const selectedFighter = fighterTypes.find(f => f.id === typeId);
    if (!selectedFighter) return;

    // Find if this fighter type (same name & class) has any sub-types
    const relatedFighters = fighterTypes.filter(ft => 
      ft.fighter_type === selectedFighter.fighter_type && 
      ft.fighter_class === selectedFighter.fighter_class
    );
    
    // Check if there's at least one fighter with this type name that doesn't have a sub-type
    const defaultFighter = relatedFighters.find(ft => 
      !ft.fighter_sub_type_id || ft.fighter_sub_type_id === null
    );
    
    // Find all fighters with sub-types
    const subTypedFighters = relatedFighters.filter(ft => 
      ft.fighter_sub_type_id !== undefined && 
      ft.fighter_sub_type_id !== null
    );
    
    // Set basic info
    setFighterType(selectedFighter.fighter_type);
    setSelectedFighterClass(selectedFighter.fighter_class);
    
    // Build sub-type options list if there are any sub-typed fighters
    if (subTypedFighters.length > 0) {
      const subTypeOptions: FighterSubType[] = [];
      
      subTypedFighters.forEach(ft => {
        if (ft.fighter_sub_type_id) {
          const subType = fighterSubTypes.find(st => st.id === ft.fighter_sub_type_id);
          if (subType) {
            subTypeOptions.push({
              ...subType,
              fighterId: ft.id
            });
          }
        }
      });
      
      // Sort sub-types alphabetically
      subTypeOptions.sort((a, b) => a.sub_type_name.localeCompare(b.sub_type_name));
      setAvailableSubTypes(subTypeOptions);
      
      // Rule 1 & 2: If there's a default fighter (no sub-type), select it
      if (defaultFighter) {
        setSelectedSubTypeId("default");
      } 
      // Rule 3: If there's no default but there are sub-types, select the first one
      else if (subTypeOptions.length > 0) {
        setSelectedSubTypeId(subTypeOptions[0].id);
      }
    } else {
      // No sub-types available
      setAvailableSubTypes([]);
      // Rule 1: If there's no sub-type, just show default
      setSelectedSubTypeId("default");
    }
  }

  // Handle edge cases where no sub-type selection was made
  useEffect(() => {
    if (selectedFighterTypeId && !selectedSubTypeId) {
      setSelectedSubTypeId("default");
    }
  }, [selectedFighterTypeId, selectedSubTypeId]);

  // Fetch fighter details when sub-type selection changes
  useEffect(() => {
    if (selectedFighterTypeId && selectedSubTypeId) {
      if (selectedSubTypeId === "default") {
        // For the default option, find the fighter with no sub-type
        const relatedFighters = fighterTypes.filter(ft => 
          ft.id === selectedFighterTypeId || 
          (ft.fighter_type === fighterTypes.find(f => f.id === selectedFighterTypeId)?.fighter_type && 
           ft.fighter_class === fighterTypes.find(f => f.id === selectedFighterTypeId)?.fighter_class)
        );
        
        const defaultFighter = relatedFighters.find(ft => 
          !ft.fighter_sub_type_id || ft.fighter_sub_type_id === null
        );
        
        if (defaultFighter) {
          fetchFighterTypeDetails(defaultFighter.id);
        } else {
          // If no default version exists, use the selected fighter type
          fetchFighterTypeDetails(selectedFighterTypeId);
        }
      } else {
        // For a specific sub-type, find its fighter ID
        const subType = availableSubTypes.find(st => st.id === selectedSubTypeId);
        if (subType && subType.fighterId) {
          fetchFighterTypeDetails(subType.fighterId);
        }
      }
    }
  }, [selectedFighterTypeId, selectedSubTypeId, availableSubTypes, fighterTypes]);

  const fetchFighterTypeDetails = async (fighterId: string) => {
    if (!fighterId) return;

    try {
      console.log('Fetching fighter type details for ID:', fighterId);
      const response = await fetch(`/api/admin/fighter-types?id=${fighterId}`);
      
      // Log the response status
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to fetch fighter type details: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Received fighter type data:', data);

      if (!data) {
        throw new Error('No data received from server');
      }

      // Set the form data - but don't change the selection state
      // This allows us to keep the dropdown showing the currently selected fighter type
      // while loading the details for the specific sub-type variant
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

      // If there's a fighter_sub_type_id, fetch the sub-type name
      if (data.fighter_sub_type_id) {
        const subType = fighterSubTypes.find(st => st.id === data.fighter_sub_type_id);
        if (subType) {
          setSubTypeName(subType.sub_type_name);
        }
      } else {
        setSubTypeName(''); // Clear the sub-type name if there's no sub-type
      }

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

    } catch (error) {
      console.error('Detailed error in fetchFighterTypeDetails:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch fighter type details",
        variant: "destructive",
      });
    }
  };

  const handleSubTypeChange = (subTypeId: string) => {
    setSelectedSubTypeId(subTypeId);
    
    if (!subTypeId) return; // If cleared, don't do anything else
    
    if (subTypeId === "default") {
      // Load the main fighter type details
      if (selectedFighterTypeId) {
        fetchFighterTypeDetails(selectedFighterTypeId);
      }
      return;
    }
    
    // Find the fighter with this sub-type
    const subType = availableSubTypes.find(st => st.id === subTypeId);
    if (subType) {
      // Set the sub-type name
      setSubTypeName(subType.sub_type_name);
      
      if ('fighterId' in subType) {
      const subTypeFighter = fighterTypes.find(ft => ft.id === subType.fighterId);
      if (subTypeFighter) {
        // Don't change selectedFighterTypeId, which controls the dropdown selection
        // Instead, update the form data to match the selected sub-type's fighter variant
        setFighterType(subTypeFighter.fighter_type);
        setSelectedFighterClass(subTypeFighter.fighter_class);
        
        // Fetch details for this specific sub-type variant
        if (typeof subType.fighterId === 'string') {
          fetchFighterTypeDetails(subType.fighterId);
          }
        }
      }
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const selectedFighter = fighterTypes.find(f => f.id === selectedFighterTypeId);
      const specialRulesArray = specialSkills
        .split(',')
        .map(rule => rule.trim())
        .filter(rule => rule.length > 0);

      const fighterClass = fighterClasses.find(fc => fc.class_name === selectedFighterClass);

      // Validate required fields
      if (!selectedFighterTypeId || !fighterType || !selectedFighter?.gang_type_id) {
        throw new Error('Missing required fields');
      }

      // Find the current sub-type ID if we have a selected sub-type
      let subTypeId: string | null = null;
      let shouldUpdateSubType = false;
      
      if (!subTypeName.trim()) {
        // If sub-type name is blank/empty, set subTypeId to null (Default)
        subTypeId = null;
      } else if (selectedSubTypeId && selectedSubTypeId !== "default") {
        subTypeId = selectedSubTypeId;
        
        // Check if the sub-type name has changed
        const existingSubType = fighterSubTypes.find(st => st.id === subTypeId);
        if (existingSubType && existingSubType.sub_type_name !== subTypeName && subTypeName.trim()) {
          shouldUpdateSubType = true;
        }
      } else if (subTypeName.trim()) {
        // We don't have a sub-type selected but have a name entered - check for existing with same name
        const normalizedName = subTypeName.trim().toLowerCase();
        
        // Check if a sub-type with this name (case-insensitive) already exists
        const existingSubType = fighterSubTypes.find(st => 
          st.sub_type_name.toLowerCase() === normalizedName
        );
        
        if (existingSubType) {
          // Use existing sub-type instead of creating a new one
          subTypeId = existingSubType.id;
          shouldUpdateSubType = false;
          
          // Display a toast notification to inform the user
          toast({
            description: `Using existing sub-type "${existingSubType.sub_type_name}" instead of creating a duplicate`,
            variant: "default"
          });
        } else {
          // No existing sub-type with this name - create a new one
          shouldUpdateSubType = true;
        }
      }
      
      // If we need to update the sub-type, call the API
      if (shouldUpdateSubType && subTypeName.trim()) {
        try {
          let updateSubTypeResponse;
          
          if (subTypeId) {
            // Update existing sub-type
            updateSubTypeResponse = await fetch(`/api/admin/fighter-sub-types?id=${subTypeId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ sub_type_name: subTypeName }),
            });
          } else {
            // Create new sub-type - use normalized first letter capitalization
            const formattedName = subTypeName.trim().charAt(0).toUpperCase() + subTypeName.trim().slice(1);
            
            updateSubTypeResponse = await fetch('/api/admin/fighter-sub-types', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ sub_type_name: formattedName }),
            });
            
            // Get the new sub-type ID
            if (updateSubTypeResponse.ok) {
              const newSubType = await updateSubTypeResponse.json() as { id: string };
              subTypeId = newSubType.id;
            }
          }
          
          if (!updateSubTypeResponse.ok) {
            throw new Error('Failed to update sub-type');
          }
        } catch (error) {
          console.error('Error updating sub-type:', error);
          throw new Error('Failed to update sub-type');
        }
      }

      const updateData = {
        id: selectedFighterTypeId,
        fighter_type: fighterType,
        cost: parseInt(baseCost),
        gang_type_id: selectedFighter.gang_type_id,
        fighter_class: selectedFighterClass,
        fighter_class_id: fighterClass?.id,
        fighter_sub_type_id: subTypeId,
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
        } : null
      };

      console.log('Sending update data:', updateData);

      const response = await fetch(`/api/admin/fighter-types?id=${selectedFighterTypeId}`, {
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

  const fetchEquipmentByCategory = async () => {
    try {
      // Fetch all equipment from the API
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      const equipmentData = await response.json();
      
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
    } catch (error) {
      console.error('Error fetching equipment categories:', error);
      toast({
        description: 'Failed to load equipment categories',
        variant: "destructive"
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit Fighter Type</h3>
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

            {/* First row: Fighter Type selection and Sub-Type selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Fighter Type to Edit
                </label>
                <select
                  value={selectedFighterTypeId}
                  onChange={(e) => handleFighterTypeChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={!gangTypeFilter}
                >
                  <option value="">
                    {!gangTypeFilter 
                      ? "Select a gang type first" 
                      : "Select a fighter type"
                    }
                  </option>
                  {fighterTypes
                    .filter(type => !gangTypeFilter || type.gang_type_id === gangTypeFilter)
                    .filter((type, index, self) => 
                      index === self.findIndex(t => 
                        t.fighter_type === type.fighter_type && 
                        t.fighter_class === type.fighter_class
                      )
                    )
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {`${type.fighter_type} (${type.fighter_class || "Unknown Class"})`}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Fighter Sub-Type to Edit
                </label>
                <select
                  value={selectedSubTypeId}
                  onChange={(e) => handleSubTypeChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedFighterTypeId}
                >
                  {!selectedFighterTypeId ? (
                    <option value="">Select a fighter type first</option>
                  ) : (
                    <>
                      {/* Only show "Default" option if there's a fighter without a sub-type */}
                      {fighterTypes.some(ft => 
                        ft.fighter_type === fighterTypes.find(f => f.id === selectedFighterTypeId)?.fighter_type &&
                        ft.fighter_class === fighterTypes.find(f => f.id === selectedFighterTypeId)?.fighter_class &&
                        (!ft.fighter_sub_type_id || ft.fighter_sub_type_id === null)
                      ) && (
                        <option value="default">Default</option>
                      )}
                  {availableSubTypes.map((subType) => (
                    <option key={subType.id} value={subType.id}>
                      {subType.sub_type_name}
                    </option>
                  ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Second row: Fighter Type name and Fighter Sub-Type input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fighter Type *
              </label>
              <Input
                type="text"
                value={fighterType}
                onChange={(e) => setFighterType(e.target.value)}
                placeholder="e.g. Van Saar Prime, Goliath Stimmer, etc."
                className="w-full"
                disabled={!selectedFighterTypeId}
              />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fighter Sub-Type
                </label>
                <Input
                  type="text"
                  value={subTypeName}
                  onChange={(e) => setSubTypeName(e.target.value)}
                  placeholder="e.g. Natborn, Alpha, etc."
                  className="w-full"
                  disabled={!selectedFighterTypeId}
                />
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
                  placeholder="Enter base cost"
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
                type="text"
                value={specialSkills}
                onChange={(e) => setSpecialSkills(e.target.value)}
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
                  setShowTradingPostDialog(true);
                  fetchEquipmentByCategory();
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
                        className="flex-grow p-2 border rounded-md"
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
                        className="flex-grow p-2 border rounded-md"
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
            disabled={!selectedFighterTypeId || isLoading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Updating...' : 'Update Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
} 