-- Rename fighter_sub_types -> fighter_specialisations (N26 terminology).
--
-- The N26 rules call this concept a "Specialisation". The old name was also actively
-- misleading: it is unrelated to the rulebook term "Subtypes", which maps to fighter_classes
-- (see the COMMENT already carried on that table).
--
-- Pure rename: no data movement, no shape change. Applied as a hard cutover with a short
-- downtime window -- the deployed application breaks between this migration and the deploy
-- of the renamed code, by design.
--
-- Verified against the live database before writing this:
--   * fighter_sub_types has exactly one index (its pkey). No index anywhere else references
--     the table or any *sub_type* column -- notably fighters.fighter_sub_type_id and
--     fighter_types.fighter_sub_type_id are UNINDEXED, so there is nothing to rename there.
--     The pkey index is renamed implicitly by ALTER TABLE ... RENAME CONSTRAINT below
--     (a bare RENAME TO on the table would NOT rename it).
--   * No triggers on fighter_sub_types / fighters / fighter_types.
--   * No views or materialised views reference sub_type.
--   * Exactly two inbound FKs, both handled below.
--   * Exactly five *sub_type* columns across the schema, all handled below.
--
-- FK definitions track their target by OID, so the table rename keeps them valid; only the
-- constraint NAMES need explicit renaming. RLS stays enabled through a rename and the policy
-- bodies are unaffected. Grants come from the blanket bootstrap/grants.sql, so nothing to re-grant.
--
-- RPC changes (get_fighter_types_with_cost, get_gang_details) live in supabase/functions/*.sql
-- per repo convention and are applied separately, AFTER this migration.

BEGIN;

-- 1. The table itself
ALTER TABLE public.fighter_sub_types RENAME TO fighter_specialisations;
ALTER TABLE public.fighter_specialisations RENAME COLUMN sub_type_name TO specialisation_name;
ALTER TABLE public.fighter_specialisations
  RENAME CONSTRAINT fighter_sub_types_pkey TO fighter_specialisations_pkey;

-- 2. fighters: FK column + denormalised name column
ALTER TABLE public.fighters RENAME COLUMN fighter_sub_type_id TO fighter_specialisation_id;
ALTER TABLE public.fighters RENAME COLUMN fighter_sub_type    TO fighter_specialisation;
ALTER TABLE public.fighters
  RENAME CONSTRAINT fighters_fighter_sub_type_id_fkey TO fighters_fighter_specialisation_id_fkey;

-- 3. fighter_types: FK column + denormalised name column
ALTER TABLE public.fighter_types RENAME COLUMN fighter_sub_type_id TO fighter_specialisation_id;
ALTER TABLE public.fighter_types RENAME COLUMN fighter_sub_type    TO fighter_specialisation;
ALTER TABLE public.fighter_types
  RENAME CONSTRAINT fighter_types_fighter_sub_type_id_fkey TO fighter_types_fighter_specialisation_id_fkey;

-- 4. RLS policies (names only -- USING/WITH CHECK expressions are unchanged)
ALTER POLICY "Allow authenticated users to view fighter_sub_types" ON public.fighter_specialisations
  RENAME TO "Allow authenticated users to view fighter_specialisations";
ALTER POLICY "Only admin can create fighter_sub_types entries" ON public.fighter_specialisations
  RENAME TO "Only admin can create fighter_specialisations entries";
ALTER POLICY "Only admin can update fighter_sub_types" ON public.fighter_specialisations
  RENAME TO "Only admin can update fighter_specialisations";
ALTER POLICY "Only admin can delete fighter_sub_types" ON public.fighter_specialisations
  RENAME TO "Only admin can delete fighter_specialisations";

-- 5. Refresh the table comment for the new terminology
COMMENT ON TABLE public.fighter_specialisations IS
  'N26 Specialisations: variants within a single fighter type. Formerly fighter_sub_types. Unrelated to the rulebook term "Subtypes", which maps to fighter_classes.';

-- 6. fighter_classes carries a cross-reference comment naming the old table (set by
--    20260802180000_drop_legacy_fighter_class_columns.sql). Refresh it so the live comment
--    does not point at a table name that no longer exists.
COMMENT ON TABLE public.fighter_classes IS
  'Fighter roles (Leader, Champion, Ganger, ...). The new edition rulebook calls these "Subtypes"; the display label is resolved per edition in app code. NOT related to fighter_specialisations. One row per class per edition, matched across editions on class_name.';

COMMIT;
