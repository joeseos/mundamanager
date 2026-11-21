/**
 * Shared helpers for reading multi-winner state from campaign battles and
 * live battles. Campaign battles keep it in the participants flags; live battle
 * readers fall back to the legacy `winner_gang_id` column so existing
 * single-winner live battles continue to render identically.
 */

import type { BattleParticipant } from '@/types/campaign';
import type { LiveBattleParticipant } from '@/types/live-battle';

interface CampaignBattleLike {
  participants?: BattleParticipant[] | string | null;
}

interface LiveBattleLike {
  participants?: LiveBattleParticipant[];
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
 * Returns every gang_id flagged as a winner on a live battle.
 * Falls back to `[winner_gang_id]` when no participants are flagged but the
 * legacy column is populated.
 */
export function getLiveBattleWinnerIds(liveBattle: LiveBattleLike): string[] {
  const flagged = (liveBattle.participants ?? [])
    .filter((p) => p?.is_winner === true && !!p.gang_id)
    .map((p) => p.gang_id);
  if (flagged.length > 0) return flagged;
  return liveBattle.winner_gang_id ? [liveBattle.winner_gang_id] : [];
}

/**
 * Returns the gang_id that claimed the territory in a live battle, or
 * `null` when no claim was made. Prefers the participant flagged with
 * `claimed_territory: true`; falls back to the legacy `winner_gang_id` column.
 */
export function getLiveBattleClaimerGangId(
  liveBattle: LiveBattleLike
): string | null {
  const claimer = (liveBattle.participants ?? []).find(
    (p) => p?.claimed_territory === true && !!p.gang_id
  );
  if (claimer) return claimer.gang_id;
  return liveBattle.winner_gang_id ?? null;
}
