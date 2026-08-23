-- Narrow fighter_specialisation_id to mean only "specialisation".
--
-- Follow-up to 20260821100000_add_fighter_variant.sql, which added fighter_variant and
-- backfilled it but left fighter_specialisation_id holding every value it had.
--
-- This is a prerequisite for the fighter_variant application changes, not optional tidying.
-- The application reads both columns as they are and does not compensate for the leftovers,
-- so while a variant id is still sitting in fighter_specialisation_id a variant fighter
-- renders its label twice ("Bonecrusher, Bonecrusher"). Run this at or just before the
-- deploy; running it first shows those fighters with no variant until the deploy lands,
-- which is the gentler of the two windows.

-- The eight real specialisations (utils/keepTypePromotionN26.ts). Every other row in
-- fighter_specialisations is a variant label.
DROP TABLE IF EXISTS pg_temp._specialist_ids;
CREATE TEMP TABLE _specialist_ids (id uuid PRIMARY KEY);
INSERT INTO pg_temp._specialist_ids (id) VALUES
  ('f16c7f9c-3fcc-4384-81c8-14a9e863dc28'),  -- Heavy
  ('71a99cf2-5a95-4328-b053-ece6cf70818f'),  -- Gunner
  ('6ba5f84f-1bba-4b33-9837-20750e272b7f'),  -- Gunslinger
  ('575d0857-1d6d-41f3-ae41-a2d529d648e2'),  -- Scout
  ('1d32f47b-3788-4fc9-a80a-a20ed63e1601'),  -- Sniper
  ('f9a96b0e-ec6e-4888-b122-84d9d5b8f62a'),  -- Brawler
  ('83f5f0f8-43bc-4c2c-b1d0-e8a2e092e98c'),  -- Medic
  ('5ca912ac-a74f-4320-a6b2-affb159b95ce');  -- Tech

-- 1. Re-run the backfill. Fighters recruited between 20260821100000 and this deploy were
-- still written the old way, so they carry a variant id and no fighter_variant. Nulling
-- the ids first would lose the label. The type row wins, as it did in the first pass.
UPDATE public.fighters f
SET fighter_variant = ft.fighter_variant
FROM public.fighter_types ft
WHERE ft.id = f.fighter_type_id
  AND ft.fighter_variant IS NOT NULL
  AND f.fighter_variant IS NULL;

UPDATE public.fighters f
SET fighter_variant = s.specialisation_name
FROM public.fighter_specialisations s
WHERE s.id = f.fighter_specialisation_id
  AND s.id NOT IN (SELECT id FROM pg_temp._specialist_ids)
  AND f.fighter_variant IS NULL;

-- 2. Drop the variant references. fighter_specialisation is the legacy text mirror of the
-- same fact and goes with them.
UPDATE public.fighters
SET fighter_specialisation_id = NULL,
    fighter_specialisation = NULL
WHERE fighter_specialisation_id IS NOT NULL
  AND fighter_specialisation_id NOT IN (SELECT id FROM pg_temp._specialist_ids);

UPDATE public.fighter_types
SET fighter_specialisation_id = NULL,
    fighter_specialisation = NULL
WHERE fighter_specialisation_id IS NOT NULL
  AND fighter_specialisation_id NOT IN (SELECT id FROM pg_temp._specialist_ids);

DROP TABLE pg_temp._specialist_ids;
