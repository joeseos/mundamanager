'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X, Plus, Minus } from "lucide-react";
import { FighterType } from "@/types/fighter";
import { GangType, Equipment } from "@/types/gang";

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

  const handleSubmit = async () => {
    if (!selectedGangType || !selectedFighterClass || !fighterType) {
      toast({
        description: "Please fill in all required fields",
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
        special_rules: specialSkills.split(',').map(skill => skill.trim()).filter(Boolean),
        free_skill: freeSkill,
        default_equipment: selectedEquipment,
        default_skills: selectedSkills,
        equipment_list: equipmentListSelections,
        equipment_discounts: equipmentDiscounts
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-screen overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Add Fighter Type</h3>
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
                  disabled={!selectedSkillType}
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
                Equipment List
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

              <div className="mt-2 flex flex-wrap gap-2">
                {equipmentListSelections.map((equipId) => {
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
                        onClick={() => setEquipmentListSelections(equipmentListSelections.filter(id => id !== item.id))}
                        className="hover:text-red-500 focus:outline-none"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
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
              !movement ||
              !weaponSkill ||
              !ballisticSkill ||
              !strength ||
              !toughness ||
              !wounds ||
              !initiative ||
              !attacks ||
              !leadership ||
              !cool ||
              !willpower ||
              !intelligence ||
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