import { revalidateTag } from 'next/cache';

/**
 * Hierarchical Cache Tag System for Necromunda Gang Manager
 * 
 * Architecture:
 * - BASE: Raw database entities (rarely change, long cache lifetime)
 * - COMPUTED: Calculated values derived from base data  
 * - COMPOSITE: Multi-entity aggregated data
 * - USER_SCOPED: User-specific data isolated per user
 * - SHARED: Cross-page consistent data
 * 
 * Naming Convention: CATEGORY_ENTITY_SCOPE
 * Example: BASE_GANG_CREDITS, COMPUTED_GANG_RATING, SHARED_GANG_RATING
 */
export const CACHE_TAGS = {
  // =============================================================================
  // 1. BASE DATA TAGS - Raw database entities
  // =============================================================================
  
  // Gang base data
  BASE_GANG_BASIC: (id: string) => `base-gang-basic-${id}`,           // name, type, color, alignment, reputation, etc.
  BASE_GANG_CREDITS: (id: string) => `base-gang-credits-${id}`,       // credits only
  BASE_GANG_STASH: (id: string) => `base-gang-stash-${id}`,           // gang stash equipment
  BASE_GANG_VEHICLES: (id: string) => `base-gang-vehicles-${id}`,     // gang-owned vehicles
  BASE_GANG_POSITIONING: (id: string) => `base-gang-positioning-${id}`, // gang positioning data
  
  // Fighter base data
  BASE_FIGHTER_BASIC: (id: string) => `base-fighter-basic-${id}`,     // name, stats, basic info
  BASE_FIGHTER_EQUIPMENT: (id: string) => `base-fighter-equipment-${id}`, // equipment list
  BASE_FIGHTER_SKILLS: (id: string) => `base-fighter-skills-${id}`,   // skills list
  BASE_FIGHTER_EFFECTS: (id: string) => `base-fighter-effects-${id}`, // effects/injuries
  BASE_FIGHTER_VEHICLES: (id: string) => `base-fighter-vehicles-${id}`, // assigned vehicles
  BASE_FIGHTER_OWNED_BEASTS: (id: string) => `base-fighter-owned-beasts-${id}`, // exotic beasts owned by fighter
  BASE_FIGHTER_LOADOUTS: (id: string) => `base-fighter-loadouts-${id}`, // fighter equipment loadouts
  
  // Campaign base data
  BASE_CAMPAIGN_BASIC: (id: string) => `base-campaign-basic-${id}`,   // name, settings
  BASE_CAMPAIGN_MEMBERS: (id: string) => `base-campaign-members-${id}`, // gang memberships
  BASE_CAMPAIGN_TERRITORIES: (id: string) => `base-campaign-territories-${id}`, // territory control
  BASE_CAMPAIGN_ALLEGIANCES: (id: string) => `base-campaign-allegiances-${id}`, // campaign allegiances (predefined and custom)
  BASE_CAMPAIGN_RESOURCES: (id: string) => `base-campaign-resources-${id}`, // campaign resources (predefined and custom)
  
  // Vehicle base data
  BASE_VEHICLE_BASIC: (id: string) => `base-vehicle-basic-${id}`,     // vehicle stats
  BASE_VEHICLE_EQUIPMENT: (id: string) => `base-vehicle-equipment-${id}`, // vehicle equipment
  BASE_VEHICLE_EFFECTS: (id: string) => `base-vehicle-effects-${id}`, // vehicle effects
  
  // User base data
  BASE_USER_PROFILE: (id: string) => `base-user-profile-${id}`,       // username, role
  
  // =============================================================================
  // 2. COMPUTED DATA TAGS - Calculated values derived from base data
  // =============================================================================
  
  // Fighter computed values
  COMPUTED_FIGHTER_TOTAL_COST: (id: string) => `computed-fighter-cost-${id}`,     // base + equipment + skills + effects
  COMPUTED_FIGHTER_BEAST_COSTS: (id: string) => `computed-fighter-beasts-${id}`,  // owned exotic beasts costs
  
  // Gang computed values
  COMPUTED_GANG_RATING: (id: string) => `computed-gang-rating-${id}`,             // sum of all fighter costs
  COMPUTED_GANG_FIGHTER_COUNT: (id: string) => `computed-gang-fighter-count-${id}`, // active fighter count
  COMPUTED_GANG_VEHICLE_COUNT: (id: string) => `computed-gang-vehicle-count-${id}`, // vehicle count
  COMPUTED_GANG_BEAST_COUNT: (id: string) => `computed-gang-beast-count-${id}`,   // exotic beast count
  COMPUTED_GANG_FIGHTER_STATS: (id: string) => `computed-gang-fighter-stats-${id}`, // OOA caused + deaths suffered
  
  // Campaign computed values
  COMPUTED_CAMPAIGN_LEADERBOARD: (id: string) => `computed-campaign-leaderboard-${id}`, // gang rankings
  
  // =============================================================================
  // 3. COMPOSITE DATA TAGS - Multi-entity aggregated data
  // =============================================================================
  
  // Page-level aggregations (only for complex multi-entity aggregations)
  // DEPRECATED: COMPOSITE_GANG_FIGHTERS_LIST - Gang/fighter pages now use granular BASE tags instead.
  // Kept here for backward compatibility with existing invalidation helpers. Safe to remove in future cleanup.
  COMPOSITE_GANG_FIGHTERS_LIST: (id: string) => `composite-gang-fighters-${id}`,    // all fighters with equipment
  COMPOSITE_CAMPAIGN_OVERVIEW: (id: string) => `composite-campaign-overview-${id}`, // complete campaign data
  COMPOSITE_VEHICLE_PAGE: (id: string) => `composite-vehicle-page-${id}`,           // complete vehicle page data
  
  // Cross-entity relationships
  COMPOSITE_GANG_CAMPAIGNS: (id: string) => `composite-gang-campaigns-${id}`,       // campaigns this gang is in
  
  // =============================================================================
  // 4. USER-SCOPED TAGS - User-specific data isolated per user
  // =============================================================================
  
  // User-specific collections
  USER_GANGS: (userId: string) => `user-gangs-${userId}`,           // user's gang list
  USER_CAMPAIGNS: (userId: string) => `user-campaigns-${userId}`,   // user's campaigns
  USER_CUSTOMIZATIONS: (userId: string) => `user-custom-${userId}`, // custom equipment/territories

  // User permissions
  CHECK_PERMISSION: (userId: string, gangId: string) => `check-permission-${userId}-${gangId}`,

  // User dashboard data
  USER_DASHBOARD: (userId: string) => `user-dashboard-${userId}`,    // home page data
  
  // =============================================================================
  // 5. SHARED DATA TAGS - Cross-page consistent data
  // =============================================================================
  
  // Cross-page shared data (same data, multiple locations)
  SHARED_GANG_RATING: (id: string) => `shared-gang-rating-${id}`,   // gang page + campaign page + leaderboards
  SHARED_FIGHTER_COST: (id: string) => `shared-fighter-cost-${id}`, // fighter page + gang page
  SHARED_CAMPAIGN_GANG_LIST: (id: string) => `shared-campaign-gangs-${id}`, // campaign page + member pages
  SHARED_GANG_BASIC_INFO: (id: string) => `shared-gang-basic-${id}`, // gang name/color used across pages
  
  // =============================================================================
  // 6. GLOBAL REFERENCE DATA - Static/semi-static data
  // =============================================================================
  
  // Global reference data (rarely changes)
  GLOBAL_GANG_TYPES: () => `global-gang-types`,                       // gang type options
  GLOBAL_EQUIPMENT_CATALOG: () => `global-equipment-catalog`,         // equipment options
  GLOBAL_FIGHTER_TYPES: () => `global-fighter-types`,                 // fighter type options
  GLOBAL_TERRITORIES_LIST: () => `global-territories-list`,           // territory options
  GLOBAL_PATREON_SUPPORTERS: () => `global-patreon-supporters`,       // patreon supporters list
  GLOBAL_USER_COUNT: () => `global-user-count`,                       // total user count for homepage
  GLOBAL_GANG_COUNT: () => `global-gang-count`,                       // total gang count for homepage
  GLOBAL_CAMPAIGN_COUNT: () => `global-campaign-count`,               // total campaign count for homepage
  GLOBAL_GANG_ACTIVITY: () => `global-gang-activity`,                 // gang activity counts by period
  GLOBAL_CAMPAIGN_ACTIVITY: () => `global-campaign-activity`,         // campaign activity counts by period
  
  // Battle session data
  BASE_BATTLE_SESSION: (id: string) => `base-battle-session-${id}`,
  GANG_BATTLE_SESSIONS: (gangId: string) => `gang-battle-sessions-${gangId}`,

  // Gang-specific reference data
  GANG_FIGHTER_TYPES: (id: string) => `gang-fighter-types-${id}`,     // fighter types available to gang
  
  // =============================================================================
  // 7. LEGACY COMPATIBILITY TAGS - For smooth migration
  // =============================================================================
  
  // Maintained for backward compatibility during migration
  // REMOVED: FIGHTER_PAGE, GANG_OVERVIEW - use granular functions instead
  GANG_FIGHTERS_LIST: (id: string) => `composite-gang-fighters-${id}`, // → COMPOSITE_GANG_FIGHTERS_LIST
} as const;

// =============================================================================
// CACHE INVALIDATION FUNCTIONS - Surgical, pattern-based invalidation
// =============================================================================

/**
 * User gangs list invalidation (Home page gangs list).
 *
 * The home gangs list is cached via `CACHE_TAGS.USER_GANGS(userId)` and must be explicitly
 * revalidated when any gang list fields change (e.g. name, variants, rating, last_updated).
 */
export const invalidateUserGangsList = (userId: string) => {
  revalidateTag(CACHE_TAGS.USER_GANGS(userId), { expire: 0 });
};

/**
 * Equipment Purchase Invalidation Pattern
 * Triggered when: User buys equipment for fighter
 * Data changed: Fighter equipment, gang credits, gang rating, fighter cost
 */
export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId), { expire: 0 });
  invalidateGangCredits(params.gangId);
  
  // Computed data changes  
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId), { expire: 0 });
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId), { expire: 0 });
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
  
  // Beast creation handling
  if (params.createdBeasts?.length) {
    params.createdBeasts.forEach(beast => {
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(beast.id), { expire: 0 });
      // Fighter page data changes due to new beast
    });
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(params.fighterId), { expire: 0 });
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(params.gangId), { expire: 0 });
  }
}

/**
 * Fighter Advancement Invalidation Pattern
 * Triggered when: Fighter gains skill/effect/injury/stat increase
 * Data changed: Fighter skills/effects, fighter cost, gang rating
 */
export function invalidateFighterAdvancement(params: {
  fighterId: string;
  gangId: string;
  advancementType: 'skill' | 'effect' | 'injury' | 'stat';
}) {
  // Base data changes
  switch (params.advancementType) {
    case 'skill':
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_SKILLS(params.fighterId), { expire: 0 });
      break;
    case 'effect':
    case 'injury':
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(params.fighterId), { expire: 0 });
      break;
    case 'stat':
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighterId), { expire: 0 });
      break;
  }
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId), { expire: 0 });

  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId), { expire: 0 });

  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
}

/**
 * Campaign Membership Invalidation Pattern  
 * Triggered when: Gang joins/leaves campaign or role changes
 * Data changed: Campaign members, gang campaigns
 */
export function invalidateCampaignMembership(params: {
  campaignId: string;
  gangId: string;
  userId: string;
  action: 'join' | 'leave' | 'role_change';
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(params.campaignId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(params.gangId), { expire: 0 });
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_CAMPAIGN_LEADERBOARD(params.campaignId), { expire: 0 });
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_CAMPAIGN_GANG_LIST(params.campaignId), { expire: 0 });
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(params.campaignId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
  
  // User-scoped changes
  revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(params.userId), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_DASHBOARD(params.userId), { expire: 0 });
}

/**
 * Gang Creation Invalidation Pattern
 * Triggered when: User creates new gang
 * Data changed: User gangs, user dashboard
 */
export function invalidateGangCreation(params: {
  gangId: string;
  userId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_GANG_BASIC(params.gangId), { expire: 0 });
  invalidateGangCredits(params.gangId);
  // Note: Reputation is in BASE_GANG_BASIC, no separate cache needed
  
  // User-scoped changes
  revalidateTag(CACHE_TAGS.USER_GANGS(params.userId), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_DASHBOARD(params.userId), { expire: 0 });
  
  // Composite data (new gang page)
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
}

/**
 * Equipment Deletion Invalidation Pattern
 * Triggered when: Equipment sold/deleted from fighter
 * Data changed: Fighter equipment, gang credits, gang rating, fighter cost
 */
export function invalidateEquipmentDeletion(params: {
  fighterId: string;
  gangId: string;
  deletedBeastIds?: string[];
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId), { expire: 0 });
  invalidateGangCredits(params.gangId);
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId), { expire: 0 });
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId), { expire: 0 });
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
  
  // Beast deletion handling
  if (params.deletedBeastIds?.length) {
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(params.fighterId), { expire: 0 });
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(params.gangId), { expire: 0 });
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_BEAST_COUNT(params.gangId), { expire: 0 });
  }
}

/**
 * Fighter Addition Invalidation Pattern
 * Triggered when: New fighter added to gang
 * Data changed: Gang fighters list, gang rating, gang fighter count
 */
export function invalidateFighterAddition(params: {
  fighterId: string;
  gangId: string;
  userId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId), { expire: 0 });
  invalidateGangCredits(params.gangId);
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(params.gangId), { expire: 0 });

  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId), { expire: 0 });

  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
}

/**
 * Gang Stash Invalidation Pattern
 * Triggered when: Items added/removed from gang stash
 * Data changed: Gang stash, gang credits
 */
export function invalidateGangStash(params: {
  gangId: string;
  userId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_GANG_STASH(params.gangId), { expire: 0 });
  invalidateGangCredits(params.gangId);
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
}

/**
 * Campaign Territory Invalidation Pattern
 * Triggered when: Territory ownership changes in campaign
 * Data changed: Campaign territories, gang campaigns
 */
export function invalidateCampaignTerritory(params: {
  campaignId: string;
  gangId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(params.campaignId), { expire: 0 });
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(params.campaignId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });
}

/**
 * User Customization Invalidation Pattern
 * Triggered when: User creates/updates custom equipment/territories
 * Data changed: User customizations
 */
export function invalidateUserCustomizations(params: {
  userId: string;
}) {
  // User-scoped changes
  revalidateTag(CACHE_TAGS.USER_CUSTOMIZATIONS(params.userId), { expire: 0 });

  // Global reference data that includes custom content
  revalidateTag(CACHE_TAGS.GLOBAL_EQUIPMENT_CATALOG(), { expire: 0 });
  revalidateTag(CACHE_TAGS.GLOBAL_TERRITORIES_LIST(), { expire: 0 });
}

/**
 * Campaign Member Permissions Invalidation Pattern
 * Triggered when: Campaign role changes or membership changes affect permissions
 * Data changed: User permissions for campaigns
 */
export function invalidateCampaignMemberPermissions(params: {
  campaignId: string;
  userId: string;
}) {
  // Invalidate user's dashboard which might show permission-dependent UI
  revalidateTag(CACHE_TAGS.USER_DASHBOARD(params.userId), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(params.userId), { expire: 0 });
}

/**
 * Gang Permissions Invalidation Pattern
 * Triggered when: Specific gang's permission context changes
 * Data changed: Permissions for specific user-gang combination
 */
export function invalidatePermissionForUser(params: {
  userId: string;
  gangId: string;
}) {
  revalidateTag(CACHE_TAGS.CHECK_PERMISSION(params.userId, params.gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_DASHBOARD(params.userId), { expire: 0 });
}

// =============================================================================
// LEGACY COMPATIBILITY FUNCTIONS - For smooth migration
// =============================================================================

// Legacy function names maintained for backward compatibility
export const invalidateFighterData = (fighterId: string, gangId: string) => {
  invalidateFighterAdvancement({ fighterId, gangId, advancementType: 'stat' });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_STATS(gangId), { expire: 0 });
};

export const invalidateVehicleData = (vehicleId: string) => {
  revalidateTag(CACHE_TAGS.BASE_VEHICLE_EQUIPMENT(vehicleId), { expire: 0 });
  revalidateTag(CACHE_TAGS.BASE_VEHICLE_BASIC(vehicleId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_VEHICLE_PAGE(vehicleId), { expire: 0 });
};

export const invalidateGangCredits = (gangId: string) => {
  revalidateTag(CACHE_TAGS.BASE_GANG_CREDITS(gangId), { expire: 0 });
};

export const invalidateGangRating = (gangId: string) => {
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(gangId), { expire: 0 });
};

export const invalidateGangFinancials = (gangId: string) => {
  invalidateGangCredits(gangId);
  invalidateGangRating(gangId);
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.GANG_FIGHTER_TYPES(gangId), { expire: 0 });
};

export const invalidateGangData = (gangId: string) => {
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.GANG_FIGHTER_TYPES(gangId), { expire: 0 });
};

export const invalidateFighterDataWithFinancials = (fighterId: string, gangId: string) => {
  invalidateFighterData(fighterId, gangId);
  invalidateGangFinancials(gangId);
};

export const invalidateFighterVehicleData = (fighterId: string, gangId: string) => {
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_VEHICLES(fighterId), { expire: 0 });
  // Gang vehicles list changes when vehicles are assigned/unassigned
  revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(gangId), { expire: 0 });
  // Fighter total cost now depends on vehicles, so invalidate it too
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(fighterId), { expire: 0 });
  // Gang rating depends on fighter costs, so invalidate when vehicle costs change
  invalidateGangRating(gangId);
  // Fighter page data invalidated via granular tags
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId), { expire: 0 });
};

export const invalidateVehicleEffects = (vehicleId: string, fighterId: string | undefined, gangId: string) => {
  // Vehicle effects data (where lasting damages and hardpoints are stored)
  revalidateTag(CACHE_TAGS.BASE_VEHICLE_EFFECTS(vehicleId), { expire: 0 });
  // Fighter's vehicle data (includes effects) — skip when vehicle is unassigned
  if (fighterId) {
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_VEHICLES(fighterId), { expire: 0 });
  }
  // Gang fighters list (shows vehicle data)
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId), { expire: 0 });
};

export const invalidateVehicleRepair = (vehicleId: string, fighterId: string, gangId: string) => {
  // Vehicle effects (damages removed)
  invalidateVehicleEffects(vehicleId, fighterId, gangId);
  // Gang credits (repair costs money)
  invalidateGangCredits(gangId);
};

export const invalidateFighterEquipment = (fighterId: string, gangId?: string) => {
  if (gangId) {
    invalidateEquipmentPurchase({ fighterId, gangId });
  } else {
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(fighterId), { expire: 0 });
    // Fighter page data invalidated via granular tags
  }
};

export const addBeastToGangCache = (beastId: string, gangId: string) => {
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(beastId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_BEAST_COUNT(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(gangId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId), { expire: 0 });
};

export const invalidateFighterOwnedBeasts = (ownerId: string, gangId: string) => {
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(ownerId), { expire: 0 });
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(ownerId), { expire: 0 });
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(gangId), { expire: 0 });
};

/**
 * Fighter Loadouts Invalidation Pattern
 * Triggered when: Loadout created/updated/deleted or active loadout changed
 * Data changed: Fighter equipment display (loadout_cost for display only)
 * Note: Gang rating uses ALL equipment, so loadout changes don't affect it
 */
export function invalidateFighterLoadouts(params: {
  fighterId: string;
  gangId: string;
}) {
  // Base data changes - loadouts have their own dedicated cache tag
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_LOADOUTS(params.fighterId), { expire: 0 });
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighterId), { expire: 0 });  // for active_loadout_id

  // Composite data changes - gang page fighter cards (display only, not rating)
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId), { expire: 0 });

  // Note: COMPUTED_GANG_RATING and SHARED_GANG_RATING are NOT invalidated here
  // because gang rating uses ALL equipment regardless of loadout selection
  // Note: BASE_FIGHTER_EQUIPMENT is NOT invalidated here to avoid over-invalidation
}

/**
 * Patreon Supporters Invalidation Pattern
 * Triggered when: Webhook updates Patreon supporter data
 * Data changed: Global Patreon supporters list on about page
 */
export function invalidatePatreonSupporters() {
  revalidateTag(CACHE_TAGS.GLOBAL_PATREON_SUPPORTERS(), { expire: 0 });
}

/**
 * User Count Invalidation Pattern
 * Triggered when: New user registers or profile is created
 * Data changed: Global user count for homepage display
 */
export function invalidateUserCount() {
  revalidateTag(CACHE_TAGS.GLOBAL_USER_COUNT(), { expire: 0 });
}

/**
 * Gang Count Invalidation Pattern
 * Triggered when: Gang is created or deleted
 * Data changed: Global gang count for homepage display
 */
export function invalidateGangCount() {
  revalidateTag(CACHE_TAGS.GLOBAL_GANG_COUNT(), { expire: 0 });
}

/**
 * Campaign Count Invalidation Pattern
 * Triggered when: Campaign is created or deleted
 * Data changed: Global campaign count for homepage display
 */
export function invalidateCampaignCount() {
  revalidateTag(CACHE_TAGS.GLOBAL_CAMPAIGN_COUNT(), { expire: 0 });
}
