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
 * Battle participant with role and gang association
 */
export interface BattleParticipant {
  role: 'attacker' | 'defender' | 'none';
  gang_id: string;
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
  attacker_id?: string;
  defender_id?: string;
  winner_id?: string | null;
  note?: string | null;
  participants?: BattleParticipant[] | string;
  territory_id?: string | null;
  custom_territory_id?: string | null;
  territory_name?: string;
  cycle?: number | null;
  attacker?: GangReference;
  defender?: GangReference;
  winner?: GangReference;
}

/**
 * Campaign gang representation
 */
export interface CampaignGang {
  id: string;
  name: string;
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
  custom_territory_id?: string | null;
}

/**
 * Campaign territory with clean structure
 */
export interface CampaignTerritory {
  id: string;                    // campaign_territory ID (unique instance)
  template_id: string | null;    // territory_id or custom_territory_id
  name: string;                  // territory_name
  gang_id?: string | null;
  created_at: string;
  ruined: boolean;
  default_gang_territory: boolean;
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
  status: string | null;
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

    // Optional campaign resources
    exploration_points?: number | null;
    meat?: number | null;
    scavenging_rolls?: number | null;
    power?: number | null;
    sustenance?: number | null;
    salvage?: number | null;
  }[];
}
