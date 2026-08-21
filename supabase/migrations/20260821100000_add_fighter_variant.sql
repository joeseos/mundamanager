-- Split the type variant out of fighter_specialisation.
--
-- fighter_specialisations has been carrying two unrelated facts under one name:
--
--   * type variant      -- Haunt Bonecrusher vs Psyrender, Goliath Natborn/Vatborn/Unborn.
--                          A label distinguishing sibling fighter_types rows. No data of
--                          its own: stats, cost and equipment live on the fighter_types row.
--   * specialisation    -- the Heavy/Gunner/Medic/... pick that comes with the Specialist
--                          subtype. An entity: it carries a granted skill and (later) an
--                          allowed list per type and its own equipment.
--
-- Both were copied into fighters.fighter_specialisation_id, so they overwrote each other:
-- promoting a Haunt wrote Heavy over Bonecrusher and the variant was simply lost.
--
-- The variant becomes text rather than a second FK. It is a label, so the column type
-- itself keeps the two facts apart -- a variant cannot be written into a uuid column and a
-- specialisation cannot be written into a text one -- and custom_fighter_types can carry a
-- user-authored variant without needing a mirror of the admin-only catalog. This follows
-- 20260801120000_fighter_multiple_classes.sql, which moved fighter_class_id to
-- fighter_subtypes as names on the row for the same reason.
--
-- Additive only. fighter_specialisation_id and the legacy fighter_specialisation text
-- column keep every value they have today, so the deployed build is unaffected and the
-- rollback is DROP COLUMN fighter_variant on the three tables. Narrowing
-- fighter_specialisation_id to mean only the specialisation is a later migration, gated on
-- the application no longer reading it.

ALTER TABLE public.fighter_types        ADD COLUMN IF NOT EXISTS fighter_variant text;
ALTER TABLE public.custom_fighter_types ADD COLUMN IF NOT EXISTS fighter_variant text;
ALTER TABLE public.fighters             ADD COLUMN IF NOT EXISTS fighter_variant text;

COMMENT ON COLUMN public.fighter_types.fighter_variant IS
  'Type variant label (Bonecrusher, Natborn). Distinguishes sibling rows of the same '
  'fighter_type. Not a specialisation -- that is the Specialist pick, on fighter_specialisation_id.';
COMMENT ON COLUMN public.custom_fighter_types.fighter_variant IS
  'Type variant label, authored by the owning user. Free text by design: there is no '
  'custom variant catalog, and none is needed.';
COMMENT ON COLUMN public.fighters.fighter_variant IS
  'Type variant label, following the fighter type. The variant follows the type; the '
  'specialisation follows the fighter.';

-- The eight specialisations (utils/keepTypePromotionN26.ts). Every other row in
-- fighter_specialisations is a variant label. Held in a temp table so the list is written
-- once, and guarded below: if the catalog has drifted, misclassifying a specialisation as
-- a variant would silently relabel live fighters, so fail rather than guess.
-- Dropped explicitly at the end rather than ON COMMIT DROP, which would take the table
-- with it after the first statement if this is applied outside a transaction.
DROP TABLE IF EXISTS _specialist_ids;
CREATE TEMP TABLE _specialist_ids (id uuid PRIMARY KEY);
INSERT INTO _specialist_ids (id) VALUES
  ('f16c7f9c-3fcc-4384-81c8-14a9e863dc28'),  -- Heavy
  ('71a99cf2-5a95-4328-b053-ece6cf70818f'),  -- Gunner
  ('6ba5f84f-1bba-4b33-9837-20750e272b7f'),  -- Gunslinger
  ('575d0857-1d6d-41f3-ae41-a2d529d648e2'),  -- Scout
  ('1d32f47b-3788-4fc9-a80a-a20ed63e1601'),  -- Sniper
  ('f9a96b0e-ec6e-4888-b122-84d9d5b8f62a'),  -- Brawler
  ('83f5f0f8-43bc-4c2c-b1d0-e8a2e092e98c'),  -- Medic
  ('5ca912ac-a74f-4320-a6b2-affb159b95ce');  -- Tech

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(s.id::text, ', ') INTO v_missing
  FROM _specialist_ids s
  WHERE NOT EXISTS (SELECT 1 FROM public.fighter_specialisations f WHERE f.id = s.id);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'fighter_specialisations is missing specialisation ids (%). Reconcile the catalog with utils/keepTypePromotionN26.ts first; classifying one of these as a variant would relabel live fighters.', v_missing;
  END IF;
END $$;

-- 1. fighter_types: the variant catalog row becomes a label on the row itself.
-- Taken from the catalog join rather than the existing fighter_specialisation text column,
-- which disagrees with the catalog on one row.
UPDATE public.fighter_types ft
SET fighter_variant = s.specialisation_name
FROM public.fighter_specialisations s
WHERE s.id = ft.fighter_specialisation_id
  AND s.id NOT IN (SELECT id FROM _specialist_ids);

-- 2. fighters: derive from the fighter's own type row, which is authoritative -- a fighter
-- of a Bonecrusher type row is a Bonecrusher. This is also the repair: it restores the
-- variant for every fighter whose instance column lost it (a promotion overwriting it, or
-- it never having been copied), which the instance column cannot do for itself.
UPDATE public.fighters f
SET fighter_variant = ft.fighter_variant
FROM public.fighter_types ft
WHERE ft.id = f.fighter_type_id
  AND ft.fighter_variant IS NOT NULL;

-- 3. fighters: fall back to the fighter's own column where the type row offered nothing.
-- Covers legacy rows whose type has since lost its variant. Deliberately last, so step 2
-- wins where the two disagree.
UPDATE public.fighters f
SET fighter_variant = s.specialisation_name
FROM public.fighter_specialisations s
WHERE s.id = f.fighter_specialisation_id
  AND s.id NOT IN (SELECT id FROM _specialist_ids)
  AND f.fighter_variant IS NULL;

DROP TABLE _specialist_ids;
