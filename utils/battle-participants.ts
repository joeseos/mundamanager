import type { BattleParticipant } from '@/types/campaign';

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
