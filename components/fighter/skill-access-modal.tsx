'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from "@/components/ui/modal";
import { toast } from 'sonner';
import { Switch } from "@/components/ui/switch";
import {
  saveFighterSkillAccessOverrides,
  type SkillAccessOverride
} from '@/app/actions/fighter-skill-access';
import { skillSetRank } from "@/utils/skillSetRank";

interface SkillAccessModalProps {
  fighterId: string;
  isOpen: boolean;
  onClose: () => void;
}

type AccessLevel = 'default' | 'primary' | 'secondary' | 'allowed' | 'denied';

interface LocalSkillAccess {
  skill_type_id: string;
  skill_type_name: string;
  default_access_level: string | null;
  selected_access_level: AccessLevel;
}

export function SkillAccessModal({
  fighterId,
  isOpen,
  onClose
}: SkillAccessModalProps) {
  
  const queryClient = useQueryClient();
  const [skillAccess, setSkillAccess] = useState<LocalSkillAccess[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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
  }, [skillTypesError, skillAccessError, toast]);

  // Helper to get the group label for a skill set based on its rank
  const getGroupLabel = (rank: number): string => {
    if (rank <= 19) return 'Universal Skill Sets';
    if (rank <= 39) return 'Gang-specific Skill Sets';
    if (rank <= 59) return 'Wyrd Powers';
    if (rank <= 69) return 'Cult Wyrd Powers';
    if (rank <= 79) return 'Psychoteric Whispers';
    if (rank <= 89) return 'Legendary Names';
    if (rank <= 99) return 'Ironhead Squat Mining Clans';
    return 'Misc.';
  };

  // Initialize local state from fetched data - merge all skill types with current access
  useEffect(() => {
    if (allSkillTypes && skillAccessData && !hasInitialized) {
      // Create a map of current access levels (defaults + overrides)
      const accessMap = new Map(
        (skillAccessData.skill_access || []).map((sa: any) => [
          sa.skill_type_id,
          { default: sa.access_level, override: sa.override_access_level }
        ])
      );

      // Helper to get the rank for a given skill set name, defaulting to Infinity for unknown sets
      const getRank = (name: string): number =>
        skillSetRank[name.toLowerCase()] ?? Number.POSITIVE_INFINITY;

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

      // Sort by skill set rank to align with the Skills modal, with alphabetical tiebreaker
      allSkillTypesWithAccess.sort((a: LocalSkillAccess, b: LocalSkillAccess) => {
        const rankA = getRank(a.skill_type_name);
        const rankB = getRank(b.skill_type_name);

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.skill_type_name.localeCompare(b.skill_type_name);
      });

      setSkillAccess(allSkillTypesWithAccess);
      setHasInitialized(true);
    }
  }, [allSkillTypes, skillAccessData, hasInitialized]);

  // Reset initialization state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasInitialized(false);
    }
  }, [isOpen]);

  const isLoading = isLoadingSkillTypes || isLoadingSkillAccess;
  const error = skillTypesError || skillAccessError;

  // Handle manual skill access change
  const handleSkillAccessChange = (skillTypeId: string, level: AccessLevel) => {
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
      // Invalidate the TanStack Query cache for skill access
      queryClient.invalidateQueries({ queryKey: ['fighter-skill-access', fighterId] });
      toast({ description: 'Skill access updated successfully' });
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
      .filter(sa => {
        if (sa.selected_access_level === 'default') return false;
        // Skip "denied" override when skill has no base access (already implicitly denied)
        if (sa.selected_access_level === 'denied' && !sa.default_access_level) return false;
        // Skip override that matches the base level (redundant)
        if (sa.selected_access_level === sa.default_access_level) return false;
        return true;
      })
      .map(sa => ({
        skill_type_id: sa.skill_type_id,
        access_level: sa.selected_access_level as 'primary' | 'secondary' | 'allowed' | 'denied'
      }));

    saveMutation.mutate(overrides);
    return true; // Let mutation handle success/failure
  };

  // Format access level for display
  const formatAccessLevel = (level: string | null): string => {
    if (!level) return '-';
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  // Group skill access by group label
  const getGroupedSkillAccess = () => {
    const getRank = (name: string): number =>
      skillSetRank[name.toLowerCase()] ?? Number.POSITIVE_INFINITY;

    // Group by label
    const groupByLabel: Record<string, LocalSkillAccess[]> = {};
    skillAccess.forEach(sa => {
      const rank = getRank(sa.skill_type_name);
      const groupLabel = getGroupLabel(rank);
      if (!groupByLabel[groupLabel]) {
        groupByLabel[groupLabel] = [];
      }
      groupByLabel[groupLabel].push(sa);
    });

    // Sort group labels by their minimum rank
    const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
      const getRank = (name: string): number =>
        skillSetRank[name.toLowerCase()] ?? Number.POSITIVE_INFINITY;
      const aRank = Math.min(...groupByLabel[a].map(sa => getRank(sa.skill_type_name)));
      const bRank = Math.min(...groupByLabel[b].map(sa => getRank(sa.skill_type_name)));
      return aRank - bRank;
    });

    return { groupByLabel, sortedGroupLabels };
  };

  if (!isOpen) return null;

  const { groupByLabel, sortedGroupLabels } = getGroupedSkillAccess();

  return (
    <Modal
      title="Customise Skill Set Access"
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
              {/* Manual Override Tables - One per group */}
              <div className="space-y-4">
                <label className="block text-sm font-medium">
                  Skill Set Access Overrides
                </label>
                {sortedGroupLabels.map((groupLabel) => {
                  const groupItems = groupByLabel[groupLabel];

                  // Determine if this group has any effective access (Allowed / Secondary / Primary)
                  const hasEffectiveAccess = groupItems.some(sa => {
                    const effectiveLevel =
                      sa.selected_access_level === 'default'
                        ? sa.default_access_level
                        : sa.selected_access_level;
                    return (
                      effectiveLevel === 'primary' ||
                      effectiveLevel === 'secondary' ||
                      effectiveLevel === 'allowed'
                    );
                  });

                  // Determine if this group has any explicit overrides
                  const hasOverride = groupItems.some(
                    sa => sa.selected_access_level !== 'default'
                  );

                  // Default collapsed when there is no effective access and no overrides
                  const defaultCollapsed = !hasEffectiveAccess && !hasOverride;
                  const isCollapsed =
                    collapsedGroups[groupLabel] ?? defaultCollapsed;

                  return (
                    <div key={groupLabel} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">
                          {groupLabel}
                        </h3>
                        <Switch
                          checked={!isCollapsed}
                          onCheckedChange={(checked) =>
                            setCollapsedGroups(prev => ({
                              ...prev,
                              [groupLabel]: !checked,
                            }))
                          }
                        />
                      </div>
                      {!isCollapsed && (
                        <div className="border rounded-md overflow-hidden">
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col style={{ width: '50%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '30%' }} />
                            </colgroup>
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                <th className="px-3 py-2 text-center font-medium">Default</th>
                                <th className="px-3 py-2 text-center font-medium">Override</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupItems.map((sa, index) => (
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
                                      <option value="allowed">Allowed</option>
                                      <option value="denied">Denied</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="text-xs text-muted-foreground">
                  <p><strong>Primary</strong>: 6 XP random / 9 XP selected.</p>
                  <p><strong>Secondary</strong>: 9 XP random / 12 XP selected.</p>
                  <p><strong>Allowed</strong>: Access to this skill set. 15 XP random.</p>
                  <p><strong>Denied</strong>: No access to this skill set.</p>
                </div>
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
