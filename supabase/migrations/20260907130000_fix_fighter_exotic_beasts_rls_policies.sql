-- Derive fighter_exotic_beasts write authority from gang ownership.
--
-- All three write policies keyed off fighters.user_id via fighter_owner_id.
-- That has no arbitrator branch (the only table in this family without one),
-- treats the fighters.user_id creator stamp as if it stated gang ownership, so
-- a gang owner is locked out of any fighter an arbitrator created inside their
-- gang, and cannot express a stash beast whose fighter_owner_id is still NULL
-- (NULL IN (...) is NULL, not TRUE, so both the INSERT and the later claiming
-- UPDATE were refused).
--
-- Key off the gang on the granting fighter_equipment row instead, mirroring
-- fighter_equipment's own policies. fighter_equipment_id is fixed for the life
-- of a beast, so one predicate holds from purchase through assignment to
-- deletion. Two legacy rows with a NULL fighter_equipment_id stay unwritable;
-- both are already orphaned and want a separate cleanup.

DROP POLICY IF EXISTS "Users can only create their own fighter exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Users can create exotic beasts for their gang" ON public.fighter_exotic_beasts;
CREATE POLICY "Users can create exotic beasts for their gang" ON public.fighter_exotic_beasts FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));


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


DROP POLICY IF EXISTS "Only fighter owner or admin can delete exotic beasts" ON public.fighter_exotic_beasts;
DROP POLICY IF EXISTS "Users can delete exotic beasts from their gang" ON public.fighter_exotic_beasts;
CREATE POLICY "Users can delete exotic beasts from their gang" ON public.fighter_exotic_beasts FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.gangs g ON ((g.id = fe.gang_id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_equipment_id IN ( SELECT fe.id
   FROM (public.fighter_equipment fe
     JOIN public.campaign_gangs cg ON ((cg.gang_id = fe.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));
