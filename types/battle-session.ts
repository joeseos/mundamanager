export type BattleSessionStatus = 'pre_battle' | 'active' | 'post_battle' | 'completed';

export const statusLabels: Record<BattleSessionStatus, string> = {
  pre_battle: 'Pre-Battle',
  active: 'Active',
  post_battle: 'Post-Battle',
  completed: 'Completed',
};

export const statusColors: Record<BattleSessionStatus, string> = {
  pre_battle: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  post_battle: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function formatBattleSessionDate(dateStr: string) {
  const date = new Date(dateStr);
  const d = date.toISOString().slice(0, 10);
  const t = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${d} ${t}`;
}

export interface BattleSession {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  campaign_id: string | null;
  scenario: string | null;
  status: BattleSessionStatus;
  winner_gang_id: string | null;
  round: number;
  campaign_battle_id: string | null;
  claimed_territory: string | null;
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
  ready: boolean;
  /**
   * Multi-winner support: any number of participants in a session may be flagged
   * as a winner. Defaults to `false`. Draws have no participants with
   * `is_winner = true`.
   */
  is_winner?: boolean;
  /**
   * The single winner that claimed the battle's territory (if any). Only one
   * participant per session may have `claimed_territory = true`, and they must
   * also be flagged as `is_winner`.
   */
  claimed_territory?: boolean;
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
  note?: string;
  activations: number;
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
    special_rules?: string[];
  };
}

export interface BattleSessionFull extends BattleSession {
  participants: (BattleSessionParticipant & {
    fighters: BattleSessionFighter[];
  })[];
  campaign_name?: string;
}
