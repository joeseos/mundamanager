import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { assembleGangFighters } from '@/utils/gang-assembly';
import { getAppDb, type AppDb } from '@/utils/db/client';
import {
  gangPortraitPublicUrl,
  type GangFighter,
  type GangFightersBundle,
  type GetGangFightersListOptions,
} from '@/types/gang';
import { gangEditionSlug } from '@/types/edition';
import { isVenatorGang } from '@/utils/venatorSkillAccess';
import { isUuid } from '@/utils/uuid';
import { GangTacticsCard, toGangTacticsCard } from '@/types/tactics-card';
import { resolveGangRules, type GangRuleRow } from '@/utils/gang-rules';

// =============================================================================
// TYPES - Shared interfaces for gang data
// =============================================================================

/** The gang's spendable resources, all stored on the gangs row. */
export interface GangBasic {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  edition_slug?: string | null;
  gang_colour: string;
  reputation: number;
  alignment: string;
  note?: string;
  note_backstory?: string;
  note_private?: string;
  note_private_updated_at?: string;
  created_at: string;
  last_updated: string;
  alliance_id?: string;
  gang_subtypes?: string[];
  user_id: string;
  gang_affiliation_id?: string | null;
  gang_affiliation?: {
    id: string;
    name: string;
  } | null;
  gang_origin_id?: string | null;
  gang_origin?: {
    id: string;
    origin_name: string;
    gang_origin_categories?: {
      category_name: string;
    } | null;
  } | null;
  gang_types?: {
    affiliation: boolean;
    gang_origin_category_id?: string;
    parent_gang_type_name?: string | null;
    gang_origin_categories?: {
      category_name: string;
    } | null;
    editions?: {
      slug: string;
    } | null;
  } | null;
  custom_gang_type_id?: string | null;
  custom_gang_types?: null;
  custom_gang_type_edition?: {
    editions?: {
      slug: string;
    } | null;
  } | null;
  image_url?: string;
  gang_portrait_id?: string | null;
  gang_portrait_url?: string | null;
  hidden: boolean;
  venator_ranks_incomplete?: boolean;
}

export interface Alliance {
  id: string;
  alliance_name: string;
  alliance_type: string;
}

export interface GangStashItem {
  id: string;
  created_at: string | null;
  equipment_id?: string | null;
  custom_equipment_id?: string | null;
  equipment_name: string;
  equipment_type: string;
  equipment_category: string;
  cost: number;
  type: 'equipment';
  cost_resource?: { name: string; amount: number } | null;
}

export interface GangCampaignResource {
  resource_id: string;
  resource_name: string;
  quantity: number;
  is_custom: boolean;
}

export interface GangCampaign {
  campaign_id: string;
  campaign_gang_id: string;
  campaign_name: string;
  role: string;
  trading_posts?: string[] | null;
  trading_post_names?: string[];
  custom_trading_posts?: string[] | null;
  custom_trading_post_names?: string[];
  territories: any[];
  allegiance?: {
    id: string;
    name: string;
  } | null;
  // New normalised resources from campaign_gang_resources
  resources: GangCampaignResource[];
}

export interface GangSubtype {
  id: string;
  subtype: string;
}


// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with proper cache tags
// =============================================================================

export interface GangCore extends GangBasic {
  credits: number;
  trade_points: number;
  rating: number;
  wealth: number;
  alliance: Alliance | null;
}

/** The gang row with its alliance, affiliation, origin, type, portrait and skill set ranks. */
function gangCoreQuery(db: AppDb, gangId: string) {
  return db.query.gangs.findFirst({
    columns: {
      id: true,
      name: true,
      gang_type: true,
      gang_type_id: true,
      gang_colour: true,
      reputation: true,
      alignment: true,
      note: true,
      note_backstory: true,
      note_private: true,
      credits: true,
      trade_points: true,
      rating: true,
      wealth: true,
      alliance_id: true,
      gang_subtypes: true,
      user_id: true,
      gang_affiliation_id: true,
      gang_origin_id: true,
      custom_gang_type_id: true,
      image_url: true,
      gang_portrait_id: true,
      hidden: true,
    },
    // The row's own timestamps would arrive in Postgres's text form; select them
    // as JSON for the ISO form the Data API returned (nested ones already are)
    extras: (gang, { sql }) => ({
      note_private_updated_at: sql<string | null>`to_json(${gang.note_private_updated_at})`.as('note_private_updated_at'),
      created_at: sql<string>`to_json(${gang.created_at})`.as('created_at'),
      last_updated: sql<string | null>`to_json(${gang.last_updated})`.as('last_updated'),
    }),
    where: (gang, { eq }) => eq(gang.id, gangId),
    with: {
      alliance: { columns: { id: true, alliance_name: true, alliance_type: true } },
      gang_affiliation: { columns: { id: true, name: true } },
      gang_origin: {
        columns: { id: true, origin_name: true },
        with: { gang_origin_categories: { columns: { category_name: true } } },
      },
      gang_types: {
        columns: { affiliation: true, gang_origin_category_id: true, parent_gang_type_name: true },
        with: {
          gang_origin_categories: { columns: { category_name: true } },
          editions: { columns: { slug: true } },
        },
      },
      custom_gang_type: { columns: {}, with: { editions: { columns: { slug: true } } } },
      gang_portrait: { columns: { storage_path: true } },
      gang_skill_set_ranks: { columns: { rank: true } },
    },
  });
}

/**
 * Get the full gang row (basic info + credits + rating + wealth + alliance).
 * One cache entry and one query replace the previous four parallel gangs-row
 * reads (basic/credits/rating-wealth) plus the alliance lookup. Positioning
 * is deliberately excluded — it changes on every drag and has its own entry.
 * Cache: gang-{id}
 */
export const getGangCore = async (gangId: string): Promise<GangCore | null> => {
  // The id comes from the URL; Postgres would reject a malformed one
  if (!isUuid(gangId)) return null;

  return unstable_cache(
    async () => {
      const row = await gangCoreQuery(getAppDb(), gangId);
      if (!row) return null;
      const { gang_portrait, custom_gang_type, gang_skill_set_ranks, ...gang } = row;
      const gangRow = { ...gang, custom_gang_type_edition: custom_gang_type };
      const editionSlug = gangEditionSlug(gangRow);
      const venatorRanksIncomplete = isVenatorGang(editionSlug, gangRow.gang_type, Boolean(gangRow.custom_gang_type_id))
        ? gang_skill_set_ranks.length < 4
        : undefined;
      // GangCore describes what the app stores: JSON columns typed, and columns
      // the database allows to be NULL (credits, gang_type_id) as always set
      return {
        ...gangRow,
        edition_slug: editionSlug,
        rating: gangRow.rating ?? 0,
        wealth: gangRow.wealth ?? 0,
        gang_portrait_url: gangPortraitPublicUrl(gang_portrait?.storage_path) ?? null,
        venator_ranks_incomplete: venatorRanksIncomplete,
      } as GangCore;
    },
    [`gang-core-v11-${gangId}`],
    {
      tags: [TAGS.gang(gangId), TAGS.globalGangTypes(), TAGS.globalGangPortraits()],
      revalidate: false
    }
  )();
};

/**
 * Get the Gang Tactics cards a gang holds, flattened with their catalogue name
 * and D66 range. Callers gate on hasGangTacticsCards(), not this.
 * Cache: gang-tactics-cards-{id}
 */
export const getGangTacticsCards = async (gangId: string): Promise<GangTacticsCard[]> => {
  return unstable_cache(
    async () => {
      const cards = await getAppDb().query.gangTacticsCards.findMany({
        columns: { id: true, description: true, tactics_cards_id: true },
        where: (card, { eq }) => eq(card.gang_id, gangId),
        with: { tactics_cards: { columns: { name: true, d66_min: true, d66_max: true } } },
      });
      return cards.map(toGangTacticsCard);
    },
    [`gang-tactics-cards-${gangId}`],
    {
      tags: [TAGS.gangTacticsCards(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang positioning data only
 * Cache: BASE_GANG_POSITIONING
 */
export const getGangPositioning = async (gangId: string): Promise<Record<string, any> | null> => {
  return unstable_cache(
    async () => {
      // A just-deleted gang re-renders from a stale gang-core entry, so no row is fine
      const gang = await getAppDb().query.gangs.findFirst({
        columns: { positioning: true },
        where: (gang, { eq }) => eq(gang.id, gangId),
      });
      return gang?.positioning ?? null;
    },
    [`gang-positioning-v2-${gangId}`],
    {
      tags: [TAGS.gangPositioning(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang stash equipment
 * Cache: BASE_GANG_STASH
 */
export const getGangStash = async (gangId: string): Promise<GangStashItem[]> => {
  return unstable_cache(
    async () => {
      const equipmentColumns = { equipment_name: true, equipment_type: true, equipment_category: true } as const;
      const items = await getAppDb().query.fighterEquipment.findMany({
        columns: { id: true, equipment_id: true, custom_equipment_id: true, purchase_cost: true, cost_resource: true },
        extras: (item, { sql }) => ({
          created_at: sql<string | null>`to_json(${item.created_at})`.as('created_at'),
        }),
        where: (item, { and, eq }) => and(eq(item.gang_id, gangId), eq(item.gang_stash, true)),
        with: {
          equipment: { columns: equipmentColumns },
          custom_equipment: { columns: equipmentColumns },
        },
      });

      return items.map((item) => ({
        id: item.id,
        created_at: item.created_at,
        equipment_id: item.equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: item.equipment?.equipment_name || item.custom_equipment?.equipment_name || 'Unknown',
        equipment_type: item.equipment?.equipment_type || item.custom_equipment?.equipment_type || 'unknown',
        equipment_category: item.equipment?.equipment_category || item.custom_equipment?.equipment_category || 'unknown',
        cost: item.purchase_cost ?? 0,
        type: 'equipment' as const,
        cost_resource: item.cost_resource ?? null
      }));
    },
    [`gang-stash-v2-${gangId}`],
    {
      tags: [TAGS.gangStash(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Resolves gang type config (affiliation, origin category) from whichever type applies
 */
export const getGangTypeConfig = (gangBasic: GangBasic) =>
  gangBasic.gang_types ?? gangBasic.custom_gang_types ?? null;

/**
 * Get gang subtypes
 * Cache: GLOBAL_GANG_TYPES (shared since subtypes rarely change)
 */
export const getGangSubtypes = async (gangSubtypeIds: string[]): Promise<GangSubtype[]> => {
  if (!gangSubtypeIds || gangSubtypeIds.length === 0) return [];
  
  return unstable_cache(
    async () => {
      const subtypes = await getAppDb().query.gangSubtypeTypes.findMany({
        columns: { id: true, subtype: true },
        where: (type, { inArray }) => inArray(type.id, gangSubtypeIds),
      });
      return subtypes.filter((type): type is GangSubtype => type.subtype !== null);
    },
    [`gang-subtypes-${gangSubtypeIds.join('-')}`],
    {
      tags: [TAGS.globalGangTypes()],
      revalidate: 3600 // 1 hour - subtypes rarely change
    }
  )();
};

/**
 * Cached list of campaign ids a gang belongs to. Exists so getGangCampaigns
 * can tag its entry with campaign-{id} per campaign (dynamic tags must be
 * known before the cached call). Busted on join/leave via gang-campaigns-{id}.
 */
const getGangCampaignIdsCached = async (gangId: string): Promise<string[]> => {
  return unstable_cache(
    async () => {
      const rows = await getAppDb().query.campaignGangs.findMany({
        columns: { campaign_id: true },
        where: (cg, { eq }) => eq(cg.gang_id, gangId),
      });
      return rows.map((cg) => cg.campaign_id).filter((id): id is string => Boolean(id));
    },
    [`gang-campaign-ids-v2-${gangId}`],
    {
      tags: [TAGS.gangCampaigns(gangId)],
      revalidate: false
    }
  )();
};

/** The gang's campaign memberships with their campaign, member role, territories, resources and allegiance. */
function gangCampaignsQuery(db: AppDb, gangId: string) {
  return db.query.campaignGangs.findMany({
    columns: { id: true, campaign_allegiance_id: true, campaign_type_allegiance_id: true },
    where: (cg, { eq }) => eq(cg.gang_id, gangId),
    with: {
      campaign_member: { columns: { role: true } },
      campaign: {
        columns: { id: true, campaign_name: true, trading_posts: true, custom_trading_posts: true },
        with: {
          // This gang's territories only
          campaign_territories: {
            columns: {
              id: true,
              campaign_id: true,
              created_at: true,
              territory_id: true,
              territory_name: true,
              playing_card: true,
              description: true,
              ruined: true,
              default_gang_territory: true,
              credits: true,
            },
            where: (territory, { eq }) => eq(territory.gang_id, gangId),
          },
          campaign_type: { columns: {}, with: { campaign_type_resources: { columns: { id: true, resource_name: true } } } },
          campaign_resources: { columns: { id: true, resource_name: true } },
        },
      },
      campaign_allegiance: { columns: { id: true, allegiance_name: true } },
      campaign_type_allegiance: { columns: { id: true, allegiance_name: true } },
      campaign_gang_resources: {
        columns: { campaign_type_resource_id: true, campaign_resource_id: true, quantity: true },
      },
    },
  });
}

/** Trading post ids (stored as JSON arrays on campaigns) mapped to their names. */
async function tradingPostNames(db: AppDb, tradingPostIds: string[], customTradingPostIds: string[]) {
  const [tradingPosts, customTradingPosts] = await Promise.all([
    tradingPostIds.length > 0
      ? db.query.tradingPostTypes.findMany({
          columns: { id: true, trading_post_name: true },
          where: (tp, { inArray }) => inArray(tp.id, tradingPostIds),
        })
      : [],
    customTradingPostIds.length > 0
      ? db.query.customTradingPosts.findMany({
          columns: { id: true, custom_trading_post_name: true },
          where: (tp, { inArray }) => inArray(tp.id, customTradingPostIds),
        })
      : [],
  ]);
  return {
    tradingPostNames: new Map(tradingPosts.map((tp) => [tp.id, tp.trading_post_name])),
    customTradingPostNames: new Map(customTradingPosts.map((tp) => [tp.id, tp.custom_trading_post_name])),
  };
}

/**
 * Get gang campaigns (the gang page campaign tab bundle).
 * Tags: gang-campaigns-{id} (join/leave/allegiance) + campaign-{cid} per
 * campaign (content changes: territories, resources, allegiances, settings).
 * Deliberately NOT gang-{id}: nothing here is fighter-dependent, so fighter
 * edits never rebuild it.
 */
export const getGangCampaigns = async (gangId: string): Promise<GangCampaign[]> => {
  const campaignIdsForTags = await getGangCampaignIdsCached(gangId);

  return unstable_cache(
    async () => {
      const db = getAppDb();
      const rows = await gangCampaignsQuery(db, gangId);

      const allIds = (key: 'trading_posts' | 'custom_trading_posts') =>
        [...new Set(rows.flatMap((cg) => cg.campaign?.[key] ?? []))];
      const names = await tradingPostNames(db, allIds('trading_posts'), allIds('custom_trading_posts'));

      return rows.flatMap((cg): GangCampaign[] => {
        const { campaign } = cg;
        if (!campaign) return [];

        const tradingPosts = campaign.trading_posts ?? [];
        const customTradingPosts = campaign.custom_trading_posts ?? [];

        // A campaign's own allegiance takes precedence over its type's
        const allegiance = cg.campaign_allegiance_id ? cg.campaign_allegiance : cg.campaign_type_allegiance;

        const quantities = new Map(
          cg.campaign_gang_resources.map((gr) => [gr.campaign_type_resource_id || gr.campaign_resource_id, gr.quantity])
        );
        const resource = (is_custom: boolean) => (r: { id: string; resource_name: string }): GangCampaignResource => ({
          resource_id: r.id,
          resource_name: r.resource_name,
          quantity: quantities.get(r.id) || 0,
          is_custom,
        });

        return [{
          campaign_id: campaign.id,
          campaign_gang_id: cg.id,
          campaign_name: campaign.campaign_name as string,
          role: cg.campaign_member?.role as string,
          trading_posts: tradingPosts,
          trading_post_names: tradingPosts.flatMap((id) => names.tradingPostNames.get(id) || []),
          custom_trading_posts: customTradingPosts,
          custom_trading_post_names: customTradingPosts.flatMap((id) => names.customTradingPostNames.get(id) || []),
          territories: campaign.campaign_territories,
          allegiance: allegiance?.allegiance_name ? { id: allegiance.id, name: allegiance.allegiance_name } : null,
          resources: [
            ...(campaign.campaign_type?.campaign_type_resources ?? []).map(resource(false)),
            ...campaign.campaign_resources.map(resource(true)),
          ],
        }];
      });
    },
    [`gang-campaigns-v4-${gangId}`],
    {
      tags: [
        TAGS.gangCampaigns(gangId),
        ...campaignIdsForTags.flatMap(id => [
          TAGS.campaignCore(id),
          TAGS.campaignMembers(id),
          TAGS.campaignTerritories(id),
          TAGS.campaignResources(id),
          TAGS.campaignTradingPosts(id)
        ])
      ],
      revalidate: false
    }
  )();
};

// =============================================================================
// COMPUTED DATA FUNCTIONS - Calculated values with proper cache tags
// =============================================================================

// =============================================================================
// COMPOSITE DATA FUNCTIONS - Multi-entity aggregated data
// =============================================================================


/**
 * Fetch the raw gang fighters bundle: every fighter/vehicle-shaped row for a
 * gang in ONE cache entry (tag gang-roster-{id}), read with one nested Drizzle
 * query over the direct connection (utils/db), so it adds no API gateway log.
 * Page-specific shapes are produced by the pure assemble* functions in
 * utils/gang-assembly.ts.
 */
export const getGangFightersBundle = async (gangId: string): Promise<GangFightersBundle> => {
  // The rules are cached globally, so editing one takes effect without busting
  // every roster; the gang's own scope columns come with the roster, whose tag
  // invalidateGang busts when the gang's origin or subtypes change
  const [{ gangScope, ...roster }, rules] = await Promise.all([
    unstable_cache(
      async () => flattenRoster(gangId, await rosterQuery(getAppDb(), gangId)),
      [`gang-fighters-bundle-v8-${gangId}`],
      {
        tags: [TAGS.gangRoster(gangId)],
        revalidate: false
      }
    )(),
    getGangRules()
  ]);
  return {
    ...roster,
    gangTypeId: gangScope?.gang_type_id ?? null,
    gangRules: gangScope ? resolveGangRules(rules, gangScope) : []
  };
};

/**
 * Every gang rule row with its effect type and modifiers. A handful of
 * rows game-wide, resolved per gang by resolveGangRules.
 * Cache: global-gang-rules
 */
export const getGangRules = async (): Promise<GangRuleRow[]> => {
  return unstable_cache(
    async () => getAppDb().query.gangRules.findMany({
      columns: { gang_type_id: true, gang_origin_id: true, gang_subtype_id: true, excluded: true },
      with: {
        fighter_effect_type: {
          columns: { id: true, effect_name: true, type_specific_data: true },
          with: {
            fighter_effect_type_modifiers: {
              columns: { stat_name: true, default_numeric_value: true, operation: true }
            }
          }
        }
      }
    }),
    ['gang-rules'],
    {
      tags: [TAGS.globalGangRules()],
      revalidate: false
    }
  )();
};

// Columns read by rosterQuery(); the equipment and effects selections are shared
// by fighters and vehicles.
const WEAPON_PROFILE_COLUMNS = {
  id: true,
  weapon_group_id: true,
  profile_name: true,
  range_short: true,
  range_long: true,
  acc_short: true,
  acc_long: true,
  strength: true,
  ap: true,
  damage: true,
  lethality: true,
  ammo: true,
  traits: true,
  sort_order: true,
} as const;

const EQUIPMENT_ITEM_COLUMNS = {
  equipment_name: true,
  equipment_type: true,
  equipment_category: true,
  equipment_category_id: true,
  is_consumable: true,
} as const;

const EQUIPMENT_QUERY = {
  columns: {
    id: true,
    fighter_id: true,
    vehicle_id: true,
    equipment_id: true,
    custom_equipment_id: true,
    purchase_cost: true,
    original_cost: true,
    is_master_crafted: true,
    is_editable: true,
    cost_resource: true,
    fighter_skill_id: true,
  },
  with: {
    equipment: {
      columns: EQUIPMENT_ITEM_COLUMNS,
      with: { weapon_profiles: { columns: { ...WEAPON_PROFILE_COLUMNS, equipment_id: true } } },
    },
    custom_equipment: {
      columns: EQUIPMENT_ITEM_COLUMNS,
      with: { custom_weapon_profiles: { columns: { ...WEAPON_PROFILE_COLUMNS, custom_equipment_id: true } } },
    },
  },
} as const;

const EFFECTS_QUERY = {
  columns: {
    id: true,
    fighter_id: true,
    vehicle_id: true,
    fighter_equipment_id: true,
    target_equipment_id: true,
    fighter_effect_type_id: true,
    effect_name: true,
    type_specific_data: true,
    sort_order: true,
    created_at: true,
    updated_at: true,
  },
  with: {
    fighter_effect_type: {
      columns: { sort_order: true },
      with: { fighter_effect_category: { columns: { category_name: true } } },
    },
    fighter_effect_modifiers: {
      columns: { id: true, fighter_effect_id: true, stat_name: true, numeric_value: true, operation: true },
    },
  },
} as const;

const FIGHTER_COLUMNS = {
  id: true,
  fighter_name: true,
  label: true,
  note: true,
  note_backstory: true,
  credits: true,
  cost_adjustment: true,
  movement: true,
  weapon_skill: true,
  ballistic_skill: true,
  strength: true,
  toughness: true,
  wounds: true,
  initiative: true,
  attacks: true,
  leadership: true,
  cool: true,
  willpower: true,
  intelligence: true,
  save: true,
  xp: true,
  starting_xp: true,
  special_rules: true,
  fighter_subtypes: true,
  fighter_type: true,
  fighter_type_id: true,
  custom_fighter_type_id: true,
  fighter_gang_legacy_id: true,
  fighter_specialisation_id: true,
  promoted_from_prospect: true,
  fighter_variant: true,
  killed: true,
  starved: true,
  retired: true,
  enslaved: true,
  recovery: true,
  captured: true,
  captured_by_gang_id: true,
  free_skill: true,
  kills: true,
  kill_count: true,
  fighter_pet_id: true,
  image_url: true,
  position: true,
  active_loadout_id: true,
  is_vehicle: true,
} as const;

const VEHICLE_COLUMNS = {
  id: true,
  gang_id: true,
  fighter_id: true,
  created_at: true,
  movement: true,
  front: true,
  side: true,
  rear: true,
  hull_points: true,
  handling: true,
  save: true,
  body_slots: true,
  drive_slots: true,
  engine_slots: true,
  body_slots_occupied: true,
  drive_slots_occupied: true,
  engine_slots_occupied: true,
  special_rules: true,
  vehicle_name: true,
  vehicle_type_id: true,
  vehicle_type: true,
  cost: true,
} as const;

/** The whole roster in one query, nested under the gang row. */
function rosterQuery(db: AppDb, gangId: string) {
  return db.query.gangs.findFirst({
    columns: { id: true, gang_type_id: true, gang_origin_id: true, gang_subtypes: true },
    where: (gang, { eq }) => eq(gang.id, gangId),
    with: {
      fighters: {
        columns: FIGHTER_COLUMNS,
        with: {
          fighter_gang_legacy: { columns: { id: true, fighter_type_id: true, name: true } },
          fighter_types: {
            columns: {
              fighter_type: true,
              fighter_subtypes: true,
              alliance_crew_name: true,
              cost: true,
              is_spyrer: true,
              is_vehicle: true,
              gang_type_id: true,
              edition_id: true,
            },
            with: {
              editions: { columns: { slug: true } },
              count_limits: {
                columns: {
                  id: true,
                  gang_type_id: true,
                  gang_origin_id: true,
                  gang_subtype_id: true,
                  min_count: true,
                  max_count: true,
                },
              },
            },
          },
          fighter_specialisations: { columns: { id: true, specialisation_name: true } },
          custom_fighter_type: { columns: { gang_type_id: true, custom_gang_type_id: true } },
          // Fighter-held items only; vehicle-mounted ones come through vehicles below
          fighter_equipment: { ...EQUIPMENT_QUERY, where: (item, { isNull }) => isNull(item.vehicle_id) },
          fighter_skills: {
            columns: {
              id: true,
              fighter_id: true,
              credits_increase: true,
              xp_cost: true,
              is_advance: true,
              fighter_effect_skill_id: true,
              custom_skill_id: true,
              created_at: true,
            },
            with: {
              skill: { columns: { name: true } },
              custom_skill: { columns: { skill_name: true } },
              fighter_effect_skills: {
                columns: {},
                with: {
                  fighter_effects: {
                    columns: { effect_name: true, type_specific_data: true, fighter_equipment_id: true },
                  },
                },
              },
            },
          },
          // Likewise, effects tied to a vehicle come through vehicles below
          fighter_effects: { ...EFFECTS_QUERY, where: (effect, { isNull }) => isNull(effect.vehicle_id) },
          fighter_exotic_beasts: {
            columns: { fighter_owner_id: true, fighter_pet_id: true, fighter_equipment_id: true },
            with: {
              fighters: { columns: { fighter_name: true } },
              fighter_equipment: { columns: { gang_stash: true } },
            },
          },
          fighter_loadouts: {
            columns: { id: true, fighter_id: true, loadout_name: true, created_at: true },
            with: { fighter_loadout_equipment: { columns: { loadout_id: true, fighter_equipment_id: true } } },
            orderBy: (loadout, { asc }) => asc(loadout.created_at),
          },
          captured_by: { columns: { id: true, name: true } },
        },
      },
      vehicles: {
        columns: VEHICLE_COLUMNS,
        with: {
          fighter_equipment: EQUIPMENT_QUERY,
          fighter_effects: EFFECTS_QUERY,
        },
      },
    },
  });
}

// Effects from every fighter and vehicle are sorted together by sort_order,
// NULLs last
function bySortOrder(a: { sort_order: number | null }, b: { sort_order: number | null }): number {
  if (a.sort_order === b.sort_order) return 0;
  if (a.sort_order === null) return 1;
  if (b.sort_order === null) return -1;
  return a.sort_order - b.sort_order;
}

/** Flatten the nested roster into the bundle's per-table lists. */
function flattenRoster(
  gangId: string,
  gang: Awaited<ReturnType<typeof rosterQuery>>
): Omit<GangFightersBundle, 'gangTypeId' | 'gangRules'> & {
  gangScope: { gang_type_id: string | null; gang_origin_id: string | null; gang_subtypes: string[] | null } | null;
} {
  const fighterRows = gang?.fighters ?? [];
  const vehicleRows = gang?.vehicles ?? [];
  const rows = [...fighterRows, ...vehicleRows];
  // Several captured fighters can be held by the same gang
  const capturedByGangs = new Map(
    fighterRows.flatMap(({ captured_by }) => (captured_by ? [[captured_by.id, captured_by] as const] : []))
  );

  return {
    gangId,
    gangScope: gang
      ? { gang_type_id: gang.gang_type_id, gang_origin_id: gang.gang_origin_id, gang_subtypes: gang.gang_subtypes }
      : null,
    fighters: fighterRows.map(
      ({ fighter_equipment, fighter_skills, fighter_effects, fighter_exotic_beasts, fighter_loadouts, captured_by, ...fighter }) =>
        fighter
    ),
    vehicles: vehicleRows.map(({ fighter_equipment, fighter_effects, ...vehicle }) => vehicle),
    equipment: rows.flatMap((row) => row.fighter_equipment),
    skills: fighterRows.flatMap((fighter) => fighter.fighter_skills),
    effects: rows.flatMap((row) => row.fighter_effects).sort(bySortOrder),
    beastLinks: fighterRows.flatMap((fighter) => fighter.fighter_exotic_beasts),
    loadouts: fighterRows.flatMap((fighter) => fighter.fighter_loadouts),
    capturedByGangs: [...capturedByGangs.values()],
  };
}

/**
 * Get all fighters in a gang with complete data — selector over
 * getGangFightersBundle. The print expansion is an assembly option over the
 * same cache entry (previously a separate duplicate entry).
 */
export const getGangFightersList = async (
  gangId: string,
  options?: GetGangFightersListOptions
): Promise<GangFighter[]> => {
  // Every fighter in a roster belongs to one gang, so the edition is resolved
  // once for the whole roster rather than per fighter from fighter_types —
  // which yields null for custom fighter types, and would leave them with no
  // edition at all. Passing the edition does not skip the gang type, origin,
  // and subtypes: count_limits scoped to those only match when the scope is known.
  const callerSlug = options?.gangEditionSlug;
  const needsEdition = callerSlug === undefined;
  const scopeProvided =
    options?.gangTypeId !== undefined &&
    options?.gangOriginId !== undefined &&
    options?.gangSubtypeIds !== undefined;
  // A caller that already knows the edition still needs the gang's type, origin,
  // and subtypes, or count_limits scoped to those never match.
  const needsCore = needsEdition || !scopeProvided;
  const [bundle, core] = await Promise.all([
    getGangFightersBundle(gangId),
    needsCore ? getGangCore(gangId) : Promise.resolve(null)
  ]);
  return assembleGangFighters(bundle, {
    ...options,
    gangEditionSlug: needsEdition ? core?.edition_slug ?? null : callerSlug,
    gangTypeId: options?.gangTypeId ?? core?.gang_type_id ?? null,
    gangOriginId: options?.gangOriginId ?? core?.gang_origin_id ?? null,
    gangSubtypeIds: options?.gangSubtypeIds ?? core?.gang_subtypes ?? [],
  });
};

/**
 * Get username and patreon tier from user_id
 * Cache: BASE_USER_PROFILE
 */
export const getUserProfile = async (userId: string): Promise<{
  username: string;
  avatar_url: string | null;
  patreon_tier_id: string | null;
  patreon_tier_title: string | null;
  patron_status: string | null;
} | null> => {
  if (!isUuid(userId)) return null;

  return unstable_cache(
    async () => {
      const profile = await getAppDb().query.profiles.findFirst({
        columns: { username: true, avatar_url: true, patreon_tier_id: true, patreon_tier_title: true, patron_status: true },
        where: (profile, { eq }) => eq(profile.id, userId),
      });
      return profile ?? null;
    },
    [`user-profile-v3-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};

export interface OoaBreakdownItem {
  fighter_name: string;
  fighter_type: string;
  fighter_subtypes: string[];
  kills: number;
}

export interface DeathsBreakdownItem {
  fighter_name: string;
  fighter_type: string;
  fighter_subtypes: string[];
}

export interface GangFighterStats {
  ooa_caused: number;
  deaths_suffered: number;
  ooa_breakdown: OoaBreakdownItem[];
  deaths_breakdown: DeathsBreakdownItem[];
}

/**
 * A gang's "OOA caused": the sum of every fighter's kills, dead and retired
 * fighters included. Shared by the gang page's stats and the campaign
 * Triumphs leaderboard so both always show the same number.
 */
export const sumFighterKills = (fighters: Array<{ kills: number | null }>) =>
  fighters.reduce((sum, f) => sum + (Number(f.kills) || 0), 0);

export const getGangFighterStats = async (gangId: string): Promise<GangFighterStats> => {
  return unstable_cache(
    async () => {
      const fighterList = await getAppDb().query.fighters.findMany({
        columns: { fighter_name: true, fighter_type: true, fighter_subtypes: true, kills: true, killed: true },
        where: (fighter, { eq }) => eq(fighter.gang_id, gangId),
      });

      const ooaCaused = sumFighterKills(fighterList);
      const deathsSuffered = fighterList.filter((f) => f.killed === true).length;

      const ooaBreakdown: OoaBreakdownItem[] = fighterList
        .filter((f) => (Number(f.kills) || 0) > 0)
        .map((f) => ({
          fighter_name: f.fighter_name || 'Unknown',
          fighter_type: f.fighter_type || '—',
          fighter_subtypes: f.fighter_subtypes || [],
          kills: Number(f.kills) || 0
        }))
        .sort((a, b) => b.kills - a.kills);

      const deathsBreakdown: DeathsBreakdownItem[] = fighterList
        .filter((f) => f.killed === true)
        .map((f) => ({
          fighter_name: f.fighter_name || 'Unknown',
          fighter_type: f.fighter_type || '—',
          fighter_subtypes: f.fighter_subtypes || []
        }));

      return {
        ooa_caused: ooaCaused,
        deaths_suffered: deathsSuffered,
        ooa_breakdown: ooaBreakdown,
        deaths_breakdown: deathsBreakdown
      };
    },
    [`gang-fighter-stats-v3-${gangId}`],
    {
      tags: [TAGS.gangRoster(gangId)],
      revalidate: false
    }
  )();
};