DROP POLICY IF EXISTS "Only override owner or admin can delete"
    ON public.fighter_skill_access_override;

CREATE POLICY "Only override owner or admin can delete"
    ON public.fighter_skill_access_override
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
        OR user_id = (SELECT auth.uid())
        OR fighter_id IN (
            SELECT f.id FROM public.fighters f
            WHERE f.user_id = (SELECT auth.uid())
        )
        OR fighter_id IN (
            SELECT f.id
            FROM public.fighters f
            JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );

DROP POLICY IF EXISTS "Only override owner or admin can update"
    ON public.fighter_skill_access_override;

CREATE POLICY "Only override owner or admin can update"
    ON public.fighter_skill_access_override
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
        OR user_id = (SELECT auth.uid())
        OR fighter_id IN (
            SELECT f.id FROM public.fighters f
            WHERE f.user_id = (SELECT auth.uid())
        )
        OR fighter_id IN (
            SELECT f.id
            FROM public.fighters f
            JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    )
    WITH CHECK (
        (SELECT private.is_admin())
        OR user_id = (SELECT auth.uid())
        OR fighter_id IN (
            SELECT f.id FROM public.fighters f
            WHERE f.user_id = (SELECT auth.uid())
        )
        OR fighter_id IN (
            SELECT f.id
            FROM public.fighters f
            JOIN public.campaign_gangs cg ON cg.gang_id = f.gang_id
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );
