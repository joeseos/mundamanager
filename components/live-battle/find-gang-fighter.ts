import type { GangFighter } from '@/types/gang';

/** Match a roster entry by fighter id and loadout, falling back to the first row for that fighter. */
export function findGangFighter(
  list: GangFighter[],
  fighterId: string,
  loadoutId?: string | null,
): GangFighter | undefined {
  return list.find((gf) => gf.id === fighterId && gf.active_loadout_id === (loadoutId ?? undefined))
    ?? list.find((gf) => gf.id === fighterId);
}
