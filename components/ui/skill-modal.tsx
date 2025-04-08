import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";
import { useSession } from '@/hooks/use-session';

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

interface Skill {
  skill_id: string;
  skill_name: string;
  skill_type_id: string;
  available_acquisition_types: string[];
}

interface SkillResponse {
  skills: Skill[];
}

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
          (skill: Skill) => skill.skill_type_id === selectedCategory
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