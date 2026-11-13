-- Every player in a battle session can cancel it, not only the creator,
-- campaign Owner/Arbitrators and admins. Cancelling deletes the session;
-- participants and crew rows go with it through ON DELETE CASCADE.
--
-- Safe to run again: the policy is dropped before it is recreated.

BEGIN;

DROP POLICY IF EXISTS "Admins, arbs or creator can delete battle sessions" ON public.battle_sessions;
DROP POLICY IF EXISTS "Admins, arbs, creator or participants can delete battle sessions" ON public.battle_sessions;

CREATE POLICY "Admins, arbs, creator or participants can delete battle sessions" ON public.battle_sessions
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR private.is_arb(campaign_id)
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.battle_session_participants bsp
      WHERE bsp.battle_session_id = battle_sessions.id
        AND bsp.user_id = (SELECT auth.uid())
    )
  );

COMMIT;
