/**
 * Shared helpers for reading multi-winner state from battles and battle
 * sessions. All readers prefer the new flags but fall back to the legacy
 * single-id columns (`winner_id` / `winner_gang_id`) so existing single-winner
 * rows continue to render identically.
 */

import type { BattleParticipant } from '@/types/campaign';
import type { BattleSessionParticipant } from '@/types/battle-session';

interface CampaignBattleLike {
  participants?: BattleParticipant[] | string | null;
  winner_id?: string | null;
}

interface BattleSessionLike {
  participants?: BattleSessionParticipant[];
  winner_gang_id?: string | null;
}

function parseParticipants(
  participants: BattleParticipant[] | string | null | undefined
): BattleParticipant[] {
  if (!participants) return [];
  if (Array.isArray(participants)) return participants;
  if (typeof participants === 'string') {
    try {
      const parsed = JSON.parse(participants);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Returns every gang_id flagged as a winner on a campaign battle's participants.
 * Falls back to `[winner_id]` when no participants are flagged but the legacy
 * column is populated (covers historical single-winner rows).
 */
export function getWinnerIds(battle: CampaignBattleLike): string[] {
  const flagged = parseParticipants(battle.participants)
    .filter((p) => p?.is_winner === true && !!p.gang_id)
    .map((p) => p.gang_id);
  if (flagged.length > 0) return flagged;
  return battle.winner_id ? [battle.winner_id] : [];
}

/**
 * Returns the gang_id that claimed the territory on a campaign battle, or
 * `null` when no claim was made. Prefers the participant flagged with
 * `claimed_territory: true`; falls back to the legacy `winner_id` column.
 */
export function getClaimerGangId(battle: CampaignBattleLike): string | null {
  const claimer = parseParticipants(battle.participants).find(
    (p) => p?.claimed_territory === true && !!p.gang_id
  );
  if (claimer) return claimer.gang_id;
  return battle.winner_id ?? null;
}

/**
 * Returns every gang_id flagged as a winner on a battle session.
 * Falls back to `[winner_gang_id]` when no participants are flagged but the
 * legacy column is populated.
 */
export function getSessionWinnerIds(session: BattleSessionLike): string[] {
  const flagged = (session.participants ?? [])
    .filter((p) => p?.is_winner === true && !!p.gang_id)
    .map((p) => p.gang_id);
  if (flagged.length > 0) return flagged;
  return session.winner_gang_id ? [session.winner_gang_id] : [];
}

/**
 * Returns the gang_id that claimed the territory in a battle session, or
 * `null` when no claim was made. Prefers the participant flagged with
 * `claimed_territory: true`; falls back to the legacy `winner_gang_id` column.
 */
export function getSessionClaimerGangId(
  session: BattleSessionLike
): string | null {
  const claimer = (session.participants ?? []).find(
    (p) => p?.claimed_territory === true && !!p.gang_id
  );
  if (claimer) return claimer.gang_id;
  return session.winner_gang_id ?? null;
}
