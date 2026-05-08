export type BattleSessionStatus = 'active' | 'confirmed' | 'cancelled';

export interface BattleSession {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  campaign_id: string | null;
  scenario: string | null;
  status: BattleSessionStatus;
  winner_gang_id: string | null;
  note: string | null;
  campaign_battle_id: string | null;
}

export interface BattleSessionParticipant {
  id: string;
  battle_session_id: string;
  user_id: string;
  gang_id: string;
  role: 'attacker' | 'defender' | 'none';
  gang_rating_snapshot: number | null;
  credits_earned: number;
  reputation_change: number;
  created_at: string;
  gang?: {
    id: string;
    name: string;
    gang_type_name?: string;
    gang_colour?: string;
    rating?: number;
  };
  profile?: {
    username: string;
  };
}

export interface SessionInjuryRecord {
  fighter_effect_id: string;
  fighter_effect_type_id: string;
  effect_name: string;
  send_to_recovery: boolean;
  set_captured: boolean;
}

export interface SessionCondition {
  key: string;
  name: string;
  value?: number;
}

export interface SessionRecord {
  xp_earned: number;
  injuries: SessionInjuryRecord[];
  conditions: SessionCondition[];
}

export interface BattleSessionFighter {
  id: string;
  battle_session_id: string;
  participant_id: string;
  fighter_id: string;
  loadout_id?: string;
  session_record: SessionRecord;
  created_at: string;
  fighter?: {
    id: string;
    fighter_name: string;
    fighter_type?: string;
    credits?: number;
    total_cost?: number;
  };
}

export interface BattleSessionFull extends BattleSession {
  participants: (BattleSessionParticipant & {
    fighters: BattleSessionFighter[];
  })[];
  campaign_name?: string;
}
