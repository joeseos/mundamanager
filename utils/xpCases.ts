import { EditionSlug } from '@/types/edition';

/**
 * Every XP award the Add XP modal can offer, across all editions.
 *
 * Ids are persisted: the modal writes them into the `xp_breakdown` payload on
 * fighter logs, and formatXpBreakdown reads them back long afterwards. An id is
 * therefore a permanent contract — labels can be reworded freely (log lines are
 * rendered at write time and never re-render), but an id must never be reused
 * or repurposed, and must never mean different things in different editions:
 * the formatter is server-side and has no edition context. That is why N26's
 * wider elite bonus is its own `eliteTargetBonus` rather than a relabelled
 * `leaderChampionBonus`.
 */
export type XpCaseId =
  | 'seriousInjury'
  | 'outOfAction'
  | 'leaderChampionBonus'
  | 'eliteTargetBonus'
  | 'vehicleWrecked'
  | 'rally'
  | 'assistance'
  | 'misc'
  | 'battleParticipation'
  | 'objectiveControl';

export interface XpCaseDef {
  label: string;
  /** XP granted per tick (checkbox) or per count (counter). */
  xp: number;
  /**
   * 'counter' awards can be earned repeatedly in one battle and render with
   * -/+ steppers; 'checkbox' awards are once-only and render below the
   * separator.
   */
  input: 'counter' | 'checkbox';
  /** Optional hint shown under the label once the count is above zero. */
  onSelectText?: (count: number) => string;
}

export const XP_CASES: Record<XpCaseId, XpCaseDef> = {
  seriousInjury: { label: 'Cause Serious Injury', xp: 1, input: 'counter' },
  outOfAction: {
    label: 'Cause OOA',
    xp: 2,
    input: 'counter',
    onSelectText: (count) => `Adds ${count} to the OOA count`,
  },
  leaderChampionBonus: { label: 'Leader/Champion', xp: 1, input: 'counter' },
  eliteTargetBonus: { label: 'Leader/Champion/Brute/Vehicle', xp: 1, input: 'counter' },
  vehicleWrecked: {
    label: 'Wreck Vehicle',
    xp: 2,
    input: 'counter',
    onSelectText: (count) => `Adds ${count} to the vehicle wrecked count`,
  },
  rally: { label: 'Successful Rally', xp: 1, input: 'counter' },
  assistance: { label: 'Provide Assistance', xp: 1, input: 'counter' },
  misc: { label: 'Misc.', xp: 1, input: 'counter' },
  battleParticipation: { label: 'Battle Participation', xp: 1, input: 'checkbox' },
  objectiveControl: { label: 'Controlled an Objective', xp: 1, input: 'checkbox' },
};

/**
 * The awards each edition offers, in render order.
 *
 * Keyed by EditionSlug on purpose: adding an edition is a compile error here
 * until it states its own awards, the same guarantee EDITION_CAPABILITIES gives
 * the capability flags. This is edition-keyed *data* rather than a behaviour
 * switch, so it lives in its own module and EditionCapabilities stays
 * boolean-only — the pattern set by utils/characteristicLimits.ts.
 */
const XP_AWARDS_BY_EDITION: Record<EditionSlug, readonly XpCaseId[]> = {
  n23: [
    'seriousInjury',
    'outOfAction',
    'leaderChampionBonus',
    'vehicleWrecked',
    'rally',
    'assistance',
    'misc',
    'battleParticipation',
  ],
  // N26 keeps N23's order but drops Rally, widens the elite bonus to Brutes and
  // Vehicles, and adds a once-per-battle objective award. Wrecking an enemy
  // Leader's vehicle stays 2 XP with the elite bonus ticked separately, mirroring
  // how OOA + Leader/Champion already works. Rules: the Receive Rewards step of
  // the Post-battle Sequence.
  n26: [
    'seriousInjury',
    'outOfAction',
    'eliteTargetBonus',
    'vehicleWrecked',
    'assistance',
    'misc',
    'battleParticipation',
    'objectiveControl',
  ],
};

/**
 * An unset or unrecognised slug offers no preset awards at all, matching
 * NO_CAPABILITIES in types/edition.ts. A missing slug means the edition failed
 * to load, and offering one edition's awards would invite logging XP under
 * rules that do not apply; the modal still accepts a manual amount.
 */
const NO_AWARDS: readonly XpCaseId[] = [];

export function xpAwardsFor(editionSlug: string | null | undefined): readonly XpCaseId[] {
  if (!editionSlug) return NO_AWARDS;

  return XP_AWARDS_BY_EDITION[editionSlug as EditionSlug] ?? NO_AWARDS;
}
