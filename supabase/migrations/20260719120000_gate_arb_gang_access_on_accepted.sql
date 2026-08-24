-- Migration: gate arbitrator gang authority on ACCEPTED campaign_gangs status
--
-- Security fix. A campaign OWNER/ARBITRATOR can insert any gang into
-- campaign_gangs; for a gang they do not own the app sets status = 'PENDING'
-- and only the gang owner can flip it to 'ACCEPTED' (acceptGangInvite). That
-- acceptance is the intended consent gate for granting an arbitrator edit
-- rights over the gang.
--
-- The RLS policies (and two SECURITY DEFINER RPCs) that derive arbitrator
-- authority from campaign_gangs did NOT check status. They matched on mere
-- membership via private.is_arb(cg.campaign_id), so a PENDING (or NULL-status)
-- row already granted the arbitrator UPDATE/DELETE over the gang's fighters,
-- vehicles, effects, equipment, etc. — before the owner accepted, or without
-- them ever accepting. The UI hid these actions (check_permission filters
-- status = 'ACCEPTED'), but the server actions rely on RLS, so a direct call
-- succeeded. This aligns the enforcement layer with the app's consent model.
--
-- Every policy/branch below that grants authority through campaign_gangs now
-- additionally requires cg.status = 'ACCEPTED'. Gang-owner (user_id =
-- auth.uid()) and admin branches are unchanged, as are the campaign-level
-- policies (campaign_gangs invite management, campaign_maps, battle_sessions)
-- whose authority is not derived from an individual gang's participation.
--
-- Scope: this migration covers the RLS policies only. The two SECURITY DEFINER
-- RPCs that share the same flaw (public.add_fighter_injury, public.add_vehicle_effect)
-- receive the identical `cg.status = 'ACCEPTED'` gate and are applied separately
-- from supabase/functions/add_fighter_injury.sql and add_vehicle_effect.sql.
--
-- Idempotent: each policy is dropped (IF EXISTS) and recreated.

-- ===========================================================================
-- RLS policies
-- ===========================================================================

DROP POLICY IF EXISTS "Gang owners and campaign managers can delete campaign gang reso" ON public.campaign_gang_resources;
CREATE POLICY "Gang owners and campaign managers can delete campaign gang reso" ON public.campaign_gang_resources FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));

DROP POLICY IF EXISTS "Gang owners and campaign managers can insert campaign gang reso" ON public.campaign_gang_resources;
CREATE POLICY "Gang owners and campaign managers can insert campaign gang reso" ON public.campaign_gang_resources FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));

DROP POLICY IF EXISTS "Gang owners and campaign managers can update campaign gang reso" ON public.campaign_gang_resources;
CREATE POLICY "Gang owners and campaign managers can update campaign gang reso" ON public.campaign_gang_resources FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));

DROP POLICY IF EXISTS "Gang owners, admins, or arbitrators can create fighters" ON public.fighters;
CREATE POLICY "Gang owners, admins, or arbitrators can create fighters" ON public.fighters FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only fighter effect owner or admin can delete" ON public.fighter_effects;
CREATE POLICY "Only fighter effect owner or admin can delete" ON public.fighter_effects FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))));

DROP POLICY IF EXISTS "Only fighter effect owner or admin can update" ON public.fighter_effects;
CREATE POLICY "Only fighter effect owner or admin can update" ON public.fighter_effects FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))));

DROP POLICY IF EXISTS "Only fighter owner, admin, or arbitrator can delete" ON public.fighters;
CREATE POLICY "Only fighter owner, admin, or arbitrator can delete" ON public.fighters FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only fighter owner, admin, or arbitrator can update" ON public.fighters;
CREATE POLICY "Only fighter owner, admin, or arbitrator can update" ON public.fighters FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only fighter skill owner or admin can delete" ON public.fighter_skills;
CREATE POLICY "Only fighter skill owner or admin can delete" ON public.fighter_skills FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only fighter skill owner or admin can update" ON public.fighter_skills;
CREATE POLICY "Only fighter skill owner or admin can update" ON public.fighter_skills FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only gang owner, admin, or arbitrator can update" ON public.gangs;
CREATE POLICY "Only gang owner, admin, or arbitrator can update" ON public.gangs FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only override owner or admin can delete" ON public.fighter_skill_access_override;
CREATE POLICY "Only override owner or admin can delete" ON public.fighter_skill_access_override FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Only override owner or admin can update" ON public.fighter_skill_access_override;
CREATE POLICY "Only override owner or admin can update" ON public.fighter_skill_access_override FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can create equipment for their gang" ON public.fighter_equipment;
CREATE POLICY "Users can create equipment for their gang" ON public.fighter_equipment FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can create loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can create loadout equipment for their fighters" ON public.fighter_loadout_equipment FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (loadout_id IN ( SELECT fl.id
   FROM public.fighter_loadouts fl
  WHERE (fl.user_id = ( SELECT auth.uid() AS uid)))) OR (loadout_id IN ( SELECT fl.id
   FROM ((public.fighter_loadouts fl
     JOIN public.fighters f ON ((f.id = fl.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can create loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can create loadouts for their gang fighters" ON public.fighter_loadouts FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can create skill access overrides for their own fighters" ON public.fighter_skill_access_override;
CREATE POLICY "Users can create skill access overrides for their own fighters" ON public.fighter_skill_access_override FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))))));

DROP POLICY IF EXISTS "Users can create skills for their own fighters" ON public.fighter_skills;
CREATE POLICY "Users can create skills for their own fighters" ON public.fighter_skills FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))))));

DROP POLICY IF EXISTS "Users can delete equipment from their gang" ON public.fighter_equipment;
CREATE POLICY "Users can delete equipment from their gang" ON public.fighter_equipment FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can delete loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can delete loadout equipment for their fighters" ON public.fighter_loadout_equipment FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (loadout_id IN ( SELECT fl.id
   FROM public.fighter_loadouts fl
  WHERE (fl.user_id = ( SELECT auth.uid() AS uid)))) OR (loadout_id IN ( SELECT fl.id
   FROM ((public.fighter_loadouts fl
     JOIN public.fighters f ON ((f.id = fl.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can delete loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can delete loadouts for their gang fighters" ON public.fighter_loadouts FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can insert logs for their gangs or campaign gangs" ON public.gang_logs;
CREATE POLICY "Users can insert logs for their gangs or campaign gangs" ON public.gang_logs FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text, 'MEMBER'::text])))))));

DROP POLICY IF EXISTS "Users can only create their own fighter effects" ON public.fighter_effects;
CREATE POLICY "Users can only create their own fighter effects" ON public.fighter_effects FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.gangs g ON ((f.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) OR ((vehicle_id IS NOT NULL) AND ((vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.gangs g ON ((v.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))))));

DROP POLICY IF EXISTS "Users can update equipment in their gang" ON public.fighter_equipment;
CREATE POLICY "Users can update equipment in their gang" ON public.fighter_equipment FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can update loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can update loadout equipment for their fighters" ON public.fighter_loadout_equipment FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (loadout_id IN ( SELECT fl.id
   FROM public.fighter_loadouts fl
  WHERE (fl.user_id = ( SELECT auth.uid() AS uid)))) OR (loadout_id IN ( SELECT fl.id
   FROM ((public.fighter_loadouts fl
     JOIN public.fighters f ON ((f.id = fl.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (loadout_id IN ( SELECT fl.id
   FROM public.fighter_loadouts fl
  WHERE (fl.user_id = ( SELECT auth.uid() AS uid)))) OR (loadout_id IN ( SELECT fl.id
   FROM ((public.fighter_loadouts fl
     JOIN public.fighters f ON ((f.id = fl.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can update loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can update loadouts for their gang fighters" ON public.fighter_loadouts FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS "Users can view logs for their gangs or campaigns they moderate" ON public.gang_logs;
CREATE POLICY "Users can view logs for their gangs or campaigns they moderate" ON public.gang_logs FOR SELECT TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS fighter_effect_modifiers_delete_policy ON public.fighter_effect_modifiers;
CREATE POLICY fighter_effect_modifiers_delete_policy ON public.fighter_effect_modifiers FOR DELETE USING ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id))))));

DROP POLICY IF EXISTS fighter_effect_modifiers_insert_policy ON public.fighter_effect_modifiers;
CREATE POLICY fighter_effect_modifiers_insert_policy ON public.fighter_effect_modifiers FOR INSERT WITH CHECK ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id))))));

DROP POLICY IF EXISTS fighter_effect_modifiers_update_policy ON public.fighter_effect_modifiers;
CREATE POLICY fighter_effect_modifiers_update_policy ON public.fighter_effect_modifiers FOR UPDATE USING ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id)))))) WITH CHECK ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND (cg.status = 'ACCEPTED'::text) AND private.is_arb(cg.campaign_id))))));

DROP POLICY IF EXISTS vehicles_user_delete_policy ON public.vehicles;
CREATE POLICY vehicles_user_delete_policy ON public.vehicles FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS vehicles_user_insert_policy ON public.vehicles;
CREATE POLICY vehicles_user_insert_policy ON public.vehicles FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

DROP POLICY IF EXISTS vehicles_user_update_policy ON public.vehicles;
CREATE POLICY vehicles_user_update_policy ON public.vehicles FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ((cg.status = 'ACCEPTED'::text) AND ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));

