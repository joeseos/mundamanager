import { revalidateTag } from 'next/cache';

export const CACHE_TAGS = {
  FIGHTER_PAGE: (id: string) => `fighter-page-${id}`,
  GANG_OVERVIEW: (id: string) => `gang-overview-${id}`,
  GANG_FIGHTERS_LIST: (id: string) => `gang-fighters-${id}`,
  VEHICLE_EQUIPMENT: (id: string) => `vehicle-${id}-equipment`,
  VEHICLE_STATS: (id: string) => `vehicle-${id}-stats`,
} as const;

export function invalidateFighterData(fighterId: string, gangId: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(fighterId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
}

export function invalidateVehicleData(vehicleId: string) {
  revalidateTag(CACHE_TAGS.VEHICLE_EQUIPMENT(vehicleId));
  revalidateTag(CACHE_TAGS.VEHICLE_STATS(vehicleId));
}