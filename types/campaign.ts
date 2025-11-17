// Campaign-related type definitions

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
  attacker?: {
    gang_id?: string;
    gang_name: string;
  };
  defender?: {
    gang_id?: string;
    gang_name: string;
  };
  winner?: {
    gang_id?: string;
    gang_name: string;
  };
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
    id: string;
    gang_id: string;
    gang_name: string;
    gang_colour?: string;
    status: string | null;
    rating?: number;
    campaign_member_id?: string;
  }[];
}
