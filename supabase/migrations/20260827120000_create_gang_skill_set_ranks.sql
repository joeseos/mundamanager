CREATE TABLE public.gang_skill_set_ranks (
    gang_id       uuid        NOT NULL REFERENCES public.gangs(id)       ON DELETE CASCADE,
    rank          int         NOT NULL CHECK (rank BETWEEN 1 AND 4),
    skill_type_id uuid        NOT NULL REFERENCES public.skill_types(id) ON DELETE RESTRICT,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz,
    PRIMARY KEY (gang_id, rank),
    UNIQUE (gang_id, skill_type_id)
);

ALTER TABLE public.gang_skill_set_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang_skill_set_ranks"
    ON public.gang_skill_set_ranks FOR SELECT
    TO authenticated
    USING (true);

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

GRANT SELECT, INSERT, DELETE ON public.gang_skill_set_ranks
    TO authenticated, service_role;
