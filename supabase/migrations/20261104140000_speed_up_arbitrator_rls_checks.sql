-- Arbitrator checks in RLS policies
--
-- These policies let an Owner or Arbitrator of a campaign edit the gangs in
-- it, with checks written as
--   gang_id IN (SELECT cg.gang_id FROM campaign_gangs cg
--               WHERE cg.status = 'ACCEPTED' AND (SELECT private.is_arb(cg.campaign_id)))
-- Postgres runs that subquery over every accepted campaign gang (~21,500),
-- calling is_arb() on each, whenever the owner check before it fails. So an
-- Arbitrator editing another player's fighter, skill or equipment, or opening
-- their gang logs, paid ~350-450 ms per statement.
--
-- private.is_gang_arb() checks only the row's own gang (reached through its
-- fighter, vehicle, loadout or effect where the table has no gang_id). Who is
-- allowed is unchanged, except that fighter_skill_access_override UPDATE and
-- DELETE now also include the fighter-owner branch from
-- 20260831120000_allow_fighter_owner_to_edit_skill_overrides.sql, which was
-- never applied to production.
--
-- Safe to run again: the function is replaced and every policy is dropped
-- before it is recreated.

BEGIN;

-- True when the caller is an Owner or Arbitrator of a campaign the gang is
-- ACCEPTED in. Used by RLS policies on gang-owned tables.
CREATE OR REPLACE FUNCTION private.is_gang_arb(gang_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM campaign_gangs cg
    WHERE cg.gang_id = gang_id_param
    AND cg.status = 'ACCEPTED'
    AND private.is_arb(cg.campaign_id)
  );
$$;

-- fighter_equipment
DROP POLICY IF EXISTS "Users can create equipment for their gang" ON public.fighter_equipment;
CREATE POLICY "Users can create equipment for their gang" ON public.fighter_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Users can update equipment in their gang" ON public.fighter_equipment;
CREATE POLICY "Users can update equipment in their gang" ON public.fighter_equipment
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Users can delete equipment from their gang" ON public.fighter_equipment;
CREATE POLICY "Users can delete equipment from their gang" ON public.fighter_equipment
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );

-- vehicles
DROP POLICY IF EXISTS "vehicles_user_insert_policy" ON public.vehicles;
CREATE POLICY "vehicles_user_insert_policy" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "vehicles_user_update_policy" ON public.vehicles;
CREATE POLICY "vehicles_user_update_policy" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "vehicles_user_delete_policy" ON public.vehicles;
CREATE POLICY "vehicles_user_delete_policy" ON public.vehicles
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );

-- gang_tactics_cards
DROP POLICY IF EXISTS "Users can create tactic cards for their gang" ON public.gang_tactics_cards;
CREATE POLICY "Users can create tactic cards for their gang" ON public.gang_tactics_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Users can update tactic cards in their gang" ON public.gang_tactics_cards;
CREATE POLICY "Users can update tactic cards in their gang" ON public.gang_tactics_cards
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Users can delete tactic cards from their gang" ON public.gang_tactics_cards;
CREATE POLICY "Users can delete tactic cards from their gang" ON public.gang_tactics_cards
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );

-- gang_skill_set_ranks
DROP POLICY IF EXISTS "Users can create skill set ranks for their gang" ON public.gang_skill_set_ranks;
CREATE POLICY "Users can create skill set ranks for their gang" ON public.gang_skill_set_ranks
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Users can delete skill set ranks from their gang" ON public.gang_skill_set_ranks;
CREATE POLICY "Users can delete skill set ranks from their gang" ON public.gang_skill_set_ranks
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );

-- gang_logs
DROP POLICY IF EXISTS "Users can view logs for their gangs or campaigns they moderate" ON public.gang_logs;
CREATE POLICY "Users can view logs for their gangs or campaigns they moderate" ON public.gang_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );

-- fighter_ooa_records
DROP POLICY IF EXISTS "Gang owner, admin or arb can insert fighter ooa records" ON public.fighter_ooa_records;
CREATE POLICY "Gang owner, admin or arb can insert fighter ooa records" ON public.fighter_ooa_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(causing_gang_id)
  );
DROP POLICY IF EXISTS "Gang owner, admin or arb can update fighter ooa records" ON public.fighter_ooa_records;
CREATE POLICY "Gang owner, admin or arb can update fighter ooa records" ON public.fighter_ooa_records
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(causing_gang_id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(causing_gang_id)
  );
DROP POLICY IF EXISTS "Gang owner, admin or arb can delete fighter ooa records" ON public.fighter_ooa_records;
CREATE POLICY "Gang owner, admin or arb can delete fighter ooa records" ON public.fighter_ooa_records
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(causing_gang_id)
  );

-- gangs
DROP POLICY IF EXISTS "Only gang owner, admin, or arbitrator can update" ON public.gangs;
CREATE POLICY "Only gang owner, admin, or arbitrator can update" ON public.gangs
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR private.is_gang_arb(id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR private.is_gang_arb(id)
  );

-- fighters
DROP POLICY IF EXISTS "Gang owners, admins, or arbitrators can create fighters" ON public.fighters;
CREATE POLICY "Gang owners, admins, or arbitrators can create fighters" ON public.fighters
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = (SELECT auth.uid()))
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Only fighter owner, admin, or arbitrator can update" ON public.fighters;
CREATE POLICY "Only fighter owner, admin, or arbitrator can update" ON public.fighters
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR private.is_gang_arb(gang_id)
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR private.is_gang_arb(gang_id)
  );
DROP POLICY IF EXISTS "Only fighter owner, admin, or arbitrator can delete" ON public.fighters;
CREATE POLICY "Only fighter owner, admin, or arbitrator can delete" ON public.fighters
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR private.is_gang_arb(gang_id)
  );

-- fighter_skills
DROP POLICY IF EXISTS "Users can create skills for their own fighters" ON public.fighter_skills;
CREATE POLICY "Users can create skills for their own fighters" ON public.fighter_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR (
      fighter_id IS NOT NULL
      AND (
        fighter_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.fighters f
          WHERE f.id = fighter_skills.fighter_id AND private.is_gang_arb(f.gang_id)
        )
      )
    )
  );
DROP POLICY IF EXISTS "Only fighter skill owner or admin can update" ON public.fighter_skills;
CREATE POLICY "Only fighter skill owner or admin can update" ON public.fighter_skills
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skills.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skills.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Only fighter skill owner or admin can delete" ON public.fighter_skills;
CREATE POLICY "Only fighter skill owner or admin can delete" ON public.fighter_skills
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skills.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );

-- fighter_skill_access_override
DROP POLICY IF EXISTS "Users can create skill access overrides for their own fighters" ON public.fighter_skill_access_override;
CREATE POLICY "Users can create skill access overrides for their own fighters" ON public.fighter_skill_access_override
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR (
      fighter_id IS NOT NULL
      AND (
        fighter_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.fighters f
          WHERE f.id = fighter_skill_access_override.fighter_id AND private.is_gang_arb(f.gang_id)
        )
      )
    )
  );
DROP POLICY IF EXISTS "Only override owner or admin can update" ON public.fighter_skill_access_override;
CREATE POLICY "Only override owner or admin can update" ON public.fighter_skill_access_override
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR fighter_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skill_access_override.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR fighter_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skill_access_override.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Only override owner or admin can delete" ON public.fighter_skill_access_override;
CREATE POLICY "Only override owner or admin can delete" ON public.fighter_skill_access_override
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR fighter_id IN (SELECT f.id FROM public.fighters f WHERE f.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_skill_access_override.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );

-- fighter_loadouts
DROP POLICY IF EXISTS "Users can create loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can create loadouts for their gang fighters" ON public.fighter_loadouts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_loadouts.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Users can update loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can update loadouts for their gang fighters" ON public.fighter_loadouts
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_loadouts.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_loadouts.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Users can delete loadouts for their gang fighters" ON public.fighter_loadouts;
CREATE POLICY "Users can delete loadouts for their gang fighters" ON public.fighter_loadouts
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_loadouts.fighter_id AND private.is_gang_arb(f.gang_id)
    )
  );

-- fighter_loadout_equipment
DROP POLICY IF EXISTS "Users can create loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can create loadout equipment for their fighters" ON public.fighter_loadout_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR loadout_id IN (SELECT fl.id FROM public.fighter_loadouts fl WHERE fl.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_loadouts fl
      JOIN public.fighters f ON f.id = fl.fighter_id
      WHERE fl.id = fighter_loadout_equipment.loadout_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Users can update loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can update loadout equipment for their fighters" ON public.fighter_loadout_equipment
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR loadout_id IN (SELECT fl.id FROM public.fighter_loadouts fl WHERE fl.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_loadouts fl
      JOIN public.fighters f ON f.id = fl.fighter_id
      WHERE fl.id = fighter_loadout_equipment.loadout_id AND private.is_gang_arb(f.gang_id)
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR loadout_id IN (SELECT fl.id FROM public.fighter_loadouts fl WHERE fl.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_loadouts fl
      JOIN public.fighters f ON f.id = fl.fighter_id
      WHERE fl.id = fighter_loadout_equipment.loadout_id AND private.is_gang_arb(f.gang_id)
    )
  );
DROP POLICY IF EXISTS "Users can delete loadout equipment for their fighters" ON public.fighter_loadout_equipment;
CREATE POLICY "Users can delete loadout equipment for their fighters" ON public.fighter_loadout_equipment
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR loadout_id IN (SELECT fl.id FROM public.fighter_loadouts fl WHERE fl.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_loadouts fl
      JOIN public.fighters f ON f.id = fl.fighter_id
      WHERE fl.id = fighter_loadout_equipment.loadout_id AND private.is_gang_arb(f.gang_id)
    )
  );

-- fighter_effects
DROP POLICY IF EXISTS "Only fighter effect owner or admin can update" ON public.fighter_effects;
CREATE POLICY "Only fighter effect owner or admin can update" ON public.fighter_effects
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR (fighter_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_effects.fighter_id AND private.is_gang_arb(f.gang_id)
    ))
    OR (vehicle_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fighter_effects.vehicle_id AND private.is_gang_arb(v.gang_id)
    ))
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR (fighter_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_effects.fighter_id AND private.is_gang_arb(f.gang_id)
    ))
    OR (vehicle_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fighter_effects.vehicle_id AND private.is_gang_arb(v.gang_id)
    ))
  );
DROP POLICY IF EXISTS "Only fighter effect owner or admin can delete" ON public.fighter_effects;
CREATE POLICY "Only fighter effect owner or admin can delete" ON public.fighter_effects
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_admin())
    OR user_id = (SELECT auth.uid())
    OR (fighter_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fighters f
      WHERE f.id = fighter_effects.fighter_id AND private.is_gang_arb(f.gang_id)
    ))
    OR (vehicle_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = fighter_effects.vehicle_id AND private.is_gang_arb(v.gang_id)
    ))
  );
DROP POLICY IF EXISTS "Users can only create their own fighter effects" ON public.fighter_effects;
CREATE POLICY "Users can only create their own fighter effects" ON public.fighter_effects
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR (
      fighter_id IS NOT NULL
      AND (
        fighter_id IN (
          SELECT f.id FROM public.fighters f JOIN public.gangs g ON f.gang_id = g.id
          WHERE g.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.fighters f
          WHERE f.id = fighter_effects.fighter_id AND private.is_gang_arb(f.gang_id)
        )
      )
    )
    OR (
      vehicle_id IS NOT NULL
      AND (
        vehicle_id IN (
          SELECT v.id FROM public.vehicles v JOIN public.gangs g ON v.gang_id = g.id
          WHERE g.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.vehicles v
          WHERE v.id = fighter_effects.vehicle_id AND private.is_gang_arb(v.gang_id)
        )
      )
    )
  );

-- fighter_effect_modifiers
DROP POLICY IF EXISTS "fighter_effect_modifiers_insert_policy" ON public.fighter_effect_modifiers;
CREATE POLICY "fighter_effect_modifiers_insert_policy" ON public.fighter_effect_modifiers
  FOR INSERT
  WITH CHECK (
    (SELECT private.is_admin())
    OR fighter_effect_id IN (SELECT fe.id FROM public.fighter_effects fe WHERE fe.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.fighters f ON f.id = fe.fighter_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(f.gang_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.vehicles v ON v.id = fe.vehicle_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(v.gang_id)
    )
  );
DROP POLICY IF EXISTS "fighter_effect_modifiers_update_policy" ON public.fighter_effect_modifiers;
CREATE POLICY "fighter_effect_modifiers_update_policy" ON public.fighter_effect_modifiers
  FOR UPDATE
  USING (
    (SELECT private.is_admin())
    OR fighter_effect_id IN (SELECT fe.id FROM public.fighter_effects fe WHERE fe.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.fighters f ON f.id = fe.fighter_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(f.gang_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.vehicles v ON v.id = fe.vehicle_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(v.gang_id)
    )
  )
  WITH CHECK (
    (SELECT private.is_admin())
    OR fighter_effect_id IN (SELECT fe.id FROM public.fighter_effects fe WHERE fe.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.fighters f ON f.id = fe.fighter_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(f.gang_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.vehicles v ON v.id = fe.vehicle_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(v.gang_id)
    )
  );
DROP POLICY IF EXISTS "fighter_effect_modifiers_delete_policy" ON public.fighter_effect_modifiers;
CREATE POLICY "fighter_effect_modifiers_delete_policy" ON public.fighter_effect_modifiers
  FOR DELETE
  USING (
    (SELECT private.is_admin())
    OR fighter_effect_id IN (SELECT fe.id FROM public.fighter_effects fe WHERE fe.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.fighters f ON f.id = fe.fighter_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(f.gang_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.fighter_effects fe
      JOIN public.vehicles v ON v.id = fe.vehicle_id
      WHERE fe.id = fighter_effect_modifiers.fighter_effect_id AND private.is_gang_arb(v.gang_id)
    )
  );

COMMIT;
