import { hasCumulativeXp } from '@/types/edition';

/**
 * XP totals that move a model onto a new rank, and so award an Advancement.
 *
 * Not keyed by edition on purpose. Whether an edition works this way is one
 * decision, and it is already declared as the `cumulativeXp` capability in
 * types/edition.ts — the registry that every caller reads and that a new edition
 * cannot compile without answering. A second `Record<EditionSlug, …>` here would
 * be the same decision written twice, with nothing keeping the two in step.
 *
 * The Rookie band's own first tier (1-3) is absent: every model is recruited
 * onto it and nothing ever *moves onto* it, so a model starting on 1 first
 * advances at 4. Leaving it out of the data rather than filtering by starting XP
 * is what makes a starting_xp of 0 work — 0 and 1 both sit below the first entry
 * and yield the same count at every XP total. That matters, because 0 is a legal
 * starting value: N23 does not use Starting XP at all, and some N26 fighter
 * types genuinely start on 0.
 *
 * Legend of the Underhive (229) is entered like any other rank but has nothing
 * above it, so Advancement stops there — 20 in total.
 */
const N26_TIER_STARTS: readonly number[] = [
  4, 7, 10,
  13, 19, 25, 31,
  37, 49, 61, 73,
  85, 97, 109, 121,
  133, 157, 181, 205,
  229,
];

const tiersAtOrBelow = (xp: number): number =>
  N26_TIER_STARTS.filter((tierStart) => tierStart <= xp).length;

/**
 * How many Advancements a model has earned in total.
 *
 * Under a cumulative-XP edition `currentXp` is starting XP plus everything ever
 * awarded, and an Advancement is granted each time that total moves the model
 * onto a new rank.
 *
 * This is a range count rather than `currentXp - startingXp` because the tiers
 * widen as XP rises: rebasing to zero would put a Ganger recruited on 13 XP back
 * on the 3-wide Rookie track and advance them at twice the intended rate.
 */
export function advancementsEarnedFor(
  editionSlug: string | null | undefined,
  startingXp: number,
  currentXp: number,
): number {
  // Editions that spend XP on Advancements have no ranks, and an unresolved slug
  // means the edition failed to load — award nothing in either case.
  if (!hasCumulativeXp(editionSlug)) return 0;

  // XP below the recruitment value is only reachable by editing a fighter after
  // the fact; it means no Advancement, never a negative one.
  return Math.max(0, tiersAtOrBelow(currentXp) - tiersAtOrBelow(startingXp));
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
 * Advancements earned but not yet taken — the "Level Up" state the badge shows,
 * and the limit the add-advancement actions enforce. Derived on read from data
 * the caller already holds, so the badge and the limit cannot drift apart and
 * awarding XP needs no extra write.
 */
export function openAdvancementsFor(
  editionSlug: string | null | undefined,
  startingXp: number,
  currentXp: number,
  advancementsTaken: number,
): number {
  return Math.max(
    0,
    advancementsEarnedFor(editionSlug, startingXp, currentXp) - advancementsTaken,
  );
}
