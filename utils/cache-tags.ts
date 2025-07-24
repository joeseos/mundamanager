import { revalidateTag } from 'next/cache';

export const CACHE_TAGS = {
  // Existing tags
  FIGHTER_PAGE: (id: string) => `fighter-page-${id}`,
  GANG_OVERVIEW: (id: string) => `gang-overview-${id}`,
  GANG_FIGHTERS_LIST: (id: string) => `gang-fighters-${id}`,
  VEHICLE_EQUIPMENT: (id: string) => `vehicle-${id}-equipment`,
  VEHICLE_STATS: (id: string) => `vehicle-${id}-stats`,
  GANG_CREDITS: (id: string) => `gang-${id}-credits`,
  GANG_RATING: (id: string) => `gang-${id}-rating`,
  VEHICLE_PAGE: (id: string) => `vehicle-page-${id}`,
  FIGHTER_VEHICLE_DATA: (id: string) => `fighter-vehicle-${id}`,
  FIGHTER_TYPES_FOR_GANG: (id: string) => `fighter-types-gang-${id}`,
  
  // New granular fighter-level cache tags
  FIGHTER_DATA: (id: string) => `fighter-data-${id}`,
  FIGHTER_EQUIPMENT: (id: string) => `fighter-equipment-${id}`,
  FIGHTER_STATS: (id: string) => `fighter-stats-${id}`,
  FIGHTER_EFFECTS: (id: string) => `fighter-effects-${id}`,
  FIGHTER_SKILLS: (id: string) => `fighter-skills-${id}`,
  FIGHTER_OWNED_BEASTS: (id: string) => `fighter-owned-beasts-${id}`,
  
  // Gang composition tags (for adding/removing fighters without full refresh)
  GANG_FIGHTER_COUNT: (id: string) => `gang-fighter-count-${id}`,
  GANG_BEAST_COUNT: (id: string) => `gang-beast-count-${id}`,
} as const;

export function invalidateFighterData(fighterId: string, gangId: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(fighterId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
  // This automatically invalidates cached gang details via existing tags
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
  revalidateTag(CACHE_TAGS.FIGHTER_TYPES_FOR_GANG(gangId));
  // This automatically invalidates cached gang details via existing tags
}

// General gang data invalidation that includes fighter types
export function invalidateGangData(gangId: string) {
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
  revalidateTag(CACHE_TAGS.FIGHTER_TYPES_FOR_GANG(gangId));
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

// NEW GRANULAR CACHE INVALIDATION FUNCTIONS

// Invalidate fighter's equipment and related gang data
export function invalidateFighterEquipment(fighterId: string, gangId?: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_EQUIPMENT(fighterId));
  revalidateTag(CACHE_TAGS.FIGHTER_DATA(fighterId));
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(fighterId));
  
  // CRITICAL: Invalidate ALL gang cache tags that gang-details depends on
  if (gangId) {
    revalidateTag(CACHE_TAGS.GANG_CREDITS(gangId));        // Credits change
    revalidateTag(CACHE_TAGS.GANG_RATING(gangId));         // Rating changes  
    revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));       // Gang overview changes
    revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));  // Fighter equipment shows on cards
  }
}

// Add a new beast to gang without refreshing all fighters
export function addBeastToGangCache(beastId: string, gangId: string) {
  // Invalidate only the new beast's data and gang composition counts
  revalidateTag(CACHE_TAGS.FIGHTER_DATA(beastId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTER_COUNT(gangId));
  revalidateTag(CACHE_TAGS.GANG_BEAST_COUNT(gangId));
  revalidateTag(CACHE_TAGS.GANG_RATING(gangId));
  
  // DO invalidate GANG_FIGHTERS_LIST so new beasts appear on gang page
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(gangId));
}

// Invalidate fighter's owned beasts when they get new ones
export function invalidateFighterOwnedBeasts(ownerId: string, gangId: string) {
  revalidateTag(CACHE_TAGS.FIGHTER_OWNED_BEASTS(ownerId));
  revalidateTag(CACHE_TAGS.FIGHTER_DATA(ownerId));
  revalidateTag(CACHE_TAGS.GANG_RATING(gangId));
}

// Optimized equipment purchase invalidation
export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  // 1. Update only the fighter who got equipment
  invalidateFighterEquipment(params.fighterId, params.gangId);
  
  // 2. If beasts were created, add them without full refresh  
  if (params.createdBeasts && params.createdBeasts.length > 0) {
    // Update the owner's beast list
    invalidateFighterOwnedBeasts(params.fighterId, params.gangId);
    
    // Add each beast individually
    params.createdBeasts.forEach(beast => {
      addBeastToGangCache(beast.id, params.gangId);
    });
  }
}

// Optimized equipment deletion invalidation
export function invalidateEquipmentDeletion(params: {
  fighterId: string;
  gangId: string;
  deletedBeastIds?: string[];
}) {
  // 1. Update the fighter who lost equipment
  invalidateFighterEquipment(params.fighterId, params.gangId);
  
  // 2. If beasts were deleted, remove them
  if (params.deletedBeastIds && params.deletedBeastIds.length > 0) {
    invalidateFighterOwnedBeasts(params.fighterId, params.gangId);
    revalidateTag(CACHE_TAGS.GANG_FIGHTER_COUNT(params.gangId));
    revalidateTag(CACHE_TAGS.GANG_BEAST_COUNT(params.gangId));
  }
}