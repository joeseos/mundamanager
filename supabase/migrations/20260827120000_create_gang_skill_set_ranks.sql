CREATE TABLE public.gang_skill_set_ranks (
    gang_id       uuid        NOT NULL REFERENCES public.gangs(id)       ON DELETE CASCADE,
    rank          int         NOT NULL CHECK (rank BETWEEN 1 AND 4),
    skill_type_id uuid        NOT NULL REFERENCES public.skill_types(id) ON DELETE RESTRICT,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz,
    PRIMARY KEY (gang_id, rank),
    UNIQUE (gang_id, skill_type_id)
);

CREATE INDEX gang_skill_set_ranks_skill_type_id_idx
    ON public.gang_skill_set_ranks (skill_type_id);

ALTER TABLE public.gang_skill_set_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang_skill_set_ranks"
    ON public.gang_skill_set_ranks FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only gang owner or admin can insert gang_skill_set_ranks"
    ON public.gang_skill_set_ranks FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
    );

CREATE POLICY "Only gang owner or admin can update gang_skill_set_ranks"
    ON public.gang_skill_set_ranks FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
    );

CREATE POLICY "Only gang owner or admin can delete gang_skill_set_ranks"
    ON public.gang_skill_set_ranks FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = gang_id AND g.user_id = auth.uid())
        OR (SELECT private.is_admin())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gang_skill_set_ranks
    TO authenticated, service_role;
