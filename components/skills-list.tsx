import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FighterSkillsTable } from "@/components/fighter-skills-table";
import Modal from "@/components/modal";
import { SkillModal } from "@/components/ui/skill-modal";

interface SkillsListProps {
  skills: Record<string, any>;
  onDeleteSkill?: (skillId: string) => void;
  fighterId: string;
  fighterXp: number;
  onSkillAdded?: () => void;
  free_skill?: boolean;
}

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

  const handleDeleteClick = (skillId: string, skillName: string) => {
    setSkillToDelete({ id: skillId, name: skillName });
  };

  const handleConfirmDelete = () => {
    if (skillToDelete && onDeleteSkill) {
      onDeleteSkill(skillToDelete.id);
    }
    setSkillToDelete(null);
  };

  const handleAdvancementAdded = () => {
    setIsAddSkillModalOpen(false);
    if (onSkillAdded) {
      onSkillAdded();
    }
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
          {(free_skill && skillsArray.length > 0) && (
            <thead>
              <tr className="bg-gray-100">
                <th className="px-1 py-1 text-left w-[75%]">Name</th>
                <th className="px-1 py-1 text-right w-[25%]">Action</th>
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
                    Starting skill missing
                  </div>
                </td>
              </tr>
            ) : skillsArray.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center py-1 text-gray-500">
                  No skills available
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
          title="Confirm Deletion"
          content={`Are you sure you want to delete the skill "${skillToDelete.name}"?`}
          onClose={() => setSkillToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {isAddSkillModalOpen && (
        <SkillModal
          fighterId={fighterId}
          onClose={() => setIsAddSkillModalOpen(false)}
          onSkillAdded={handleAdvancementAdded}
        />
      )}
    </div>
  );
} 