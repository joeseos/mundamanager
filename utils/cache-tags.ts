import { revalidateTag } from 'next/cache';

/**
 * Cache Tag System for Munda Manager
 *
 * Entity-scoped tags: each piece of data has ONE authoritative cached home
 * per key space (gang bundle, campaign entries, user lists), and every
 * additional displayed copy carries a tag its write path provably fires —
 * from a choke point, not hand-written per call site.
 *
 * Read side                                  | Busted by
 * -------------------------------------------|------------------------------
 * gang-{id}        gang core + fighters      | any gang/fighter mutation
 * gang-overview-{id} name/rating/wealth/     | updateGangFinancials (choke
 *                  credits copies on other   | point) + gang name/reputation
 *                  pages (campaign, home)    | edits — NOT xp/image/loadouts
 * gang-campaigns-{id} gang's campaigns bundle| join/leave/allegiance changes
 * gang-positioning-{id} card positioning     | drag/reorder only
 * gang-stash-{id}  stash equipment           | stash mutations
 * fighter-{id}     id→gang resolver +        | fighter mutations (always
 *                  advancement caches        | alongside gang-{id})
 * campaign-{id}    all campaign-page entries | campaign mutations
 * user-{id}        profile/gang list/        | profile, list, social
 *                  campaign list/friends     | mutations
 * custom-{id}      custom content            | customise mutations
 */
export const TAGS = {
  gang: (id: string) => `gang-${id}`,
  gangOverview: (id: string) => `gang-overview-${id}`,
  gangCampaigns: (id: string) => `gang-campaigns-${id}`,
  gangPositioning: (id: string) => `gang-positioning-${id}`,
  gangStash: (id: string) => `gang-stash-${id}`,
  fighter: (id: string) => `fighter-${id}`,
  campaign: (id: string) => `campaign-${id}`,
  user: (id: string) => `user-${id}`,
  customs: (userId: string) => `custom-${userId}`,
  permission: (userId: string, gangId: string) => `check-permission-${userId}-${gangId}`,

  // Battle sessions keep their own namespace: live battles mutate frequently
  // and must not thrash the gang bundles.
  battleSession: (id: string) => `base-battle-session-${id}`,
  gangBattleSessions: (gangId: string) => `gang-battle-sessions-${gangId}`,

  // Global reference data
  globalGangTypes: () => 'global-gang-types',
  globalFighterTypes: () => 'global-fighter-types',
  globalTerritories: () => 'global-territories-list',
  globalScenarios: () => 'global-scenarios',
  globalTradingPostTypes: () => 'global-trading-post-types',
  globalPatreonSupporters: () => 'global-patreon-supporters',
  globalUserCount: () => 'global-user-count',
  globalGangCount: () => 'global-gang-count',
  globalCampaignCount: () => 'global-campaign-count',
  globalGangActivity: () => 'global-gang-activity',
  globalCampaignActivity: () => 'global-campaign-activity',
  campaignTypes: () => 'campaign-types',
  campaignTriumphs: (campaignTypeId: string) => `campaign-triumphs-${campaignTypeId}`,
  advancementCategories: () => 'advancement-categories',
  availableSkills: () => 'available-skills',
  availableInjuries: () => 'available-injuries',
} as const;

const bust = (tag: string) => revalidateTag(tag, { expire: 0 });

// =============================================================================
// CANONICAL INVALIDATION API
// =============================================================================

/** Any gang-shaped data changed (gang core row and/or its fighters). */
export const invalidateGang = (gangId: string) => {
  bust(TAGS.gang(gangId));
};

/** A fighter changed. Always busts the owning gang's bundle too. */
export const invalidateFighter = (fighterId: string, gangId: string) => {
  bust(TAGS.fighter(fighterId));
  bust(TAGS.gang(gangId));
};

/**
 * The gang's cross-page display fields changed (name/rating/wealth/credits/
 * reputation). Fired automatically by updateGangFinancials — do NOT call by
 * hand from actions unless the action changes those fields without going
 * through the financials helper (e.g. gang rename).
 */
export const invalidateGangOverview = (gangId: string) => {
  bust(TAGS.gangOverview(gangId));
};

/** The gang joined/left a campaign or its allegiance changed. */
export const invalidateGangCampaignMembership = (gangId: string) => {
  bust(TAGS.gangCampaigns(gangId));
};

/** Positioning drag only — never rebuilds the fighters bundle. */
export const invalidateGangPositioning = (gangId: string) => {
  bust(TAGS.gangPositioning(gangId));
};

/** Campaign content changed (settings/territories/resources/allegiances/…). */
export const invalidateCampaign = (campaignId: string) => {
  bust(TAGS.campaign(campaignId));
};

/**
 * A campaign↔gang relationship changed (join/leave, territory ownership,
 * gang allegiance, gang resources).
 */
export const invalidateCampaignGang = (campaignId: string, gangId: string) => {
  bust(TAGS.campaign(campaignId));
  bust(TAGS.gangCampaigns(gangId));
};

/** User-scoped data changed (profile, gang/campaign lists, friends, favourites). */
export const invalidateUser = (userId: string) => {
  bust(TAGS.user(userId));
};

/** User custom content changed (equipment/skills/fighters/gang types/TPs/collections). */
export const invalidateUserCustoms = (userId: string) => {
  bust(TAGS.customs(userId));
};

/** Permission context for a user-gang pair changed. */
export const invalidatePermission = (userId: string, gangId: string) => {
  bust(TAGS.permission(userId, gangId));
};

/** Battle session data changed for a gang. */
export const invalidateBattleSessions = (gangId: string) => {
  bust(TAGS.gangBattleSessions(gangId));
};

// =============================================================================
// LEGACY TAG FACTORIES (aliased onto the new tags)
//
// Both cache reads (`tags:` arrays) and writes (`revalidateTag`) go through
// these factories, so redefining the bodies migrates every call site at once.
// Cached functions whose tag strings changed got a `-v2` keyParts suffix so
// stale persisted entries (carrying the old tag strings) can't be served.
// These aliases are deleted in the final cleanup sweep once call sites are
// moved to TAGS / the canonical API above.
// =============================================================================

export const CACHE_TAGS = {
  // Gang → gang-{id}
  BASE_GANG_BASIC: TAGS.gang,
  BASE_GANG_CREDITS: TAGS.gang,
  BASE_GANG_VEHICLES: TAGS.gang,
  COMPUTED_GANG_RATING: TAGS.gang,
  COMPUTED_GANG_FIGHTER_COUNT: TAGS.gang,
  COMPUTED_GANG_VEHICLE_COUNT: TAGS.gang,
  COMPUTED_GANG_BEAST_COUNT: TAGS.gang,
  COMPUTED_GANG_FIGHTER_STATS: TAGS.gang,
  COMPOSITE_GANG_FIGHTERS_LIST: TAGS.gang,

  // Gang carve-outs
  BASE_GANG_POSITIONING: TAGS.gangPositioning,
  BASE_GANG_STASH: TAGS.gangStash,
  COMPOSITE_GANG_CAMPAIGNS: TAGS.gangCampaigns,
  SHARED_GANG_RATING: TAGS.gangOverview,
  SHARED_GANG_BASIC_INFO: TAGS.gangOverview,

  // Fighter → fighter-{id}
  BASE_FIGHTER_BASIC: TAGS.fighter,
  BASE_FIGHTER_EQUIPMENT: TAGS.fighter,
  BASE_FIGHTER_SKILLS: TAGS.fighter,
  BASE_FIGHTER_EFFECTS: TAGS.fighter,
  BASE_FIGHTER_VEHICLES: TAGS.fighter,
  BASE_FIGHTER_OWNED_BEASTS: TAGS.fighter,
  BASE_FIGHTER_EXOTIC_BEAST: TAGS.fighter,
  BASE_FIGHTER_LOADOUTS: TAGS.fighter,
  COMPUTED_FIGHTER_TOTAL_COST: TAGS.fighter,
  COMPUTED_FIGHTER_BEAST_COSTS: TAGS.fighter,
  SHARED_FIGHTER_COST: TAGS.fighter,

  // Campaign → campaign-{id}
  BASE_CAMPAIGN_BASIC: TAGS.campaign,
  BASE_CAMPAIGN_MEMBERS: TAGS.campaign,
  BASE_CAMPAIGN_TERRITORIES: TAGS.campaign,
  BASE_CAMPAIGN_ALLEGIANCES: TAGS.campaign,
  BASE_CAMPAIGN_RESOURCES: TAGS.campaign,
  COMPOSITE_CAMPAIGN_OVERVIEW: TAGS.campaign,
  SHARED_CAMPAIGN_GANG_LIST: TAGS.campaign,

  // User → user-{id}
  BASE_USER_PROFILE: TAGS.user,
  USER_GANGS: TAGS.user,
  USER_CAMPAIGNS: TAGS.user,
  USER_FRIENDS: TAGS.user,
  USER_DASHBOARD: TAGS.user,

  // Custom content → custom-{userId}
  USER_CUSTOM_EQUIPMENT: TAGS.customs,
  USER_CUSTOM_SKILLS: TAGS.customs,
  USER_CUSTOM_FIGHTERS: TAGS.customs,
  USER_CUSTOM_GANG_TYPES: TAGS.customs,
  USER_CUSTOM_TRADING_POSTS: TAGS.customs,
  USER_CUSTOM_COLLECTIONS: TAGS.customs,

  // Unchanged namespaces
  CHECK_PERMISSION: TAGS.permission,
  BASE_BATTLE_SESSION: TAGS.battleSession,
  GANG_BATTLE_SESSIONS: TAGS.gangBattleSessions,
  GLOBAL_GANG_TYPES: TAGS.globalGangTypes,
  GLOBAL_FIGHTER_TYPES: TAGS.globalFighterTypes,
  GLOBAL_TERRITORIES_LIST: TAGS.globalTerritories,
  GLOBAL_PATREON_SUPPORTERS: TAGS.globalPatreonSupporters,
  GLOBAL_USER_COUNT: TAGS.globalUserCount,
  GLOBAL_GANG_COUNT: TAGS.globalGangCount,
  GLOBAL_CAMPAIGN_COUNT: TAGS.globalCampaignCount,
  GLOBAL_GANG_ACTIVITY: TAGS.globalGangActivity,
  GLOBAL_CAMPAIGN_ACTIVITY: TAGS.globalCampaignActivity,
} as const;

// =============================================================================
// LEGACY INVALIDATION HELPERS (thin wrappers over the canonical API)
//
// Kept so the ~46 action files keep compiling; the cleanup sweep replaces
// their call sites with the canonical API and deletes them.
// =============================================================================

export const invalidateUserGangsList = (userId: string) => {
  invalidateUser(userId);
};

export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  invalidateFighter(params.fighterId, params.gangId);
  params.createdBeasts?.forEach(beast => bust(TAGS.fighter(beast.id)));
}

export function invalidateFighterAdvancement(params: {
  fighterId: string;
  gangId: string;
  advancementType: 'skill' | 'effect' | 'injury' | 'stat';
}) {
  invalidateFighter(params.fighterId, params.gangId);
}

export function invalidateCampaignMembership(params: {
  campaignId: string;
  gangId: string;
  userId: string;
  action: 'join' | 'leave' | 'role_change';
}) {
  invalidateCampaignGang(params.campaignId, params.gangId);
  invalidateUser(params.userId);
}

export function invalidateGangCreation(params: {
  gangId: string;
  userId: string;
}) {
  invalidateGang(params.gangId);
  invalidateUser(params.userId);
}

export function invalidateEquipmentDeletion(params: {
  fighterId: string;
  gangId: string;
  deletedBeastIds?: string[];
}) {
  invalidateFighter(params.fighterId, params.gangId);
  params.deletedBeastIds?.forEach(beastId => bust(TAGS.fighter(beastId)));
}

export function invalidateFighterAddition(params: {
  fighterId: string;
  gangId: string;
  userId: string;
}) {
  invalidateFighter(params.fighterId, params.gangId);
  invalidateUser(params.userId);
}

/**
 * Stash contents changed. Accepts the legacy `{ gangId, userId }` object
 * (which also busts the gang-wide caches, matching the old behavior) or a
 * plain gangId string for the stash entry only.
 */
export function invalidateGangStash(params: string | { gangId: string; userId?: string }) {
  const gangId = typeof params === 'string' ? params : params.gangId;
  bust(TAGS.gangStash(gangId));
  if (typeof params !== 'string') {
    invalidateGang(gangId);
  }
}

export function invalidateCampaignTerritory(params: {
  campaignId: string;
  gangId: string;
}) {
  invalidateCampaignGang(params.campaignId, params.gangId);
}

export function invalidateUserCustomizations() {
  bust(TAGS.globalTerritories());
}

export function invalidateCampaignMemberPermissions(params: {
  campaignId: string;
  userId: string;
}) {
  invalidateUser(params.userId);
}

export function invalidatePermissionForUser(params: {
  userId: string;
  gangId: string;
}) {
  invalidatePermission(params.userId, params.gangId);
  invalidateUser(params.userId);
}

export const invalidateFighterData = (fighterId: string, gangId: string) => {
  invalidateFighter(fighterId, gangId);
};

/** Credits changed. Credits are shown cross-page, so overview fires too. */
export const invalidateGangCredits = (gangId: string) => {
  invalidateGang(gangId);
  invalidateGangOverview(gangId);
};

export const invalidateGangRating = (gangId: string) => {
  invalidateGang(gangId);
  invalidateGangOverview(gangId);
};

/**
 * THE financials choke point: called by updateGangFinancials for every
 * rating/credits/wealth write in the app (43 call sites), so campaign
 * standings and home cards refresh exactly when those fields change.
 */
export const invalidateGangFinancials = (gangId: string) => {
  invalidateGang(gangId);
  invalidateGangOverview(gangId);
};

export const invalidateFighterDataWithFinancials = (fighterId: string, gangId: string) => {
  invalidateFighter(fighterId, gangId);
  invalidateGangOverview(gangId);
};

export const invalidateFighterVehicleData = (fighterId: string, gangId: string) => {
  invalidateFighter(fighterId, gangId);
  invalidateGangOverview(gangId);
};

export const invalidateVehicleEffects = (fighterId: string | undefined, gangId: string) => {
  if (fighterId) {
    bust(TAGS.fighter(fighterId));
  }
  invalidateGang(gangId);
};

export const invalidateVehicleRepair = (fighterId: string, gangId: string) => {
  invalidateFighter(fighterId, gangId);
  invalidateGangOverview(gangId);
};

export const invalidateFighterEquipment = (fighterId: string, gangId: string) => {
  invalidateFighter(fighterId, gangId);
};

export const addBeastToGangCache = (beastId: string, gangId: string) => {
  invalidateFighter(beastId, gangId);
};

export const invalidateFighterOwnedBeasts = (ownerId: string, gangId: string) => {
  invalidateFighter(ownerId, gangId);
};

export function invalidateFighterLoadouts(params: {
  fighterId: string;
  gangId: string;
}) {
  invalidateFighter(params.fighterId, params.gangId);
}

export function invalidatePatreonSupporters() {
  bust(TAGS.globalPatreonSupporters());
}

export function invalidateUserCount() {
  bust(TAGS.globalUserCount());
}

export function invalidateGangCount() {
  bust(TAGS.globalGangCount());
}

export function invalidateCampaignCount() {
  bust(TAGS.globalCampaignCount());
}

export function invalidateUserProfile(userId: string) {
  invalidateUser(userId);
}

export const invalidateUserCustomEquipment = invalidateUserCustoms;
export const invalidateUserCustomSkills = invalidateUserCustoms;
export const invalidateUserCustomFighters = invalidateUserCustoms;
export const invalidateUserCustomGangTypes = invalidateUserCustoms;
export const invalidateUserCustomTradingPosts = invalidateUserCustoms;
export const invalidateUserCustomCollections = invalidateUserCustoms;

export const invalidateAllUserCustomContent = (userId: string) => {
  invalidateUserCustoms(userId);
};
