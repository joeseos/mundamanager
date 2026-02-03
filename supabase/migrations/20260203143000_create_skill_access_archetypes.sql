-- Create skill_access_archetypes table
-- Stores predefined skill access templates for Underhive Outcasts archetypes

CREATE TABLE public.skill_access_archetypes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    skill_access jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);

-- Add primary key
ALTER TABLE ONLY public.skill_access_archetypes
    ADD CONSTRAINT skill_access_archetypes_pkey PRIMARY KEY (id);

-- Enable RLS
ALTER TABLE public.skill_access_archetypes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can view archetypes
CREATE POLICY "Allow authenticated users to view skill_access_archetypes"
    ON public.skill_access_archetypes FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Only admins can insert archetypes
CREATE POLICY skill_access_archetypes_admin_insert_policy
    ON public.skill_access_archetypes FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

-- RLS Policy: Only admins can update archetypes
CREATE POLICY skill_access_archetypes_admin_update_policy
    ON public.skill_access_archetypes FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin() AS is_admin))
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

-- RLS Policy: Only admins can delete archetypes
CREATE POLICY skill_access_archetypes_admin_delete_policy
    ON public.skill_access_archetypes FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin() AS is_admin));
