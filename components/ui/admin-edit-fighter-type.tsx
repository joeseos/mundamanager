'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X } from "lucide-react";
import { FighterType } from "@/types/fighter";
import { GangType, Equipment } from "@/types/gang";

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

export function AdminEditFighterTypeModal({ onClose, onSubmit }: AdminEditFighterTypeModalProps) {
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [fighterType, setFighterType] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [selectedFighterClass, setSelectedFighterClass] = useState<string>('');
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
  const [gangTypeFilter, setGangTypeFilter] = useState('');
  const [fighterClasses, setFighterClasses] = useState<FighterClass[]>([]);
  const [skillTypes, setSkillTypes] = useState<SkillType[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

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
    const fetchFighterTypeDetails = async () => {
      if (!selectedFighterTypeId) return;

      try {
        const response = await fetch(`/api/admin/fighter-types?id=${selectedFighterTypeId}`);
        if (!response.ok) throw new Error('Failed to fetch fighter type details');
        const data = await response.json();

        setFighterType(data.fighter_type);
        setBaseCost(data.cost.toString());
        setSelectedFighterClass(data.fighter_class);
        setMovement(data.movement.toString());
        setWeaponSkill(data.weapon_skill.toString());
        setBallisticSkill(data.ballistic_skill.toString());
        setStrength(data.strength.toString());
        setToughness(data.toughness.toString());
        setWounds(data.wounds.toString());
        setInitiative(data.initiative.toString());
        setLeadership(data.leadership.toString());
        setCool(data.cool.toString());
        setWillpower(data.willpower.toString());
        setIntelligence(data.intelligence.toString());
        setAttacks(data.attacks.toString());
        setSpecialSkills(data.special_rules?.join(', ') || '');
        setFreeSkill(data.free_skill);
        setSelectedEquipment(data.default_equipment || []);
        setSelectedSkills(data.default_skills || []);
      } catch (error) {
        console.error('Error fetching fighter type details:', error);
        toast({
          description: 'Failed to load fighter type details',
          variant: "destructive"
        });
      }
    };

    fetchFighterTypeDetails();
  }, [selectedFighterTypeId, toast]);

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
        if (!response.ok) throw new Error('Failed to fetch skill types');
        const data = await response.json();
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching skill types:', error);
        toast({
          description: 'Failed to load skill types',
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

      const updateData = {
        id: selectedFighterTypeId,
        fighter_type: fighterType,
        cost: parseInt(baseCost),
        gang_type_id: selectedFighter.gang_type_id,
        fighter_class: selectedFighterClass,
        fighter_class_id: fighterClass?.id,
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
        default_equipment: selectedEquipment,
        default_skills: selectedSkills
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

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit Fighter Type</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required</p>
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
                onChange={(e) => setGangTypeFilter(e.target.value)}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Fighter Type to Edit
                </label>
                <select
                  value={selectedFighterTypeId}
                  onChange={(e) => setSelectedFighterTypeId(e.target.value)}
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
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.fighter_type}
                      </option>
                    ))}
                </select>
              </div>

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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <option value="">Select skill type</option>
                  {skillTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.skill_type}
                    </option>
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
                  <option value="">Select skill to add</option>
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