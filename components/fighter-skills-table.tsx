import React from 'react';
import { Button } from "@/components/ui/button";

interface Skill {
  id: string;
  name: string;
  xp_cost: number;
  credits_increase: number;
  acquired_at: string;
  is_advance: boolean;
  fighter_injury_id: string | null;
}

interface FighterSkillsTableProps {
  skills: Skill[];
  onDeleteSkill?: (skillId: string, skillName: string) => void;
}

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
                <td colSpan={2} className="text-center py-4 text-gray-500">
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