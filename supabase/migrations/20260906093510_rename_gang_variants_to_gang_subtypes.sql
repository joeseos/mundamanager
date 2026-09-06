-- Rename gang variants → gang subtypes (schema identifiers only).
--
-- Mirrors 20260806120000_rename_fighter_classes_to_fighter_subtypes: pure rename,
-- no UUID/data-shape change. Hard cutover — deploy the Phase 4 app pass and the
-- updated RPCs in supabase/functions/ in the same window as this migration.
--
-- RPC bodies (get_gang_details, get_equipment_detailed_data, copy_custom_collection)
-- live in supabase/functions/*.sql per repo convention and are applied separately
-- via the dashboard / your usual RPC deploy path. Apply those AFTER or WITH this
-- migration so live functions do not reference the old names.
--
-- Catalog data: gang_types.gang_type values 'Variant: …' become 'Subtype: …'
-- (Option B). The app helper subtypeGangTypeName must ship with this.

BEGIN;

-- 1. Reference table
ALTER TABLE public.gang_variant_types RENAME TO gang_subtype_types;
ALTER TABLE public.gang_subtype_types RENAME COLUMN variant TO subtype;

ALTER TABLE public.gang_subtype_types
  RENAME CONSTRAINT gang_variant_types_pkey TO gang_subtype_types_pkey;
ALTER TABLE public.gang_subtype_types
  RENAME CONSTRAINT gang_variant_types_edition_id_fkey TO gang_subtype_types_edition_id_fkey;

ALTER INDEX public.gang_variant_types_edition_id_idx
  RENAME TO gang_subtype_types_edition_id_idx;

-- 2. RLS policies (names only)
ALTER POLICY "Allow authenticated users to view gang_variant_types"
  ON public.gang_subtype_types
  RENAME TO "Allow authenticated users to view gang_subtype_types";
ALTER POLICY gang_variant_types_admin_insert_policy
  ON public.gang_subtype_types
  RENAME TO gang_subtype_types_admin_insert_policy;
ALTER POLICY gang_variant_types_admin_update_policy
  ON public.gang_subtype_types
  RENAME TO gang_subtype_types_admin_update_policy;
ALTER POLICY gang_variant_types_admin_delete_policy
  ON public.gang_subtype_types
  RENAME TO gang_subtype_types_admin_delete_policy;

-- 3. Gangs JSONB column (values are UUID strings; rename only)
ALTER TABLE public.gangs RENAME COLUMN gang_variants TO gang_subtypes;

-- 4. FK columns on dependent tables
ALTER TABLE public.equipment_availability
  RENAME COLUMN gang_variant_id TO gang_subtype_id;
ALTER TABLE public.equipment_availability
  RENAME CONSTRAINT equipment_availability_gang_variant_id_fkey
                 TO equipment_availability_gang_subtype_id_fkey;

ALTER TABLE public.fighter_type_equipment
  RENAME COLUMN gang_variant_id TO gang_subtype_id;
ALTER TABLE public.fighter_type_equipment
  RENAME CONSTRAINT fighter_type_equipment_gang_variant_id_fkey
                 TO fighter_type_equipment_gang_subtype_id_fkey;

ALTER TABLE public.custom_trading_post_availability
  RENAME COLUMN gang_variant_id TO gang_subtype_id;
ALTER TABLE public.custom_trading_post_availability
  RENAME CONSTRAINT custom_trading_post_availability_gang_variant_id_fkey
                 TO custom_trading_post_availability_gang_subtype_id_fkey;

-- 5. Indexes that include / are named for the old column
ALTER INDEX public.fighter_type_equipment_gang_variant_id_idx
  RENAME TO fighter_type_equipment_gang_subtype_id_idx;

-- Unique scope index must be rebuilt: Postgres does not rename columns inside
-- an index definition via ALTER INDEX alone when the column was renamed — the
-- index follows the column rename automatically for btree columns. Confirm:
-- after RENAME COLUMN, the uidx still references gang_subtype_id. No rebuild
-- needed if that holds; leave the index name as-is (it does not embed
-- gang_variant_id in its name). fighter_type_equipment_fighter_scope_uidx stays.

-- 6. Comments
COMMENT ON TABLE public.gang_subtype_types IS
  'Gang subtype catalog (Chaos Corrupted, Wasteland, Skirmish, …). Formerly gang_variant_types.';

COMMENT ON COLUMN public.gang_subtype_types.subtype IS
  'Display name of the gang subtype. Unique enough in practice per edition; matched by gangs.gang_subtypes UUID array.';

COMMENT ON COLUMN public.gangs.gang_subtypes IS
  'JSONB array of gang_subtype_types.id values held by this gang. Formerly gangs.gang_variants.';

COMMENT ON COLUMN public.fighter_type_equipment.gang_subtype_id IS
  'Restricts the row to gangs holding this subtype (gangs.gang_subtypes contains the id). '
  'NULL applies regardless of subtype.';

COMMENT ON COLUMN public.equipment_availability.gang_subtype_id IS
  'When set, this availability row applies only to gangs whose gang_subtypes contains this id.';

COMMENT ON COLUMN public.custom_trading_post_availability.gang_subtype_id IS
  'When set, this custom trading-post availability rule applies only to gangs holding this subtype.';

-- 7. Catalog gang_type labels used by Add Fighter unlocks (Option B)
UPDATE public.gang_types
SET gang_type = replace(gang_type, 'Variant: ', 'Subtype: ')
WHERE gang_type LIKE 'Variant: %';

-- custom_gang_types does not use the Variant:/Subtype: prefix pattern for
-- subtype pools; official gang_types rows are the join key in fighter-types.

COMMIT;
