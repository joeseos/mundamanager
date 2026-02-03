-- Create fighter_skill_access_override table
-- Stores individual skill access overrides per fighter

CREATE TABLE public.fighter_skill_access_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_id uuid NOT NULL,
    skill_type_id uuid NOT NULL,
    access_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    user_id uuid,
    CONSTRAINT fighter_skill_access_override_access_level_check
        CHECK ((access_level = ANY (ARRAY['primary'::text, 'secondary'::text, 'denied'::text])))
);

-- Add primary key
ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_pkey PRIMARY KEY (id);

-- Add unique constraint to prevent duplicate overrides
ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_fighter_id_skill_type_id_key
        UNIQUE (fighter_id, skill_type_id);

-- Add foreign key constraints
ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_fighter_id_fkey
        FOREIGN KEY (fighter_id)
        REFERENCES public.fighters(id)
        ON DELETE CASCADE;

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_skill_type_id_fkey
        FOREIGN KEY (skill_type_id)
        REFERENCES public.skill_types(id)
        ON DELETE CASCADE;

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id);

-- Add index for queries (fighter_id lookups are common)
CREATE INDEX idx_fighter_skill_access_override_fighter_id
    ON public.fighter_skill_access_override(fighter_id);

-- Enable RLS
ALTER TABLE public.fighter_skill_access_override ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can view overrides
CREATE POLICY "Allow authenticated users to view fighter skill access override"
    ON public.fighter_skill_access_override FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Users can create overrides for their own fighters
CREATE POLICY "Users can create skill access overrides for their own fighters"
    ON public.fighter_skill_access_override FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin() AS is_admin)
        OR (fighter_id IS NOT NULL AND (
            fighter_id IN (
                SELECT f.id FROM public.fighters f
                WHERE f.user_id = (SELECT auth.uid() AS uid)
            )
            OR fighter_id IN (
                SELECT f.id FROM public.fighters f
                JOIN public.campaign_gangs cg ON (cg.gang_id = f.gang_id)
                WHERE (SELECT private.is_arb(cg.campaign_id) AS is_arb)
            )
        ))
    );

-- RLS Policy: Only override owner or admin can update
CREATE POLICY "Only override owner or admin can update"
    ON public.fighter_skill_access_override FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (user_id = (SELECT auth.uid() AS uid))
        OR (fighter_id IN (
            SELECT f.id FROM public.fighters f
            JOIN public.campaign_gangs cg ON (cg.gang_id = f.gang_id)
            WHERE (SELECT private.is_arb(cg.campaign_id) AS is_arb)
        ))
    );

-- RLS Policy: Only override owner or admin can delete
CREATE POLICY "Only override owner or admin can delete"
    ON public.fighter_skill_access_override FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (user_id = (SELECT auth.uid() AS uid))
        OR (fighter_id IN (
            SELECT f.id FROM public.fighters f
            JOIN public.campaign_gangs cg ON (cg.gang_id = f.gang_id)
            WHERE (SELECT private.is_arb(cg.campaign_id) AS is_arb)
        ))
    );
