import { revalidateTag } from 'next/cache';

export const CACHE_TAGS = {
  FIGHTER_PAGE: (id: string) => `fighter-page-${id}`,
  GANG_OVERVIEW: (id: string) => `gang-overview-${id}`,
  GANG_FIGHTERS_LIST: (id: string) => `gang-fighters-${id}`,
  VEHICLE_EQUIPMENT: (id: string) => `vehicle-${id}-equipment`,
  VEHICLE_STATS: (id: string) => `vehicle-${id}-stats`,
  GANG_CREDITS: (id: string) => `gang-${id}-credits`,
  GANG_RATING: (id: string) => `gang-${id}-rating`,
  VEHICLE_PAGE: (id: string) => `vehicle-page-${id}`,
  FIGHTER_VEHICLE_DATA: (id: string) => `fighter-vehicle-${id}`,
} as const;

export function invalidateFighterData(fighterId: string, gangId: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(fighterId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
}

export function invalidateVehicleData(vehicleId: string) {
  revalidateTag(CACHE_TAGS.VEHICLE_EQUIPMENT(vehicleId));
  revalidateTag(CACHE_TAGS.VEHICLE_STATS(vehicleId));
  revalidateTag(CACHE_TAGS.VEHICLE_PAGE(vehicleId));
}

// Gang credit and rating invalidation functions
export function invalidateGangCredits(gangId: string) {
  revalidateTag(CACHE_TAGS.GANG_CREDITS(gangId));
}

export function invalidateGangRating(gangId: string) {
  revalidateTag(CACHE_TAGS.GANG_RATING(gangId));
}

export function invalidateGangFinancials(gangId: string) {
  invalidateGangCredits(gangId);
  invalidateGangRating(gangId);
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
}

// Enhanced fighter data invalidation that includes gang financials
export function invalidateFighterDataWithFinancials(fighterId: string, gangId: string) {
  invalidateFighterData(fighterId, gangId);
  invalidateGangFinancials(gangId);
}

// New function to invalidate fighter vehicle data specifically
export function invalidateFighterVehicleData(fighterId: string, gangId: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_VEHICLE_DATA(fighterId));
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(fighterId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
}