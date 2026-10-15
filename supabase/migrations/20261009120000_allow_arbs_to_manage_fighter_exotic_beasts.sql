-- Arbitrators could not buy beast-granting equipment for other players' fighters:
-- unlike the other fighter tables, these policies had no arbitrator clause.
-- EXISTS rather than IN (...) so is_arb() is not run for every campaign gang.

BEGIN;

DROP POLICY IF EXISTS "Users can only create their own fighter exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Only fighter owner or admin can update exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Only fighter owner or admin can delete exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Fighter owner, admin or arb can create exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Fighter owner, admin or arb can update exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Fighter owner, admin or arb can delete exotic beasts" ON public.fighter_exotic_beasts;

CREATE POLICY "Fighter owner, admin or arb can create exotic beasts"
  ON public.fighter_exotic_beasts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR fighter_owner_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE f.id = fighter_exotic_beasts.fighter_owner_id
        AND cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  );

CREATE POLICY "Fighter owner, admin or arb can update exotic beasts"
  ON public.fighter_exotic_beasts FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR fighter_owner_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE f.id = fighter_exotic_beasts.fighter_owner_id
        AND cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR fighter_owner_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE f.id = fighter_exotic_beasts.fighter_owner_id
        AND cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  );

CREATE POLICY "Fighter owner, admin or arb can delete exotic beasts"
  ON public.fighter_exotic_beasts FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR fighter_owner_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE f.id = fighter_exotic_beasts.fighter_owner_id
        AND cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  );

COMMIT;
