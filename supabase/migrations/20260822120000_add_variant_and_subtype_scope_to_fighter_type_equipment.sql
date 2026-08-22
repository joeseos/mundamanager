-- Variant- and subtype-scoped equipment lists.
--
-- Adds two more nullable scope columns to fighter_type_equipment, alongside the
-- gang_type_id / gang_origin_id it already carries:
--
--   gang_variant_id  -- NULL: the row applies regardless of gang variant.
--                       Set:  it applies only to gangs whose gangs.gang_variants
--                             jsonb array contains that id.
--   fighter_subtype  -- NULL: the row applies regardless of subtype.
--                       Set:  it applies only to fighters carrying that subtype.
--
-- and a polarity flag:
--
--   excluded         -- false: the row grants (the existing meaning of a row).
--                       true:  it denies, removing the item from the matching
--                              fighters' Equipment List.
--
-- Existing rows default to NULL/NULL/false and are therefore unaffected.
--
-- Rules like "Leaders and Champions of a Genestealer Cult Corrupted Gang may
-- purchase Psychic Familiars" could not be expressed before. fighter_type_equipment
-- had no variant axis at all, and equipment_availability.gang_variant_id is
-- gang-wide and all-or-nothing: its ea_var join in the equipment picker RPC sets
-- is_fighter_list = true for every fighter in the gang, with no way to carve out a
-- subset.
--
-- The subtype axis is what keeps that rule to two rows rather than fourteen.
-- Genestealer Cult Corruption applies to seven gangs (six clan houses and Palanite
-- Enforcers), so scoping by fighter_type_id alone would need one row per gang's
-- Leader type plus one per Champion type -- hand-maintained, and silently incomplete
-- the moment a gang type is added.
--
-- fighter_subtype is text rather than an FK to fighter_subtypes, because that is how
-- subtypes are stored everywhere else: fighter_types.fighter_subtypes and
-- fighters.fighter_subtypes are jsonb arrays of subtype *names*, matched with ?, and
-- the fighter_subtypes table is a per-edition lookup list with no join table. See
-- 20260806120000_rename_fighter_classes_to_fighter_subtypes.sql.
--
-- excluded exists because scoping alone cannot express a rule that takes something
-- away. "A Genestealer Cult Corrupted Gang may not purchase any Pets from the
-- equipment list" has to override grants that are already there and carry no variant
-- scope of their own -- a Pet is an equipment row (Sheenbird (Exotic Beast)) mapped to
-- a beast fighter type through exotic_beasts, and who may buy it is a plain
-- fighter_type_equipment grant, e.g. every Cawdor Leader and Champion. Adding more
-- grants cannot subtract those, so the row needs a polarity. A deny also has to beat
-- equipment_availability's gang-wide ea_var grant, which the reader resolves.
--
-- The get_equipment_detailed_data change that reads these columns lives in
-- supabase/functions/get_equipment_detailed_data.sql and is applied to the database
-- separately (see supabase/README.md). This migration must be applied BEFORE that
-- deploy runs, since the updated RPC reads the columns added here.

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
  'fighters.fighter_subtypes. A name, not an FK -- subtypes are stored as names in jsonb '
  'arrays throughout. NULL applies regardless of subtype. Set with fighter_type_id NULL '
  'for a rule that spans every gang, e.g. "every Leader".';
COMMENT ON COLUMN public.fighter_type_equipment.excluded IS
  'false grants the item (the original meaning of a row); true denies it, removing the '
  'item from the Equipment List of fighters matching this row''s scope even when another '
  'row or a gang-wide equipment_availability entry would have granted it. Scoped to the '
  'Equipment List only -- it does not gate Trading Post access.';

-- Collapse exact duplicates before the unique index below can reject them. This table
-- has never had a uniqueness constraint, so equal rows may exist; keep the oldest of
-- each set. The two columns added above are NULL everywhere at this point, so in
-- practice this dedupes on the pre-existing scope columns.
--
-- Scoped to the same rows as the index (vehicle_type_id IS NULL). Vehicle rows are
-- left exactly as they are: the index does not constrain them, so deleting their
-- duplicates would be destroying data this change has no reason to touch.
DELETE FROM public.fighter_type_equipment a
USING public.fighter_type_equipment b
WHERE a.id > b.id
  AND a.vehicle_type_id IS NULL
  AND b.vehicle_type_id IS NULL
  AND a.equipment_id           IS NOT DISTINCT FROM b.equipment_id
  AND a.fighter_type_id        IS NOT DISTINCT FROM b.fighter_type_id
  AND a.vehicle_type_id        IS NOT DISTINCT FROM b.vehicle_type_id
  AND a.custom_fighter_type_id IS NOT DISTINCT FROM b.custom_fighter_type_id
  AND a.gang_variant_id        IS NOT DISTINCT FROM b.gang_variant_id
  AND a.fighter_subtype        IS NOT DISTINCT FROM b.fighter_subtype
  AND a.gang_type_id           IS NOT DISTINCT FROM b.gang_type_id
  AND a.gang_origin_id         IS NOT DISTINCT FROM b.gang_origin_id;

-- One row per equipment/scope combination. NULLS NOT DISTINCT so that two rows whose
-- scope columns are both NULL collide rather than both being allowed -- the default
-- NULL-is-distinct behaviour would let the duplicates this index exists to prevent
-- straight through.
--
-- excluded is deliberately NOT part of the key. Leaving it out means a grant and a deny
-- for the same equipment and scope collide, so an admin cannot create a row that both
-- gives and takes away the same item -- a contradiction the reader would have to break
-- arbitrarily. Including it would permit exactly that pair.
--
-- Vehicle rows are excluded: they are written by a separate admin surface
-- (app/api/admin/vehicles/route.ts) that this change does not touch, and constraining
-- them here would make that surface's writes fail on data it did not create.
CREATE UNIQUE INDEX IF NOT EXISTS fighter_type_equipment_fighter_scope_uidx
    ON public.fighter_type_equipment
       (equipment_id, fighter_type_id, custom_fighter_type_id, fighter_subtype,
        gang_variant_id, gang_type_id, gang_origin_id)
    NULLS NOT DISTINCT
    WHERE vehicle_type_id IS NULL;

-- Supports the RPC's variant predicate and the admin editor's per-equipment reads.
CREATE INDEX IF NOT EXISTS fighter_type_equipment_gang_variant_id_idx
    ON public.fighter_type_equipment (gang_variant_id)
    WHERE gang_variant_id IS NOT NULL;
