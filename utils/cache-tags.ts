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
 * gang-core-{id}   gang row only (credits/  | financial-only writes, which must
 *                  rating/wealth/name)      | not drop the fighters bundle
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
  /** The gang row alone, carried alongside gang-{id} so financial-only writes can
   *  refresh it without dropping the fighters bundle. */
  gangCore: (id: string) => `gang-core-${id}`,
  gangOverview: (id: string) => `gang-overview-${id}`,
  gangCampaigns: (id: string) => `gang-campaigns-${id}`,
  gangPositioning: (id: string) => `gang-positioning-${id}`,
  gangStash: (id: string) => `gang-stash-${id}`,
  gangTacticsCards: (id: string) => `gang-tactics-cards-${id}`,
  fighter: (id: string) => `fighter-${id}`,
  campaign: (id: string) => `campaign-${id}`,
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
  // Deliberately NOT TAGS.gang(): that also carries the fighters bundle, which a
  // financial write has not touched. Every action that does write fighter rows
  // busts the bundle itself via invalidateGang/invalidateFighter.
  bust(TAGS.gangCore(gangId));
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

// Global reference data
export const invalidatePatreonSupporters = () => bust(TAGS.globalPatreonSupporters());
export const invalidateUserCount = () => bust(TAGS.globalUserCount());
export const invalidateGangCount = () => bust(TAGS.globalGangCount());
export const invalidateCampaignCount = () => bust(TAGS.globalCampaignCount());
