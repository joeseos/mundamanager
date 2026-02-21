'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { skillSetRank } from "@/utils/skillSetRank";
import { gangOriginRank } from "@/utils/gangOriginRank";

interface AdminCreateSkillModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminCreateSkillModal({ onClose, onSubmit }: AdminCreateSkillModalProps) {
  const [skillName, setSkillName] = useState('');
  const [skillTypeList, setSkillTypes] = useState<Array<{id: string, skill_type: string}>>([]);
  const [skillType, setSkillType] = useState('');
  const [skillTypeName, setSkillTypeName] = useState('');
  const [gangOriginList, setGangOriginList] = useState<Array<{id: string, origin_name: string, category_name: string}>>([]);
  const [gangOrigin, setGangOrigin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  

  useEffect(() => {
    const fetchSkillTypes = async () => {
      try {
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch Skill Sets');
        const data = await response.json();
        console.log('Fetched Skill Sets:', data);
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching Skill Sets:', error);
        toast.error('Failed to load Skill Sets');
      }
    };

    const fetchGangOrigins = async () => {
      try {
        const response = await fetch('/api/admin/gang-origins');
        if (!response.ok) throw new Error('Failed to fetch Gang Origins');
        const data = await response.json();
        console.log('Fetched Gang Origins:', data);
        setGangOriginList(data);
      } catch (error) {
        console.error('Error fetching Gang Origins:', error);
        toast.error('Failed to load Gang Origins');
      }
    };

    fetchSkillTypes();
    fetchGangOrigins();
  }, [toast]);

  const handleSubmit = async () => {
    if (!skillName || !skillType) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: skillName,
          skill_type_id: skillType,
          gang_origin_id: gangOrigin || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create skill');
      }

      toast.success("Skill created successfully");

      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error creating skill:', error);
      toast.error('Failed to create skill');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitType = async () => {
    if (!skillTypeName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/skill-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: skillTypeName
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create Skill Set');
      }

      toast.success("Skill Set created successfully");

      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error creating Skill Set:', error);
      toast.error('Failed to create Skill Set');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Add Skill</h3>
            <p className="text-sm text-muted-foreground">Fields marked with * are required. However, some fields are mutually exclusive.</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Skill Set *
              </label>
              <select
                value={skillType}
                onChange={(e) => setSkillType(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={skillTypeName !== ""}
              >
                <option value="">Select a skill set</option>

                {Object.entries(
                  skillTypeList
                    .sort((a, b) => {
                      const rankA = skillSetRank[a.skill_type.toLowerCase()] ?? Infinity;
                      const rankB = skillSetRank[b.skill_type.toLowerCase()] ?? Infinity;
                      return rankA - rankB;
                    })
                    .reduce((groups, type) => {
                      const rank = skillSetRank[type.skill_type.toLowerCase()] ?? Infinity;
                      let groupLabel = "Misc."; // Default category for unlisted skill sets

                      if (rank <= 19) groupLabel = "Universal Skills";
                      else if (rank <= 39) groupLabel = "Gang-specific Skills";
                      else if (rank <= 59) groupLabel = "Wyrd Powers";
                      else if (rank <= 69) groupLabel = "Cult Wyrd Powers";
                      else if (rank <= 79) groupLabel = "Psychoteric Whispers";
                      else if (rank <= 89) groupLabel = "Legendary Names";
                      else if (rank <= 99) groupLabel = "Ironhead Squat Mining Clans";

                      if (!groups[groupLabel]) groups[groupLabel] = [];
                      groups[groupLabel].push(type);
                      return groups;
                    }, {} as Record<string, typeof skillTypeList>)
                ).map(([groupLabel, skillList]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {skillList.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.skill_type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {skillTypeName !== '' && (
                <p className="text-xs text-amber-600 mt-1">Clear the Skill Set Name field to select a Skill Set.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Skill Name *
              </label>
              <Input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="E.g. Restrain, Killing Blow"
                className="w-full"
                disabled={skillTypeName !== ''}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Origin (Optional)
              </label>
              <select
                value={gangOrigin}
                onChange={(e) => setGangOrigin(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={skillTypeName !== ''}
              >
                <option value="">No gang origin restriction</option>
                {Object.entries(
                  gangOriginList
                    .sort((a, b) => {
                      const rankA = gangOriginRank[a.origin_name.toLowerCase()] ?? Infinity;
                      const rankB = gangOriginRank[b.origin_name.toLowerCase()] ?? Infinity;
                      return rankA - rankB;
                    })
                    .reduce((groups, origin) => {
                      const rank = gangOriginRank[origin.origin_name.toLowerCase()] ?? Infinity;
                      let groupLabel = "Misc."; // Default category for unlisted origins

                      if (rank <= 19) groupLabel = "Prefecture";
                      else if (rank <= 39) groupLabel = "Ancestry";
                      else if (rank <= 59) groupLabel = "Tribe";

                      if (!groups[groupLabel]) groups[groupLabel] = [];
                      groups[groupLabel].push(origin);
                      return groups;
                    }, {} as Record<string, typeof gangOriginList>)
                ).map(([groupLabel, origins]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {origins.map((origin) => (
                      <option key={origin.id} value={origin.id}>
                        {origin.origin_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {skillTypeName !== '' && (
                <p className="text-xs text-amber-600 mt-1">Clear the Skill Set Name field to select a Gang Origin.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Skill Set Name *
              </label>
              <Input
                type="text"
                value={skillTypeName}
                onChange={(e) => setSkillTypeName(e.target.value)}
                placeholder="E.g. Bravado, Finesse"
                className="w-full"
                disabled={skillType !== ''}
              />
              {skillType !== '' && (
                <p className="text-xs text-amber-600 mt-1">Clear the Skill Set selection to enter a Skill Set Name.</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!skillName || !skillType || skillTypeName !== '' || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create Skill'}
          </Button>
          <Button
            onClick={handleSubmitType}
            disabled={!skillTypeName || skillType !== '' || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create Skill Set'}
          </Button>
        </div>
      </div>
    </div>
  );
}