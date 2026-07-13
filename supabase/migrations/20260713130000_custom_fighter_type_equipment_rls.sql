-- custom_fighter_type_equipment: add ownership column + RLS policies.
--
-- The table had RLS ENABLED but ZERO policies, so the cookie-bound client used by
-- the custom-fighter server actions could neither read nor write it (only the
-- service_role, which bypasses RLS, worked). This adds a user_id ownership column
-- and the standard custom_* table policies (view = any authenticated user;
-- create/update/delete = owner or admin).

-- 1. Ownership column (mirrors the other custom_* tables)
ALTER TABLE public.custom_fighter_type_equipment
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill any pre-existing rows from the parent custom fighter type's owner
UPDATE public.custom_fighter_type_equipment cfte
SET user_id = cft.user_id
FROM public.custom_fighter_types cft
WHERE cfte.custom_fighter_type_id = cft.id
  AND cfte.user_id IS NULL;

ALTER TABLE public.custom_fighter_type_equipment
    ALTER COLUMN user_id SET NOT NULL;

-- 2. Indexes for the lookup columns (table previously had only the PK).
-- The equipment picker RPC (get_equipment_detailed_data) probes this table per
-- equipment row with (custom_fighter_type_id + equipment_id) and
-- (custom_fighter_type_id + custom_equipment_id); the custom-fighters loader
-- filters by custom_fighter_type_id. Leading with custom_fighter_type_id also
-- serves that loader and the parent's ON DELETE cascade.
CREATE INDEX IF NOT EXISTS idx_cfte_fighter_type_equipment
    ON public.custom_fighter_type_equipment (custom_fighter_type_id, equipment_id);
CREATE INDEX IF NOT EXISTS idx_cfte_fighter_type_custom_equipment
    ON public.custom_fighter_type_equipment (custom_fighter_type_id, custom_equipment_id);

-- 3. RLS policies (RLS is already enabled on the table; ENABLE is idempotent)
ALTER TABLE public.custom_fighter_type_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view custom fighter type equip" ON public.custom_fighter_type_equipment;
CREATE POLICY "Allow authenticated users to view custom fighter type equip"
    ON public.custom_fighter_type_equipment
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to create custom fighter type equip" ON public.custom_fighter_type_equipment;
CREATE POLICY "Allow authenticated users to create custom fighter type equip"
    ON public.custom_fighter_type_equipment
    FOR INSERT TO authenticated
    WITH CHECK ((((SELECT auth.uid()) = user_id) OR (SELECT private.is_admin())));

DROP POLICY IF EXISTS "Only custom fighter type equipment owner or admin can update" ON public.custom_fighter_type_equipment;
CREATE POLICY "Only custom fighter type equipment owner or admin can update"
    ON public.custom_fighter_type_equipment
    FOR UPDATE TO authenticated
    USING ((((SELECT auth.uid()) = user_id) OR (SELECT private.is_admin())))
    WITH CHECK ((((SELECT auth.uid()) = user_id) OR (SELECT private.is_admin())));

DROP POLICY IF EXISTS "Only custom fighter type equipment owner or admin can delete" ON public.custom_fighter_type_equipment;
CREATE POLICY "Only custom fighter type equipment owner or admin can delete"
    ON public.custom_fighter_type_equipment
    FOR DELETE TO authenticated
    USING ((((SELECT auth.uid()) = user_id) OR (SELECT private.is_admin())));
