/**
 * Fighter status utility functions
 * 
 * These functions help determine fighter status relationships and whether
 * fighters count toward gang rating calculations.
 */

export interface FighterStatus {
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  captured?: boolean;
  recovery?: boolean;
  starved?: boolean;
}

/**
 * Determines if a fighter counts toward gang rating.
 * 
 * Fighters that COUNT toward rating:
 * - Fighters in recovery (still count)
 * - Fighters starved (still count)
 * - Normal active fighters
 * 
 * Fighters that DO NOT count toward rating:
 * - Killed fighters
 * - Enslaved fighters
 * - Retired fighters
 * - Captured fighters
 * 
 * @param fighter - Fighter status object
 * @returns true if fighter counts toward rating, false otherwise
 */
export function countsTowardRating(fighter: FighterStatus | null | undefined): boolean {
  if (!fighter) return false;
  return !fighter.killed && !fighter.retired && !fighter.enslaved && !fighter.captured;
}

/**
 * Whether a fighter card is collapsed. Recovery is included; captured is not
 * (a captured fighter still shows a full card).
 */
export function isCardInactive(fighter: FighterStatus | null | undefined): boolean {
  if (!fighter) return false;
  return !!(fighter.killed || fighter.retired || fighter.enslaved || fighter.recovery);
}

/**
 * The owner's primary status for pet/beast owner lines, or null when they
 * have none. One label, in this order: killed, retired, enslaved, captured,
 * recovery, then starved.
 *
 * Starved is included on purpose even though it does not collapse the pet
 * card: the suffix is how you see how the owner is doing, same as Recovery
 * or Captured on an otherwise expanded card.
 */
export function fighterStatusLabel(fighter: FighterStatus | null | undefined): string | null {
  if (!fighter) return null;
  if (fighter.killed) return 'Killed';
  if (fighter.retired) return 'Retired';
  if (fighter.enslaved) return 'Enslaved';
  if (fighter.captured) return 'Captured';
  if (fighter.recovery) return 'Recovery';
  if (fighter.starved) return 'Starved';
  return null;
}

/** `Name` or `Name (Recovery)` for pet/beast owner lines. */
export function formatOwnerDisplay(
  name: string | null | undefined,
  status?: string | null
): string | null {
  if (!name) return null;
  return status ? `${name} (${status})` : name;
}

/**
 * Whether a pet/beast card collapses from its owner's status label.
 * Maps the label back to flags and uses `isCardInactive`, so adding a
 * collapsing status there also collapses pets (Captured/Starved stay
 * expanded unless `isCardInactive` starts treating those flags as inactive).
 *
 * Print filters the owner's flags instead. They only disagree on legacy
 * rows that have both captured and recovery set (the label prefers Captured,
 * so the card stays expanded while print can still hide the pet).
 */
export function ownerStatusCollapsesCard(status: string | null | undefined): boolean {
  return isCardInactive({
    killed: status === 'Killed',
    retired: status === 'Retired',
    enslaved: status === 'Enslaved',
    captured: status === 'Captured',
    recovery: status === 'Recovery',
    starved: status === 'Starved',
  });
}

/** Print "inactive fighters" toggle: killed / retired / enslaved. */
export function isPrintInactive(fighter: FighterStatus | null | undefined): boolean {
  if (!fighter) return false;
  return !!(fighter.killed || fighter.enslaved || fighter.retired);
}

/**
 * Pets/beasts: copy the owner's current status label onto `owner_status`.
 * Call at render over the roster, not in each state updater.
 */
export function withPetOwnerStatus<
  T extends { id: string; owner_id?: string; owner_status?: string | null } & FighterStatus
>(fighters: T[]): T[] {
  const byId = new Map(fighters.map((f) => [f.id, f]));
  return fighters.map((f) => {
    if (!f.owner_id) return f;
    const ownerStatus = fighterStatusLabel(byId.get(f.owner_id));
    if (f.owner_status === ownerStatus) return f;
    return { ...f, owner_status: ownerStatus };
  });
}

/**
 * Columns to select on `fighters` for fighterCostTarget: the fighter's
 * status and, for an exotic beast, its owner's status.
 */
export const RATING_STATUS_COLUMNS = `
  killed, retired, enslaved, captured,
  beast_link:fighter_exotic_beasts!fk_fighter_pet_ownership (
    owner:fighters!fighter_exotic_beasts_fighter_owner_id_fkey (killed, retired, enslaved, captured)
  )
`;

/** A fighters row selected with RATING_STATUS_COLUMNS. */
export type FighterRatingStatus = FighterStatus & { beast_link?: unknown };

/**
 * Where a change to a fighter's cost goes: gang rating (and wealth), stash
 * value (wealth only), or nowhere.
 */
export type FighterCostTarget = 'rating' | 'stash' | 'none';

/**
 * Where costs added to this fighter (equipment, effects) go. Only an active
 * fighter's count toward rating, and an exotic beast's cost rolls into its
 * owner, so the owner must count too. A fighter kept in the stash by its item
 * (no owner, the Trazior Pattern Sentry Gun) is part of that item's stash value.
 */
export function fighterCostTarget(fighter: FighterRatingStatus | null | undefined): FighterCostTarget {
  // A many-to-one embed, so PostgREST returns an object; without generated
  // types supabase-js types it as an array.
  const beastLink = fighter?.beast_link as { owner: FighterStatus | null } | null | undefined;
  if (beastLink && !beastLink.owner) return 'stash';
  return countsTowardRating(fighter) && (!beastLink || countsTowardRating(beastLink.owner)) ? 'rating' : 'none';
}

/**
 * Where costs added to a vehicle (equipment, effects) go: its crew's target, or
 * stash value for a vehicle without crew, which counts toward wealth only.
 * crew is null only when the vehicle was read and has none; undefined (not read)
 * goes nowhere.
 */
export function vehicleCostTarget(crew: FighterStatus | null | undefined): FighterCostTarget {
  if (crew === undefined) return 'none';
  return crew ? fighterCostTarget(crew) : 'stash';
}

export function hasKilledStatusFlag(typeSpecificData: any): boolean {
  return typeSpecificData?.killed === 'true' || typeSpecificData?.killed === true;
}

/**
 * Determines if a fighter can be sent to recovery.
 * 
 * Recovery is mutually exclusive with: killed, enslaved, retired, and captured.
 * A fighter cannot be in recovery if they have any of these statuses.
 * 
 * @param fighter - Fighter status object
 * @returns true if fighter can be in recovery, false otherwise
 */
export function canBeInRecovery(fighter: FighterStatus | null | undefined): boolean {
  if (!fighter) return false;
  return !fighter.killed && !fighter.enslaved && !fighter.retired && !fighter.captured;
}

/**
 * Determines if a target status action is incompatible with the fighter's current status.
 * Used for UI button disabling logic.
 * 
 * @param fighter - Fighter status object
 * @param targetStatus - The status action being attempted
 * @returns true if the action is incompatible (should be disabled), false otherwise
 */
export function isStatusIncompatible(
  fighter: FighterStatus | null | undefined,
  targetStatus: 'kill' | 'retire' | 'enslave' | 'capture' | 'recovery'
): boolean {
  if (!fighter) return false;
  
  switch (targetStatus) {
    case 'kill':
      // Can't kill if already retired, enslaved, or captured
      // Can kill if in recovery
      // But can always resurrect (toggle off)
      return !fighter.killed && !!(fighter.retired || fighter.enslaved || fighter.captured);
    
    case 'retire':
      // Can't retire if already killed, enslaved, captured, or in recovery
      // But can always unretire (toggle off)
      return !fighter.retired && !!(fighter.killed || fighter.enslaved || fighter.captured || fighter.recovery);
    
    case 'enslave':
      // Can't enslave if already killed, retired, captured, or in recovery
      // But can always release from Guilders
      return !fighter.enslaved && !!(fighter.killed || fighter.retired || fighter.captured || fighter.recovery);
    
    case 'capture':
      // Can't capture if already killed, retired, enslaved, or in recovery
      // But can always rescue from captivity
      return !fighter.captured && !!(fighter.killed || fighter.retired || fighter.enslaved || fighter.recovery);
    
    case 'recovery':
      // Can't send to recovery if already killed, enslaved, retired, or captured
      // But can always recover (toggle off)
      return !!(fighter.killed || fighter.enslaved || fighter.retired || fighter.captured);
    
    default:
      return false;
  }
}

