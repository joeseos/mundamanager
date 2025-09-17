'use client';

import { useState, useEffect } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomFighterType } from '@/app/lib/customise/custom-fighters';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { X, Edit } from 'lucide-react';
import { LuTrash2 } from 'react-icons/lu';
import Modal from '@/components/ui/modal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCustomFighter, deleteCustomFighter, updateCustomFighter } from '@/app/actions/customise/custom-fighters';
import { filterAllowedFighterClasses } from '@/utils/allowedFighterClasses';

interface CustomiseFightersProps {
  initialFighters: CustomFighterType[];
}

interface GangType {
  gang_type_id: string;
  gang_type: string;
}

interface FighterClass {
  id: string;
  class_name: string;
}

export function CustomiseFighters({ initialFighters }: CustomiseFightersProps) {
  const [fighters, setFighters] = useState<CustomFighterType[]>(initialFighters);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomFighterType | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomFighterType | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TanStack Query mutation for creating custom fighters
  const createFighterMutation = useMutation({
    mutationFn: createCustomFighter,
    onMutate: async (newFighterData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['customFighters'] });

      // Snapshot the previous value
      const previousFighters = fighters;

      // Optimistically update the UI
      const optimisticFighter: CustomFighterType = {
        id: `temp-${Date.now()}`, // Temporary ID
        user_id: 'current-user',
        fighter_type: newFighterData.fighter_type,
        gang_type: newFighterData.gang_type,
        gang_type_id: newFighterData.gang_type_id,
        cost: newFighterData.cost,
        movement: newFighterData.movement,
        weapon_skill: newFighterData.weapon_skill,
        ballistic_skill: newFighterData.ballistic_skill,
        strength: newFighterData.strength,
        toughness: newFighterData.toughness,
        wounds: newFighterData.wounds,
        initiative: newFighterData.initiative,
        attacks: newFighterData.attacks,
        leadership: newFighterData.leadership,
        cool: newFighterData.cool,
        willpower: newFighterData.willpower,
        intelligence: newFighterData.intelligence,
        special_rules: newFighterData.special_rules,
        free_skill: newFighterData.free_skill,
        fighter_class: newFighterData.fighter_class,
        fighter_class_id: newFighterData.fighter_class_id,
        skill_access: newFighterData.skill_access,
        created_at: new Date().toISOString(),
      };

      setFighters(prev => [...prev, optimisticFighter]);

      // Return a context object with the snapshotted value
      return { previousFighters };
    },
    onSuccess: (result, _, context) => {
      if (result.success && result.data) {
        // Replace the optimistic fighter with the real one
        setFighters(prev => prev.map(f =>
          f.id.startsWith('temp-') ? result.data! : f
        ));
        setIsAddModalOpen(false);
        resetForm();
        toast({
          description: 'Custom fighter type created successfully',
          variant: 'default',
        });
      } else {
        // Rollback on server error
        if (context?.previousFighters) {
          setFighters(context.previousFighters);
        }
        toast({
          description: result.error || 'Failed to create custom fighter type',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback to the previous state
      if (context?.previousFighters) {
        setFighters(context.previousFighters);
      }
      toast({
        description: error.message || 'Failed to create custom fighter type',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['customFighters'] });
    }
  });

  // TanStack Query mutation for deleting custom fighters
  const deleteFighterMutation = useMutation({
    mutationFn: deleteCustomFighter,
    onMutate: async (deletedId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['customFighters'] });

      // Snapshot the previous value
      const previousFighters = fighters;

      // Optimistically remove the fighter from UI
      setFighters(prev => prev.filter(f => f.id !== deletedId));

      // Return a context object with the snapshotted value
      return { previousFighters };
    },
    onSuccess: (result, _, context) => {
      if (result.success) {
        toast({
          description: 'Custom fighter type deleted successfully',
          variant: 'default',
        });
      } else {
        // Rollback on server error
        if (context?.previousFighters) {
          setFighters(context.previousFighters);
        }
        toast({
          description: result.error || 'Failed to delete custom fighter type',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback to the previous state
      if (context?.previousFighters) {
        setFighters(context.previousFighters);
      }
      toast({
        description: error.message || 'Failed to delete custom fighter type',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['customFighters'] });
    }
  });

  // TanStack Query mutation for updating custom fighters
  const updateFighterMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCustomFighter(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['customFighters'] });

      // Snapshot the previous value
      const previousFighters = fighters;

      // Optimistically update the fighter in UI
      const updatedFighter: CustomFighterType = {
        ...fighters.find(f => f.id === id)!,
        fighter_type: data.fighter_type,
        gang_type: data.gang_type,
        gang_type_id: data.gang_type_id,
        cost: data.cost,
        movement: data.movement,
        weapon_skill: data.weapon_skill,
        ballistic_skill: data.ballistic_skill,
        strength: data.strength,
        toughness: data.toughness,
        wounds: data.wounds,
        initiative: data.initiative,
        attacks: data.attacks,
        leadership: data.leadership,
        cool: data.cool,
        willpower: data.willpower,
        intelligence: data.intelligence,
        special_rules: data.special_rules,
        free_skill: data.free_skill,
        fighter_class: data.fighter_class,
        fighter_class_id: data.fighter_class_id,
        skill_access: data.skill_access,
        updated_at: new Date().toISOString(),
      };

      setFighters(prev => prev.map(f => f.id === id ? updatedFighter : f));

      // Return a context object with the snapshotted value
      return { previousFighters };
    },
    onSuccess: (result, { id }, context) => {
      if (result.success && result.data) {
        // Replace with the real data from server
        setFighters(prev => prev.map(f => f.id === id ? result.data! : f));
        setEditModalData(null);
        resetForm();
        toast({
          description: 'Custom fighter type updated successfully',
          variant: 'default',
        });
      } else {
        // Rollback on server error
        if (context?.previousFighters) {
          setFighters(context.previousFighters);
        }
        toast({
          description: result.error || 'Failed to update custom fighter type',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback to the previous state
      if (context?.previousFighters) {
        setFighters(context.previousFighters);
      }
      toast({
        description: error.message || 'Failed to update custom fighter type',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['customFighters'] });
    }
  });

  // Modal form state
  const [fighterType, setFighterType] = useState('');
  const [cost, setCost] = useState('');
  const [selectedGangType, setSelectedGangType] = useState('');
  const [selectedFighterClass, setSelectedFighterClass] = useState<FighterClass | ''>('');
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [fighterClasses, setFighterClasses] = useState<FighterClass[]>([]);

  // Combat stats
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
  const [specialRules, setSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');
  const [freeSkill, setFreeSkill] = useState(false);

  // Skill access state
  const [skillTypes, setSkillTypes] = useState<Array<{id: string, skill_type: string, name?: string}>>([]);
  const [skillAccess, setSkillAccess] = useState<{
    skill_type_id: string;
    access_level: 'primary' | 'secondary' | 'allowed';
    skill_type_name?: string;
  }[]>([]);
  const [skillTypeToAdd, setSkillTypeToAdd] = useState<string>('');

  // Check if selected fighter class is Crew (simplified stats)
  const isCrew = selectedFighterClass && selectedFighterClass.class_name === 'Crew';

  // Set fighter class when editing and fighter classes are loaded
  useEffect(() => {
    if (editModalData && fighterClasses.length > 0 && !selectedFighterClass) {
      const fighterClass = fighterClasses.find(fc =>
        fc.id === editModalData.fighter_class_id || fc.class_name === editModalData.fighter_class
      );
      if (fighterClass) {
        setSelectedFighterClass(fighterClass);
      }
    }
  }, [editModalData, fighterClasses, selectedFighterClass]);

  const columns: ListColumn[] = [
    {
      key: 'fighter_type',
      label: 'Fighter Type',
      align: 'left',
    },
    {
      key: 'gang_type',
      label: 'Gang',
      align: 'left',
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      render: (value) => value ? `${value}` : '-',
    },
    {
      key: 'fighter_class',
      label: 'Class',
      align: 'left',
    },
  ];

  const actions: ListAction[] = [
    {
      icon: <Edit className="h-4 w-4" />,
      onClick: (item: CustomFighterType) => handleEdit(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <LuTrash2 className="h-4 w-4" />,
      onClick: (item: CustomFighterType) => handleDelete(item),
      variant: 'destructive',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ];

  useEffect(() => {
    if (isAddModalOpen) {
      const fetchGangTypes = async () => {
        try {
          const response = await fetch('/api/gang-types?includeAll=true');
          if (!response.ok) throw new Error('Failed to fetch gang types');
          const data = await response.json();
          setGangTypes(data);
        } catch (error) {
          console.error('Error fetching gang types:', error);
          toast({
            description: 'Failed to load gang types',
            variant: 'destructive'
          });
        }
      };

      fetchGangTypes();
    }
  }, [isAddModalOpen, toast]);

  useEffect(() => {
    if (isAddModalOpen) {
      const fetchFighterClasses = async () => {
        try {
          const response = await fetch('/api/fighter-classes');
          if (!response.ok) throw new Error('Failed to fetch fighter classes');
          const data = await response.json();
          setFighterClasses(filterAllowedFighterClasses(data));
        } catch (error) {
          console.error('Error fetching fighter classes:', error);
          toast({
            description: 'Failed to load fighter classes',
            variant: 'destructive'
          });
        }
      };

      const fetchSkillTypes = async () => {
        try {
          const response = await fetch('/api/skill-types');
          if (!response.ok) throw new Error('Failed to fetch skill types');
          const data = await response.json();
          // Transform the data to match the expected format
          const transformedData = data.map((type: any) => ({
            id: type.id,
            skill_type: type.name || type.skill_type,
            name: type.name
          }));
          setSkillTypes(transformedData);
        } catch (error) {
          console.error('Error fetching skill types:', error);
          toast({
            description: 'Failed to load skill types',
            variant: 'destructive'
          });
        }
      };

      fetchFighterClasses();
      fetchSkillTypes();
    }
  }, [isAddModalOpen, toast]);


  const resetForm = () => {
    setFighterType('');
    setCost('');
    setSelectedGangType('');
    setSelectedFighterClass('');
    setMovement('');
    setWeaponSkill('');
    setBallisticSkill('');
    setStrength('');
    setToughness('');
    setWounds('');
    setInitiative('');
    setLeadership('');
    setCool('');
    setWillpower('');
    setIntelligence('');
    setAttacks('');
    setSpecialRules([]);
    setNewSpecialRule('');
    setFreeSkill(false);
    setSkillAccess([]);
    setSkillTypeToAdd('');
  };

  const handleEdit = async (fighter: CustomFighterType) => {
    setEditModalData(fighter);

    // Fetch data if not already loaded
    if (gangTypes.length === 0) {
      const fetchGangTypes = async () => {
        try {
          const response = await fetch('/api/gang-types?includeAll=true');
          if (!response.ok) throw new Error('Failed to fetch gang types');
          const data = await response.json();
          setGangTypes(data);
        } catch (error) {
          console.error('Error fetching gang types:', error);
        }
      };
      await fetchGangTypes();
    }

    if (fighterClasses.length === 0) {
      const fetchFighterClasses = async () => {
        try {
          const response = await fetch('/api/fighter-classes');
          if (!response.ok) throw new Error('Failed to fetch fighter classes');
          const data = await response.json();
          setFighterClasses(filterAllowedFighterClasses(data));
        } catch (error) {
          console.error('Error fetching fighter classes:', error);
        }
      };
      await fetchFighterClasses();
    }

    if (skillTypes.length === 0) {
      const fetchSkillTypes = async () => {
        try {
          const response = await fetch('/api/skill-types');
          if (!response.ok) throw new Error('Failed to fetch skill types');
          const data = await response.json();
          // Transform the data to match the expected format
          const transformedData = data.map((type: any) => ({
            id: type.id,
            skill_type: type.name || type.skill_type,
            name: type.name
          }));
          setSkillTypes(transformedData);
        } catch (error) {
          console.error('Error fetching skill types:', error);
        }
      };
      await fetchSkillTypes();
    }

    // Pre-populate the form with existing data
    setFighterType(fighter.fighter_type);
    setCost(fighter.cost?.toString() || '');
    setSelectedGangType(fighter.gang_type_id || '');
    setMovement(fighter.movement?.toString() || '');
    setWeaponSkill(fighter.weapon_skill?.toString() || '');
    setBallisticSkill(fighter.ballistic_skill?.toString() || '');
    setStrength(fighter.strength?.toString() || '');
    setToughness(fighter.toughness?.toString() || '');
    setWounds(fighter.wounds?.toString() || '');
    setInitiative(fighter.initiative?.toString() || '');
    setLeadership(fighter.leadership?.toString() || '');
    setCool(fighter.cool?.toString() || '');
    setWillpower(fighter.willpower?.toString() || '');
    setIntelligence(fighter.intelligence?.toString() || '');
    setAttacks(fighter.attacks?.toString() || '');
    setSpecialRules(fighter.special_rules || []);
    setFreeSkill(fighter.free_skill || false);
    setSkillAccess(fighter.skill_access || []);

    // Fighter class will be set by useEffect when fighterClasses are loaded
  };

  const handleDelete = (fighter: CustomFighterType) => {
    setDeleteModalData(fighter);
  };

  const handleDeleteModalClose = () => {
    setDeleteModalData(null);
  };

  const handleDeleteModalConfirm = async () => {
    if (!deleteModalData) return false;

    deleteFighterMutation.mutate(deleteModalData.id);
    setDeleteModalData(null);
    return true; // Return true to close modal
  };

  const handleSubmit = () => {
    // Validation
    if (!selectedGangType || !selectedFighterClass || !fighterType || !cost) {
      toast({
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return false;
    }

    // For Crew, only validate BS
    if (isCrew && !ballisticSkill) {
      toast({
        description: 'Please fill in Ballistic Skill (BS)',
        variant: 'destructive'
      });
      return false;
    }

    // For non-Crew fighters, validate key combat stats
    if (!isCrew && (!movement || !weaponSkill || !strength || !toughness || !wounds || !initiative || !attacks)) {
      toast({
        description: 'Please fill in all required stats',
        variant: 'destructive'
      });
      return false;
    }

    const selectedGang = gangTypes.find(g => g.gang_type_id === selectedGangType);

    const requestData = {
      fighter_type: fighterType,
      cost: parseInt(cost),
      gang_type_id: selectedGangType,
      gang_type: selectedGang?.gang_type || '',
      fighter_class: selectedFighterClass.class_name,
      fighter_class_id: selectedFighterClass.id,
      movement: movement ? parseInt(movement) : undefined,
      weapon_skill: weaponSkill ? parseInt(weaponSkill) : undefined,
      ballistic_skill: ballisticSkill ? parseInt(ballisticSkill) : undefined,
      strength: strength ? parseInt(strength) : undefined,
      toughness: toughness ? parseInt(toughness) : undefined,
      wounds: wounds ? parseInt(wounds) : undefined,
      initiative: initiative ? parseInt(initiative) : undefined,
      leadership: leadership ? parseInt(leadership) : undefined,
      cool: cool ? parseInt(cool) : undefined,
      willpower: willpower ? parseInt(willpower) : undefined,
      intelligence: intelligence ? parseInt(intelligence) : undefined,
      attacks: attacks ? parseInt(attacks) : undefined,
      special_rules: specialRules,
      free_skill: freeSkill,
      skill_access: skillAccess,
    };

    // Check if we're editing or creating
    if (editModalData) {
      // Update existing fighter
      updateFighterMutation.mutate({ id: editModalData.id, data: requestData });
    } else {
      // Create new fighter
      createFighterMutation.mutate(requestData);
    }
    return true;
  };

  // Add handler for adding a special rule
  const handleAddSpecialRule = () => {
    if (!newSpecialRule.trim()) return;

    // Avoid duplicates
    if (specialRules.includes(newSpecialRule.trim())) {
      setNewSpecialRule('');
      return;
    }

    setSpecialRules(prev => [...prev, newSpecialRule.trim()]);
    setNewSpecialRule('');
  };

  // Add handler for removing a special rule
  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setSpecialRules(prev => prev.filter(rule => rule !== ruleToRemove));
  };

  const renderStatInput = (label: string, value: string, onChange: (value: string) => void, required = false) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && '*'}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min="0"
      />
    </div>
  );

  return (
    <>
      <List
        title="Fighters"
        items={fighters}
        columns={columns}
        actions={actions}
        onAdd={() => setIsAddModalOpen(true)}
        addButtonText="Add"
        addButtonDisabled={createFighterMutation.isPending || deleteFighterMutation.isPending || updateFighterMutation.isPending}
        emptyMessage="No custom fighters created yet."
        isLoading={deleteFighterMutation.isPending}
      />

      {isAddModalOpen && (
        <Modal
          title="Add Custom Fighter"
          helper="Create your own custom fighter with unique stats and abilities."
          onClose={() => {
            setIsAddModalOpen(false);
            resetForm();
          }}
          onConfirm={handleSubmit}
          confirmText={createFighterMutation.isPending ? 'Creating...' : 'Create Fighter'}
          confirmDisabled={createFighterMutation.isPending}
          width="xl"
        >
          <div className="space-y-4">
            {/* Fighter Type and Class */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fighter Type *
                </label>
                <Input
                  type="text"
                  value={fighterType}
                  onChange={(e) => setFighterType(e.target.value)}
                  placeholder="e.g. Subtek or Bully"
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
            </div>

            {/* Gang Type and Cost */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  {gangTypes
                    .sort((a, b) => {
                      // Put "Available To All" first
                      if (a.gang_type === 'Available To All') return -1;
                      if (b.gang_type === 'Available To All') return 1;
                      // Sort the rest alphabetically
                      return a.gang_type.localeCompare(b.gang_type);
                    })
                    .map((type) => (
                      <option key={type.gang_type_id} value={type.gang_type_id}>
                        {type.gang_type}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost (credits) *
                </label>
                <Input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="e.g. 125"
                  className="w-full"
                  min="0"
                />
              </div>
            </div>

            {/* Combat Stats */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 md:gap-4">
              {renderStatInput('M', movement, setMovement, !isCrew)}
              {renderStatInput('WS', weaponSkill, setWeaponSkill, !isCrew)}
              {renderStatInput('BS', ballisticSkill, setBallisticSkill, true)}
              {renderStatInput('S', strength, setStrength, !isCrew)}
              {renderStatInput('T', toughness, setToughness, !isCrew)}
              {renderStatInput('W', wounds, setWounds, !isCrew)}
              {renderStatInput('I', initiative, setInitiative, !isCrew)}
              {renderStatInput('A', attacks, setAttacks, !isCrew)}
              {renderStatInput('Ld', leadership, setLeadership)}
              {renderStatInput('Cl', cool, setCool)}
              {renderStatInput('Wil', willpower, setWillpower)}
              {renderStatInput('Int', intelligence, setIntelligence)}
            </div>

            {/* Special Rules Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Rules
              </label>
              <div className="flex space-x-2 mb-2">
                <Input
                  type="text"
                  value={newSpecialRule}
                  onChange={(e) => setNewSpecialRule(e.target.value)}
                  placeholder="Add a Special Rule"
                  className="flex-grow"
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

              {/* Display existing special rules as tags */}
              <div className="flex flex-wrap gap-2 mt-2">
                {specialRules.map((rule, index) => (
                  <div
                    key={index}
                    className="bg-gray-100 px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Access */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Access
              </label>
              <div className="overflow-hidden rounded-md border mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2 text-left font-medium">Skill Set</th>
                      <th className="px-4 py-2 text-left font-medium">Access Level</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillAccess.map((row, idx) => {
                      const skillType = skillTypes.find(st => st.id === row.skill_type_id);
                      const skillTypeName = row.skill_type_name || skillType?.skill_type || 'Unknown';
                      return (
                        <tr key={row.skill_type_id} className="border-b last:border-0">
                          <td className="px-4 py-2">{skillTypeName}</td>
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
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
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

            {/* Free Skill Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="freeSkill"
                checked={freeSkill}
                onCheckedChange={(checked) => setFreeSkill(checked === true)}
              />
              <label htmlFor="freeSkill" className="text-sm font-medium text-gray-700">
                Free Skill
              </label>
            </div>
          </div>
        </Modal>
      )}

      {editModalData && (
        <Modal
          title="Edit Custom Fighter"
          helper="Update your custom fighter's stats and abilities."
          onClose={() => {
            setEditModalData(null);
            resetForm();
          }}
          onConfirm={handleSubmit}
          confirmText={createFighterMutation.isPending ? 'Updating...' : 'Update Fighter'}
          confirmDisabled={createFighterMutation.isPending}
          width="xl"
        >
          <div className="space-y-4">
            {/* Fighter Type and Class */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fighter Type *
                </label>
                <Input
                  type="text"
                  value={fighterType}
                  onChange={(e) => setFighterType(e.target.value)}
                  placeholder="e.g. Custom Warrior"
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
            </div>

            {/* Gang Type and Cost */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  {gangTypes
                    .sort((a, b) => {
                      // Put "Available To All" first
                      if (a.gang_type === 'Available To All') return -1;
                      if (b.gang_type === 'Available To All') return 1;
                      // Sort the rest alphabetically
                      return a.gang_type.localeCompare(b.gang_type);
                    })
                    .map((type) => (
                      <option key={type.gang_type_id} value={type.gang_type_id}>
                        {type.gang_type}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost (credits) *
                </label>
                <Input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="e.g. 125"
                  className="w-full"
                  min="0"
                />
              </div>
            </div>

            {/* Combat Stats */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 md:gap-4">
              {renderStatInput('M', movement, setMovement, !isCrew)}
              {renderStatInput('WS', weaponSkill, setWeaponSkill, !isCrew)}
              {renderStatInput('BS', ballisticSkill, setBallisticSkill, true)}
              {renderStatInput('S', strength, setStrength, !isCrew)}
              {renderStatInput('T', toughness, setToughness, !isCrew)}
              {renderStatInput('W', wounds, setWounds, !isCrew)}
              {renderStatInput('I', initiative, setInitiative, !isCrew)}
              {renderStatInput('A', attacks, setAttacks, !isCrew)}
              {renderStatInput('Ld', leadership, setLeadership)}
              {renderStatInput('Cl', cool, setCool)}
              {renderStatInput('Wil', willpower, setWillpower)}
              {renderStatInput('Int', intelligence, setIntelligence)}
            </div>

            {/* Special Rules Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Rules
              </label>
              <div className="flex space-x-2 mb-2">
                <Input
                  type="text"
                  value={newSpecialRule}
                  onChange={(e) => setNewSpecialRule(e.target.value)}
                  placeholder="Add a Special Rule"
                  className="flex-grow"
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
                    className="bg-gray-100 px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Access */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Access
              </label>
              <div className="overflow-hidden rounded-md border mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2 text-left font-medium">Skill Set</th>
                      <th className="px-4 py-2 text-left font-medium">Access Level</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillAccess.map((row, idx) => {
                      const skillType = skillTypes.find(st => st.id === row.skill_type_id);
                      const skillTypeName = row.skill_type_name || skillType?.skill_type || 'Unknown';
                      return (
                        <tr key={row.skill_type_id} className="border-b last:border-0">
                          <td className="px-4 py-2">{skillTypeName}</td>
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
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
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

            {/* Free Skill Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="freeSkillEdit"
                checked={freeSkill}
                onCheckedChange={(checked) => setFreeSkill(checked === true)}
              />
              <label htmlFor="freeSkillEdit" className="text-sm font-medium text-gray-700">
                Free Skill
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleteModalData && (
        <Modal
          title="Delete Fighter"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete <strong>{deleteModalData.fighter_type}</strong>?</p>
              <p className="text-sm text-red-600">
                <strong>Warning:</strong> This custom fighter will be permanently deleted and cannot be recovered.
              </p>
            </div>
          }
          onClose={handleDeleteModalClose}
          onConfirm={handleDeleteModalConfirm}
          confirmText="Delete"
        />
      )}
    </>
  );
}