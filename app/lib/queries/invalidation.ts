import { revalidateTag } from 'next/cache';
import { cacheKeys } from './keys';

// =============================================================================
// CACHE INVALIDATION FUNCTIONS - For use in server actions
// =============================================================================

/**
 * Fighter Equipment Purchase Invalidation
 * Triggered when: Equipment purchased for fighter
 */
export function invalidateFighterEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
}) {
  revalidateTag(cacheKeys.fighters.equipment(params.fighterId));
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.credits(params.gangId));
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Fighter Equipment Deletion Invalidation
 * Triggered when: Equipment sold/deleted from fighter
 */
export function invalidateFighterEquipmentDeletion(params: {
  fighterId: string;
  gangId: string;
}) {
  revalidateTag(cacheKeys.fighters.equipment(params.fighterId));
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.credits(params.gangId));
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Fighter Status Change Invalidation
 * Triggered when: Fighter killed/retired/enslaved/rescued etc.
 */
export function invalidateFighterStatusChange(params: {
  fighterId: string;
  gangId: string;
}) {
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.fighterCount(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Fighter XP/Details Update Invalidation
 * Triggered when: Fighter XP, name, stats, etc. updated
 */
export function invalidateFighterDetailsUpdate(params: {
  fighterId: string;
  gangId: string;
}) {
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Fighter Skills/Effects Change Invalidation
 * Triggered when: Fighter gains/loses skills or effects
 */
export function invalidateFighterSkillsEffects(params: {
  fighterId: string;
  gangId: string;
  type: 'skills' | 'effects' | 'both';
}) {
  if (params.type === 'skills' || params.type === 'both') {
    revalidateTag(cacheKeys.fighters.skills(params.fighterId));
  }
  if (params.type === 'effects' || params.type === 'both') {
    revalidateTag(cacheKeys.fighters.effects(params.fighterId));
  }
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Fighter Vehicles Change Invalidation
 * Triggered when: Vehicle assigned/unassigned to fighter
 */
export function invalidateFighterVehicles(params: {
  fighterId: string;
  gangId: string;
  vehicleId?: string;
}) {
  revalidateTag(cacheKeys.fighters.vehicles(params.fighterId));
  revalidateTag(cacheKeys.fighters.detail(params.fighterId));
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
  
  if (params.vehicleId) {
    revalidateTag(cacheKeys.vehicles.detail(params.vehicleId));
  }
}

/**
 * Gang Credits Change Invalidation
 * Triggered when: Gang credits updated
 */
export function invalidateGangCredits(params: {
  gangId: string;
}) {
  revalidateTag(cacheKeys.gangs.credits(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Gang Resources Change Invalidation
 * Triggered when: Gang meat, reputation, scavenging rolls updated
 */
export function invalidateGangResources(params: {
  gangId: string;
}) {
  revalidateTag(cacheKeys.gangs.resources(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Gang Rating Change Invalidation
 * Triggered when: Gang rating recalculated
 */
export function invalidateGangRating(params: {
  gangId: string;
}) {
  revalidateTag(cacheKeys.gangs.rating(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Gang Stash Change Invalidation
 * Triggered when: Items added/removed from gang stash
 */
export function invalidateGangStash(params: {
  gangId: string;
}) {
  revalidateTag(cacheKeys.gangs.stash(params.gangId));
  revalidateTag(cacheKeys.gangs.credits(params.gangId));
  revalidateTag(cacheKeys.gangs.detail(params.gangId));
}

/**
 * Vehicle Damage/Equipment Change Invalidation
 * Triggered when: Vehicle equipment or damage changed
 */
export function invalidateVehicleChange(params: {
  vehicleId: string;
  fighterId?: string;
  gangId?: string;
  type: 'equipment' | 'damage' | 'both';
}) {
  if (params.type === 'equipment' || params.type === 'both') {
    revalidateTag(cacheKeys.vehicles.equipment(params.vehicleId));
  }
  if (params.type === 'damage' || params.type === 'both') {
    revalidateTag(cacheKeys.vehicles.effects(params.vehicleId));
  }
  revalidateTag(cacheKeys.vehicles.detail(params.vehicleId));
  
  if (params.fighterId) {
    revalidateTag(cacheKeys.fighters.vehicles(params.fighterId));
  }
  if (params.gangId) {
    revalidateTag(cacheKeys.gangs.rating(params.gangId));
  }
}

/**
 * Beast Owner Cache Invalidation
 * Triggered when: Exotic beast status changes, affecting owner's total cost
 */
export async function invalidateBeastOwnerCache(
  beastId: string, 
  _gangId: string, 
  supabase: any
) {
  // Check if this fighter is an exotic beast owned by another fighter
  const { data: ownerData } = await supabase
    .from('fighter_exotic_beasts')
    .select('fighter_owner_id')
    .eq('fighter_pet_id', beastId)
    .single();
    
  if (ownerData) {
    // Invalidate the owner's cache since their total cost changed
    revalidateTag(cacheKeys.fighters.detail(ownerData.fighter_owner_id));
    revalidateTag(cacheKeys.fighters.totalCost(ownerData.fighter_owner_id));
  }
}

// =============================================================================
// LEGACY COMPATIBILITY - Simple function names for common operations
// =============================================================================

export const invalidateFighter = (fighterId: string) => {
  revalidateTag(cacheKeys.fighters.detail(fighterId));
};

export const invalidateGang = (gangId: string) => {
  revalidateTag(cacheKeys.gangs.detail(gangId));
};

export const invalidateVehicle = (vehicleId: string) => {
  revalidateTag(cacheKeys.vehicles.detail(vehicleId));
};