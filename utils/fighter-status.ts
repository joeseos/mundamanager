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
      // Can't kill if already retired, enslaved, captured, or in recovery
      // But can always resurrect (toggle off)
      return !fighter.killed && !!(fighter.retired || fighter.enslaved || fighter.captured || fighter.recovery);
    
    case 'retire':
      // Can't retire if already killed, enslaved, captured, or in recovery
      // But can always unretire (toggle off)
      return !fighter.retired && !!(fighter.killed || fighter.enslaved || fighter.captured || fighter.recovery);
    
    case 'enslave':
      // Can't enslave if already killed, retired, captured, or in recovery
      // But can always rescue (toggle off)
      return !fighter.enslaved && !!(fighter.killed || fighter.retired || fighter.captured || fighter.recovery);
    
    case 'capture':
      // Can't capture if already killed, retired, enslaved, or in recovery
      // But can always rescue (toggle off)
      return !fighter.captured && !!(fighter.killed || fighter.retired || fighter.enslaved || fighter.recovery);
    
    case 'recovery':
      // Can't send to recovery if already killed, enslaved, retired, or captured
      // But can always recover (toggle off)
      return !!(fighter.killed || fighter.enslaved || fighter.retired || fighter.captured);
    
    default:
      return false;
  }
}

