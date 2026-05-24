import type { BattleParticipant } from '@/types/campaign';

// ---------------------------------------------------------------------------
// Attacker / defender extraction
// ---------------------------------------------------------------------------

/**
 * Finds the attacker and defender gang IDs from a normalised participants
 * array. Either (or both) may be `null` when the battle has no role
 * assignments.
 */
export function getAttackerDefenderIds(participants: BattleParticipant[]): {
  attacker_id: string | null;
  defender_id: string | null;
} {
  return {
    attacker_id: participants.find((p) => p.role === 'attacker')?.gang_id ?? null,
    defender_id: participants.find((p) => p.role === 'defender')?.gang_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Winner-name enrichment
// ---------------------------------------------------------------------------

/**
 * Builds the three enriched winner objects shared by `createBattleLog` and
 * `updateBattleLog`.
 *
 * @param winnerGangs   Rows returned by the `gangs` name-lookup query.
 * @param effectiveWinnerIds  All flagged winner IDs in slot order.
 * @param claimerGangId The single territory claimer, or `null`.
 * @param legacyWinnerId  The `winner_id` written to the battle row (claimer ??
 *                        first winner ?? null).
 */
export function enrichWinners(
  winnerGangs: { id: string; name: string }[] | null,
  effectiveWinnerIds: string[],
  claimerGangId: string | null,
  legacyWinnerId: string | null
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
  const primaryWinner = legacyWinnerId
    ? { id: legacyWinnerId, name: nameMap.get(legacyWinnerId) ?? 'Unknown' }
    : null;
  return { winnersEnriched, claimerEnriched, primaryWinner };
}

/**
 * Normalise the participants array so that:
 *   - every entry has explicit (potentially false) is_winner / claimed_territory flags;
 *   - if `winner_id` is supplied and no participant is flagged as a winner, the
 *     matching participant is flagged (handles single-winner callers that only
 *     pass `winner_id`);
 *   - if `territory_claimed_by_gang_id` is supplied, the matching participant
 *     becomes the sole claimer (any prior flags are cleared);
 *   - at most one participant may have `claimed_territory: true`, and only if
 *     they are also a winner.
 *
 * Lives in utils/ (not inside a 'use server' file) so it can be imported by
 * both the server action and the API route without triggering Next.js's
 * "Server Actions must be async" constraint.
 */
export function normaliseParticipants(
  participants: BattleParticipant[],
  winnerIdFromCaller: string | null,
  territoryClaimerFromCaller: string | null | undefined
): {
  participants: BattleParticipant[];
  effectiveWinnerIds: string[];
  claimerGangId: string | null;
} {
  const normalised: BattleParticipant[] = participants.map((p) => ({
    role: p.role,
    gang_id: p.gang_id,
    is_winner: p.is_winner === true,
    claimed_territory: false,
  }));

  // Backfill is_winner from the legacy winner_id when no participant is flagged.
  const anyFlagged = normalised.some((p) => p.is_winner === true);
  if (!anyFlagged && winnerIdFromCaller) {
    const target = normalised.find((p) => p.gang_id === winnerIdFromCaller);
    if (target) target.is_winner = true;
  }

  // Decide the claimer. Caller-supplied override wins; otherwise pick any
  // existing claimer flag; otherwise default to the single winner when there is
  // only one (existing behaviour); otherwise no claimer.
  let claimerGangId: string | null = null;
  if (territoryClaimerFromCaller) {
    claimerGangId = territoryClaimerFromCaller;
  } else {
    const existingClaimer = participants.find((p) => p.claimed_territory === true);
    if (existingClaimer) {
      claimerGangId = existingClaimer.gang_id;
    } else {
      const flaggedWinners = normalised.filter((p) => p.is_winner);
      if (flaggedWinners.length === 1) claimerGangId = flaggedWinners[0].gang_id;
    }
  }

  if (claimerGangId) {
    const claimer = normalised.find((p) => p.gang_id === claimerGangId);
    if (claimer && claimer.is_winner) {
      claimer.claimed_territory = true;
    } else {
      // Either the claimer isn't a participant, or isn't a winner. Drop the claim.
      claimerGangId = null;
    }
  }

  const effectiveWinnerIds = normalised.filter((p) => p.is_winner).map((p) => p.gang_id);
  return { participants: normalised, effectiveWinnerIds, claimerGangId };
}

/**
 * Resolves the claimer hint passed into `normaliseParticipants` for a battle.
 * When the caller didn't pass an explicit override and there is no claim being
 * made (no territory selected), we suppress any stale `claimed_territory` flags
 * on the input.
 */
export function territoryClaimerFor(
  newTerritoryId: string | null,
  callerOverride: string | null | undefined,
  existingClaimer: string | null
): string | null {
  if (!newTerritoryId) return null;
  return callerOverride ?? existingClaimer ?? null;
}
