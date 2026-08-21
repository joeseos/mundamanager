-- Backfill edition_id on the custom_* roots, which 385 rows are missing.
--
-- These are not legacy rows: every one was created after the 20260630 backfill, and 15 were
-- created the day this migration was written. They come from copy_custom_collection, which
-- dropped edition_id on every clone except custom_fighter_types (fixed alongside this).
-- That asymmetry is what makes the data recoverable -- a copied gang type lost its edition
-- while its cloned fighter types kept theirs.
--
-- Each rule below was validated against rows whose edition is already known, because the
-- obvious signals are traps: starting_xp and trade_points are set on 100% of BOTH editions
-- (column defaults), is_vehicle is false everywhere, and trading_post_types.edition_id says
-- n23 for six gang types that are really n26. None of those may be used.
--
-- Order matters: each step consumes what the previous one resolved.

BEGIN;

-- 1. Fighter types. save IS NOT NULL predicts n26 on 61 of 62 known rows and 0 of 1720 n23
--    rows; starting_xp <> 0 predicts it on 53 with no false positives.
UPDATE public.custom_fighter_types f
SET edition_id = (
  SELECT id FROM public.editions
  WHERE slug = CASE
    WHEN f.save IS NOT NULL OR COALESCE(f.starting_xp, 0) <> 0 THEN 'n26'
    ELSE 'n23'
  END
)
WHERE f.edition_id IS NULL;

-- 2. Gang types, from the fighter types beneath them: n26 only when it has children and none
--    of them resolve to anything else.
UPDATE public.custom_gang_types g
SET edition_id = (
  SELECT id FROM public.editions
  WHERE slug = CASE
    WHEN EXISTS (
           SELECT 1 FROM public.custom_fighter_types f
           WHERE f.custom_gang_type_id = g.id AND f.edition_id IS NOT NULL
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.custom_fighter_types f
           JOIN public.editions e ON e.id = f.edition_id
           WHERE f.custom_gang_type_id = g.id AND e.slug <> 'n26'
         )
    THEN 'n26'
    ELSE 'n23'
  END
)
WHERE g.edition_id IS NULL;

-- 3. Equipment. An n23 category is exact -- 7472 of 7472 known rows -- so it wins outright.
--    An n26 category is only 37 of 53, so those defer to the fighter type granting the item,
--    and fall back to the category only when nothing grants it.
UPDATE public.custom_equipment ce
SET edition_id = COALESCE(
  (SELECT ec.edition_id
     FROM public.equipment_categories ec
     JOIN public.editions e ON e.id = ec.edition_id AND e.slug = 'n23'
    WHERE ec.id = ce.equipment_category_id),
  (SELECT f.edition_id
     FROM public.custom_fighter_type_equipment fe
     JOIN public.custom_fighter_types f ON f.id = fe.custom_fighter_type_id
    WHERE fe.custom_equipment_id = ce.id AND f.edition_id IS NOT NULL
    LIMIT 1),
  (SELECT ec.edition_id FROM public.equipment_categories ec WHERE ec.id = ce.equipment_category_id),
  (SELECT id FROM public.editions WHERE slug = 'n23')
)
WHERE ce.edition_id IS NULL;

-- 4. Skill types and trading posts. Nothing references them with a resolvable edition, and all
--    of them predate the n26 content, so they are n23 by elimination.
UPDATE public.custom_skill_types
SET edition_id = (SELECT id FROM public.editions WHERE slug = 'n23')
WHERE edition_id IS NULL;

UPDATE public.custom_trading_posts
SET edition_id = (SELECT id FROM public.editions WHERE slug = 'n23')
WHERE edition_id IS NULL;

-- 5. Collections, from the items they hold now that those are resolved.
WITH item_editions AS (
  SELECT c.id AS collection_id,
    COALESCE(
      (SELECT e.slug FROM public.custom_equipment x
         JOIN public.editions e ON e.id = x.edition_id WHERE x.id = (it->>'id')::uuid),
      (SELECT e.slug FROM public.custom_fighter_types x
         JOIN public.editions e ON e.id = x.edition_id WHERE x.id = (it->>'id')::uuid),
      (SELECT e.slug FROM public.custom_gang_types x
         JOIN public.editions e ON e.id = x.edition_id WHERE x.id = (it->>'id')::uuid),
      (SELECT e.slug FROM public.custom_trading_posts x
         JOIN public.editions e ON e.id = x.edition_id WHERE x.id = (it->>'id')::uuid),
      (SELECT e.slug FROM public.custom_skills s
         JOIN public.custom_skill_types t ON t.id = s.custom_skill_type_id
         JOIN public.editions e ON e.id = t.edition_id WHERE s.id = (it->>'id')::uuid)
    ) AS slug
  FROM public.custom_collections c
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.items, '[]'::jsonb)) it
  WHERE c.edition_id IS NULL
)
UPDATE public.custom_collections c
SET edition_id = (
  SELECT id FROM public.editions
  WHERE slug = CASE
    WHEN EXISTS (SELECT 1 FROM item_editions ie WHERE ie.collection_id = c.id AND ie.slug IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM item_editions ie
                     WHERE ie.collection_id = c.id AND ie.slug IS NOT NULL AND ie.slug <> 'n26')
    THEN 'n26'
    ELSE 'n23'
  END
)
WHERE c.edition_id IS NULL;

-- 6. Nothing may be left unresolved: a silent remainder would read as n23 downstream.
DO $$
DECLARE v_remaining int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.custom_equipment     WHERE edition_id IS NULL)
  + (SELECT count(*) FROM public.custom_fighter_types WHERE edition_id IS NULL)
  + (SELECT count(*) FROM public.custom_gang_types    WHERE edition_id IS NULL)
  + (SELECT count(*) FROM public.custom_skill_types   WHERE edition_id IS NULL)
  + (SELECT count(*) FROM public.custom_trading_posts WHERE edition_id IS NULL)
  + (SELECT count(*) FROM public.custom_collections   WHERE edition_id IS NULL)
  INTO v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'custom_* edition backfill left % row(s) unresolved', v_remaining;
  END IF;
END $$;

COMMIT;
