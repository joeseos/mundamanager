/**
 * Shared helpers for reading multi-winner state from battles and battle
 * sessions. Campaign battles keep it in the participants flags; battle session
 * readers fall back to the legacy `winner_gang_id` column so existing
 * single-winner sessions continue to render identically.
 */

import type { BattleParticipant } from '@/types/campaign';
import type { BattleSessionParticipant } from '@/types/battle-session';

interface CampaignBattleLike {
  participants?: BattleParticipant[] | string | null;
}

interface BattleSessionLike {
  participants?: BattleSessionParticipant[];
  winner_gang_id?: string | null;
}

export function parseParticipants(
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

/** Returns every gang_id flagged as a winner on a campaign battle's participants. */
export function getWinnerIds(battle: CampaignBattleLike): string[] {
  return parseParticipants(battle.participants)
    .filter((p) => p?.is_winner === true && !!p.gang_id)
    .map((p) => p.gang_id);
}

/**
 * Returns the gang_id of the first participant flagged with
 * `claimed_territory: true`, or `null` when no claim was made.
 */
export function getClaimerGangId(battle: CampaignBattleLike): string | null {
  const claimer = parseParticipants(battle.participants).find(
    (p) => p?.claimed_territory === true && !!p.gang_id
  );
  return claimer ? claimer.gang_id : null;
}

// ---------------------------------------------------------------------------
// Winner-name enrichment
// ---------------------------------------------------------------------------

/**
 * Builds the three enriched winner objects shared by `createBattleLog` and
 * `updateBattleLog`. Lives here (not in battle-participants) because it has no
 * dependency on the participants array — it maps IDs to names from a gangs
 * lookup result.
 *
 * @param winnerGangs        Rows returned by the `gangs` name-lookup query.
 * @param effectiveWinnerIds All flagged winner IDs in slot order.
 * @param claimerGangId      The single territory claimer, or `null`.
 * @returns `primaryWinner` is the claimer, else the first winner; `null` for a draw.
 */
export function enrichWinners(
  winnerGangs: { id: string; name: string }[] | null,
  effectiveWinnerIds: string[],
  claimerGangId: string | null
): {
  winnersEnriched: { id: string; name: string }[];
  claimerEnriched: { id: string; name: string } | null;
  primaryWinner: { id: string; name: string } | null;
} {
  const nameMap = new Map((winnerGangs ?? []).map((g) => [g.id, g.name]));
  const winnersEnriched = effectiveWinnerIds.map((id) => ({
    id,
    name: nameMap.get(id) ?? 'Unknown',
  }));
  const claimerEnriched = claimerGangId
    ? { id: claimerGangId, name: nameMap.get(claimerGangId) ?? 'Unknown' }
    : null;
  return { winnersEnriched, claimerEnriched, primaryWinner: claimerEnriched ?? winnersEnriched[0] ?? null };
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
