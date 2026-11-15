-- Players in a battle session can cancel (delete) it too.

BEGIN;

DROP POLICY IF EXISTS "Admins, arbs or creator can delete battle sessions" ON public.battle_sessions;

CREATE POLICY "Admins, arbs, creator or participants can delete battle sessions" ON public.battle_sessions
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR (SELECT private.is_arb(campaign_id))
    OR created_by = (SELECT auth.uid())
    OR id IN (
      SELECT bsp.battle_session_id FROM public.battle_session_participants bsp
      WHERE bsp.user_id = (SELECT auth.uid())
    )
  );

COMMIT;
