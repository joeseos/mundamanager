-- Let a gang owner create the effect->skill link, not just an admin.
--
-- fighter_effect_skills was written by exactly one caller until now:
-- add_fighter_injury(), which is SECURITY DEFINER and so never saw the
-- admin-only INSERT policy. Equipment grants a skill from a server action
-- running as the user, which does, so without this the insert fails silently
-- for everyone except admins.
--
-- Scoped like "Users can create skills for their own fighters" on
-- fighter_skills, reached through the fighter_skills row this links to: the
-- fighter's owner, or an arbitrator of a campaign the gang has joined.
--
-- INSERT only. Removal happens through the ON DELETE CASCADE from
-- fighter_effects, which runs as the table owner and does not consult RLS.

CREATE POLICY "Users can create effect skill links for their own fighters"
  ON public.fighter_effect_skills
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    OR fighter_skill_id IN (
      SELECT fs.id
      FROM public.fighter_skills fs
      JOIN public.fighters f ON f.id = fs.fighter_id
      WHERE f.user_id = (SELECT auth.uid())
    )
    OR fighter_skill_id IN (
      SELECT fs.id
      FROM public.fighter_skills fs
      JOIN public.fighters f ON f.id = fs.fighter_id
      JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
      WHERE cg.status = 'ACCEPTED'
        AND (SELECT private.is_arb(cg.campaign_id))
    )
  );
