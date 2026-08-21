import { EditionSlug } from '@/types/edition';

export type XpLadderRow = {
  rank: number;
  xpMin: number;
  /** null = open-ended (Legend of the Underhive). */
  xpMax: number | null;
  title: string;
};

/**
 * Full N26 XP ladder for display. Rank 0 (1–3, Rookie) is recruitment only:
 * every model starts on it, so it does not award an Advancement when entered.
 */
export const n26XpLadder: readonly XpLadderRow[] = [
  { rank: 0, xpMin: 1, xpMax: 3, title: 'Rookie' },
  { rank: 1, xpMin: 4, xpMax: 6, title: 'Rookie' },
  { rank: 2, xpMin: 7, xpMax: 9, title: 'Rookie' },
  { rank: 3, xpMin: 10, xpMax: 12, title: 'Rookie' },
  { rank: 4, xpMin: 13, xpMax: 18, title: 'Gang Member' },
  { rank: 5, xpMin: 19, xpMax: 24, title: 'Gang Member' },
  { rank: 6, xpMin: 25, xpMax: 30, title: 'Gang Member' },
  { rank: 7, xpMin: 31, xpMax: 36, title: 'Gang Member' },
  { rank: 8, xpMin: 37, xpMax: 48, title: 'Gang Exemplar' },
  { rank: 9, xpMin: 49, xpMax: 60, title: 'Gang Exemplar' },
  { rank: 10, xpMin: 61, xpMax: 72, title: 'Gang Exemplar' },
  { rank: 11, xpMin: 73, xpMax: 84, title: 'Gang Exemplar' },
  { rank: 12, xpMin: 85, xpMax: 96, title: 'Gang Hero' },
  { rank: 13, xpMin: 97, xpMax: 108, title: 'Gang Hero' },
  { rank: 14, xpMin: 109, xpMax: 120, title: 'Gang Hero' },
  { rank: 15, xpMin: 121, xpMax: 132, title: 'Gang Hero' },
  { rank: 16, xpMin: 133, xpMax: 156, title: 'Gang Legend' },
  { rank: 17, xpMin: 157, xpMax: 180, title: 'Gang Legend' },
  { rank: 18, xpMin: 181, xpMax: 204, title: 'Gang Legend' },
  { rank: 19, xpMin: 205, xpMax: 228, title: 'Gang Legend' },
  { rank: 20, xpMin: 229, xpMax: null, title: 'Legend of the Underhive' },
];

/**
 * XP totals that move a model onto a new tier, and so award an Advancement.
 *
 * Rank 0 (1–3) is absent: every model is recruited onto it and nothing ever
 * moves onto it, so a model starting on 1 XP first advances at 4. Left out
 * rather than filtered by starting XP, because starting_xp can be 0 and such a
 * fighter would otherwise collect an Advancement on reaching 1. Legend of the
 * Underhive (229) is entered like any other rank but has nothing above it, so
 * Advancement stops there.
 */
const N26_TIER_STARTS: readonly number[] = n26XpLadder
  .filter((row) => row.rank > 0)
  .map((row) => row.xpMin);

/**
 * N23 spends XP on Advancements instead of earning them by rank, so it has no
 * tiers. The empty list self-gates every count to zero without an edition
 * capability flag, the way NO_AWARDS does in utils/xpCases.ts.
 *
 * Keyed by EditionSlug so adding an edition is a compile error until it states
 * its own tiers.
 */
const TIER_STARTS_BY_EDITION: Record<EditionSlug, readonly number[]> = {
  n23: [],
  n26: N26_TIER_STARTS,
};

const LADDER_BY_EDITION: Record<EditionSlug, readonly XpLadderRow[]> = {
  n23: [],
  n26: n26XpLadder,
};

/** An unset or unrecognised slug means the edition failed to load: award nothing. */
const NO_TIERS: readonly number[] = [];
const NO_LADDER: readonly XpLadderRow[] = [];

function tierStartsFor(editionSlug: string | null | undefined): readonly number[] {
  if (!editionSlug) return NO_TIERS;

  return TIER_STARTS_BY_EDITION[editionSlug as EditionSlug] ?? NO_TIERS;
}

export function xpLadderFor(editionSlug: string | null | undefined): readonly XpLadderRow[] {
  if (!editionSlug) return NO_LADDER;

  return LADDER_BY_EDITION[editionSlug as EditionSlug] ?? NO_LADDER;
}

export function xpLadderRangeLabel(row: XpLadderRow): string {
  if (row.xpMax == null) return `${row.xpMin}+`;
  return `${row.xpMin}-${row.xpMax}`;
}

/**
 * Ladder rank for the given XP total, or null when below the Rookie band
 * (XP &lt; 1) or the edition has no ladder.
 */
export function currentXpLadderRankFor(
  editionSlug: string | null | undefined,
  xp: number,
): number | null {
  const ladder = xpLadderFor(editionSlug);
  if (ladder.length === 0 || xp < 1) return null;

  for (let i = ladder.length - 1; i >= 0; i--) {
    if (xp >= ladder[i].xpMin) return ladder[i].rank;
  }

  return null;
}

const tiersAtOrBelow = (tiers: readonly number[], xp: number): number =>
  tiers.filter((tierStart) => tierStart <= xp).length;

/**
 * How many Advancements a model has earned in total.
 *
 * N26 never spends XP, so `currentXp` is starting XP plus everything ever
 * awarded, and an Advancement is granted each time that total moves the model
 * onto a new tier. This is a range count rather than `currentXp - startingXp`
 * because tiers widen as XP rises: rebasing to zero would put a Ganger recruited
 * on 13 XP back on the 3-wide Rookie track and advance them twice as fast.
 *
 * A null `startingXp` is N/A — the model's type cannot gain XP — and counts as
 * zero rather than short-circuiting. Such a model sits on 0 XP and so earns
 * nothing anyway; reading it as zero is what lets a group that house-rules XP
 * onto it have that XP rank normally instead of being silently ignored.
 */
export function advancementsEarnedFor(
  editionSlug: string | null | undefined,
  startingXp: number | null,
  currentXp: number,
): number {
  const tiers = tierStartsFor(editionSlug);

  // XP below the recruitment value is only reachable by editing a fighter after
  // the fact; it means no Advancement, never a negative one.
  return Math.max(0, tiersAtOrBelow(tiers, currentXp) - tiersAtOrBelow(tiers, startingXp ?? 0));
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

/**
 * Advancements earned but not yet taken. Derived on read so it cannot drift.
 *
 * Floored at zero: taking one is not gated on having earned one, so a fighter
 * can hold more than its XP accounts for.
 */
export function openAdvancementsFor(
  editionSlug: string | null | undefined,
  startingXp: number | null,
  currentXp: number,
  advancementsTaken: number,
): number {
  return Math.max(0, advancementsEarnedFor(editionSlug, startingXp, currentXp) - advancementsTaken);
}
