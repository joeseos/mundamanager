import React, { useState, useEffect } from 'react';
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { useSession } from '@/hooks/use-session';
import { FighterSkills } from '@/types/fighter';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { 
  addSkillAdvancement, 
  deleteAdvancement 
} from '@/app/actions/fighter-advancement';
import { LuTrash2 } from 'react-icons/lu';
import { useMutation, useQueryClient } from '@tanstack/react-query';


// Props for the SkillsList component
interface SkillsListProps {
  skills: FighterSkills;
  fighterId: string;
  free_skill?: boolean;
  userPermissions: UserPermissions;
}

// SkillModal Interfaces
interface SkillModalProps {
  fighterId: string;
  onClose: () => void;
  isSubmitting: boolean;
  onAddSkill: (skillData: { 
    fighter_id: string; 
    skill_id: string; 
    xp_cost: number; 
    credits_increase: number; 
    is_advance: boolean;
    skillName: string;
  }) => void;
}

interface Category {
  id: string;
  name: string;
}

interface SkillData {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  skill_type_name: string;
  available_acquisition_types: string[];
  available: boolean;
}

interface SkillResponse {
  skills: SkillData[];
}

interface SkillAccess {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed';
  skill_type_name: string;
}

// SkillModal Component
export function SkillModal({ fighterId, onClose, isSubmitting, onAddSkill }: SkillModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [skillAccess, setSkillAccess] = useState<SkillAccess[]>([]);
  const { toast } = useToast();
  const session = useSession();

  // Fetch all data from get_available_skills function
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_available_skills`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              fighter_id: fighterId
            })
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch fighter skills data');
        }

        const data = await response.json();
        console.log('Skills data from get_available_skills:', data);
        
        // Set all skills data
        setSkillsData(data);
        
        // Extract skill access from the response
        setSkillAccess(data.skill_access || []);
        
        // Extract unique skill types from skills to create categories
        const skillTypesMap = new Map();
        data.skills.forEach((skill: SkillData & { skill_type_name: string }) => {
          if (!skillTypesMap.has(skill.skill_type_id)) {
            skillTypesMap.set(skill.skill_type_id, {
              id: skill.skill_type_id,
              name: skill.skill_type_name
            });
          }
        });
        setCategories(Array.from(skillTypesMap.values()));
      } catch (error) {
        console.error('Error fetching skills data:', error);
        toast({
          description: 'Failed to load skills data',
          variant: "destructive"
        });
      }
    };

    fetchAllData();
  }, [fighterId, toast]);

  // Filter skills when category is selected
  const filteredSkills = selectedCategory && skillsData 
    ? skillsData.skills.filter((skill: SkillData) => skill.skill_type_id === selectedCategory)
    : [];

  const handleSubmit = async () => {
    if (!selectedSkill) return false;

    // Check for session
    if (!session) {
      toast({
        description: "Authentication required. Please log in again.",
        variant: "destructive"
      });
      return false;
    }

    console.log("Adding skill with ID:", selectedSkill);
    
    // Get the selected skill data for optimistic update
    const selectedSkillData = filteredSkills.find(skill => skill.skill_id === selectedSkill);
    if (!selectedSkillData) {
      toast({
        description: "Selected skill not found",
        variant: "destructive"
      });
      return false;
    }
    
    // Close modal immediately for better UX
    onClose();
    
    // Trigger the mutation with optimistic updates
    onAddSkill({
      fighter_id: fighterId,
      skill_id: selectedSkill,
      xp_cost: 0,
      credits_increase: 0,
      is_advance: false,
      skillName: selectedSkillData.skill_name
    });

    return true;
  };

  const modalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Skill Set</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option key="placeholder-type" value="">Select a skill set</option>

          {(() => {
            // Map skill access by skill type ID
            const skillAccessMap = new Map<string, SkillAccess>();
            skillAccess.forEach(access => {
              skillAccessMap.set(access.skill_type_id, access);
            });

            // Group categories by rank label
            const groupByLabel: Record<string, typeof categories> = {};
            categories.forEach(category => {
              const rank = skillSetRank[category.name.toLowerCase()] ?? Infinity;
              let groupLabel = 'Misc.';
              if (rank <= 19) groupLabel = 'Universal Skills';
              else if (rank <= 39) groupLabel = 'Gang-specific Skills';
              else if (rank <= 59) groupLabel = 'Wyrd Powers';
              else if (rank <= 69) groupLabel = 'Cult Wyrd Powers';
              else if (rank <= 79) groupLabel = 'Psychoteric Whispers';
              else if (rank <= 89) groupLabel = 'Legendary Names';
              else if (rank <= 99) groupLabel = 'Ironhead Squat Mining Clans';
              if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
              groupByLabel[groupLabel].push(category);
            });

            // Sort group labels by their first rank
            const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
              const aRank = Math.min(...groupByLabel[a].map(cat => skillSetRank[cat.name.toLowerCase()] ?? Infinity));
              const bRank = Math.min(...groupByLabel[b].map(cat => skillSetRank[cat.name.toLowerCase()] ?? Infinity));
              return aRank - bRank;
            });

            // Render optgroups
            return sortedGroupLabels.map(groupLabel => {
              const groupCategories = groupByLabel[groupLabel].sort((a, b) => {
                const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
                const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
                return rankA - rankB;
              });
              return (
                <optgroup key={groupLabel} label={groupLabel}>
                  {groupCategories.map(category => {
                    const access = skillAccessMap.get(category.id);
                    let accessLabel = '';
                    let style: React.CSSProperties = { color: '#999999', fontStyle: 'italic' };
                    if (access) {
                      if (access.access_level === 'primary') {
                        accessLabel = '(Primary)';
                        style = {};
                      } else if (access.access_level === 'secondary') {
                        accessLabel = '(Secondary)';
                        style = {};
                      } else if (access.access_level === 'allowed') {
                        accessLabel = '(-)';
                        style = {};
                      }
                    }
                    return (
                      <option
                        key={category.id}
                        value={category.id}
                        style={style}
                      >
                        {category.name} {accessLabel}
                      </option>
                    );
                  })}
                </optgroup>
              );
            });
          })()}
        </select>
      </div>

      {selectedCategory && filteredSkills.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Skill</label>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option key="placeholder-skill" value="">Select a skill</option>
            {filteredSkills.map((skill) => {
              const isAvailable = skill.available;
              return (
                <option 
                  key={skill.skill_id} 
                  value={skill.skill_id}
                  disabled={!isAvailable}
                  style={{ 
                    color: !isAvailable ? '#9CA3AF' : 'inherit',
                    fontStyle: !isAvailable ? 'italic' : 'normal'
                  }}
                >
                  {skill.skill_name}{!isAvailable ? ' (already owned)' : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      title="Skills"
      content={modalContent}
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText="Add Skill"
      confirmDisabled={!selectedSkill || isSubmitting}
    />
  );
}

// Main SkillsList component that wraps the table with management functionality
export function SkillsList({ 
  skills = {}, 
  fighterId,
  free_skill,
  userPermissions
}: SkillsListProps) {
  const [skillToDelete, setSkillToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false);
  const [pendingSkills, setPendingSkills] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use TanStack Query cache for optimistic updates, initializing with props
  React.useEffect(() => {
    queryClient.setQueryData(['fighter-skills', fighterId], { skills });
  }, [queryClient, fighterId, skills]);

  // Get skills from cache, fallback to props
  const cachedData = queryClient.getQueryData(['fighter-skills', fighterId]) as { skills: any } | undefined;
  const currentSkills = cachedData?.skills || skills;

  // Add skill mutation with optimistic updates
  const addSkillMutation = useMutation({
    mutationFn: async (skillData: { 
      fighter_id: string; 
      skill_id: string; 
      xp_cost: number; 
      credits_increase: number; 
      is_advance: boolean;
      skillName: string;
    }) => {
      const result = await addSkillAdvancement({
        fighter_id: skillData.fighter_id,
        skill_id: skillData.skill_id,
        xp_cost: skillData.xp_cost,
        credits_increase: skillData.credits_increase,
        is_advance: skillData.is_advance
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to add skill');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fighter-skills', fighterId] });
      
      // Add skill to pending set
      setPendingSkills(prev => new Set(prev).add(variables.skillName));
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['fighter-skills', fighterId]);
      
      // Optimistically add skill to cache
      queryClient.setQueryData(['fighter-skills', fighterId], (old: any) => {
        if (!old) return { skills: {} };
        
        // Add the new skill to the skills object
        const newSkill = {
          id: `temp-${Date.now()}`, // Temporary ID
          xp_cost: variables.xp_cost,
          credits_increase: variables.credits_increase,
          acquired_at: new Date().toISOString(),
          is_advance: variables.is_advance,
          fighter_injury_id: null,
          isPending: true // Mark as pending
        };
        
        return {
          ...old,
          skills: {
            ...old.skills,
            [variables.skillName]: newSkill
          }
        };
      });
      
      // Return context object with the snapshot
      return { previousData };
    },
    onSuccess: (_, variables) => {
      // Remove skill from pending set
      setPendingSkills(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.skillName);
        return newSet;
      });
      
      toast({
        description: "Skill successfully added",
        variant: "default"
      });
      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['fighter-skills'] });
    },
    onError: (error: Error, variables, context) => {
      // Remove skill from pending set
      setPendingSkills(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.skillName);
        return newSet;
      });
      
      console.error('Error adding skill:', error);
      toast({
        description: `Failed to add skill: ${error.message}`,
        variant: "destructive"
      });
      // Rollback optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(['fighter-skills', fighterId], context.previousData);
      }
    }
  });

  // Delete skill mutation with optimistic updates
  const deleteSkillMutation = useMutation({
    mutationFn: async (skillData: { 
      fighter_id: string; 
      advancement_id: string; 
      advancement_type: 'skill' | 'characteristic'; 
      skillName: string;
    }) => {
      const result = await deleteAdvancement({
        fighter_id: skillData.fighter_id,
        advancement_id: skillData.advancement_id,
        advancement_type: skillData.advancement_type
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete skill');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fighter-skills', fighterId] });
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['fighter-skills', fighterId]);
      
      // Optimistically remove skill from cache
      queryClient.setQueryData(['fighter-skills', fighterId], (old: any) => {
        if (!old) return { skills: {} };
        
        // Remove the skill from the skills object
        const updatedSkills = { ...old.skills };
        delete updatedSkills[variables.skillName];
        
        return {
          ...old,
          skills: updatedSkills
        };
      });
      
      // Return context object with the snapshot
      return { previousData };
    },
    onSuccess: (_, variables) => {
      toast({
        description: `${variables.skillName} removed successfully`,
        variant: "default"
      });
      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['fighter-skills'] });
    },
    onError: (error: Error, variables, context) => {
      console.error('Error deleting skill:', error);
      toast({
        description: `Failed to delete ${variables.skillName}`,
        variant: "destructive"
      });
      // Rollback optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(['fighter-skills', fighterId], context.previousData);
      }
    }
  });

  const handleDeleteClick = (skillId: string, skillName: string) => {
    setSkillToDelete({ id: skillId, name: skillName });
  };

  const handleConfirmDelete = async () => {
    if (!skillToDelete) return;

    // Close modal immediately for better UX
    const skillToDeleteCopy = skillToDelete;
    setSkillToDelete(null);
    
    // Trigger the mutation with optimistic updates
    deleteSkillMutation.mutate({
      fighter_id: fighterId,
      advancement_id: skillToDeleteCopy.id,
      advancement_type: 'skill' as const,
      skillName: skillToDeleteCopy.name
    });
  };

  // Transform skills object into array for table display
  const skillsArray = Object.entries(currentSkills).map(([name, data]) => {
    const typedData = data as any;
    return {
      id: typedData.id,
      name: name,
      xp_cost: typedData.xp_cost,
      credits_increase: typedData.credits_increase,
      acquired_at: typedData.acquired_at,
      is_advance: typedData.is_advance ?? false,
      fighter_injury_id: typedData.fighter_injury_id,
      injury_name: typedData.injury_name
    };
  });

  // Custom empty message based on free_skill status
  const getEmptyMessage = () => {
    if (free_skill) {
      return "Starting skill missing.";
    }
    return "No skills yet.";
  };

  return (
    <>
      <List
        title="Skills"
        items={skillsArray}
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '75%'
          },
          {
            key: 'action_info',
            label: 'Source',
            align: 'right',
            render: (_, item) => {
              if (item.fighter_injury_id) {
                return (
                  <span className="text-gray-500 text-sm italic whitespace-nowrap">
                    ({item.injury_name || 'Lasting Injury'})
                  </span>
                );
              }
              if (item.is_advance) {
                return (
                  <span className="text-gray-500 text-sm italic whitespace-nowrap">
                    (Advancement)
                  </span>
                );
              }
              return null;
            }
          }
        ]}
        actions={[
          {
            icon: <LuTrash2 className="h-4 w-4" />,
            title: "Delete",
            variant: 'destructive' as const,
            onClick: (item: any) => handleDeleteClick(item.id, item.name),
            disabled: (item: any) => 
              !!item.fighter_injury_id || 
              !!item.is_advance || 
              !userPermissions.canEdit ||
              pendingSkills.has(item.name) // Disable if skill is pending
          }
        ]}
        onAdd={() => setIsAddSkillModalOpen(true)}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage={getEmptyMessage()}
      />

      {skillToDelete && (
        <Modal
          title="Delete Skill"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{skillToDelete.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setSkillToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {isAddSkillModalOpen && (
        <SkillModal
          fighterId={fighterId}
          onClose={() => setIsAddSkillModalOpen(false)}
          isSubmitting={addSkillMutation.isPending}
          onAddSkill={(skillData) => addSkillMutation.mutate(skillData)}
        />
      )}
    </>
  );
} 