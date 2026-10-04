'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Skill, FighterSkills, FighterEffect as FighterEffectType } from '@/types/fighter';
import { countAdvancementsTaken, openAdvancementsFor } from "@/utils/advancementRanks";
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { 
  applyN26ProspectPromotion,
  applyN26GangerChampionPromotion,
  applyN26ChampionLeaderPromotion,
  deleteAdvancement,
} from '@/app/actions/fighter-advancement';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { LuUndo2 } from 'react-icons/lu';
import type { FighterPromotionResult } from '@/components/fighter/edit-fighter/fighter-promotion-modal';
import { hasCumulativeXp } from '@/types/edition';
import {
  N26_CHAMPION_PROMOTION_SKILL_NAME,
  N26_PROSPECT_PROMOTION_CREDITS,
  getN26ProspectSpecialisation,
  hasN26ProspectPromotionOccurred,
} from '@/utils/keepTypePromotionN26';

// Modals load their code on first open, not with the page
const AdvancementModal = dynamic(
  () => import('@/components/fighter/advancement-modal').then((mod) => mod.AdvancementModal),
  { ssr: false }
);
const FighterPromotionModal = dynamic(
  () => import('@/components/fighter/edit-fighter/fighter-promotion-modal').then((mod) => mod.FighterPromotionModal),
  { ssr: false }
);

// AdvancementsList Interfaces
interface StatChange {
  id: string;
  applied_at: string;
  stat_change_type_id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    [key: string]: number;
  };
}

interface FighterChanges {
  advancement?: StatChange[];
  characteristics?: Array<{
    id: string;
    created_at: string;
    updated_at: string;
    code: string;
    times_increased: number;
    characteristic_name: string;
    credits_increase: number;
    xp_cost: number;
    characteristic_value: number;
    acquired_at: string;
  }>;
  skills?: Skill[];
}

interface AdvancementsListProps {
  fighterXp: number;
  fighterStartingXp?: number | null;
  fighterChanges?: FighterChanges;
  fighterId: string;
  editionSlug?: string | null;
  fighterSubtypes: string[];
  advancements: Array<FighterEffectType>;
  skills: FighterSkills;
  userPermissions: UserPermissions;
  onAdvancementUpdate: (updatedAdvancements: Array<FighterEffectType>) => void;
  onSkillUpdate?: (updatedSkills: FighterSkills) => void;
  onXpCreditsUpdate?: (xpChange: number, creditsChange: number) => void;
  onCharacteristicUpdate?: (characteristicName: string, changeAmount: number) => void;
  gangId?: string;
  venatorRanksIncomplete?: boolean;
  gangTypeId?: string;
  customGangTypeId?: string;
  fighterSpecialRules?: string[];
  fighterTypeName?: string;
  fighterTypeId?: string;
  fighterSpecialisationId?: string;
  promotedFromProspect?: boolean;
  fighterArchetypeName?: string | null;
  onFighterDetailsUpdate?: (patch: {
    fighter_subtypes?: string[];
    fighter_type?: string;
    fighter_type_id?: string;
    fighter_specialisation?: string | null;
    fighter_specialisation_id?: string | null;
    special_rules?: string[];
    promoted_from_prospect?: boolean;
  }) => void;
}

interface TransformedAdvancement {
  id: string;
  stat_change_name: string;
  xp_spent: number;
  changes: {
    credits: number;
    [key: string]: number;
  };
  acquired_at: string;
  type: 'characteristic' | 'skill';
}

// AdvancementsList Component
export function AdvancementsList({
  fighterXp,
  fighterStartingXp = null,
  fighterChanges = { advancement: [], characteristics: [], skills: [] },
  fighterId,
  editionSlug = null,
  fighterSubtypes,
  advancements = [],
  skills = {},
  userPermissions,
  onAdvancementUpdate,
  onSkillUpdate,
  onXpCreditsUpdate,
  onCharacteristicUpdate,
  gangId = '',
  venatorRanksIncomplete,
  gangTypeId = '',
  customGangTypeId = '',
  fighterSpecialRules = [],
  fighterTypeName = '',
  fighterTypeId = '',
  fighterSpecialisationId = '',
  promotedFromProspect = false,
  fighterArchetypeName = null,
  onFighterDetailsUpdate
}: AdvancementsListProps) {
  const [isAdvancementModalOpen, setIsAdvancementModalOpen] = useState(false);
  const [isStandalonePromotionOpen, setIsStandalonePromotionOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string; type: string } | null>(null);

  // No XP is spent on Advancements in a rank-based edition, so there is no XP
  // cost to list and nothing to refund when one is undone.
  const isCumulativeXp = hasCumulativeXp(editionSlug);

  const showPromoteButton = fighterSubtypes.some(c => ['Ganger', 'Juve', 'Prospect', 'Champion', 'Specialist', 'Exotic Beast', 'Exotic Beast Specialist'].includes(c));

  const { data: preFetchedFighterTypes = [] } = useQuery({
    queryKey: ['fighter-types-edit', gangId, gangTypeId, customGangTypeId, false],
    queryFn: async () => {
      const params = new URLSearchParams({
        gang_id: gangId,
        is_gang_addition: 'false',
        is_vehicle: 'false'
      });
      if (gangTypeId) params.set('gang_type_id', gangTypeId);
      if (customGangTypeId) params.set('custom_gang_type_id', customGangTypeId);

      const response = await fetch(`/api/fighter-types?${params}`);
      if (!response.ok) throw new Error('Failed to fetch fighter types');
      return response.json();
    },
    enabled: !!gangId && !!(gangTypeId || customGangTypeId) && isStandalonePromotionOpen,
    staleTime: 10 * 60 * 1000,
  });

  const currentPromotionSpecialisation = useMemo(() => {
    const match = preFetchedFighterTypes.find((ft: any) => ft.id === fighterTypeId);
    return {
      fighter_specialisation: match?.specialisation?.specialisation_name ?? null,
      fighter_specialisation_id: fighterSpecialisationId || (match?.specialisation?.id ?? null),
    };
  }, [preFetchedFighterTypes, fighterTypeId, fighterSpecialisationId]);

  const standalonePromotionMutation = useMutation({
    mutationFn: async (promotion: FighterPromotionResult) => {
      if (promotion.kind === 'n26_prospect') {
        if (!promotion.fighter_specialisation_id) {
          throw new Error('Specialisation is required for Prospect promotion');
        }
        const result = await applyN26ProspectPromotion({
          fighter_id: fighterId,
          fighter_specialisation_id: promotion.fighter_specialisation_id,
          special_rules: promotion.special_rules,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to promote fighter');
        }
        return result;
      }

      if (promotion.kind === 'n26_ganger_champion') {
        const result = await applyN26GangerChampionPromotion({
          fighter_id: fighterId,
          special_rules: promotion.special_rules,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to promote fighter');
        }
        return result;
      }

      if (promotion.kind === 'n26_champion_leader') {
        if (!promotion.fighter_type_id) {
          throw new Error('A Leader fighter type is required');
        }
        const result = await applyN26ChampionLeaderPromotion({
          fighter_id: fighterId,
          fighter_type_id: promotion.fighter_type_id,
          special_rules: promotion.special_rules,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to promote fighter');
        }
        return result;
      }

      const result = await updateFighterDetails({
        fighter_id: fighterId,
        fighter_subtypes: promotion.fighter_subtypes,
        fighter_type: promotion.fighter_type,
        fighter_type_id: promotion.fighter_type_id,
        fighter_specialisation: promotion.fighter_specialisation ?? null,
        fighter_specialisation_id: promotion.fighter_specialisation_id ?? null,
        special_rules: promotion.special_rules,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to promote fighter');
      }
      return result;
    },
    onMutate: async (promotion) => {
      const previousPatch = {
        fighter_subtypes: fighterSubtypes,
        fighter_type: fighterTypeName,
        fighter_type_id: fighterTypeId,
        special_rules: fighterSpecialRules,
        promoted_from_prospect: promotedFromProspect,
        ...currentPromotionSpecialisation,
      };
      const previousSkills = { ...skills };
      const creditsIncrease =
        promotion.kind === 'n26_prospect'
          ? (promotion.credits_increase ?? N26_PROSPECT_PROMOTION_CREDITS)
          : 0;
      const optimisticSkillName =
        promotion.kind === 'n26_prospect' && promotion.fighter_specialisation_id
          ? getN26ProspectSpecialisation(promotion.fighter_specialisation_id)?.skillName
          : promotion.kind === 'n26_ganger_champion' || promotion.kind === 'n26_champion_leader'
            ? N26_CHAMPION_PROMOTION_SKILL_NAME
            : undefined;

      onFighterDetailsUpdate?.(promotion);

      // Grant is not an Advancement (is_advance: false) — lands in Skills.
      // Champion→Leader skips optimistic grant when Inspiring is already present.
      if (optimisticSkillName && onSkillUpdate && !skills[optimisticSkillName]) {
        const optimisticId =
          promotion.kind === 'n26_prospect'
            ? `optimistic-n26-prospect-${promotion.fighter_specialisation_id}`
            : promotion.kind === 'n26_champion_leader'
              ? 'optimistic-n26-champion-leader'
              : 'optimistic-n26-ganger-champion';
        onSkillUpdate({
          ...skills,
          [optimisticSkillName]: {
            id: optimisticId,
            name: optimisticSkillName,
            xp_cost: 0,
            credits_increase: creditsIncrease,
            is_advance: false,
            acquired_at: new Date().toISOString(),
          } as any,
        });
      }

      if (creditsIncrease > 0 && onXpCreditsUpdate) {
        onXpCreditsUpdate(0, creditsIncrease);
      }

      return { previousPatch, previousSkills, creditsIncrease, optimisticSkillName };
    },
    onSuccess: (result, promotion, context) => {
      // Replace optimistic skill id with the real fighter_skills row id
      const isPromotionSkillGrant =
        promotion.kind === 'n26_prospect' ||
        promotion.kind === 'n26_ganger_champion' ||
        promotion.kind === 'n26_champion_leader';
      const skillId =
        isPromotionSkillGrant && result && 'advancement' in result
          ? result.advancement?.id
          : undefined;
      if (
        isPromotionSkillGrant &&
        context?.optimisticSkillName &&
        skillId &&
        onSkillUpdate &&
        context.previousSkills
      ) {
        const skillName = context.optimisticSkillName;
        onSkillUpdate({
          ...context.previousSkills,
          [skillName]: {
            id: skillId,
            name: skillName,
            xp_cost: 0,
            credits_increase:
              promotion.kind === 'n26_prospect'
                ? (context.creditsIncrease ?? N26_PROSPECT_PROMOTION_CREDITS)
                : 0,
            is_advance: false,
            acquired_at: new Date().toISOString(),
          } as any,
        });
      }
      setIsStandalonePromotionOpen(false);
      toast.success('Fighter promoted successfully');
    },
    onError: (error, _promotion, context) => {
      if (context?.previousPatch) {
        onFighterDetailsUpdate?.(context.previousPatch);
      }
      if (context?.previousSkills && onSkillUpdate) {
        onSkillUpdate(context.previousSkills);
      }
      if (context?.creditsIncrease && onXpCreditsUpdate) {
        onXpCreditsUpdate(0, -context.creditsIncrease);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to promote fighter');
    },
  });

  // TanStack Query delete mutation
  const deleteAdvancementMutation = useMutation({
    mutationFn: async (variables: { fighter_id: string; advancement_id: string; advancement_type: 'characteristic' | 'skill' }) => {
      const result = await deleteAdvancement(variables);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete advancement');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Find the advancement being deleted from the combined list
      const advancementToDelete = [...advancements, ...advancementSkills].find(adv => adv.id === variables.advancement_id);
      if (!advancementToDelete) return {};

      // Store previous states for rollback
      const previousAdvancements = [...advancements];
      const previousSkills = { ...skills };
      
      // Determine if this is a skill or characteristic advancement
      const isSkill = variables.advancement_type === 'skill' || advancementToDelete.effect_name.startsWith('Skill: ');
      
      if (isSkill) {
        // For skill advancements, remove from skills object
        const skillName = advancementToDelete.effect_name.replace('Skill: ', '');
        const updatedSkills = { ...skills };
        delete updatedSkills[skillName];
        
        if (onSkillUpdate) {
          onSkillUpdate(updatedSkills);
        }
      } else {
        // For characteristic advancements, remove from advancements array
        const updatedAdvancements = advancements.filter(adv => adv.id !== variables.advancement_id);
        onAdvancementUpdate(updatedAdvancements);
      }

      // Get XP and credits to refund from the advancement data
      const typeSpecificData = typeof advancementToDelete.type_specific_data === 'string'
        ? JSON.parse(advancementToDelete.type_specific_data || '{}')
        : (advancementToDelete.type_specific_data || {});
      
      const xpToRefund = typeSpecificData.xp_cost || 0;
      const creditsToDeduct = typeSpecificData.credits_increase || 0;

      // Don't update characteristic optimistically for deletes - server handles this
      // The server action will decrease the characteristic value correctly
      let characteristicName: string | undefined;
      if (!isSkill) {
        characteristicName = advancementToDelete.effect_name.replace('Characteristic: ', '').toLowerCase().replace(' ', '_');
      }

      // Update XP and credits immediately (refund XP, deduct credits)
      if (onXpCreditsUpdate && (xpToRefund > 0 || creditsToDeduct > 0)) {
        onXpCreditsUpdate(xpToRefund, -creditsToDeduct);
      }

      return { 
        advancementToDelete, 
        previousAdvancements, 
        previousSkills, 
        isSkill, 
        xpToRefund, 
        creditsToDeduct,
        characteristicName
      };
    },
    onSuccess: (result, variables, context) => {
      toast.success(`${context?.advancementToDelete?.effect_name || 'Advancement'} removed successfully`);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.isSkill && context?.previousSkills && onSkillUpdate) {
        onSkillUpdate(context.previousSkills);
      } else if (!context?.isSkill && context?.previousAdvancements) {
        onAdvancementUpdate(context.previousAdvancements);
      }

      // Rollback XP and credits changes
      if (context?.xpToRefund || context?.creditsToDeduct) {
        if (onXpCreditsUpdate) {
          onXpCreditsUpdate(-context.xpToRefund, context.creditsToDeduct);
        }
      }

      // No characteristic rollback needed since server handles characteristic updates

      toast.error('Failed to delete advancement');
    }
  });

  // Memoize the entire data transformation
  const { characteristics, skills: transformedSkills } = useMemo(() => {
    const transformedCharacteristics: TransformedAdvancement[] = [];
    const transformedSkills: TransformedAdvancement[] = [];
    
    // Transform characteristics
    if (fighterChanges.characteristics && Array.isArray(fighterChanges.characteristics)) {
      fighterChanges.characteristics.forEach((data) => {
        transformedCharacteristics.push({
          id: data.id,
          stat_change_name: data.characteristic_name,
          xp_spent: data.xp_cost,
          changes: {
            credits: data.credits_increase,
            [data.code.toLowerCase()]: data.characteristic_value
          },
          acquired_at: data.acquired_at,
          type: 'characteristic'
        });
      });
    }

    // Transform skills
    if (Array.isArray(skills)) {
      skills.forEach((skill) => {
        transformedSkills.push({
          id: skill.id,
          stat_change_name: skill.name,
          xp_spent: skill.xp_cost || 0,
          changes: {
            credits: skill.credits_increase
          },
          acquired_at: skill.acquired_at,
          type: 'skill'
        });
      });
    }

    // Sort each array by acquired_at date
    const sortByDate = (a: TransformedAdvancement, b: TransformedAdvancement) => 
      new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime();

    return {
      characteristics: transformedCharacteristics.sort(sortByDate),
      skills: transformedSkills.sort(sortByDate)
    };
  }, [fighterChanges, skills]); // Only recompute when fighterChanges or skills updates

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const advancementSkills = useMemo(() => {
    return Object.entries(skills)
      .filter(([_, skill]) => skill && (skill as any).is_advance)
      .map(([name, skill]) => {
        const typedSkill = skill as any;
        return {
          id: typedSkill.id,
          effect_name: `Skill: ${name}`,
          created_at: typedSkill.acquired_at,
          type_specific_data: {
            xp_cost: typedSkill.xp_cost || 0,
            credits_increase: typedSkill.credits_increase
          }
        };
      });
  }, [skills]);

  const handleDeleteAdvancement = (advancementId: string, advancementName: string, advancementType?: string) => {
    const isSkill = advancementType === 'skill' || advancementName.startsWith('Skill: ');
    setDeleteModalData(null);
    deleteAdvancementMutation.mutate({
      fighter_id: fighterId,
      advancement_id: advancementId,
      advancement_type: isSkill ? 'skill' : 'characteristic'
    });
  };

  const handleAdvancementAdded = (advancement: FighterEffectType) => {
  };

  // Transform advancements for the List component
  const transformedAdvancements = useMemo(() => {
    const allAdvancements = [...advancements, ...advancementSkills];
    const filteredAdvancements = allAdvancements.filter((advancement) => {
      if (!advancement.id?.startsWith('optimistic-')) {
        return true;
      }
      const hasRealServerEntry = allAdvancements.some(other =>
        !other.id?.startsWith('optimistic-') &&
        other.effect_name === advancement.effect_name
      );
      return !hasRealServerEntry;
    });

    return filteredAdvancements
      .sort((a, b) => {
        const dateA = a.created_at || '';
        const dateB = b.created_at || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .map((advancement, index) => {
        const specificData = typeof advancement.type_specific_data === 'string'
          ? JSON.parse(advancement.type_specific_data || '{}')
          : (advancement.type_specific_data || {});

        const isSkill = advancement.effect_name.startsWith('Skill: ');

        return {
          id: advancement.id || `temp-${index}`,
          name: advancement.effect_name.startsWith('Skill') ? advancement.effect_name :
                advancement.effect_name.startsWith('Characteristic') ? advancement.effect_name :
                `Characteristic: ${advancement.effect_name}`,
          xp_cost: specificData.xp_cost || 0,
          credits_increase: specificData.credits_increase || 0,
          advancement_id: advancement.id,
          advancement_type: isSkill ? 'skill' : 'characteristic'
        };
      });
  }, [advancements, advancementSkills]);

  // Taken count: characteristic effects plus is_advance skills (shared with gang cards).
  const advancementCount = countAdvancementsTaken({ advancements }, skills);

  const prospectPromotionConsumed = hasN26ProspectPromotionOccurred(
    editionSlug,
    promotedFromProspect,
  );

  const openAdvancements = openAdvancementsFor(
    editionSlug,
    fighterStartingXp,
    fighterXp,
    advancementCount,
    { prospectPromotionConsumed },
  );

  const title = (
    <>
      <span className="sm:hidden">Advanc.</span>
      <span className="hidden sm:inline">Advancements</span>
      {isCumulativeXp ? (
        openAdvancements > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 mr-1 whitespace-nowrap">
            <span className="align-middle inline-flex items-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-semibold text-white">
              <span className="sm:hidden">Avail: {openAdvancements}</span>
              <span className="hidden sm:inline">Available: {openAdvancements}</span>
            </span>
          </span>
        ) : null
      ) : advancementCount > 0 ? (
        <span className="ml-auto whitespace-nowrap">
          <span className="text-sm sm:hidden">({advancementCount})</span>
          <span className="text-sm hidden sm:inline">(Adv. count: {advancementCount})</span>
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <List
        title={title}
        titleClassName="flex flex-1 items-center min-w-0"
        items={transformedAdvancements}
        columns={isCumulativeXp ? [
          {
            key: 'name',
            label: 'Name',
            width: '75%'
          },
          {
            key: 'credits_increase',
            label: 'Cost',
            align: 'right'
          }
        ] : [
          {
            key: 'name',
            label: 'Name',
            width: '50%'
          },
          {
            key: 'xp_cost',
            label: 'XP',
            align: 'right',
            width: '25%'
          },
          {
            key: 'credits_increase',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            icon: <LuUndo2 className="h-4 w-4" />,
            title: "Undo",
            variant: 'outline_remove',
            onClick: (item) => item.advancement_id ? setDeleteModalData({
              id: item.advancement_id,
              name: item.name,
              type: item.advancement_type
            }) : null,
            disabled: (item) => deleteAdvancementMutation.isPending || !item.advancement_id || !userPermissions.canEdit
          }
        ]}
        headerActions={
          showPromoteButton ? (
            <Button
              type="button"
              variant="outline"
              disabled={!userPermissions.canEdit || standalonePromotionMutation.isPending}
              onClick={() => setIsStandalonePromotionOpen(true)}
            >
              Promote
            </Button>
          ) : undefined
        }
        onAdd={() => setIsAdvancementModalOpen(true)}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No advancements yet."
      />

      {/* Modals */}
      {isStandalonePromotionOpen && (
        <FighterPromotionModal
          currentSubtype={fighterSubtypes[0] || ''}
          currentSubtypes={fighterSubtypes}
          currentSpecialRules={fighterSpecialRules}
          currentFighterType={fighterTypeName}
          currentFighterTypeId={fighterTypeId}
          currentFighterSpecialisationId={fighterSpecialisationId || undefined}
          fighterTypes={preFetchedFighterTypes}
          editionSlug={editionSlug}
          isOpen={isStandalonePromotionOpen}
          onClose={() => setIsStandalonePromotionOpen(false)}
          showXpPromotionHint
          onPromoted={(data) => {
            standalonePromotionMutation.mutate(data);
          }}
        />
      )}

      {isAdvancementModalOpen && (
        <AdvancementModal
          fighterId={fighterId}
          currentXp={fighterXp}
          openAdvancements={openAdvancements}
          editionSlug={editionSlug}
          fighterSubtypes={fighterSubtypes}
          advancements={advancements}
          skills={skills}
          onClose={() => setIsAdvancementModalOpen(false)}
          onAdvancementAdded={handleAdvancementAdded}
          onSkillUpdate={onSkillUpdate}
          onXpCreditsUpdate={onXpCreditsUpdate}
          onAdvancementUpdate={onAdvancementUpdate}
          onCharacteristicUpdate={onCharacteristicUpdate}
          userPermissions={userPermissions}
          gangId={gangId}
          venatorRanksIncomplete={venatorRanksIncomplete}
          gangTypeId={gangTypeId}
          customGangTypeId={customGangTypeId}
          fighterSpecialRules={fighterSpecialRules}
          fighterTypeName={fighterTypeName}
          fighterTypeId={fighterTypeId}
          fighterSpecialisationId={fighterSpecialisationId}
          fighterArchetypeName={fighterArchetypeName}
          onFighterDetailsUpdate={onFighterDetailsUpdate}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Undo Advancement"
          content={
            <div>
              <p>Are you sure you want to undo <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p>
                {isCumulativeXp
                  ? "The fighter's value will be adjusted accordingly."
                  : "XP spent will be refunded and the fighter's value will be adjusted accordingly."}
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteAdvancement(deleteModalData.id, deleteModalData.name, deleteModalData.type)}
        />
      )}
    </>
  );
} 