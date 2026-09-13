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
 * campaign-core-{id}  the campaigns row itself  | campaign settings/image/discord
 * campaign-members-{id} members, gangs, standings| member + campaign-gang mutations
 * campaign-territories-{id} rows and ownership   | territory mutations
 * campaign-battles-{id} battle logs              | battle log + challenge mutations
 * campaign-allegiances-{id} allegiance catalog   | allegiance mutations
 * campaign-resources-{id} resource catalog +     | resource mutations + gang resource
 *                  per-gang resource rows        | edits
 * campaign-map-{id} map and its objects          | map editor mutations
 * campaign-captives-{id} captives held by gangs  | fighter capture/rescue
 * campaign-trading-posts-{id} shared custom TPs  | custom-share mutations
 * user-{id}        profile/gang list/        | profile, list, social
 *                  campaign list/friends     | mutations
 * custom-{id}      custom content            | customise mutations
 * global-gang-types gang type catalog +      | any admin gang-type write
 *                  home-card portraits/names |
 */
export const TAGS = {
  gang: (id: string) => `gang-${id}`,
  gangOverview: (id: string) => `gang-overview-${id}`,
  gangCampaigns: (id: string) => `gang-campaigns-${id}`,
  gangPositioning: (id: string) => `gang-positioning-${id}`,
  gangStash: (id: string) => `gang-stash-${id}`,
  gangTacticsCards: (id: string) => `gang-tactics-cards-${id}`,
  fighter: (id: string) => `fighter-${id}`,
  campaignCore: (id: string) => `campaign-core-${id}`,
  campaignMembers: (id: string) => `campaign-members-${id}`,
  campaignTerritories: (id: string) => `campaign-territories-${id}`,
  campaignBattles: (id: string) => `campaign-battles-${id}`,
  campaignAllegiances: (id: string) => `campaign-allegiances-${id}`,
  campaignResources: (id: string) => `campaign-resources-${id}`,
  campaignMap: (id: string) => `campaign-map-${id}`,
  campaignCaptives: (id: string) => `campaign-captives-${id}`,
  campaignTradingPosts: (id: string) => `campaign-trading-posts-${id}`,
  user: (id: string) => `user-${id}`,
  customs: (userId: string) => `custom-${userId}`,
  permission: (userId: string, gangId: string) => `check-permission-${userId}-${gangId}`,
  // All cached permission entries for one user, across every gang (busted on sign-in)
  userPermissions: (userId: string) => `user-permissions-${userId}`,

  // Battle sessions keep their own namespace: live battles mutate frequently
  // and must not thrash the gang bundles.
  battleSession: (id: string) => `base-battle-session-${id}`,
  gangBattleSessions: (gangId: string) => `gang-battle-sessions-${gangId}`,

  // Global reference data
  globalEditions: () => 'global-editions',
  globalGangTypes: () => 'global-gang-types',
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
  campaignTriumphs: () => 'campaign-triumphs',
} as const;

const bust = (tag: string) => revalidateTag(tag, { expire: 0 });

// =============================================================================
// INVALIDATION API
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

/**
 * Credits/rating/wealth changed: gang pages AND the cross-page copies
 * (campaign standings, home cards). updateGangFinancials calls this for
 * every financial write in the app.
 */
export const invalidateGangFinancials = (gangId: string) => {
  bust(TAGS.gang(gangId));
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

/** Stash contents changed — never rebuilds the fighters bundle by itself. */
export const invalidateGangStash = (gangId: string) => {
  bust(TAGS.gangStash(gangId));
};

/**
 * The gang's tactics cards changed (added, described or removed). That list
 * only — nothing feeds rating, credits or the fighters bundle.
 */
export const invalidateGangTacticsCards = (gangId: string) => {
  bust(TAGS.gangTacticsCards(gangId));
};

/** The campaigns row changed: name, status, description, note, image, discord, cycle. */
export const invalidateCampaignCore = (campaignId: string) => {
  bust(TAGS.campaignCore(campaignId));
};

/** Membership changed: members, roles, or a gang's campaign_gangs row. */
export const invalidateCampaignMembers = (campaignId: string) => {
  bust(TAGS.campaignMembers(campaignId));
};

/** Territory rows, their ownership, or their map association changed. */
export const invalidateCampaignTerritories = (campaignId: string) => {
  bust(TAGS.campaignTerritories(campaignId));
};

/** Battle logs changed. */
export const invalidateCampaignBattles = (campaignId: string) => {
  bust(TAGS.campaignBattles(campaignId));
};

/** The allegiance catalog changed (created, renamed or deleted). */
export const invalidateCampaignAllegiances = (campaignId: string) => {
  bust(TAGS.campaignAllegiances(campaignId));
};

/** The resource catalog or a gang's resource quantities changed. */
export const invalidateCampaignResources = (campaignId: string) => {
  bust(TAGS.campaignResources(campaignId));
};

/** The map or its objects changed. */
export const invalidateCampaignMap = (campaignId: string) => {
  bust(TAGS.campaignMap(campaignId));
};

/** A fighter was captured or rescued in this campaign. */
export const invalidateCampaignCaptives = (campaignId: string) => {
  bust(TAGS.campaignCaptives(campaignId));
};

/** The set of custom trading posts shared into the campaign changed. */
export const invalidateCampaignTradingPosts = (campaignId: string) => {
  bust(TAGS.campaignTradingPosts(campaignId));
};

/**
 * Every campaign subject at once. Only for mutations that invalidate the whole
 * campaign — deleting it. Anything narrower must name its subject.
 */
export const invalidateCampaignAll = (campaignId: string) => {
  bust(TAGS.campaignCore(campaignId));
  bust(TAGS.campaignMembers(campaignId));
  bust(TAGS.campaignTerritories(campaignId));
  bust(TAGS.campaignBattles(campaignId));
  bust(TAGS.campaignAllegiances(campaignId));
  bust(TAGS.campaignResources(campaignId));
  bust(TAGS.campaignMap(campaignId));
  bust(TAGS.campaignCaptives(campaignId));
  bust(TAGS.campaignTradingPosts(campaignId));
};

/**
 * A campaign↔gang relationship changed (join/leave, territory ownership,
 * gang allegiance, gang resources). The choke point for both sides.
 */
export const invalidateCampaignGang = (campaignId: string, gangId: string) => {
  bust(TAGS.campaignMembers(campaignId));
  bust(TAGS.campaignTerritories(campaignId));
  bust(TAGS.campaignCaptives(campaignId));
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

/** Every cached permission entry for a user, across all gangs (fired on sign-in). */
export const invalidateUserPermissions = (userId: string) => {
  bust(TAGS.userPermissions(userId));
};

/** A single battle session's data changed. */
export const invalidateBattleSession = (sessionId: string) => {
  bust(TAGS.battleSession(sessionId));
};

/** A gang's battle session list changed. */
export const invalidateBattleSessions = (gangId: string) => {
  bust(TAGS.gangBattleSessions(gangId));
};

/**
 * Global campaign catalog lists (campaign types + territory templates).
 * Call after admin edits.
 */
export function invalidateCampaignCatalogLists() {
  bust(TAGS.campaignTypes());
  bust(TAGS.globalTerritories());
}

/**
 * Official gang-type catalog changed (name, images, flags). Home cards join
 * that catalog under the same tag.
 */
export function invalidateGangTypesCatalog() {
  bust(TAGS.globalGangTypes());
}

// Global reference data
export const invalidatePatreonSupporters = () => bust(TAGS.globalPatreonSupporters());
export const invalidateUserCount = () => bust(TAGS.globalUserCount());
export const invalidateGangCount = () => bust(TAGS.globalGangCount());
export const invalidateCampaignCount = () => bust(TAGS.globalCampaignCount());
