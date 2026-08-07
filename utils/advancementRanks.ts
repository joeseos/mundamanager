import { EditionSlug } from '@/types/edition';

/**
 * One rank band — a title covering four XP tiers.
 *
 * `tierStarts` holds the XP totals that move a model onto a new tier, i.e. the
 * lower bound of each tier. A model rolls on the Advancement table when its XP
 * reaches one, so these are the awarding thresholds.
 *
 * The band grouping is load-bearing even though nothing reads it yet. Rank
 * titles are deferred, not designed out, and a title belongs to a band rather
 * than to a tier — keeping the tiers grouped means adding them later is one
 * extra field here plus a new accessor, not a reshaping of this table.
 */
interface RankBand {
  tierStarts: readonly number[];
}

/**
 * N26 model ranks. Tiers widen as XP rises (3 → 6 → 12 → 12 → 24 wide), which is
 * the whole reason an Advancement count cannot be derived by subtracting
 * starting XP: a fighter type's starting XP places the model on the track that
 * suits it, and rebasing to zero would put a Ganger back on the 3-wide Rookie
 * track and advance them twice as fast as the rules intend.
 */
const N26_RANKS: readonly RankBand[] = [
  // Rookie's own first tier (1–3) is absent: every model is recruited onto it,
  // so nothing ever moves onto it, and a model starting on 1 XP first advances
  // at 4. Left out of the data rather than filtered out by starting XP, because
  // fighters.starting_xp is NOT NULL DEFAULT 0 and the admin form yields 0 for a
  // blank field — a fighter whose type never set Starting XP would otherwise
  // collect a phantom Advancement on reaching 1 XP.
  { tierStarts: [4, 7, 10] },
  { tierStarts: [13, 19, 25, 31] },
  { tierStarts: [37, 49, 61, 73] },
  { tierStarts: [85, 97, 109, 121] },
  { tierStarts: [133, 157, 181, 205] },
  // Legend of the Underhive (229+) is entered like any other rank, so 229 does
  // award — but it is open-ended with no tier above it, so Advancement stops.
  { tierStarts: [229] },
];

/**
 * N23 has no XP-based ranks — it spends XP on Advancements instead of earning
 * them by rank. An empty list is the honest description of that, and it
 * self-gates: every count comes out zero without an edition capability flag,
 * the same way NO_AWARDS works in utils/xpCases.ts.
 */
const N23_RANKS: readonly RankBand[] = [];

/**
 * Keyed by EditionSlug on purpose: adding an edition is a compile error here
 * until it states its own ranks, the same guarantee EDITION_CAPABILITIES gives
 * for the capability flags.
 */
const RANKS_BY_EDITION: Record<EditionSlug, readonly RankBand[]> = {
  n23: N23_RANKS,
  n26: N26_RANKS,
};

/**
 * An unset or unrecognised slug gets no ranks at all, matching NO_CAPABILITIES
 * in types/edition.ts. A missing slug means the edition failed to load, and
 * handing out another edition's Advancements would be worse than handing out
 * none.
 */
const NO_RANKS: readonly RankBand[] = [];

function ranksFor(editionSlug: string | null | undefined): readonly RankBand[] {
  if (!editionSlug) return NO_RANKS;

  return RANKS_BY_EDITION[editionSlug as EditionSlug] ?? NO_RANKS;
}

function tiersAtOrBelow(ranks: readonly RankBand[], xp: number): number {
  let count = 0;
  for (const band of ranks) {
    for (const tierStart of band.tierStarts) {
      if (tierStart <= xp) count++;
    }
  }
  return count;
}

/**
 * How many Advancements a model has earned in total.
 *
 * N26 never spends XP, so `currentXp` is the starting XP plus every point ever
 * awarded, and an Advancement is granted each time that total moves the model
 * onto a new tier. Tiers at or below the model's starting XP were never moved
 * onto and award nothing, which is why this is a range count over the table
 * rather than a lookup on `currentXp - startingXp`.
 *
 * Only the function is exported. Consumers ask what a model earned; they never
 * see the table, so rank titles can be added to it without touching them.
 */
export function advancementsEarnedFor(
  editionSlug: string | null | undefined,
  startingXp: number,
  currentXp: number,
): number {
  const ranks = ranksFor(editionSlug);

  // XP below the recruitment value is only reachable by editing a fighter after
  // the fact; it means no Advancement, never a negative one.
  return Math.max(0, tiersAtOrBelow(ranks, currentXp) - tiersAtOrBelow(ranks, startingXp));
}

/**
 * How many Advancements a model has already taken.
 *
 * An Advancement lands as one of two rows depending on what was picked: a
 * characteristic increase becomes a fighter_effect in the 'advancements'
 * category, a skill becomes a fighter_skill flagged is_advance. Starting and
 * free skills are not Advancements and carry is_advance false.
 *
 * Both the fighter page and the gang roster count this, so it lives here rather
 * than in either card — the same reason calculateAdjustedStats is shared.
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
 * Advancements the model has earned but not yet spent — the "Level Up" state.
 *
 * Derived on read rather than stored: it is a pure function of the model's XP,
 * its recruitment XP and what it has already taken, so it cannot drift out of
 * step with any of them and adding XP needs no extra write.
 */
export function openAdvancementsFor(
  editionSlug: string | null | undefined,
  startingXp: number,
  currentXp: number,
  advancementsTaken: number,
): number {
  return Math.max(0, advancementsEarnedFor(editionSlug, startingXp, currentXp) - advancementsTaken);
}
