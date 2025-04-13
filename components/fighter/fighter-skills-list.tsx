import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { useSession } from '@/hooks/use-session';
import { FighterSkills } from '@/types/fighter';

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

// Props for the FighterSkillsTable component
interface FighterSkillsTableProps {
  skills: Skill[];
  onDeleteSkill?: (skillId: string, skillName: string) => void;
}

// Props for the SkillsList component
interface SkillsListProps {
  skills: FighterSkills;
  onDeleteSkill?: (skillId: string) => void;
  fighterId: string;
  fighterXp: number;
  onSkillAdded?: () => void;
  free_skill?: boolean;
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
}

interface SkillResponse {
  skills: SkillData[];
}

// Component for displaying table of skills
export function FighterSkillsTable({ skills, onDeleteSkill }: FighterSkillsTableProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-1 py-1 text-left w-[75%]">Name</th>
              <th className="px-1 py-1 text-right w-[25%]">Action</th>
            </tr>
          </thead>
          <tbody>
            {!skills?.length ? (
              <tr>
                <td colSpan={2} className="text-center py-1 text-gray-500">
                  No skills available
                </td>
              </tr>
            ) : (
              skills.map((skill) => (
                <tr key={skill.id} className="border-b">
                  <td className="px-1 py-1">{skill.name}</td>
                  <td className="px-1 py-1">
                    <div className="flex justify-end">
                      {skill.fighter_injury_id ? (
                        <span className="text-gray-500 text-sm italic">
                          (added by injury)
                        </span>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDeleteSkill?.(skill.id, skill.name)}
                          className="text-xs px-1.5 h-6"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// SkillModal Component
export function SkillModal({ fighterId, onClose, onSkillAdded, isSubmitting, onSelectSkill }: SkillModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const { toast } = useToast();
  const session = useSession();

  // Fetch categories (skill sets)
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/skill_types`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch skill sets');
        }
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
          description: 'Failed to load skill sets',
          variant: "destructive"
        });
      }
    };

    fetchCategories();
  }, [toast]);

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

      const payload = {
        fighter_id: fighterId,
        skill_id: selectedSkill,
        xp_cost: 0,
        credits_increase: 0,
        is_advance: false
      };
      
      console.log("Sending skill payload:", payload);
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/add_fighter_skill`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to add skill: ${response.status} ${errorText}`);
      }

      // Log the response to verify the insertion worked correctly
      const responseData = await response.json();
      console.log("RPC response:", responseData);

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

          {Object.entries(
            categories
              .sort((a, b) => {
                const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
                const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
                return rankA - rankB;
              })
              .reduce((groups, category) => {
                const rank = skillSetRank[category.name.toLowerCase()];
                let groupLabel = "Misc."; // Default category if no clear separator

                if (rank <= 19) groupLabel = "Universal Skills";
                else if (rank <= 39) groupLabel = "Gang-specific Skills";
                else if (rank <= 59) groupLabel = "Wyrd Powers";
                else if (rank <= 69) groupLabel = "Cult Wyrd Powers";
                else if (rank <= 79) groupLabel = "Psychoteric Whispers";
                else if (rank <= 89) groupLabel = "Legendary Names";

                if (!groups[groupLabel]) groups[groupLabel] = [];
                groups[groupLabel].push(category);
                return groups;
              }, {} as Record<string, typeof categories>)
          ).map(([groupLabel, categoryList]) => (
            <optgroup key={groupLabel} label={groupLabel}>
              {categoryList.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          ))}
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
            {skillsData.skills.map((skill) => (
              <option key={skill.skill_id} value={skill.skill_id}>
                {skill.skill_name}
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
      confirmDisabled={!selectedSkill || isSubmitting}
    />
  );
}

// Main SkillsList component that wraps the table with management functionality
export function SkillsList({ 
  skills = {}, 
  onDeleteSkill,
  fighterId,
  fighterXp,
  onSkillAdded,
  free_skill
}: SkillsListProps) {
  const [skillToDelete, setSkillToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDeleteClick = (skillId: string, skillName: string) => {
    setSkillToDelete({ id: skillId, name: skillName });
  };

  const handleConfirmDelete = () => {
    if (skillToDelete && onDeleteSkill) {
      onDeleteSkill(skillToDelete.id);
    }
    setSkillToDelete(null);
  };

  // Transform skills object into array for table display
  const skillsArray = Object.entries(skills).map(([name, data]) => ({
    id: data.id,
    name: name,
    xp_cost: data.xp_cost,
    credits_increase: data.credits_increase,
    acquired_at: data.acquired_at,
    is_advance: data.is_advance ?? false,
    fighter_injury_id: data.fighter_injury_id
  }));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-2xl font-bold mr-4">Skills</h2>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setIsAddSkillModalOpen(true)}
            className="bg-black hover:bg-gray-800 text-white whitespace-nowrap"
          >
            Add
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          {(Object.keys(skills).length > 0) && (
            <thead>
              <tr className="bg-gray-100">
                <th className="px-1 py-1 text-left">Name</th>
                <th className="px-1 py-1 text-right">Action</th>
              </tr>
            </thead>
          )}
          <tbody>
            {free_skill && skillsArray.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center py-1">
                  <div className="flex items-center justify-center gap-2 text-amber-700">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 24 24" 
                      fill="currentColor" 
                      className="w-4 h-4"
                    >
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                    </svg>
                    Starting skill missing.
                  </div>
                </td>
              </tr>
            ) : skillsArray.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-gray-500 italic text-center">
                  No skills yet.
                </td>
              </tr>
            ) : (
              skillsArray.map((skill) => (
                <tr key={skill.id} className="border-b">
                  <td className="px-1 py-1">{skill.name}</td>
                  <td className="px-1 py-1">
                    <div className="flex justify-end">
                      {skill.fighter_injury_id ? (
                        <span className="text-gray-500 text-sm italic whitespace-nowrap">
                          (added by injury)
                        </span>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(skill.id, skill.name)}
                          className="text-xs px-1.5 h-6"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
} 