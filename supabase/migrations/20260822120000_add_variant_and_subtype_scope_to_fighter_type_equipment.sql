-- Variant- and subtype-scoped equipment lists.
--
-- Adds two nullable scope columns to fighter_type_equipment alongside the
-- gang_type_id / gang_origin_id it already carries, plus a polarity flag. Existing
-- rows default to NULL/NULL/false and are unaffected. Per-column semantics are in
-- the COMMENT ON COLUMN statements below.
--
-- Rules like "Leaders and Champions of a Genestealer Cult Corrupted Gang may purchase
-- Psychic Familiars" could not be expressed before: fighter_type_equipment had no
-- variant axis, and equipment_availability.gang_variant_id is gang-wide and
-- all-or-nothing, with no way to carve out a subset of a gang. The subtype axis is
-- what keeps that rule to two rows rather than one per gang's Leader and Champion
-- type across all seven eligible gangs.
--
-- excluded exists because scoping alone cannot take something away. "...may not
-- purchase any Pets from the equipment list" has to override grants that are already
-- there and carry no variant scope of their own, and adding more grants cannot
-- subtract those.
--
-- The get_equipment_detailed_data change that reads these columns lives in
-- supabase/functions/get_equipment_detailed_data.sql and is applied separately (see
-- supabase/README.md). This migration must be applied BEFORE that deploy runs.

ALTER TABLE public.fighter_type_equipment
    ADD COLUMN IF NOT EXISTS gang_variant_id uuid
        REFERENCES public.gang_variant_types(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS fighter_subtype text,
    ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fighter_type_equipment.gang_variant_id IS
  'Restricts the row to gangs holding this variant (gangs.gang_variants contains the id). '
  'NULL applies regardless of variant.';
COMMENT ON COLUMN public.fighter_type_equipment.fighter_subtype IS
  'Restricts the row to fighters carrying this subtype name, matched against '
  'fighters.fighter_subtypes. A name rather than an FK because subtypes are stored as '
  'names in jsonb arrays throughout; see 20260806120000. NULL applies regardless of '
  'subtype. Set with fighter_type_id NULL for a rule spanning every gang.';
COMMENT ON COLUMN public.fighter_type_equipment.excluded IS
  'false grants the item (the original meaning of a row); true denies it, removing the '
  'item from the Equipment List of fighters matching this row''s scope even when another '
  'row or a gang-wide equipment_availability entry would have granted it. Equipment List '
  'only -- it does not gate Trading Post access.';

-- This table has never had a uniqueness constraint, so duplicates may exist and would
-- abort the index below. Scoped to the same rows as that index: vehicle rows are left
-- alone, since nothing here constrains them.
DELETE FROM public.fighter_type_equipment a
USING public.fighter_type_equipment b
WHERE a.id > b.id
  AND a.vehicle_type_id IS NULL
  AND b.vehicle_type_id IS NULL
  AND a.equipment_id           IS NOT DISTINCT FROM b.equipment_id
  AND a.fighter_type_id        IS NOT DISTINCT FROM b.fighter_type_id
  AND a.custom_fighter_type_id IS NOT DISTINCT FROM b.custom_fighter_type_id
  AND a.gang_variant_id        IS NOT DISTINCT FROM b.gang_variant_id
  AND a.fighter_subtype        IS NOT DISTINCT FROM b.fighter_subtype
  AND a.gang_type_id           IS NOT DISTINCT FROM b.gang_type_id
  AND a.gang_origin_id         IS NOT DISTINCT FROM b.gang_origin_id;

-- One row per equipment/scope combination. NULLS NOT DISTINCT because the default
-- would let two all-NULL scopes both through, which is the duplicate this prevents.
-- excluded is deliberately not in the key, so a grant and a deny for one scope collide
-- and the contradictory pair cannot be stored. Vehicle rows are out: they belong to
-- app/api/admin/vehicles/route.ts, which this change does not touch.
CREATE UNIQUE INDEX IF NOT EXISTS fighter_type_equipment_fighter_scope_uidx
    ON public.fighter_type_equipment
       (equipment_id, fighter_type_id, custom_fighter_type_id, fighter_subtype,
        gang_variant_id, gang_type_id, gang_origin_id)
    NULLS NOT DISTINCT
    WHERE vehicle_type_id IS NULL;

CREATE INDEX IF NOT EXISTS fighter_type_equipment_gang_variant_id_idx
    ON public.fighter_type_equipment (gang_variant_id)
    WHERE gang_variant_id IS NOT NULL;
