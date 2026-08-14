-- Hoist the per-row auth calls out of three RLS policies.
--
-- Postgres re-evaluates a function call in an RLS predicate once per row unless
-- it can prove the call is constant for the whole statement. Wrapping an
-- argument-free STABLE function in a scalar subquery -- `(SELECT f())` -- makes
-- that proof available: the planner lifts it into an InitPlan and evaluates it
-- once per statement instead of once per row. This is the pattern Supabase's
-- performance advisor asks for, and it is already the convention in this
-- schema -- private.is_admin() is wrapped in 233 policies against 6 bare,
-- private.is_arb() in 48 against 6, auth.uid() in 136 against 3. The three
-- policies below were added later and missed it, and are most of that
-- remainder.
--
-- private.is_admin(), private.is_arb() and auth.uid() are all STABLE, so this
-- is a planner hint, not a change in meaning. The predicates are otherwise
-- copied verbatim from the live policies -- same tables, same commands, same
-- roles, same logic. ALTER POLICY is used rather than DROP + CREATE so the
-- command and role bindings cannot drift, and so the policy is never briefly
-- absent.
--
-- private.is_arb(...) is wrapped here for consistency rather than for speed.
-- It takes a column as its argument, so the subquery stays correlated and is
-- still evaluated per row -- there is no InitPlan to gain. Every other policy
-- in the schema wraps it anyway, including the correlated-inside-a-subquery
-- form used by battle_session_fighters, so matching that is worth more than
-- the micro-optimisation argument for leaving it bare.
--
-- Expected impact is small and that is fine. All three are INSERT/DELETE
-- policies: two guard single-row inserts, where per-row evaluation costs
-- essentially nothing, and the third guards deletes on a table of ~8k rows.
-- This is consistency work, not a fix for a measured problem.

BEGIN;

-- INSERT on battle_sessions: one row per statement, so this is purely for
-- consistency with the DELETE and UPDATE policies on the same table.
ALTER POLICY "Authenticated users can create battle sessions"
  ON public.battle_sessions
  WITH CHECK (
    (SELECT private.is_admin())
    OR (SELECT private.is_arb(campaign_id))
    OR (created_by = (SELECT auth.uid()))
  );

-- INSERT on fighter_ooa_records. The auth.uid() call sits inside an IN
-- subquery over `gangs`, so before this change it was re-evaluated for every
-- gang row scanned, not just once.
ALTER POLICY "Gang owner, admin or arb can insert fighter ooa records"
  ON public.fighter_ooa_records
  WITH CHECK (
    (SELECT private.is_admin())
    OR (causing_gang_id IN (
          SELECT g.id FROM public.gangs g
          WHERE g.user_id = (SELECT auth.uid())))
    OR (causing_gang_id IN (
          SELECT cg.gang_id FROM public.campaign_gangs cg
          WHERE cg.status = 'ACCEPTED'
            AND (SELECT private.is_arb(cg.campaign_id))))
  );

-- DELETE on fighter_ooa_records: same predicate as the INSERT policy above,
-- and the one of the three where per-row evaluation could actually add up,
-- since a delete can match many rows.
ALTER POLICY "Gang owner, admin or arb can delete fighter ooa records"
  ON public.fighter_ooa_records
  USING (
    (SELECT private.is_admin())
    OR (causing_gang_id IN (
          SELECT g.id FROM public.gangs g
          WHERE g.user_id = (SELECT auth.uid())))
    OR (causing_gang_id IN (
          SELECT cg.gang_id FROM public.campaign_gangs cg
          WHERE cg.status = 'ACCEPTED'
            AND (SELECT private.is_arb(cg.campaign_id))))
  );

COMMIT;
