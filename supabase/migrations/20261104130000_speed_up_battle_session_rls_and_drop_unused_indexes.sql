-- 1. Battle session RLS
--
-- The arbitrator check on battle_session_participants and
-- battle_session_fighters was written as
--   battle_session_id IN (SELECT bs.id FROM battle_sessions bs
--                         WHERE (SELECT private.is_arb(bs.campaign_id)))
-- which runs is_arb() for every battle session in the table (~7,000) each
-- time a row is checked. Updates took ~360 ms and used about a quarter of
-- all database time. Looking up only the row's own session gives the same
-- result, because battle_sessions.id is the primary key.
--
-- Safe to run again: every policy is dropped before it is recreated.

DROP POLICY IF EXISTS "Admins, arbs or own participant can insert fighters" ON public.battle_session_fighters;
DROP POLICY IF EXISTS "Admins, arbs or own participant can update fighters" ON public.battle_session_fighters;
DROP POLICY IF EXISTS "Admins, arbs or own participant can delete fighters" ON public.battle_session_fighters;

CREATE POLICY "Admins, arbs or own participant can insert fighters" ON public.battle_session_fighters
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_fighters.battle_session_id
        AND private.is_arb(bs.campaign_id)
    )
    OR participant_id IN (
      SELECT bsp.id FROM public.battle_session_participants bsp
      WHERE bsp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins, arbs or own participant can update fighters" ON public.battle_session_fighters
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_fighters.battle_session_id
        AND private.is_arb(bs.campaign_id)
    )
    OR participant_id IN (
      SELECT bsp.id FROM public.battle_session_participants bsp
      WHERE bsp.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_fighters.battle_session_id
        AND private.is_arb(bs.campaign_id)
    )
    OR participant_id IN (
      SELECT bsp.id FROM public.battle_session_participants bsp
      WHERE bsp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins, arbs or own participant can delete fighters" ON public.battle_session_fighters
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_fighters.battle_session_id
        AND private.is_arb(bs.campaign_id)
    )
    OR participant_id IN (
      SELECT bsp.id FROM public.battle_session_participants bsp
      WHERE bsp.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins, arbs, session creator or self can insert participants" ON public.battle_session_participants;
DROP POLICY IF EXISTS "Admins, arbs, session creator or self can update participants" ON public.battle_session_participants;
DROP POLICY IF EXISTS "Admins, arbs, session creator or self can delete participants" ON public.battle_session_participants;

CREATE POLICY "Admins, arbs, session creator or self can insert participants" ON public.battle_session_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_participants.battle_session_id
        AND (bs.created_by = (SELECT auth.uid()) OR private.is_arb(bs.campaign_id))
    )
    OR user_id = (SELECT auth.uid())
  );

CREATE POLICY "Admins, arbs, session creator or self can update participants" ON public.battle_session_participants
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_participants.battle_session_id
        AND (bs.created_by = (SELECT auth.uid()) OR private.is_arb(bs.campaign_id))
    )
    OR user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_participants.battle_session_id
        AND (bs.created_by = (SELECT auth.uid()) OR private.is_arb(bs.campaign_id))
    )
    OR user_id = (SELECT auth.uid())
  );

CREATE POLICY "Admins, arbs, session creator or self can delete participants" ON public.battle_session_participants
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.battle_sessions bs
      WHERE bs.id = battle_session_participants.battle_session_id
        AND (bs.created_by = (SELECT auth.uid()) OR private.is_arb(bs.campaign_id))
    )
    OR user_id = (SELECT auth.uid())
  );

-- 2. Unused indexes (~226 MB)
--
-- No query in the app, API routes, edge functions or supabase/functions uses
-- these, so they only cost memory and slow down every write to fighters and
-- fighter_equipment. fighter_equipment.user_id has no foreign key, so account
-- deletion does not need its index either.
--
-- Plain DROP INDEX, not CONCURRENTLY, because the migration runs in a
-- transaction. Each drop only holds its table's lock for a moment.

DROP INDEX IF EXISTS public.fighters_updated_at_idx;
DROP INDEX IF EXISTS public.fighters_created_at_idx;
DROP INDEX IF EXISTS public.fighters_fighter_name_idx;
DROP INDEX IF EXISTS public.idx_fighters_gang_status_composite;
DROP INDEX IF EXISTS public.fighter_equipment_created_at_idx;
DROP INDEX IF EXISTS public.fighter_equipment_is_editable_idx;
DROP INDEX IF EXISTS public.fighter_equipment_user_id_idx;
