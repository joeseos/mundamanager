-- ============================================
-- CUSTOM_SKILL_TYPES - Create table
-- ============================================

CREATE TABLE public.custom_skill_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL
);

-- ============================================
-- CUSTOM_SKILL_TYPES - RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE custom_skill_types ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can view custom skill types
CREATE POLICY "Allow authenticated users to view custom skill types"
ON public.custom_skill_types AS PERMISSIVE FOR SELECT TO authenticated
USING (true);

-- INSERT: Owner or admin can create skill types
CREATE POLICY "Allow authenticated users to create custom skill types"
ON public.custom_skill_types AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);

-- UPDATE: Owner or admin can update skill types
CREATE POLICY "Only custom skill type owner or admin can update"
ON public.custom_skill_types AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
)
WITH CHECK (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);

-- DELETE: Owner or admin can delete skill types
CREATE POLICY "Only custom skill type owner or admin can delete"
ON public.custom_skill_types AS PERMISSIVE FOR DELETE TO authenticated
USING (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);

-- ============================================
-- CUSTOM_SKILLS - Add custom_skill_type_id FK
-- ============================================

ALTER TABLE public.custom_skills
  ADD COLUMN custom_skill_type_id uuid REFERENCES public.custom_skill_types(id) ON DELETE CASCADE;

-- Ensure exactly one skill type FK is set (standard OR custom, not both/neither)
ALTER TABLE public.custom_skills
  ADD CONSTRAINT chk_custom_skills_skill_type_exclusive
  CHECK (
    (skill_type_id IS NOT NULL AND custom_skill_type_id IS NULL)
    OR (skill_type_id IS NULL AND custom_skill_type_id IS NOT NULL)
  );

-- Index for queries that look up custom_skills by custom_skill_type_id
CREATE INDEX idx_custom_skills_custom_skill_type_id
  ON public.custom_skills(custom_skill_type_id);
