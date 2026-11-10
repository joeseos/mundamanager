import type { GangFighter } from "@/types/gang";

/**
 * A fighter's roster summary for the public data endpoints: the gang endpoint
 * lists one per fighter, and the fighter endpoint starts from it
 */
export function transformFighterSummaryForData(fighter: GangFighter) {
  return {
    id: fighter.id,
    name: fighter.fighter_name ?? '',
    type: fighter.fighter_type,
    subtypes: fighter.fighter_subtypes ?? [],
    cost: fighter.credits,
    xp: fighter.xp ?? 0,
    kills: fighter.kills,
    is_vehicle: fighter.is_vehicle ?? false,
    killed: fighter.killed,
    retired: fighter.retired,
    enslaved: fighter.enslaved,
    recovery: fighter.recovery,
    captured: fighter.captured,
    starved: fighter.starved
  };
}
