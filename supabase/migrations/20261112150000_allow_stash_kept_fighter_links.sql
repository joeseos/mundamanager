-- A fighter kept in the gang stash by its item (the N26 Trazior Pattern Sentry
-- Gun's card) has no owner, so its fighter_exotic_beasts row has
-- fighter_owner_id NULL. The INSERT check only looked at the owner, so it
-- refused that row for everyone but admins. It now checks the owner, or the
-- fighter itself when there is none.
--
-- Only INSERT needs this: these rows are never updated (the item can't leave the
-- stash) and are removed by the cascade from fighter_equipment, which RLS does
-- not apply to.
--
-- Safe to run again: the policy is dropped before it is recreated.

BEGIN;

DROP POLICY IF EXISTS "Fighter owner, admin or arb can create exotic beasts" ON public.fighter_exotic_beasts;

CREATE POLICY "Fighter owner, admin or arb can create exotic beasts"
  ON public.fighter_exotic_beasts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR COALESCE(fighter_owner_id, fighter_pet_id) IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE f.id = COALESCE(fighter_exotic_beasts.fighter_owner_id, fighter_exotic_beasts.fighter_pet_id)
        AND cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  );

COMMIT;
