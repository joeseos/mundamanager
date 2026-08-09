import { countAdvancementsTaken, openAdvancementsFor } from '@/utils/advancementRanks';

interface LevelUpBadgeProps {
  editionSlug?: string | null;
  startingXp?: number;
  xp: number;
  effects?: { advancements?: unknown[] } | null;
  /**
   * The fighter's actual skill rows. Distinct from `advancements.skills`, which
   * is a parallel shape the server does not populate on first load — counting
   * from that would silently miss every skill the fighter already has.
   */
  skills?: Record<string, { is_advance?: boolean }> | null;
}

/**
 * "2 Level Ups" — Advancements the fighter has earned but not yet taken.
 *
 * Renders nothing when there are none, which includes every edition that spends
 * XP on Advancements rather than earning them by rank, so callers need no
 * edition check of their own.
 *
 * The count is derived on read from data the card already holds, so it cannot
 * drift from the limit the add-advancement actions enforce, and awarding XP
 * needs no extra write.
 */
export function LevelUpBadge({
  editionSlug,
  startingXp = 0,
  xp,
  effects,
  skills,
}: LevelUpBadgeProps) {
  const openAdvancements = openAdvancementsFor(
    editionSlug,
    startingXp,
    xp,
    countAdvancementsTaken(effects, skills),
  );

  if (openAdvancements <= 0) return null;

  return (
    <span className="text-xs font-bold text-amber-500 whitespace-nowrap">
      {openAdvancements} Level Up{openAdvancements === 1 ? '' : 's'}
    </span>
  );
}
