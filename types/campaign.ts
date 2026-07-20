// Campaign-related type definitions

/**
 * Gang reference used when gang is nested under another entity.
 * Uses clean names for id/name, but keeps database column names for gang_type/gang_colour.
 */
export interface GangReference {
  id: string;
  name: string;
  gang_type?: string;
  gang_colour?: string;
}

/**
 * Battle participant with role and gang association.
 * `is_winner` and `claimed_territory` are optional flags stored on the
 * `campaign_battles.participants` JSONB to support multi-winner battles.
 * Both default to `false` when omitted. At most one participant may have
 * `claimed_territory: true`, and only if `is_winner` is also true.
 */
export interface BattleParticipant {
  role: 'attacker' | 'defender' | 'none';
  gang_id: string;
  is_winner?: boolean;
  claimed_territory?: boolean;
}

/**
 * Battle/Battle log data structure
 */
export interface Battle {
  id: string;
  created_at: string;
  updated_at?: string;
  scenario_number?: number;
  scenario_name?: string;
  scenario?: string;
  winner_id?: string | null;
  note?: string | null;
  participants?: BattleParticipant[] | string;
  campaign_territory_id?: string | null;
  territory_name?: string;
  cycle?: number | null;
  attacker?: GangReference;
  defender?: GangReference;
  winner?: GangReference;
  /**
   * Full list of winning gangs for the battle. For single-winner battles this
   * mirrors `winner` as a one-element array. Multi-winner battles populate every
   * winning gang here. Empty / undefined means a draw.
   */
  winners?: GangReference[];
  /**
   * The gang that claimed the battle's territory (if any). Always one of
   * `winners` when present.
   */
  territory_claimer?: GangReference | null;
}

/**
 * Campaign gang representation
 */
export interface CampaignGang {
  id: string;
  name: string;
  gang_colour?: string;
  campaign_member_id?: string;
  user_id?: string;
  owner_username?: string;
}

/**
 * Territory data structure
 */
export interface Territory {
  id: string;
  name?: string;
  territory_name?: string;
  controlled_by?: string; // gang_id of controlling gang
  gang_id?: string | null;
  is_custom?: boolean;
  territory_id?: string | null;
}

/**
 * Campaign territory with clean structure
 */
export interface CampaignTerritory {
  id: string;                    // campaign_territory ID (unique instance)
  template_id: string | null;    // territory_id (null for custom territories)
  name: string;                  // territory_name
  gang_id?: string | null;
  created_at: string;
  ruined: boolean;
  default_gang_territory: boolean;
  playing_card?: string | null;
  is_custom: boolean;
  owning_gangs: GangReference[];
}

/**
 * Scenario definition
 */
export interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
}

/**
 * Campaign member data
 */
export interface Member {
  id?: string;
  user_id: string;
  username: string;
  role: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  invited_at: string;
  joined_at: string | null;
  invited_by: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role: string;
  };
  gangs: {
    // Relationship metadata (from campaign_gangs junction table)
    campaign_gang_id: string;
    campaign_member_id?: string;
    status: string | null;

    // Gang data (clean names for id/name, database names for gang_type/gang_colour)
    id: string;              // gang's actual UUID
    name: string;
    gang_type: string;
    gang_colour: string;
    rating?: number;
    wealth?: number;
    reputation?: number;
    territory_count?: number;

    // Allegiance information
    allegiance?: {
      id: string;
      name: string;
      is_custom: boolean;
    } | null;
  }[];
}

/**
 * Minimal campaign reference used in user-facing lists (home, customise pages)
 */
export interface UserCampaign {
  id: string;
  campaign_name: string;
  status: string | null;
}

/**
 * Campaign type definition (e.g. Dominion, Law & Misrule)
 */
export interface CampaignTypeResource {
  id: string;
  resource_name: string;
}

export interface CampaignType {
  id: string;
  campaign_type_name: string;
  image_url?: string | null;
  trading_posts?: string[] | null;
  campaign_type_resources?: CampaignTypeResource[];
}
