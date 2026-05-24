-- =============================================================================
-- Multi-winner battle sessions
-- =============================================================================
--
-- Adds per-participant winner / territory-claimer flags so a battle session
-- can record more than one winning gang, and explicitly attribute the
-- territory claim when several gangs share the victory.
--
-- Mirrors the per-gang flag shape used on `campaign_battles.participants`
-- JSONB (extended in place — no schema change required there).
--
-- Notes:
--   * battle_sessions.winner_gang_id is kept as a legacy fallback, populated
--     server-side as either the territory claimer or the first winner.
--   * Existing rows default to is_winner = false / claimed_territory = false;
--     readers fall back to winner_gang_id for legacy sessions.
--   * battle_session_participants.ready and the pre_battle -> active
--     transition that depends on it are untouched.
-- =============================================================================

ALTER TABLE public.battle_session_participants
  ADD COLUMN is_winner         boolean NOT NULL DEFAULT false,
  ADD COLUMN claimed_territory boolean NOT NULL DEFAULT false;
