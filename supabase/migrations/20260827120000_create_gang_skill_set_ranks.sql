CREATE TABLE public.gang_skill_set_ranks (
    gang_id       uuid        NOT NULL REFERENCES public.gangs(id)       ON DELETE CASCADE,
    rank          int         NOT NULL CHECK (rank BETWEEN 1 AND 4),
    skill_type_id uuid        NOT NULL REFERENCES public.skill_types(id) ON DELETE RESTRICT,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (gang_id, rank),
    UNIQUE (gang_id, skill_type_id)
);

ALTER TABLE public.gang_skill_set_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang skill set ranks"
    ON public.gang_skill_set_ranks
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create skill set ranks for their gang"
    ON public.gang_skill_set_ranks
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );

CREATE POLICY "Users can delete skill set ranks from their gang"
    ON public.gang_skill_set_ranks
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );

GRANT SELECT, INSERT, DELETE ON public.gang_skill_set_ranks
    TO authenticated, service_role;
