import { EditionSlug } from '@/types/edition';

/**
 * XP totals that move a model onto a new tier, and so award an Advancement.
 *
 * The Rookie band's own first tier (1-3) is absent: every model is recruited
 * onto it and nothing ever moves onto it, so a model starting on 1 XP first
 * advances at 4. Left out of the data rather than filtered by starting XP,
 * because starting_xp can be 0 and such a fighter would otherwise collect an
 * Advancement on reaching 1. Legend of the Underhive (229) is entered like any
 * other rank but has nothing above it, so Advancement stops there.
 */
const N26_TIER_STARTS: readonly number[] = [
  4, 7, 10,
  13, 19, 25, 31,
  37, 49, 61, 73,
  85, 97, 109, 121,
  133, 157, 181, 205,
  229,
];

/**
 * N23 spends XP on Advancements instead of earning them by rank, so it has no
 * tiers. The empty list self-gates every lookup without an edition capability
 * flag, the way NO_AWARDS does in utils/xpCases.ts.
 *
 * Keyed by EditionSlug so adding an edition is a compile error until it states
 * its own tiers.
 */
const TIER_STARTS_BY_EDITION: Record<EditionSlug, readonly number[]> = {
  n23: [],
  n26: N26_TIER_STARTS,
};

/** An unset or unrecognised slug means the edition failed to load: it has no tiers. */
const NO_TIERS: readonly number[] = [];

function tierStartsFor(editionSlug: string | null | undefined): readonly number[] {
  if (!editionSlug) return NO_TIERS;

  return TIER_STARTS_BY_EDITION[editionSlug as EditionSlug] ?? NO_TIERS;
}

/**
 * The XP total that moves a model onto its next tier, or null when there is
 * none: a Legend of the Underhive has nothing above it, and an edition without
 * tiers has nothing to reach.
 */
export function nextTierStartFor(
  editionSlug: string | null | undefined,
  currentXp: number,
): number | null {
  return tierStartsFor(editionSlug).find((tierStart) => tierStart > currentXp) ?? null;
}
