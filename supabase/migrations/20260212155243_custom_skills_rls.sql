-- ============================================
-- CUSTOM_SKILLS - RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE custom_skills ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can view custom skills
CREATE POLICY "Allow authenticated users to view custom skills"
ON public.custom_skills AS PERMISSIVE FOR SELECT TO authenticated
USING (true);

-- INSERT: Owner or admin can create skills
CREATE POLICY "Allow authenticated users to create custom skills"
ON public.custom_skills AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);

-- UPDATE: Owner or admin can update skills
CREATE POLICY "Only custom skill owner or admin can update"
ON public.custom_skills AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
)
WITH CHECK (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);

-- DELETE: Owner or admin can delete skills
CREATE POLICY "Only custom skill owner or admin can delete"
ON public.custom_skills AS PERMISSIVE FOR DELETE TO authenticated
USING (
  ((SELECT auth.uid()) = user_id)
  OR (SELECT private.is_admin())
);
