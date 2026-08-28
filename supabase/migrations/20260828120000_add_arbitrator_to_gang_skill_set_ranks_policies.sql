DROP POLICY IF EXISTS "Only gang owner or admin can insert gang_skill_set_ranks"
    ON public.gang_skill_set_ranks;

DROP POLICY IF EXISTS "Only gang owner or admin can update gang_skill_set_ranks"
    ON public.gang_skill_set_ranks;

DROP POLICY IF EXISTS "Only gang owner or admin can delete gang_skill_set_ranks"
    ON public.gang_skill_set_ranks;

CREATE POLICY "gang_skill_set_ranks insert: owner, admin, or arbitrator"
    ON public.gang_skill_set_ranks FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.campaign_gangs cg
            WHERE cg.gang_id = gang_skill_set_ranks.gang_id
              AND cg.status = 'ACCEPTED'
              AND private.is_arb(cg.campaign_id)
        )
    );

CREATE POLICY "gang_skill_set_ranks update: owner, admin, or arbitrator"
    ON public.gang_skill_set_ranks FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.campaign_gangs cg
            WHERE cg.gang_id = gang_skill_set_ranks.gang_id
              AND cg.status = 'ACCEPTED'
              AND private.is_arb(cg.campaign_id)
        )
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.campaign_gangs cg
            WHERE cg.gang_id = gang_skill_set_ranks.gang_id
              AND cg.status = 'ACCEPTED'
              AND private.is_arb(cg.campaign_id)
        )
    );

CREATE POLICY "gang_skill_set_ranks delete: owner, admin, or arbitrator"
    ON public.gang_skill_set_ranks FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.campaign_gangs cg
            WHERE cg.gang_id = gang_skill_set_ranks.gang_id
              AND cg.status = 'ACCEPTED'
              AND private.is_arb(cg.campaign_id)
        )
    );
