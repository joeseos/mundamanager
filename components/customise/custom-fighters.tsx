'use client';

import { useState, useEffect } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomFighterType } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { X, Edit, Eye } from 'lucide-react';
import { LuTrash2 } from 'react-icons/lu';
import { FaRegCopy } from 'react-icons/fa';
import Modal from '@/components/ui/modal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCustomFighter, deleteCustomFighter, updateCustomFighter } from '@/app/actions/customise/custom-fighters';
import { filterAllowedFighterClasses } from '@/utils/allowedFighterClasses';

interface CustomiseFightersProps {
  className?: string;
  initialFighters: CustomFighterType[];
  readOnly?: boolean;
}

interface GangType {
  gang_type_id: string;
  gang_type: string;
}

interface FighterClass {
  id: string;
  class_name: string;
}

export function CustomiseFighters({ className, initialFighters, readOnly = false }: CustomiseFightersProps) {
  const [fighters, setFighters] = useState<CustomFighterType[]>(initialFighters);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomFighterType | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomFighterType | null>(null);
  const [viewModalData, setViewModalData] = useState<CustomFighterType | null>(null);
  const [copyModalData, setCopyModalData] = useState<CustomFighterType | null>(null);
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

  // Equipment state
  const [equipment, setEquipment] = useState<Array<{id: string, equipment_name: string, equipment_category: string}>>([]);

  // Loading states to prevent duplicate API calls
  const [isLoadingDropdownData, setIsLoadingDropdownData] = useState(false);

  // Default skills state
  const [skills, setSkills] = useState<Array<{id: string, skill_name: string, skill_type_id: string}>>([]);
  const [selectedSkillType, setSelectedSkillType] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Default equipment state
  const [selectedEquipmentCategory, setSelectedEquipmentCategory] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  // Check if selected fighter class is Crew (simplified stats)
  const isCrew = Boolean(selectedFighterClass && selectedFighterClass.class_name === 'Crew');

  // Clear disabled stats when switching to/from Crew class (but not when loading edit data)
  useEffect(() => {
    // Don't clear stats if we're currently loading edit data
    if (editModalData) return;

    if (isCrew) {
      // Clear the fields for Crew class (they'll be disabled and show empty)
      setMovement('');
      setWeaponSkill('');
      setStrength('');
      setToughness('');
      setWounds('');
      setInitiative('');
      setAttacks('');
    } else {
      // Clear the fields when switching away from Crew class
      setMovement('');
      setWeaponSkill('');
      setStrength('');
      setToughness('');
      setWounds('');
      setInitiative('');
      setAttacks('');
    }
  }, [isCrew, editModalData]);

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
      width: '30%'
    },
    {
      key: 'fighter_class',
      label: 'Class',
      align: 'left',
      width: '20%'
    },
    {
      key: 'gang_type',
      label: 'Gang',
      align: 'left',
      width: '15%'
    },
    {
      key: '',
      label: '',
      align: 'right',
      width: '15%'
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      width: '10%',
      render: (value) => value ? `${value}` : '-',
    },
  ];

  const actions: ListAction[] = readOnly ? [
    {
      icon: <Eye className="h-4 w-4" />,
      onClick: (item: CustomFighterType) => handleView(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <FaRegCopy className="h-4 w-4" />,
      onClick: (item: CustomFighterType) => handleCopy(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ] : [
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
    if ((isAddModalOpen || editModalData) && gangTypes.length === 0) {
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
  }, [isAddModalOpen, editModalData, toast, gangTypes.length]);

  useEffect(() => {
    if ((isAddModalOpen || editModalData) && !isLoadingDropdownData && (fighterClasses.length === 0 || skillTypes.length === 0 || equipment.length === 0)) {
      const fetchData = async () => {
        setIsLoadingDropdownData(true);
        try {
          const promises = [];

          // Fetch fighter classes if not loaded
          if (fighterClasses.length === 0) {
            promises.push(
              fetch('/api/fighter-classes').then(async (response) => {
                if (response.ok) {
                  const classData = await response.json();
                  setFighterClasses(filterAllowedFighterClasses(classData));
                }
              })
            );
          }

          // Fetch skill types if not loaded
          if (skillTypes.length === 0) {
            promises.push(
              fetch('/api/skill-types').then(async (response) => {
                if (response.ok) {
                  const skillData = await response.json();
                  const transformedData = skillData.map((type: any) => ({
                    id: type.id,
                    skill_type: type.name || type.skill_type,
                    name: type.name
                  }));
                  setSkillTypes(transformedData);
                }
              })
            );
          }

          // Fetch equipment if not loaded
          if (equipment.length === 0) {
            promises.push(
              fetch('/api/equipment').then(async (response) => {
                if (response.ok) {
                  const equipData = await response.json();
                  setEquipment(equipData);
                }
              })
            );
          }

          await Promise.all(promises);
        } catch (error) {
          console.error('Error fetching dropdown data:', error);
          toast({
            description: 'Failed to load some dropdown options',
            variant: 'destructive'
          });
        } finally {
          setIsLoadingDropdownData(false);
        }
      };

      fetchData();
    }
  }, [isAddModalOpen, editModalData, fighterClasses.length, skillTypes.length, equipment.length, isLoadingDropdownData, toast]);

  // useEffect to fetch skills based on selected skill type
  useEffect(() => {
    const fetchSkills = async () => {
      if (!selectedSkillType) {
        setSkills([]);
        return;
      }

      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();

        const { data, error } = await supabase
          .from('skills')
          .select('id, name, skill_type_id')
          .eq('skill_type_id', selectedSkillType)
          .order('name');

        if (error) throw error;

        // Transform to match the expected format
        const transformedSkills = data.map(skill => ({
          id: skill.id,
          skill_name: skill.name,
          skill_type_id: skill.skill_type_id
        }));

        setSkills(transformedSkills);
      } catch (error) {
        console.error('Error fetching skills:', error);
        toast({
          description: 'Failed to load skills',
          variant: 'destructive'
        });
      }
    };

    fetchSkills();
  }, [selectedSkillType, toast]);


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
    setSelectedSkills([]);
    setSelectedSkillType('');
    setSkills([]);
    setSelectedEquipment([]);
    setSelectedEquipmentCategory('');
  };

  const handleEdit = async (fighter: CustomFighterType) => {
    setEditModalData(fighter);

    // Load existing default skills if they exist - use data from server
    if (fighter.default_skills && fighter.default_skills.length > 0) {
      // Transform the existing skill data to match the expected format
      const existingSkills = fighter.default_skills.map(skill => ({
        id: skill.skill_id,
        skill_name: skill.skill_name,
        skill_type_id: '' // We don't have this from the server data, but it's not needed for display
      }));

      setSkills(existingSkills);
    }

    // Note: We don't add existing equipment to the equipment state here
    // because it would interfere with the API call that fetches full equipment list with categories
    // The selected equipment IDs will be set below, and the equipment list will be loaded via API

    // Pre-populate the form with existing data
    setFighterType(fighter.fighter_type);
    setCost(fighter.cost?.toString() || '');
    setSelectedGangType(fighter.gang_type_id || '');

    // Load all values from database (Crew fighters will have 0s, which is fine to display)
    setMovement(fighter.movement?.toString() || '');
    setWeaponSkill(fighter.weapon_skill?.toString() || '');
    setBallisticSkill(fighter.ballistic_skill?.toString() || '');
    setStrength(fighter.strength?.toString() || '');
    setToughness(fighter.toughness?.toString() || '');
    setWounds(fighter.wounds?.toString() || '');
    setInitiative(fighter.initiative?.toString() || '');
    setAttacks(fighter.attacks?.toString() || '');

    setLeadership(fighter.leadership?.toString() || '');
    setCool(fighter.cool?.toString() || '');
    setWillpower(fighter.willpower?.toString() || '');
    setIntelligence(fighter.intelligence?.toString() || '');
    setSpecialRules(fighter.special_rules || []);
    setFreeSkill(fighter.free_skill || false);
    setSkillAccess(fighter.skill_access || []);

    // Set selected skills from existing data
    if (fighter.default_skills && fighter.default_skills.length > 0) {
      setSelectedSkills(fighter.default_skills.map(skill => skill.skill_id));
    } else {
      setSelectedSkills([]);
    }
    setSelectedSkillType('');

    // Set selected equipment from existing data
    if (fighter.default_equipment && fighter.default_equipment.length > 0) {
      setSelectedEquipment(fighter.default_equipment.map(equip => equip.equipment_id));
    } else {
      setSelectedEquipment([]);
    }
    setSelectedEquipmentCategory('');

    // Fighter class will be set by useEffect when fighterClasses are loaded
  };

  const handleView = async (fighter: CustomFighterType) => {
    setViewModalData(fighter);

    // Load existing default skills if they exist - use data from server
    if (fighter.default_skills && fighter.default_skills.length > 0) {
      // Transform the existing skill data to match the expected format
      const existingSkills = fighter.default_skills.map(skill => ({
        id: skill.skill_id,
        skill_name: skill.skill_name,
        skill_type_id: '' // We don't have this from the server data, but it's not needed for display
      }));

      setSkills(existingSkills);
    }

    // Load skill access data if it exists
    if (fighter.skill_access && fighter.skill_access.length > 0) {
      const existingSkillAccess = fighter.skill_access.map(access => ({
        skill_type_id: access.skill_type_id,
        skill_type_name: access.skill_type_name,
        access_level: access.access_level
      }));
      setSkillAccess(existingSkillAccess);
    }

    // Load existing default equipment if they exist
    if (fighter.default_equipment && fighter.default_equipment.length > 0) {
      const existingEquipment = fighter.default_equipment.map(eq => ({
        id: eq.equipment_id,
        equipment_name: eq.equipment_name,
        equipment_category: '',
        cost: 0,
        equipment_type: 'wargear' as 'wargear' | 'weapon',
        availability: 'C'
      }));

      setEquipment(existingEquipment);
    }

    // Load gang types and fighter classes if not already loaded
    if (gangTypes.length === 0) {
      const fetchGangTypes = async () => {
        try {
          const response = await fetch('/api/gang-types');
          if (response.ok) {
            const data = await response.json();
            setGangTypes(data);
          }
        } catch (error) {
          console.error('Error fetching gang types:', error);
        }
      };
      fetchGangTypes();
    }

    if (fighterClasses.length === 0) {
      const fetchFighterClasses = async () => {
        try {
          const response = await fetch('/api/fighter-classes');
          if (response.ok) {
            const data = await response.json();
            setFighterClasses(data);
          }
        } catch (error) {
          console.error('Error fetching fighter classes:', error);
        }
      };
      fetchFighterClasses();
    }
  };

  const handleCopy = (fighter: CustomFighterType) => {
    setCopyModalData(fighter);
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

  const handleCopyModalConfirm = async () => {
    if (!copyModalData) return false;

    try {
      // Create a copy of the fighter with new user_id
      const newFighter = {
        fighter_type: copyModalData.fighter_type,
        cost: copyModalData.cost,
        movement: copyModalData.movement,
        weapon_skill: copyModalData.weapon_skill,
        ballistic_skill: copyModalData.ballistic_skill,
        strength: copyModalData.strength,
        toughness: copyModalData.toughness,
        wounds: copyModalData.wounds,
        initiative: copyModalData.initiative,
        attacks: copyModalData.attacks,
        leadership: copyModalData.leadership,
        cool: copyModalData.cool,
        willpower: copyModalData.willpower,
        intelligence: copyModalData.intelligence,
        special_rules: copyModalData.special_rules || [],
        free_skill: copyModalData.free_skill || false,
        gang_type: copyModalData.gang_type || '',
        gang_type_id: copyModalData.gang_type_id || '',
        fighter_class: copyModalData.fighter_class || '',
        fighter_class_id: copyModalData.fighter_class_id || '',
        skill_access: copyModalData.skill_access || [],
        default_skills: copyModalData.default_skills?.map(skill => skill.skill_id) || [],
        default_equipment: copyModalData.default_equipment?.map(eq => eq.equipment_id) || [],
      };

      if (readOnly) {
        // In read-only mode, call the server action directly without using the mutation
        // This prevents the mutation from updating the local state (which shows someone else's fighters)
        const result = await createCustomFighter(newFighter);
        
        if (result.success) {
          toast({
            title: "Success",
            description: `${copyModalData.fighter_type} has been copied to your custom fighters.`,
          });
          setCopyModalData(null);
          return true;
        } else {
          throw new Error(result.error || 'Failed to copy fighter');
        }
      } else {
        // In edit mode, use the mutation which will update the local state
        await createFighterMutation.mutateAsync(newFighter);
        setCopyModalData(null);
        return true;
      }
    } catch (error) {
      console.error('Error copying fighter:', error);
      toast({
        title: "Error",
        description: "Failed to copy fighter. Please try again.",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    }
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

    // For Crew, only validate BS (other stats are automatically set to 0)
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

    // Validate mandatory stats for all fighter types
    if (!leadership || !cool || !willpower || !intelligence) {
      toast({
        description: 'Please fill in Leadership, Cool, Willpower, and Intelligence',
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
      movement: isCrew ? 0 : (movement ? parseInt(movement) : undefined),
      weapon_skill: isCrew ? 0 : (weaponSkill ? parseInt(weaponSkill) : undefined),
      ballistic_skill: ballisticSkill ? parseInt(ballisticSkill) : undefined,
      strength: isCrew ? 0 : (strength ? parseInt(strength) : undefined),
      toughness: isCrew ? 0 : (toughness ? parseInt(toughness) : undefined),
      wounds: isCrew ? 0 : (wounds ? parseInt(wounds) : undefined),
      initiative: isCrew ? 0 : (initiative ? parseInt(initiative) : undefined),
      leadership: leadership ? parseInt(leadership) : undefined,
      cool: cool ? parseInt(cool) : undefined,
      willpower: willpower ? parseInt(willpower) : undefined,
      intelligence: intelligence ? parseInt(intelligence) : undefined,
      attacks: isCrew ? 0 : (attacks ? parseInt(attacks) : undefined),
      special_rules: specialRules,
      free_skill: freeSkill,
      skill_access: skillAccess,
      default_skills: selectedSkills,
      default_equipment: selectedEquipment,
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

  const renderStatInput = (label: string, value: string, onChange: (value: string) => void, required = false, disabled = false) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label} {required && '*'}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min="0"
        disabled={disabled}
      />
    </div>
  );

  return (
    <div className={className}>
      <List
        title="Fighters"
        items={fighters}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : () => setIsAddModalOpen(true)}
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                      // Put "Available to All" first
                      if (a.gang_type === 'Available to All') return -1;
                      if (b.gang_type === 'Available to All') return 1;
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
              {renderStatInput('M', movement, setMovement, !isCrew, isCrew)}
              {renderStatInput('WS', weaponSkill, setWeaponSkill, !isCrew, isCrew)}
              {renderStatInput('BS', ballisticSkill, setBallisticSkill, true)}
              {renderStatInput('S', strength, setStrength, !isCrew, isCrew)}
              {renderStatInput('T', toughness, setToughness, !isCrew, isCrew)}
              {renderStatInput('W', wounds, setWounds, !isCrew, isCrew)}
              {renderStatInput('I', initiative, setInitiative, !isCrew, isCrew)}
              {renderStatInput('A', attacks, setAttacks, !isCrew, isCrew)}
              {renderStatInput('Ld', leadership, setLeadership, true)}
              {renderStatInput('Cl', cool, setCool, true)}
              {renderStatInput('Wil', willpower, setWillpower, true)}
              {renderStatInput('Int', intelligence, setIntelligence, true)}
            </div>

            {/* Special Rules Section */}
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
                    className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-muted-foreground focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Access */}
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

            {/* Default Skills */}
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
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
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

            {/* Default Equipment */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Default Equipment
              </label>
              <div className="space-y-2">
                <select
                  value={selectedEquipmentCategory}
                  onChange={(e) => setSelectedEquipmentCategory(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select an equipment category</option>
                  {Array.from(new Set(equipment.map(eq => eq.equipment_category)))
                    .sort()
                    .map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                </select>

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
                  disabled={!selectedEquipmentCategory}
                >
                  <option value="">Select equipment to add</option>
                  {equipment
                    .filter(eq => eq.equipment_category === selectedEquipmentCategory && !selectedEquipment.includes(eq.id))
                    .map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedEquipment.map((equipmentId) => {
                    const eq = equipment.find(e => e.id === equipmentId);
                    if (!eq) return null;

                    return (
                      <div
                        key={eq.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                      >
                        <span>{eq.equipment_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEquipment(selectedEquipment.filter(id => id !== eq.id))}
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

            {/* Free Skill Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="freeSkill"
                checked={freeSkill}
                onCheckedChange={(checked) => setFreeSkill(checked === true)}
              />
              <label htmlFor="freeSkill" className="text-sm font-medium text-muted-foreground">
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                      // Put "Available to All" first
                      if (a.gang_type === 'Available to All') return -1;
                      if (b.gang_type === 'Available to All') return 1;
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
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
              {renderStatInput('M', movement, setMovement, !isCrew, isCrew)}
              {renderStatInput('WS', weaponSkill, setWeaponSkill, !isCrew, isCrew)}
              {renderStatInput('BS', ballisticSkill, setBallisticSkill, true)}
              {renderStatInput('S', strength, setStrength, !isCrew, isCrew)}
              {renderStatInput('T', toughness, setToughness, !isCrew, isCrew)}
              {renderStatInput('W', wounds, setWounds, !isCrew, isCrew)}
              {renderStatInput('I', initiative, setInitiative, !isCrew, isCrew)}
              {renderStatInput('A', attacks, setAttacks, !isCrew, isCrew)}
              {renderStatInput('Ld', leadership, setLeadership, true)}
              {renderStatInput('Cl', cool, setCool, true)}
              {renderStatInput('Wil', willpower, setWillpower, true)}
              {renderStatInput('Int', intelligence, setIntelligence, true)}
            </div>

            {/* Special Rules Section */}
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
                    className="flex items-center text-sm rounded-full px-3 py-1 bg-muted"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-red-500 focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Access */}
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

            {/* Default Skills */}
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
                        className="flex items-center text-sm rounded-full px-3 py-1 bg-muted gap-2"
                      >
                        <span>{skill.skill_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSkills(selectedSkills.filter(id => id !== skill.id))}
                          className="text-gray-500 hover:text-red-500 focus:outline-none"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Default Equipment */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Default Equipment
              </label>
              <div className="space-y-2">
                <select
                  value={selectedEquipmentCategory}
                  onChange={(e) => setSelectedEquipmentCategory(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select an equipment category</option>
                  {Array.from(new Set(equipment.map(eq => eq.equipment_category)))
                    .sort()
                    .map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                </select>

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
                  disabled={!selectedEquipmentCategory}
                >
                  <option value="">Select equipment to add</option>
                  {equipment
                    .filter(eq => eq.equipment_category === selectedEquipmentCategory && !selectedEquipment.includes(eq.id))
                    .map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedEquipment.map((equipmentId) => {
                    const eq = equipment.find(e => e.id === equipmentId);
                    if (!eq) return null;

                    return (
                      <div
                        key={eq.id}
                        className="flex items-center text-sm rounded-full px-3 py-1 bg-muted gap-2"
                      >
                        <span>{eq.equipment_name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEquipment(selectedEquipment.filter(id => id !== eq.id))}
                          className="text-gray-500 hover:text-red-500 focus:outline-none"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Free Skill Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="freeSkillEdit"
                checked={freeSkill}
                onCheckedChange={(checked) => setFreeSkill(checked === true)}
              />
              <label htmlFor="freeSkillEdit" className="text-sm font-medium text-muted-foreground">
                Free Skill
              </label>
            </div>
          </div>
        </Modal>
      )}

      {viewModalData && (
        <Modal
          title="View Custom Fighter"
          helper="View fighter details and abilities."
          onClose={() => {
            setViewModalData(null);
            resetForm();
          }}
          hideCancel={true}
          width="xl"
        >
          <div className="space-y-4">
            {/* Fighter Type and Class */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter Type
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {viewModalData.fighter_type}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fighter Class
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {viewModalData.fighter_class}
                </div>
              </div>
            </div>

            {/* Gang Type */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Type
              </label>
              <div className="w-full p-2 border rounded-md bg-muted">
                {viewModalData.gang_type}
              </div>
            </div>

            {/* Characteristics */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Characteristics
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">M</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.movement}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">WS</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.weapon_skill}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">BS</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.ballistic_skill}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">S</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.strength}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">T</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.toughness}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">W</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.wounds}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">I</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.initiative}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">A</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.attacks}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Ld</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.leadership}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cl</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.cool}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Wil</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.willpower}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Int</label>
                  <div className="w-full p-2 border rounded-md bg-muted text-center">
                    {viewModalData.intelligence}
                  </div>
                </div>
              </div>
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Cost
              </label>
              <div className="w-full p-2 border rounded-md bg-muted">
                {viewModalData.cost} credits
              </div>
            </div>

            {/* Default Skills */}
            {skills.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Default Skills
                </label>
                <div className="space-y-2">
                  {skills.map((skill, index) => (
                    <div key={index} className="p-2 border rounded-md bg-muted">
                      {skill.skill_name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Default Equipment */}
            {equipment.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Default Equipment
                </label>
                <div className="space-y-2">
                  {equipment.map((eq, index) => (
                    <div key={index} className="p-2 border rounded-md bg-muted">
                      <span>{eq.equipment_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skill Access */}
            {skillAccess.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Skill Access
                </label>
                <div className="space-y-2">
                  {skillAccess.map((access, index) => (
                    <div key={index} className="p-2 border rounded-md bg-muted">
                      <div className="flex justify-between items-center">
                        <span>{access.skill_type_name}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          access.access_level === 'primary' ? 'bg-blue-100 text-blue-800' :
                          access.access_level === 'secondary' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {access.access_level}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Rules */}
            {viewModalData.special_rules && viewModalData.special_rules.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Special Rules
                </label>
                <div className="space-y-2">
                  {viewModalData.special_rules.map((rule, index) => (
                    <div key={index} className="p-2 border rounded-md bg-muted">
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Free Skill */}
            {viewModalData.free_skill && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Free Skill
                </label>
                <div className="p-2 border rounded-md bg-muted">
                  <span>This fighter has a free skill</span>
                </div>
              </div>
            )}
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

      {copyModalData && (
        <Modal
          title="Copy Custom Asset"
          content={
            <div className="space-y-4">
              <p>Do you want to copy the custom asset <strong>"{copyModalData.fighter_type}"</strong> into your own profile?</p>
              <p className="text-sm text-muted-foreground">
                This will create a copy of the fighter in your custom fighters list.
              </p>
            </div>
          }
          onClose={() => setCopyModalData(null)}
          onConfirm={handleCopyModalConfirm}
          confirmText="Copy Custom Asset"
        />
      )}
    </div>
  );
}