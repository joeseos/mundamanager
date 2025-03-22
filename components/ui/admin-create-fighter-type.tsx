'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X, Plus, Minus } from "lucide-react";
import { FighterType } from "@/types/fighter";
import { GangType, Equipment } from "@/types/gang";
import { skillSetRank } from "@/utils/skillSetRank";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";

interface AdminCreateFighterTypeModalProps {
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

export function AdminCreateFighterTypeModal({ onClose, onSubmit }: AdminCreateFighterTypeModalProps) {
  const [fighterType, setFighterType] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [selectedGangType, setSelectedGangType] = useState('');
  const [selectedFighterClass, setSelectedFighterClass] = useState<FighterClass | ''>('');
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
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
  const [specialSkills, setSpecialSkills] = useState('');
  const [freeSkill, setFreeSkill] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [fighterClasses, setFighterClasses] = useState<FighterClass[]>([]);
  const [skillTypes, setSkillTypes] = useState<SkillType[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
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
  const [equipmentByCategory, setEquipmentByCategory] = useState<Record<string, Equipment[]>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [equipmentSelection, setEquipmentSelection] = useState<{
    weapons?: {
      default?: Array<{ id: string; quantity: number }>;
      options?: EquipmentOption[];
      select_type: 'optional' | 'single' | 'multiple';
    };
  }>({ weapons: { select_type: 'optional' } });

  const { toast } = useToast();

  const fetchEquipmentByCategory = async () => {
    try {
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      
      const data = await response.json();
      
      // Log first item for debugging
      if (data.length > 0) {
        console.log('Example equipment item:', data[0]);
      }
      
      // Group equipment by category
      const grouped: Record<string, Equipment[]> = {};
      
      data.forEach((item: any) => {
        // Use category or equipment type as the grouping key, with fallback to 'Uncategorized'
        const category = item.equipment_category || item.equipment_type || 'Uncategorized';
        
        if (!grouped[category]) {
          grouped[category] = [];
        }
        
        grouped[category].push(item);
      });
      
      // Sort equipment within each category
      Object.keys(grouped).forEach(category => {
        grouped[category].sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
      });
      
      setEquipmentByCategory(grouped);
    } catch (error) {
      console.error('Error fetching equipment categories:', error);
      toast({
        description: 'Failed to load equipment categories',
        variant: "destructive"
      });
    }
  };

  const isCrew = selectedFighterClass && selectedFighterClass.class_name === 'Crew';

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
    const fetchEquipment = async () => {
      try {
        const response = await fetch('/api/admin/equipment');
        if (!response.ok) throw new Error('Failed to fetch equipment');
        const data = await response.json();
        setEquipment(data);
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
      try {
        const response = await fetch('/api/admin/fighter-classes');
        if (!response.ok) throw new Error('Failed to fetch fighter classes');
        const data = await response.json();
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

  const handleSubmit = async () => {
    // Check if selected fighter class is Crew
    const isCrew = selectedFighterClass && selectedFighterClass.class_name === 'Crew';

    // Modify validation for Crew class
    if (!selectedGangType || !selectedFighterClass || !fighterType) {
      toast({
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return false;
    }

    // For Crew, only validate BS
    if (isCrew && !ballisticSkill) {
      toast({
        description: "Please fill in Ballistic Skill (BS)",
        variant: "destructive"
      });
      return false;
    }

    // For non-Crew fighters, validate all combat stats
    if (!isCrew && (!movement || !weaponSkill || !strength || !toughness || !wounds || !initiative || !attacks)) {
      toast({
        description: "Please fill in all required stats",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      const requestData = {
        fighterType,
        baseCost: parseInt(baseCost),
        gangTypeId: selectedGangType,
        fighterClass: selectedFighterClass.class_name,
        fighterClassId: selectedFighterClass.id,
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
        special_rules: specialSkills.split(',').map(skill => skill.trim()).filter(Boolean),
        free_skill: freeSkill,
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
      console.log('Sending fighter type data:', requestData);

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

      toast({
        description: "Fighter type created successfully",
        variant: "default"
      });
      
      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true;
    } catch (error) {
      console.error('Error creating fighter type:', error);
      toast({
        description: 'Failed to create fighter type',
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

  const renderStatInput = (label: string, value: string, onChange: (value: string) => void) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min="0"
      />
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Add Fighter Type</h3>
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
                Gang Type *
              </label>
              <select
                value={selectedGangType}
                onChange={(e) => setSelectedGangType(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select gang type</option>
                {gangTypes.map((type) => (
                  <option key={type.gang_type_id} value={type.gang_type_id}>
                    {type.gang_type}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fighter Class *
                </label>
                <select
                  value={selectedFighterClass ? selectedFighterClass.id : ''}
                  onChange={(e) => {
                    const selectedClass = fighterClasses.find(fc => fc.id === e.target.value);
                    setSelectedFighterClass(selectedClass || '');
                  }}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select fighter class</option>
                  {fighterClasses.map((fighterClass) => (
                    <option key={fighterClass.id} value={fighterClass.id}>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  A {!isCrew && '*'}
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
                Special Skills
              </label>
              <Input
                type="text"
                value={specialSkills}
                onChange={(e) => setSpecialSkills(e.target.value)}
                placeholder="e.g. Tools of the Trade, Gang Leader, Group Activation (2)"
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Separate multiple skills with commas
              </p>
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
                  // Reset the select to empty after selection
                  e.target.value = "";
                }}
                className="w-full p-2 border rounded-md"
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
                      className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full text-sm"
                    >
                      <span>{item.equipment_name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedEquipment(selectedEquipment.filter(id => id !== item.id))}
                        className="hover:text-red-500 focus:outline-none"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
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
                    const skill = skills.find(s => s.id === skillId) || 
                                skills.find(s => s.id === skillId);
                    if (!skill) return null;
                    
                    return (
                      <div 
                        key={skill.id}
                        className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full text-sm"
                      >
                        <span>{skill.skill_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSkills(selectedSkills.filter(id => id !== skill.id))}
                          className="hover:text-red-500 focus:outline-none"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="freeSkill"
                checked={freeSkill}
                onChange={(e) => setFreeSkill(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="freeSkill" className="text-sm font-medium text-gray-700">
                Free Skill
              </label>
            </div>

            <div>
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
              >
                <option value="">Available equipment</option>
                {equipment
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
                      const rankA = equipmentCategoryRank[a!.equipment_category.toLowerCase()] ?? Infinity;
                      const rankB = equipmentCategoryRank[b!.equipment_category.toLowerCase()] ?? Infinity;

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
                    }, {} as Record<string, Equipment[]>)
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
                disabled={!selectedGangType}
              >
                Add Equipment Discount
              </Button>

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
                disabled={!selectedGangType}
              >
                Open Trading Post Menu
              </Button>
              {!selectedGangType && (
                <p className="text-sm text-gray-500 mb-2">
                  Select a gang type to configure trading post options
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
                                          className="border-t px-4 py-2 flex items-center"
                                        >
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
                            description: "Trading Post options saved. Remember to create the fighter type to apply changes.",
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
                      setEquipmentSelection({
                        weapons: {
                          select_type: value,
                          default: value === 'optional' ? [] : undefined,
                          options: []
                        }
                      });
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={!selectedGangType}
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
                        disabled={!selectedGangType}
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
                        disabled={!selectedGangType}
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
            disabled={
              !baseCost || 
              !selectedGangType || 
              !selectedFighterClass || 
              !fighterType ||
              !ballisticSkill ||
              (!selectedFighterClass || selectedFighterClass.class_name !== 'Crew') && (
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
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Creating...' : 'Create Fighter Type'}
          </Button>
        </div>
      </div>
    </div>
  );
} 