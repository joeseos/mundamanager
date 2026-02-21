'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { skillSetRank } from "@/utils/skillSetRank";
import { gangOriginRank } from "@/utils/gangOriginRank";
import { AdminFighterEffects } from './admin-fighter-effects';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface Skill {
  id: string;
  name: string;
  gang_origin_id: string | null;
  effects?: any[];
}

// Helper function to save skill effects and modifiers
const saveSkillEffects = async (skillId: string, effects: any[], skillNameList: Skill[]) => {
  try {
    // Get existing effects from the original skill data
    const originalSkill = skillNameList.find(s => s.id === skillId);
    const originalEffects = originalSkill?.effects || [];

    // Determine which effects to delete (exist in original but not in current)
    const currentEffectIds = effects.map(e => e.id).filter(id => !id.startsWith('temp-'));
    const effectsToDelete = originalEffects.filter(
      (origEffect: any) => !currentEffectIds.includes(origEffect.id)
    );

    // Delete removed effects
    for (const effect of effectsToDelete) {
      await fetch(`/api/admin/skills?effect=true&id=${effect.id}`, {
        method: 'DELETE'
      });
    }

    // Process each effect
    for (const effect of effects) {
      const isNewEffect = effect.id.startsWith('temp-');

      if (isNewEffect) {
        // Create new effect
        const response = await fetch('/api/admin/skills?effect=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effect_name: effect.effect_name,
            fighter_effect_category_id: effect.fighter_effect_category_id,
            type_specific_data: effect.type_specific_data
          })
        });

        if (!response.ok) throw new Error('Failed to create effect');
        const createdEffect = await response.json();

        // Create modifiers for this effect
        for (const modifier of effect.modifiers || []) {
          await fetch('/api/admin/skills?modifier=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fighter_effect_type_id: createdEffect.id,
              stat_name: modifier.stat_name,
              default_numeric_value: modifier.default_numeric_value,
              operation: modifier.operation
            })
          });
        }
      } else {
        // Update existing effect
        await fetch(`/api/admin/skills?effect=true&id=${effect.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effect_name: effect.effect_name,
            fighter_effect_category_id: effect.fighter_effect_category_id,
            type_specific_data: effect.type_specific_data
          })
        });

        // Get original modifiers
        const originalEffect = originalEffects.find((e: any) => e.id === effect.id);
        const originalModifiers = originalEffect?.modifiers || [];

        // Delete removed modifiers
        const currentModifierIds = effect.modifiers.map((m: any) => m.id).filter((id: string) => !id.startsWith('temp-'));
        const modifiersToDelete = originalModifiers.filter(
          (origMod: any) => !currentModifierIds.includes(origMod.id)
        );

        for (const modifier of modifiersToDelete) {
          await fetch(`/api/admin/skills?modifier=true&id=${modifier.id}`, {
            method: 'DELETE'
          });
        }

        // Create/update modifiers
        for (const modifier of effect.modifiers || []) {
          if (modifier.id.startsWith('temp-')) {
            // Create new modifier
            await fetch('/api/admin/skills?modifier=true', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fighter_effect_type_id: effect.id,
                stat_name: modifier.stat_name,
                default_numeric_value: modifier.default_numeric_value,
                operation: modifier.operation
              })
            });
          } else {
            // Update existing modifier
            await fetch(`/api/admin/skills?modifier=true&id=${modifier.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                stat_name: modifier.stat_name,
                default_numeric_value: modifier.default_numeric_value,
                operation: modifier.operation
              })
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error saving skill effects:', error);
    throw error; // Re-throw to let caller handle it
  }
};

interface AdminEditSkillModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminEditSkillModal({ onClose, onSubmit }: AdminEditSkillModalProps) {
  const [skillName, setSkillName] = useState('');
  const [skillId, setSkillId] = useState('');
  const [skillNameList, setSkillList] = useState<Skill[]>([]);
  const [skillTypeList, setSkillTypes] = useState<Array<{id: string, skill_type: string}>>([]);
  const [skillType, setSkillType] = useState('');
  const [skillTypeName, setSkillTypeName] = useState('');
  const [gangOriginList, setGangOriginList] = useState<Array<{id: string, origin_name: string, category_name: string}>>([]);
  const [gangOrigin, setGangOrigin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [skillEffects, setSkillEffects] = useState<any[]>([]);
  const [skillsCategoryId, setSkillsCategoryId] = useState('');
  const [effectCategories, setEffectCategories] = useState<any[]>([]);

  

  useEffect(() => {
    const fetchSkillTypes = async () => {
      try {
        const response = await fetch('/api/admin/skill-types');
        if (!response.ok) throw new Error('Failed to fetch skill sets');
        const data = await response.json();
        setSkillTypes(data);
      } catch (error) {
        console.error('Error fetching skill sets:', error);
        toast.error('Failed to load skill sets');
      }
    };

    const fetchGangOrigins = async () => {
      try {
        const response = await fetch('/api/admin/gang-origins');
        if (!response.ok) throw new Error('Failed to fetch Gang Origins');
        const data = await response.json();
        setGangOriginList(data);
      } catch (error) {
        console.error('Error fetching Gang Origins:', error);
        toast.error('Failed to load Gang Origins');
      }
    };

    fetchSkillTypes();
    fetchGangOrigins();
  }, [toast]);


  // Set skill effects when skill selected from dropdown
  useEffect(() => {
    if (skillId) {
      const selectedSkill = skillNameList.find(s => s.id === skillId);
      if (selectedSkill?.effects) {
        setSkillEffects(selectedSkill.effects);
      } else {
        setSkillEffects([]);
      }
    }
  }, [skillId, skillNameList]);

  const searchSkillType = async (skillTypeId: string) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/skills?skill_type_id=' + skillTypeId, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data = await response.json();

      // Extract skills and categories from response
      const skills = data.skills || data; // Support both new and old format
      const categories = data.effect_categories || [];

      // Set effect categories
      if (categories.length > 0) {
        setEffectCategories(categories);
        const skillsCat = categories.find((c: any) => c.category_name === 'skills');
        if (skillsCat) setSkillsCategoryId(skillsCat.id);
      }

      // Set skills list
      setSkillList(skills.map((skill: any) => ({
        id: skill.id,
        name: skill.skill_name,
        gang_origin_id: skill.gang_origin_id,
        effects: skill.effects || []
      })));

      // If a skill is currently selected, set its effects immediately (FIX for race condition)
      if (skillId) {
        const selectedSkill = skills.find((s: any) => s.id === skillId);
        if (selectedSkill?.effects) {
          setSkillEffects(selectedSkill.effects);
        }
      }
    } catch (error) {
      console.error('Error fetching skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitType = async (operation: OperationType) => {
   // For POST and UPDATE operations, validate required fields.
  if ((operation === OperationType.POST || operation === OperationType.UPDATE) && (!skillType)) {
    toast.error("Please fill in all required fields");
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

    toast.success(`Skill ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`);

    if (onSubmit) {
      onSubmit();
    }
    onClose();
  } catch (error) {
    console.error(`Error executing ${operation} operation:`, error);
    toast.error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`);
  } finally {
    setIsLoading(false);
  }
};

const handleSubmitSkill = async (operation: OperationType) => {
  // For POST and UPDATE operations, validate required fields.
  if ((operation === OperationType.POST || operation === OperationType.UPDATE) && (!skillName || !skillType)) {
    toast.error("Please fill in all required fields");
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
          gang_origin_id: gangOrigin || null,
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

    // If UPDATE, save all effects and modifiers
    if (operation === OperationType.UPDATE && skillId) {
      await saveSkillEffects(skillId, skillEffects, skillNameList);
    }

    toast.success(`Skill ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`);

    if (onSubmit) {
      onSubmit();
    }
    onClose();
  } catch (error) {
    console.error(`Error executing ${operation} operation:`, error);
    toast.error(`Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} skill`);
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Edit Skill</h3>
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
                      else if (rank <= 99) groupLabel = "Ironhead Squat Mining Clans";

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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Skill Name *
              </label>
              <select
                value={skillName}
                onChange={(e) => {
                  setSkillName(e.target.value);
                  const selectedOption = e.target.options[e.target.selectedIndex];
                  setSkillId(selectedOption.getAttribute("data-skill-id") || "");
                  setGangOrigin(selectedOption.getAttribute("data-gang-origin-id") || "");
                  }
                }

                className="w-full p-2 border rounded-md"
                disabled={skillType == ""}
              >
                <option value="">Select a skill</option>
                  {skillNameList.map((skill) => (
                      <option key={skill.id} value={skill.name} data-skill-id={skill.id} data-gang-origin-id={skill.gang_origin_id || ""}>
                        {skill.name}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Origin (Optional)
              </label>
              <select
                value={gangOrigin}
                onChange={(e) => setGangOrigin(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={skillName == ''}
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
            </div>

            {/* Skill Effects Section */}
            {skillId && skillsCategoryId && (
              <div className="mt-6 border-t pt-4">
                <label className="block text-sm font-medium mb-1">
                  Skill Effects
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  These effects will be automatically applied when a fighter acquires this skill
                </p>
                <AdminFighterEffects
                  equipmentId={skillId}
                  isSkill={true}
                  fighterEffects={skillEffects}
                  fighterEffectCategories={effectCategories.filter(c => c.category_name === 'skills')}
                  onChange={(effects) => {
                    setSkillEffects(effects);
                  }}
                  onUpdate={() => {
                    // Effects are managed in local state, no need to refetch from API
                    // They will be persisted when the skill itself is saved/updated
                  }}
                />
              </div>
            )}

            <div>
              {skillName == ''  && (
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Rename Skill Set
              </label>
              )}
              {skillName !== '' && (
              <label className="block text-sm font-medium text-muted-foreground mb-1">
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
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Loading...' : 'Update Skill'}
          </Button>
          <Button
            onClick={() => handleSubmitSkill(OperationType.DELETE) }
            disabled={!skillName || !skillType || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Loading...' : 'Delete Skill'}
          </Button>
           <Button
            onClick={() => handleSubmitType(OperationType.UPDATE) }
            disabled={ !!skillName || skillTypeName == '' || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Loading...' : 'Rename Skill Set'}
          </Button>
          <Button
            onClick={() => handleSubmitType(OperationType.DELETE) }
            disabled={!!skillName || skillTypeName == '' || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
          >
            {isLoading ? 'Loading...' : 'Delete Skill Set'}
          </Button>
        </div>
      </div>
    </div>
  );
}