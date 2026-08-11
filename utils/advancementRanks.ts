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

/** An unset or unrecognised slug means the edition failed to load: award nothing. */
const NO_TIERS: readonly number[] = [];

function tierStartsFor(editionSlug: string | null | undefined): readonly number[] {
  if (!editionSlug) return NO_TIERS;

  return TIER_STARTS_BY_EDITION[editionSlug as EditionSlug] ?? NO_TIERS;
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
 * How many Advancements a model has already taken.
 *
 * A characteristic lands as a fighter_effect in the 'advancements' category, a
 * skill as a fighter_skill flagged is_advance. Starting and free skills are not
 * Advancements and carry is_advance false.
 */
export function countAdvancementsTaken(
  effects: { advancements?: unknown[] } | null | undefined,
  skills: Record<string, { is_advance?: boolean }> | null | undefined,
): number {
  const characteristics = effects?.advancements?.length ?? 0;
  const skillAdvances = Object.values(skills ?? {}).filter((skill) => skill?.is_advance).length;

  return characteristics + skillAdvances;
}

/**
 * Advancements earned but not yet taken — the "Level Up" state, and the cap the
 * add-advancement actions enforce. Derived on read so it cannot drift.
 */
export function openAdvancementsFor(
  editionSlug: string | null | undefined,
  startingXp: number | null,
  currentXp: number,
  advancementsTaken: number,
): number {
  return Math.max(0, advancementsEarnedFor(editionSlug, startingXp, currentXp) - advancementsTaken);
}
