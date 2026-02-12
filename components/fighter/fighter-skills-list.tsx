import React, { useState, useEffect } from 'react';
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { useSession } from '@/hooks/use-session';
import { FighterSkills } from '@/types/fighter';
import { createClient } from '@/utils/supabase/client';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  addSkillAdvancement, 
  deleteAdvancement 
} from '@/app/actions/fighter-advancement';
import { LuTrash2 } from 'react-icons/lu';

// Interface for individual skill when displayed in table
interface Skill {
  id: string;
  name: string;
  xp_cost: number;
  credits_increase: number;
  acquired_at: string;
  is_advance: boolean;
  fighter_injury_id: string | null;
}

// Props for the SkillsList component
interface SkillsListProps {
  skills: FighterSkills;
  fighterId: string;
  fighterXp: number;
  free_skill?: boolean;
  userPermissions: UserPermissions;
  onSkillsUpdate: (updatedSkills: FighterSkills) => void;
}

// SkillModal Interfaces
interface SkillModalProps {
  fighterId: string;
  onClose: () => void;
  onSkillAdded: (skillId: string, skillName: string) => void;
  isSubmitting: boolean;
  onSelectSkill?: (selectedSkill: any) => Promise<void>;
}

interface Category {
  id: string;
  name: string;
}

interface SkillData {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available_acquisition_types: string[];
  available: boolean;
  is_custom: boolean;
}

interface SkillResponse {
  skills: SkillData[];
}

interface SkillAccess {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | null; // default from fighter type
  override_access_level: 'primary' | 'secondary' | 'allowed' | null; // override from archetype
  skill_type_name: string;
}

// SkillModal Component
export function SkillModal({ fighterId, onClose, onSkillAdded, isSubmitting, onSelectSkill }: SkillModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [isCustomSkillSelected, setIsCustomSkillSelected] = useState(false);
  const [skillAccess, setSkillAccess] = useState<SkillAccess[]>([]);
  const { toast } = useToast();
  const session = useSession();
  const queryClient = useQueryClient();

  // TanStack Query mutation for adding skills
  const addSkillMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; skill_id?: string; custom_skill_id?: string; xp_cost: number; credits_increase: number; is_advance: boolean }) => {
      const result = await addSkillAdvancement(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add skill');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Get the selected skill details for optimistic update
      let skillName = 'Unknown Skill';
      const selectedSkillData = skillsData?.skills.find(
        (s) => s.skill_id === (variables.skill_id || variables.custom_skill_id)
      );
      skillName = selectedSkillData?.skill_name || skillName;

      // Optimistically add to parent's local state
      onSkillAdded(variables.skill_id || variables.custom_skill_id || '', skillName);

      return { skillName };
    },
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.skillName} added successfully`,
        variant: "default"
      });
    },
    onError: (error, variables, context) => {
      toast({
        description: error instanceof Error ? error.message : 'Failed to add skill',
        variant: "destructive"
      });
    }
  });

  // Fetch categories (skill sets) and skill access
  useEffect(() => {
    const fetchCategoriesAndAccess = async () => {
      try {
        // Get the session from the hook
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        // Fetch skill types
        const skillTypesResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/skill_types`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session?.access_token || ''}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!skillTypesResponse.ok) {
          throw new Error('Failed to fetch skill sets');
        }
        const skillTypesData = await skillTypesResponse.json();
        setCategories(skillTypesData);

        // Fetch skill access for this fighter
        try {
          const skillAccessResponse = await fetch(`/api/fighters/skill-access?fighterId=${fighterId}`);
          if (skillAccessResponse.ok) {
            const skillAccessData = await skillAccessResponse.json();
            setSkillAccess(skillAccessData.skill_access || []);
          } else {
            setSkillAccess([]);
          }
        } catch (error) {
          console.error('Error fetching skill access:', error);
          setSkillAccess([]);
        }

      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
          description: 'Failed to load skill sets',
          variant: "destructive"
        });
      }
    };

    fetchCategoriesAndAccess();
  }, [fighterId, toast]);

  // Fetch skills when category is selected
  useEffect(() => {
    if (!selectedCategory) return;

    const fetchSkills = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('get_available_skills', {
          fighter_id: fighterId
        });

        if (error) {
          throw new Error('Failed to fetch skills');
        }

        // Filter skills by the selected type
        const skillsForType = data.skills.filter(
          (skill: SkillData) => skill.skill_type_id === selectedCategory
        );

        setSkillsData({ skills: skillsForType });
      } catch (error) {
        console.error('Error fetching skills:', error);
        toast({
          description: 'Failed to load skills',
          variant: "destructive"
        });
      }
    };

    fetchSkills();
  }, [selectedCategory, fighterId, toast]);

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

    // Close modal immediately for instant UX
    onClose();

    // Fire mutation with either skill_id or custom_skill_id
    const mutationData = {
      fighter_id: fighterId,
      xp_cost: 0,
      credits_increase: 0,
      is_advance: false,
      ...(isCustomSkillSelected ? { custom_skill_id: selectedSkill } : { skill_id: selectedSkill }),
    };
    addSkillMutation.mutate(mutationData);

    return true;
  };

  const modalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Skill Set</label>
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSkill(''); setIsCustomSkillSelected(false); }}
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
              if (rank <= 19) groupLabel = 'Universal Skill Sets';
              else if (rank <= 39) groupLabel = 'Gang-specific Skill Sets';
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
                    // Compute effective level: override takes priority over default
                    const effectiveLevel = access?.override_access_level ?? access?.access_level;
                    let accessLabel = '';
                    let style: React.CSSProperties = { color: '#999999', fontStyle: 'italic' };
                    if (effectiveLevel) {
                      if (effectiveLevel === 'primary') {
                        accessLabel = '(Primary)';
                        style = {};
                      } else if (effectiveLevel === 'secondary') {
                        accessLabel = '(Secondary)';
                        style = {};
                      } else if (effectiveLevel === 'allowed') {
                        accessLabel = '(Allowed)';
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

      {selectedCategory && skillsData && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Skill</label>
          <select
            value={selectedSkill}
            onChange={(e) => {
              const value = e.target.value;
              const skill = skillsData?.skills.find(s => s.skill_id === value);
              setSelectedSkill(value);
              setIsCustomSkillSelected(skill?.is_custom ?? false);
            }}
            className="w-full p-2 border rounded"
          >
            <option key="placeholder-skill" value="">Select a skill</option>
            {skillsData.skills.map((skill) => (
              <option
                key={skill.skill_id}
                value={skill.skill_id}
                disabled={!skill.available}
                style={{
                  color: !skill.available ? '#9CA3AF' : 'inherit',
                  fontStyle: !skill.available ? 'italic' : 'normal'
                }}
              >
                {skill.skill_name}{skill.is_custom ? ' (Custom)' : ''}{!skill.available ? ' (already owned)' : ''}
              </option>
            ))}
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
      confirmDisabled={!selectedSkill || addSkillMutation.isPending}
    />
  );
}

// Main SkillsList component that wraps the table with management functionality
export function SkillsList({ 
  skills = {}, 
  fighterId,
  fighterXp,
  free_skill,
  userPermissions,
  onSkillsUpdate
}: SkillsListProps) {
  const [skillToDelete, setSkillToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Internal state for optimistic updates
  const [localSkills, setLocalSkills] = useState<FighterSkills>(skills);

  // Sync with props when they change (from server refresh)
  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

  // TanStack Query delete mutation
  const deleteSkillMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; advancement_id: string; advancement_type: 'skill' }) => {
      const result = await deleteAdvancement(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete skill');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the skill being deleted
      const skillToDelete = Object.entries(localSkills).find(([name, skill]) => (skill as any).id === variables.advancement_id);
      if (!skillToDelete) return {};

      // Store previous state for rollback
      const previousSkills = { ...localSkills };

      // Optimistically remove the skill
      const updatedSkills = { ...localSkills };
      delete updatedSkills[skillToDelete[0]];
      setLocalSkills(updatedSkills);
      onSkillsUpdate(updatedSkills);

      return { skillName: skillToDelete[0], previousSkills };
    },
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.skillName} removed successfully`,
        variant: "default"
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousSkills) {
        setLocalSkills(context.previousSkills);
        onSkillsUpdate(context.previousSkills);
      }

      toast({
        description: 'Failed to delete skill',
        variant: "destructive"
      });
    }
  });

  const handleDeleteClick = (skillId: string, skillName: string) => {
    setSkillToDelete({ id: skillId, name: skillName });
  };

  const handleConfirmDelete = async () => {
    if (!skillToDelete) return;

    // Close modal immediately for instant UX
    setSkillToDelete(null);

    // Fire mutation
    deleteSkillMutation.mutate({
      fighter_id: fighterId,
      advancement_id: skillToDelete.id,
      advancement_type: 'skill'
    });
  };

  const handleSkillAdded = (skillId: string, skillName: string) => {
    // Add to local state optimistically
    const updatedSkills = {
      ...localSkills,
      [skillName]: {
        id: skillId,
        credits_increase: 0,
        xp_cost: 0,
        is_advance: false,
        acquired_at: new Date().toISOString(),
        fighter_injury_id: null,
        injury_name: undefined
      }
    };
    setLocalSkills(updatedSkills);
    onSkillsUpdate(updatedSkills);
  };

  // Transform skills object into array for table display
  const skillsArray = Object.entries(localSkills).map(([name, data]) => {
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
            render: (value, item) => {
              if (item.fighter_injury_id) {
                return (
                  <span className="text-muted-foreground text-sm italic whitespace-nowrap">
                    ({item.injury_name || 'Lasting Injury'})
                  </span>
                );
              }
              if (item.is_advance) {
                return (
                  <span className="text-muted-foreground text-sm italic whitespace-nowrap">
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
            variant: 'outline_remove' as const,
            onClick: (item: any) => handleDeleteClick(item.id, item.name),
            disabled: (item: any) => !!item.fighter_injury_id || !!item.is_advance || !userPermissions.canEdit || deleteSkillMutation.isPending
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
          onSkillAdded={handleSkillAdded}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
} 