import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";

interface SkillModalProps {
  fighterId: string;
  onClose: () => void;
  onSkillAdded: () => void;
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

export function SkillModal({ fighterId, onClose, onSkillAdded }: SkillModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [skillsData, setSkillsData] = useState<SkillResponse | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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

    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_skills`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            fighter_id: fighterId,
            skill_id: selectedSkill,
            xp_cost: 0,
            credits_increase: 0
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add skill');
      }

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
        description: 'Failed to add skill',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
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
          {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
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
      title="Add Skill"
      content={modalContent}
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText="Add Skill"
      confirmDisabled={!selectedSkill || isLoading}
    />
  );
} 