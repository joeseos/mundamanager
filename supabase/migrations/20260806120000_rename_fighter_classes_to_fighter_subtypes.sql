-- Rename fighter_classes -> fighter_subtypes (N26 terminology).
--
-- The N26 rulebook calls these Leader/Champion/Ganger/Specialist roles "Subtypes". The schema has
-- carried a note about this mismatch since 20260630095837: 'the rulebook term "Subtypes" refers to
-- what this schema calls fighter_classes'. This is the second half of that cleanup -- the first half
-- (20260805120000, fighter_sub_types -> fighter_specialisations) freed up the name.
--
-- Pure rename: no data movement, no shape change. Hard cutover with a short downtime window; the
-- deployed application breaks between this migration and the deploy of the renamed code, by design.
--
-- IMPORTANT: the class NAMES themselves ('Leader', 'Ganger', 'Exotic Beast Specialist', ...) are
-- DATA VALUES and are deliberately untouched. Only identifiers change here.
--
-- Verified against the live database before writing this (the schema snapshot was stale at the time,
-- so pg_indexes / pg_constraint / pg_policies / information_schema were queried directly):
--   * Indexes: fighter_classes_pkey (constraint-backed) plus three standalone indexes --
--     fighter_classes_class_name_idx, fighter_classes_edition_class_name_idx (UNIQUE, partial),
--     fighter_classes_edition_id_idx. The pkey index is renamed implicitly by RENAME CONSTRAINT;
--     the other three need explicit ALTER INDEX.
--   * No triggers, no views, no materialised views.
--   * Exactly one inbound FK: skill_access_archetypes.fighter_class_id (ON DELETE SET NULL).
--     That column is unindexed -- pre-existing, deliberately not addressed here.
--   * standard_class still exists (20260402100000 was written to drop it but evidently never ran)
--     and holds real data: 10 rows true, 28 false. No application code reads it, so it is renamed
--     rather than dropped -- a rename preserves the data either way.
--   * Class membership elsewhere is denormalised as jsonb arrays of class-name strings on five
--     columns, not FKs. There is no join table.
--
-- RPC changes (get_fighter_types_with_cost, get_gang_details, get_available_skills,
-- get_fighter_available_advancements, copy_custom_collection) live in supabase/functions/*.sql per
-- repo convention and are applied separately, AFTER this migration.

BEGIN;

-- 1. The reference table
ALTER TABLE public.fighter_classes RENAME TO fighter_subtypes;
ALTER TABLE public.fighter_subtypes RENAME COLUMN class_name     TO subtype_name;
ALTER TABLE public.fighter_subtypes RENAME COLUMN standard_class TO standard_subtype;

ALTER TABLE public.fighter_subtypes
  RENAME CONSTRAINT fighter_classes_pkey TO fighter_subtypes_pkey;
ALTER TABLE public.fighter_subtypes
  RENAME CONSTRAINT fighter_classes_edition_id_fkey TO fighter_subtypes_edition_id_fkey;

-- 2. Standalone indexes (not renamed by the statements above)
ALTER INDEX public.fighter_classes_class_name_idx         RENAME TO fighter_subtypes_subtype_name_idx;
ALTER INDEX public.fighter_classes_edition_class_name_idx RENAME TO fighter_subtypes_edition_subtype_name_idx;
ALTER INDEX public.fighter_classes_edition_id_idx         RENAME TO fighter_subtypes_edition_id_idx;

-- 3. The sole real FK into the table
ALTER TABLE public.skill_access_archetypes
  RENAME COLUMN fighter_class_id TO fighter_subtype_id;
ALTER TABLE public.skill_access_archetypes
  RENAME CONSTRAINT skill_access_archetypes_fighter_class_id_fkey
                 TO skill_access_archetypes_fighter_subtype_id_fkey;

-- 4. Denormalised jsonb name arrays (the hot path -- values unchanged, column names only)
ALTER TABLE public.fighters             RENAME COLUMN fighter_classes TO fighter_subtypes;
ALTER TABLE public.fighter_types        RENAME COLUMN fighter_classes TO fighter_subtypes;
ALTER TABLE public.custom_fighter_types RENAME COLUMN fighter_classes TO fighter_subtypes;
ALTER TABLE public.fighter_ooa_records
  RENAME COLUMN causing_fighter_classes TO causing_fighter_subtypes;
ALTER TABLE public.fighter_ooa_records
  RENAME COLUMN injured_fighter_classes TO injured_fighter_subtypes;

-- 5. RLS policies (names only -- USING/WITH CHECK expressions are unchanged)
ALTER POLICY fighter_classes_select_policy ON public.fighter_subtypes
  RENAME TO fighter_subtypes_select_policy;
ALTER POLICY fighter_classes_insert_policy ON public.fighter_subtypes
  RENAME TO fighter_subtypes_insert_policy;
ALTER POLICY fighter_classes_update_policy ON public.fighter_subtypes
  RENAME TO fighter_subtypes_update_policy;
ALTER POLICY fighter_classes_delete_policy ON public.fighter_subtypes
  RENAME TO fighter_subtypes_delete_policy;

-- 6. Comments. The old text described the rulebook mismatch this migration resolves, so it is
--    rewritten rather than merely find/replaced.
COMMENT ON TABLE public.fighter_subtypes IS
  'Fighter roles (Leader, Champion, Ganger, ...). Called "Subtypes" by the N26 rulebook; formerly fighter_classes. NOT related to fighter_specialisations. One row per subtype per edition, matched across editions on subtype_name.';

COMMENT ON COLUMN public.fighter_subtypes.subtype_name IS
  'Subtype identity. Unique per edition (fighter_subtypes_edition_subtype_name_idx) and the value stored in fighters/fighter_types.fighter_subtypes; match on this across editions.';

-- 7. fighter_specialisations cross-references the old name (set by 20260805120000). Refresh it so
--    the live comment does not point at a table name that no longer exists.
COMMENT ON TABLE public.fighter_specialisations IS
  'N26 Specialisations: variants within a single fighter type. Formerly fighter_sub_types. Unrelated to the rulebook term "Subtypes", which maps to fighter_subtypes.';

COMMIT;
