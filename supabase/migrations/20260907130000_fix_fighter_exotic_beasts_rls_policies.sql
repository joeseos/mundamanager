-- Migration: derive fighter_exotic_beasts write authority from gang ownership
--
-- All three write policies derived authority from fighters.user_id:
--
--   fighter_owner_id IN (SELECT f.id FROM fighters f WHERE f.user_id = auth.uid())
--
-- That is wrong on two counts.
--
-- 1. No arbitrator branch. fighter_exotic_beasts was the only table in this
--    family without one. An arbitrator acting on an ACCEPTED campaign gang
--    could insert the fighter_equipment row and the beast's own fighters row,
--    but not the link row joining them -- leaving a half-created beast and the
--    error "Failed to create beast ownership record: new row violates
--    row-level security policy for table fighter_exotic_beasts".
--
-- 2. fighters.user_id is a creator stamp (DEFAULT auth.uid()), not a statement
--    of gang ownership. A fighter an arbitrator created inside a member's gang
--    carries the arbitrator's id permanently, so the gang owner is then
--    blocked from buying that fighter a beast. 28 fighters across 25 gangs
--    currently have a user_id that differs from their gang's user_id, and
--    almost all of them are beasts orphaned by exactly this failure.
--
-- A third case the old predicate could not express: fighter_owner_id is NULL
-- between a gang-stash beast purchase and its assignment to a fighter
-- (buyEquipmentForFighter passes ownerFighterId: null; moveEquipmentFromStash
-- sets it later). NULL IN (...) yields NULL rather than TRUE, so the INSERT was
-- refused outright, and the UPDATE's USING clause could never see the row in
-- order to claim it.
--
-- The policies below derive authority from the gang on the granting
-- fighter_equipment row instead, mirroring fighter_equipment's own policies.
-- fighter_equipment_id is fixed for the life of a beast, so one predicate holds
-- from purchase through assignment to deletion.
--
-- Not covered: two legacy rows have a NULL fighter_equipment_id (both already
-- orphaned -- no matching fighter_equipment row exists). They are not writable
-- under these policies and want a separate cleanup.
--
-- Idempotent: both the old and the new policy names are dropped IF EXISTS.

-- ===========================================================================
-- INSERT
-- ===========================================================================

DROP POLICY IF EXISTS "Users can only create their own fighter exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Users can create exotic beasts for their gang" ON public.fighter_exotic_beasts;
CREATE POLICY "Users can create exotic beasts for their gang" ON public.fighter_exotic_beasts FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

-- ===========================================================================
-- UPDATE
-- ===========================================================================

DROP POLICY IF EXISTS "Only fighter owner or admin can update exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Users can update exotic beasts in their gang" ON public.fighter_exotic_beasts;
CREATE POLICY "Users can update exotic beasts in their gang" ON public.fighter_exotic_beasts FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

-- ===========================================================================
-- DELETE
-- ===========================================================================

DROP POLICY IF EXISTS "Only fighter owner or admin can delete exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Users can delete exotic beasts from their gang" ON public.fighter_exotic_beasts;
CREATE POLICY "Users can delete exotic beasts from their gang" ON public.fighter_exotic_beasts FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));
