'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { skillSetRank } from "@/utils/skillSetRank";

interface AdminEditSkillModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminEditSkillModal({ onClose, onSubmit }: AdminEditSkillModalProps) {
  const [skillName, setSkillName] = useState('');
  const [skillId, setSkillId] = useState('');
  const [skillNameList, setSkillList] = useState<Array<{id: string, name: string}>>([]);
  const [skillTypeList, setSkillTypes] = useState<Array<{id: string, skill_type: string}>>([]);
  const [skillType, setSkillType] = useState('');
  const [skillTypeName, setSkillTypeName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const fetchSkillTypes = async () => {
      try {
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch skill sets');
        const data = await response.json();
        console.log('Fetched skill sets:', data);
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast({
          description: 'Failed to load skill sets',
          variant: "destructive"
        });
      }
    };

    fetchSkillTypes();
  }, [toast]);

  const searchSkillType = async (skillTypeId: string) => {
    setIsLoading(true);

    try {
      const response = await fetch('api/skills?type=' + skillTypeId, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data = await response.json();
      console.log('Fetched skills list:', data);
      setSkillList(data.skills);
    } catch (error) {
      console.error('Error fetching skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitType = async (operation: OperationType) => {
   // For POST and UPDATE operations, validate required fields.
  if ((operation === OperationType.POST || operation === OperationType.UPDATE) && (!skillType)) {
    toast({
      description: "Please fill in all required fields",
      variant: "destructive"
    });
    return;
  }

  setIsLoading(true);
  try {
    let url = '/api/admin/skill-types';
    let method: string;
    let body: string | undefined;

    switch (operation) {
      case OperationType.POST:
        method = 'POST';
        body = JSON.stringify({
          skill_type_name: skillTypeName,
        });
        break;
      case OperationType.UPDATE:
        method = 'PATCH';
        body = JSON.stringify({
          name: skillTypeName,
          id: skillType,
        });
        break;
      case OperationType.DELETE:
        method = 'DELETE';
        body = JSON.stringify({
          id: skillType,
        });
        break;
      default:
        throw new Error('Invalid operation');
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`);
    }

    toast({
      description: `Skill ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`,
      variant: "default"
    });

    if (onSubmit) {
      onSubmit();
    }
    onClose();
  } catch (error) {
    console.error(`Error executing ${operation} operation:`, error);
    toast({
      description: `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`,
      variant: "destructive"
    });
  } finally {
    setIsLoading(false);
  }
};

  enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

const handleSubmitSkill = async (operation: OperationType) => {
  // For POST and UPDATE operations, validate required fields.
  if ((operation === OperationType.POST || operation === OperationType.UPDATE) && (!skillName || !skillType)) {
    toast({
      description: "Please fill in all required fields",
      variant: "destructive"
    });
    return;
  }

  setIsLoading(true);
  try {
    let url = '/api/admin/skills';
    let method: string;
    let body: string | undefined;

    switch (operation) {
      case OperationType.POST:
        method = 'POST';
        body = JSON.stringify({
          name: skillName,
          skill_type_id: skillType,
        });
        break;
      case OperationType.UPDATE:
        method = 'PATCH';
        body = JSON.stringify({
          name: skillName,
          id: skillId,
        });
        break;
      case OperationType.DELETE:
        method = 'DELETE';
        body = JSON.stringify({
          id: skillId,
        });
        break;
      default:
        throw new Error('Invalid operation');
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`);
    }

    toast({
      description: `Skill ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`,
      variant: "default"
    });

    if (onSubmit) {
      onSubmit();
    }
    onClose();
  } catch (error) {
    console.error(`Error executing ${operation} operation:`, error);
    toast({
      description: `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`,
      variant: "destructive"
    });
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">Edit Skill</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required. However, some fields are mutually exclusive.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Set *
              </label>
              <select
                value={skillType}
                onChange={
                  (e) => {
                    const selectedIndex = e.target.selectedIndex;
                    const selectedOption = e.target.options[selectedIndex];
                    const selectedSkillType = selectedOption.getAttribute("data-skill-type") || "";
                    setSkillType(e.target.value);
                    setSkillName("");
                    if (e.target.value !== "") {
                      searchSkillType(e.target.value);
                    }
                    setSkillTypeName(selectedSkillType);
                  }
                }
                className="w-full p-2 border rounded-md"
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

                      if (!groups[groupLabel]) groups[groupLabel] = [];
                      groups[groupLabel].push(type);
                      return groups;
                    }, {} as Record<string, typeof skillTypeList>)
                ).map(([groupLabel, skillList]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {skillList.map((type) => (
                      <option key={type.id} value={type.id} data-skill-type={type.skill_type}>
                        {type.skill_type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Name *
              </label>
              <select
                value={skillName}
                onChange={(e) => {
                  setSkillName(e.target.value);
                  setSkillId(e.target.options[e.target.selectedIndex].getAttribute("data-skill-id") || "");
                  }
                }

                className="w-full p-2 border rounded-md"
                disabled={skillType == ""}
              >
                <option value="">Select a skill</option>
                  {skillNameList.map((type) => (
                      <option key={type.id} value={type.name} data-skill-id={type.id}>
                        {type.name}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              {skillName == ''  && (
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rename Skill Set
              </label>
              )}
              {skillName !== '' && (
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rename Skill
              </label>
              )}
              <Input
                type="text"
                value={skillName == '' ? skillTypeName : skillName}
                onChange={(e) => {
                  if (skillName == '') {
                    setSkillTypeName(e.target.value);
                  } else {
                    setSkillName(e.target.value);
                  }
                }}
                placeholder=""
                className="w-full"
                disabled={skillName == '' && skillType == ''}
              />
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
            onClick={ () => handleSubmitSkill(OperationType.UPDATE) }
            disabled={!skillName || !skillType || isLoading}
            className="flex-1 bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Loading...' : 'Rename Skill'}
          </Button>
          <Button
            onClick={() => handleSubmitSkill(OperationType.DELETE) }
            disabled={!skillName || !skillType || isLoading}
            className="flex-1 bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Loading...' : 'Delete Skill'}
          </Button>
           <Button
            onClick={() => handleSubmitType(OperationType.UPDATE) }
            disabled={ !!skillName || skillTypeName == '' || isLoading}
            className="flex-1 bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Loading...' : 'Rename Skill Set'}
          </Button>
          <Button
            onClick={() => handleSubmitType(OperationType.DELETE) }
            disabled={!!skillName || skillTypeName == '' || isLoading}
            className="flex-1 bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Loading...' : 'Delete Skill Set'}
          </Button>
        </div>
      </div>
    </div>
  );
}