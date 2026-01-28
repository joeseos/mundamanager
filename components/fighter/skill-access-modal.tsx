'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  saveFighterSkillAccessOverrides,
  type SkillAccessOverride
} from '@/app/actions/fighter-skill-access';

// Gang type UUID for Underhive Outcasts
const UNDERHIVE_OUTCASTS_GANG_TYPE_ID = '77fc520f-b453-46ef-9ef0-6a12872934f8';

// Fighter classes that can use archetypes (when in an Outcasts gang)
const ARCHETYPE_ELIGIBLE_FIGHTER_CLASSES = ['Leader', 'Champion'];

interface Archetype {
  id: string;
  name: string;
  description: string | null;
  skill_access: Array<{
    skill_type_id: string;
    access_level: 'primary' | 'secondary';
  }>;
}

interface SkillAccessModalProps {
  fighterId: string;
  gangTypeId: string | null;
  fighterClass: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

type AccessLevel = 'default' | 'primary' | 'secondary' | 'denied';

interface LocalSkillAccess {
  skill_type_id: string;
  skill_type_name: string;
  default_access_level: string | null;
  selected_access_level: AccessLevel;
}

export function SkillAccessModal({
  fighterId,
  gangTypeId,
  fighterClass,
  isOpen,
  onClose,
  onSave
}: SkillAccessModalProps) {
  const { toast } = useToast();
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('');
  const [skillAccess, setSkillAccess] = useState<LocalSkillAccess[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Determine if this fighter can use archetypes (Outcasts gang + Leader/Champion class)
  const canUseArchetypes = gangTypeId === UNDERHIVE_OUTCASTS_GANG_TYPE_ID && 
    ARCHETYPE_ELIGIBLE_FIGHTER_CLASSES.includes(fighterClass || '');

  // Fetch all skill types using TanStack Query
  const { data: allSkillTypes, isLoading: isLoadingSkillTypes, error: skillTypesError } = useQuery({
    queryKey: ['skill-types'],
    queryFn: async () => {
      const response = await fetch('/api/skill-types');
      if (!response.ok) {
        throw new Error('Failed to fetch skill types');
      }
      return response.json();
    },
    enabled: isOpen,
    staleTime: 10 * 60 * 1000, // 10 minutes - skill types rarely change
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });

  // Fetch fighter's current skill access (defaults + overrides)
  const { data: skillAccessData, isLoading: isLoadingSkillAccess, error: skillAccessError } = useQuery({
    queryKey: ['fighter-skill-access', fighterId],
    queryFn: async () => {
      const response = await fetch(`/api/fighters/skill-access?fighterId=${fighterId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch skill access');
      }
      return response.json();
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
  });

  // Fetch archetypes using TanStack Query (only if eligible)
  const { data: archetypesData, isLoading: isLoadingArchetypes, error: archetypesError } = useQuery({
    queryKey: ['skill-archetypes'],
    queryFn: async () => {
      const response = await fetch('/api/fighters/skill-archetypes');
      if (!response.ok) {
        throw new Error('Failed to fetch archetypes');
      }
      return response.json();
    },
    enabled: isOpen && canUseArchetypes,
    staleTime: 10 * 60 * 1000, // 10 minutes - archetypes rarely change
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });

  // Show error toast if data failed to load
  useEffect(() => {
    if (skillTypesError) {
      toast({
        description: 'Failed to load skill types',
        variant: 'destructive'
      });
    }
    if (skillAccessError) {
      toast({
        description: skillAccessError instanceof Error ? skillAccessError.message : 'Failed to load skill access',
        variant: 'destructive'
      });
    }
    if (archetypesError) {
      toast({
        description: 'Failed to load archetypes',
        variant: 'destructive'
      });
    }
  }, [skillTypesError, skillAccessError, archetypesError, toast]);

  // Initialize local state from fetched data - merge all skill types with current access
  useEffect(() => {
    if (allSkillTypes && skillAccessData && !hasInitialized) {
      // Create a map of current access levels (defaults + overrides)
      const accessMap = new Map(
        (skillAccessData.skill_access || []).map((sa: any) => [
          sa.skill_type_id,
          { default: sa.default_access_level, override: sa.override_access_level }
        ])
      );

      // Build skill access from ALL skill types
      const allSkillTypesWithAccess: LocalSkillAccess[] = (allSkillTypes as any[])
        .map((st: any) => {
          const access = accessMap.get(st.id) as { default: string | null, override: string | null } | undefined;
          return {
            skill_type_id: st.id,
            skill_type_name: st.name,
            default_access_level: access?.default || null,
            selected_access_level: access?.override
              ? (access.override as AccessLevel)
              : 'default'
          };
        });

      // Sort alphabetically by name
      allSkillTypesWithAccess.sort((a: LocalSkillAccess, b: LocalSkillAccess) => 
        a.skill_type_name.localeCompare(b.skill_type_name)
      );

      setSkillAccess(allSkillTypesWithAccess);
      setHasInitialized(true);
    }
  }, [allSkillTypes, skillAccessData, hasInitialized]);

  // Reset initialization state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasInitialized(false);
      setSelectedArchetypeId('');
    }
  }, [isOpen]);

  const archetypes: Archetype[] = archetypesData?.archetypes || [];
  const isLoading = isLoadingSkillTypes || isLoadingSkillAccess || (canUseArchetypes && isLoadingArchetypes);
  const error = skillTypesError || skillAccessError || archetypesError;

  // Handle archetype selection
  const handleArchetypeChange = (archetypeId: string) => {
    setSelectedArchetypeId(archetypeId);

    if (!archetypeId) {
      // "None" selected - reset all to default
      setSkillAccess(prev => prev.map(sa => ({
        ...sa,
        selected_access_level: 'default'
      })));
      return;
    }

    // Find the selected archetype
    const archetype = archetypes.find(a => a.id === archetypeId);
    if (!archetype) return;

    // Create a map of skill access from the archetype
    const archetypeAccessMap = new Map(
      archetype.skill_access.map(sa => [sa.skill_type_id, sa.access_level])
    );

    // Update skill access based on archetype
    setSkillAccess(prev => prev.map(sa => {
      const archetypeLevel = archetypeAccessMap.get(sa.skill_type_id);
      return {
        ...sa,
        // If archetype defines this skill, use its level; otherwise 'denied'
        // (Skills not in the archetype are not accessible)
        selected_access_level: archetypeLevel || 'denied'
      };
    }));
  };

  // Handle manual skill access change
  const handleSkillAccessChange = (skillTypeId: string, level: AccessLevel) => {
    // Clear archetype selection when manually editing
    setSelectedArchetypeId('');

    setSkillAccess(prev => prev.map(sa =>
      sa.skill_type_id === skillTypeId
        ? { ...sa, selected_access_level: level }
        : sa
    ));
  };

  // TanStack mutation for saving
  const saveMutation = useMutation({
    mutationFn: async (overrides: SkillAccessOverride[]) => {
      const result = await saveFighterSkillAccessOverrides({
        fighter_id: fighterId,
        overrides
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save skill access');
      }
      return result;
    },
    onSuccess: () => {
      toast({ description: 'Skill access updated successfully' });
      onSave?.();
      onClose();
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        description: error instanceof Error ? error.message : 'Failed to save skill access'
      });
    }
  });

  // Handle save
  const handleSave = async () => {
    // Convert local state to overrides (only non-default values)
    const overrides: SkillAccessOverride[] = skillAccess
      .filter(sa => sa.selected_access_level !== 'default')
      .map(sa => ({
        skill_type_id: sa.skill_type_id,
        access_level: sa.selected_access_level as 'primary' | 'secondary' | 'denied'
      }));

    saveMutation.mutate(overrides);
    return true; // Let mutation handle success/failure
  };

  // Format access level for display
  const formatAccessLevel = (level: string | null): string => {
    if (!level) return '-';
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Manage Skill Access"
      width="lg"
      onClose={onClose}
      onConfirm={handleSave}
      confirmText={saveMutation.isPending ? 'Saving...' : 'Save'}
      confirmDisabled={saveMutation.isPending}
      content={
        <div className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <p>{error instanceof Error ? error.message : 'Failed to load data'}</p>
            </div>
          ) : (
            <>
              {/* Archetype Selection (only for Underhive Outcasts Leader/Champion) */}
              {canUseArchetypes && archetypes.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    Archetype
                  </label>
                  <select
                    value={selectedArchetypeId}
                    onChange={(e) => handleArchetypeChange(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background"
                    disabled={saveMutation.isPending}
                  >
                    <option value="">None (Use Default)</option>
                    {archetypes.map(archetype => (
                      <option key={archetype.id} value={archetype.id}>
                        {archetype.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Selecting an archetype will set skill access levels. You can further customize individual skills below.
                  </p>
                </div>
              )}

              {/* Manual Override Table */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Skill Access Overrides
                </label>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Skill Type</th>
                        <th className="px-3 py-2 text-center font-medium">Default</th>
                        <th className="px-3 py-2 text-center font-medium">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skillAccess.map((sa, index) => (
                        <tr
                          key={sa.skill_type_id}
                          className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                        >
                          <td className="px-3 py-2 font-medium">
                            {sa.skill_type_name}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">
                            {formatAccessLevel(sa.default_access_level)}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={sa.selected_access_level}
                              onChange={(e) => handleSkillAccessChange(sa.skill_type_id, e.target.value as AccessLevel)}
                              className="w-full p-1 border rounded text-sm bg-background"
                              disabled={saveMutation.isPending}
                            >
                              <option value="default">Default</option>
                              <option value="primary">Primary</option>
                              <option value="secondary">Secondary</option>
                              <option value="denied">Denied</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Default</strong>: Use the fighter type&apos;s default access. 
                  <strong> Primary</strong>: 6 XP random / 9 XP selected. 
                  <strong> Secondary</strong>: 9 XP random / 12 XP selected. 
                  <strong> Denied</strong>: No access to this skill type.
                </p>
              </div>

              {/* Effective Access Summary */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Effective Access (after overrides)
                </label>
                <div className="flex flex-wrap gap-2">
                  {skillAccess.map(sa => {
                    const effectiveLevel = sa.selected_access_level === 'default'
                      ? sa.default_access_level
                      : sa.selected_access_level;

                    if (!effectiveLevel || effectiveLevel === 'denied') return null;

                    const isPrimary = effectiveLevel === 'primary';
                    return (
                      <span
                        key={sa.skill_type_id}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          isPrimary
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {sa.skill_type_name} ({isPrimary ? 'P' : 'S'})
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
