import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { useSession } from '@/hooks/use-session';
import { FighterSkills } from '@/types/fighter';
import { createClient } from '@/utils/supabase/client';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { 
  addSkillAdvancement, 
  deleteAdvancement 
} from '@/app/actions/fighter-advancement';

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
  onSkillDeleted?: () => void;
  fighterId: string;
  fighterXp: number;
  onSkillAdded?: () => void;
  free_skill?: boolean;
  userPermissions: UserPermissions;
}

// SkillModal Interfaces
interface SkillModalProps {
  fighterId: string;
  onClose: () => void;
  onSkillAdded: () => void;
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
export function SkillModal({ fighterId, onClose, onSkillAdded, isSubmitting, onSelectSkill }: SkillModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [skillAccess, setSkillAccess] = useState<SkillAccess[]>([]);
  const { toast } = useToast();
  const session = useSession();

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
        console.log('Fetching skill access for fighter:', fighterId);
        try {
          const skillAccessResponse = await fetch(`/api/fighters/skill-access?fighterId=${fighterId}`);
          console.log('Skill access response status:', skillAccessResponse.status);
          if (skillAccessResponse.ok) {
            const skillAccessData = await skillAccessResponse.json();
            console.log('Skill access data:', skillAccessData);
            setSkillAccess(skillAccessData.skill_access || []);
          } else {
            const errorText = await skillAccessResponse.text();
            console.warn('Failed to fetch skill access:', errorText);
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
          throw new Error('Failed to fetch skills');
        }

        const data = await response.json();
        console.log('Raw skills data:', data);
        
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

    try {
      // Check for session
      if (!session) {
        toast({
          description: "Authentication required. Please log in again.",
          variant: "destructive"
        });
        return false;
      }

      console.log("Adding skill with ID:", selectedSkill);
      
      const result = await addSkillAdvancement({
        fighter_id: fighterId,
        skill_id: selectedSkill,
        xp_cost: 0,
        credits_increase: 0,
        is_advance: false
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add skill');
      }

      console.log("Skill added successfully:", result);

      toast({
        description: "Skill successfully added",
        variant: "default"
      });

      onSkillAdded();
      onClose();
      return true;
    } catch (error) {
      console.error('Error adding skill:', error);
      toast({
        description: `Failed to add skill: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      return false;
    }
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

      {selectedCategory && skillsData && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Skill</label>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option key="placeholder-skill" value="">Select a skill</option>
            {skillsData.skills.map((skill) => {
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
  onSkillDeleted,
  fighterId,
  fighterXp,
  onSkillAdded,
  free_skill,
  userPermissions
}: SkillsListProps) {
  const [skillToDelete, setSkillToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleDeleteClick = (skillId: string, skillName: string) => {
    setSkillToDelete({ id: skillId, name: skillName });
  };

  const handleConfirmDelete = async () => {
    if (!skillToDelete) return;

    try {
      const result = await deleteAdvancement({
        fighter_id: fighterId,
        advancement_id: skillToDelete.id,
        advancement_type: 'skill'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete skill');
      }

      // Call the callback to refresh data in parent component
      onSkillDeleted?.();
      
      toast({
        description: `${skillToDelete.name} removed successfully`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error deleting skill:', error);
      toast({
        description: 'Failed to delete skill',
        variant: "destructive"
      });
    } finally {
      setSkillToDelete(null);
    }
  };

  // Transform skills object into array for table display
  const skillsArray = Object.entries(skills).map(([name, data]) => {
    const typedData = data as any;
    return {
      id: typedData.id,
      name: name,
      xp_cost: typedData.xp_cost,
      credits_increase: typedData.credits_increase,
      acquired_at: typedData.acquired_at,
      is_advance: typedData.is_advance ?? false,
      fighter_injury_id: typedData.fighter_injury_id
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
            label: 'Action',
            align: 'right',
            render: (value, item) => {
              if (item.fighter_injury_id) {
                return (
                  <span className="text-gray-500 text-sm italic whitespace-nowrap">
                    (added by injury)
                  </span>
                );
              }
              return null;
            }
          }
        ]}
        actions={[
          {
            label: 'Delete',
            variant: 'destructive' as const,
            onClick: (item: any) => handleDeleteClick(item.id, item.name),
            disabled: (item: any) => !!item.fighter_injury_id || !userPermissions.canEdit
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
              <p>Are you sure you want to delete "{skillToDelete.name}"?</p>
              <br />
              <p>This action cannot be undone.</p>
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
          onSkillAdded={onSkillAdded || (() => {})}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
} 