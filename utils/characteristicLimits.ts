import { EditionSlug } from '@/types/edition';

/**
 * Legal range for each characteristic, keyed by the short display code used in
 * the stat tables ('M', 'WS', 'Sv', …).
 *
 * A tuple is [numeric low, numeric high] — NOT [worst, best]. For target-number
 * characteristics the low end is the *better* value ('2+' beats '6+'), so
 * `Ld: ['3+', '10+']` reads as "3 to 10". Consumers only parse the leading
 * integer, so `'6+'` and `6` compare identically; each entry is written in
 * whichever form its rulebook table uses.
 */
export type CharacteristicLimits = Record<string, [string | number, string | number]>;

const N23_FIGHTER_LIMITS: CharacteristicLimits = {
  M: ['1"', '8"'],
  WS: ['2+', '6+'],
  BS: ['2+', '6+'],
  S: [1, 6],
  T: [1, 6],
  W: [1, 6],
  I: ['2+', '6+'],
  A: [1, 10],
  Sv: ['2+', '6+'],
  Ld: ['3+', '10+'],
  Cl: ['3+', '10+'],
  Wil: ['3+', '10+'],
  Int: ['3+', '10+'],
};

const N26_FIGHTER_LIMITS: CharacteristicLimits = {
  M: ['1"', '12"'],
  WS: ['2+', '6+'],
  BS: ['2+', '6+'],
  S: [1, 10],
  T: [1, 10],
  W: [0, 10],
  I: [1, 10],
  A: [1, 10],
  Sv: ['3+', '6+'],
  Ld: [4, 10],
  Cl: [4, 10],
  Wil: [4, 10],
  Int: [4, 10],
};

// Vehicles: no N26 vehicle rules published yet, so both editions share this table.
const CREW_LIMITS: CharacteristicLimits = {
  M: ['1"', '12"'],
  Front: [3, 10],
  Side: [3, 10],
  Rear: [3, 10],
  HP: [1, 8],
  Hnd: ['3+', '10+'],
  Sv: ['2+', '6+'],
  BS: ['2+', '6+'],
  Ld: ['3+', '10+'],
  Cl: ['3+', '10+'],
  Wil: ['3+', '10+'],
  Int: ['3+', '10+'],
};

/**
 * Keyed by EditionSlug on purpose: adding an edition is a compile error here
 * until it states its own limits, the same guarantee EDITION_CAPABILITIES gives
 * for the capability flags.
 */
const LIMITS_BY_EDITION: Record<EditionSlug, { fighter: CharacteristicLimits; crew: CharacteristicLimits }> = {
  n23: { fighter: N23_FIGHTER_LIMITS, crew: CREW_LIMITS },
  n26: { fighter: N26_FIGHTER_LIMITS, crew: CREW_LIMITS },
};

/**
 * An unset or unrecognised slug gets no limits at all, so callers find no entry
 * and flag nothing — matching how the capability registry answers. A missing
 * slug means the edition failed to load, and quietly applying one edition's
 * ranges would mark correct stats as illegal.
 */
const NO_LIMITS: CharacteristicLimits = {};

export function characteristicLimitsFor(
  editionSlug: string | null | undefined,
  isCrew: boolean,
): CharacteristicLimits {
  if (!editionSlug) return NO_LIMITS;

  const limits = LIMITS_BY_EDITION[editionSlug as EditionSlug];
  if (!limits) return NO_LIMITS;

  return isCrew ? limits.crew : limits.fighter;
}
