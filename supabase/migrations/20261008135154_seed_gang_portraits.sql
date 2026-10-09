-- Fill gang_portraits from the gang-type-images bucket.
--
-- unknown_gang.webp and unknown_fighter.webp at the bucket root are not
-- portraits. The app already uses the copies in site-images as fallbacks
-- (unknown_gang_cropped_web.webp, unknown_fighter_cropped_web.webp), so those
-- root files are left out of this catalogue.
--
-- Section titles use the n26 gang type name when the two editions differ:
--   Chaos Helots            n23: Helot Chaos Cults
--   Ironhead Squats         n23: Ironhead Squat Prospectors
--   Outcasts                n23: Underhive Outcasts
--   Free Ogryns             n23: Slave Ogryns
--   Spyre Hunters           n23: Spyre Hunting Party
--   The Malstrain           n23: Malstrain Genestealers
-- Badzone Enforcers exists only on n23, so that name is kept.
--
-- Gallery order is not stored. A section is grouped by style (colour, then
-- black & white, then ai-assisted), and within a style by label, with the
-- unlabelled portrait first.
-- Child gangs with no file of their own (Outrider Gang, Wrecking Crew) are omitted.

BEGIN;

CREATE TEMP TABLE gang_portrait_seed (
    stem text PRIMARY KEY,
    group_label text NOT NULL,
    label text
) ON COMMIT DROP;

INSERT INTO gang_portrait_seed (stem, group_label, label)
VALUES
    ('ash_waste_nomads',              'Ash Waste Nomads',      NULL),
    ('badzone_enforcers',             'Badzone Enforcers',     NULL),
    ('corpse_grinder_cults',          'Corpse Grinder Cults',  NULL),
    ('genestealer_cults',             'Genestealer Cults',     NULL),
    ('helot_chaos_cults',             'Chaos Helots',          NULL),
    ('house_cawdor',                  'House Cawdor',          NULL),
    ('house_cawdor-faith',            'House Cawdor',          'Faith'),
    ('house_cawdor-redemption',       'House Cawdor',          'Redemption'),
    ('house_delaque',                 'House Delaque',         NULL),
    ('house_escher',                  'House Escher',          NULL),
    ('house_escher-chymist_cult',     'House Escher',          'Chymist Cult'),
    ('house_escher-wyld_hunt',        'House Escher',          'Wyld Hunt'),
    ('house_goliath',                 'House Goliath',         NULL),
    ('house_goliath-furnace_brutes',  'House Goliath',         'Furnace Brutes'),
    ('house_goliath-unborn_gang',     'House Goliath',         'Unborn Gang'),
    ('house_orlock',                  'House Orlock',          NULL),
    ('house_van_saar',                'House Van Saar',        NULL),
    ('ironhead_squat_prospectors',    'Ironhead Squats',       NULL),
    ('malstrain_web',                 'The Malstrain',         NULL),
    ('mastrain_web',                  'The Malstrain',         NULL),
    ('palanite_enforcers',            'Palanite Enforcers',    NULL),
    ('slave_ogryns',                  'Free Ogryns',           NULL),
    ('spyre_hunters',                 'Spyre Hunters',         NULL),
    ('underhive_outcasts',            'Outcasts',              NULL),
    ('underhive_outcasts-pride1',     'Outcasts',              'Pride 1'),
    ('underhive_outcasts-pride2',     'Outcasts',              'Pride 2'),
    ('venators',                      'Venators',              NULL);

INSERT INTO public.gang_portraits (
    storage_path,
    credit,
    group_label,
    style,
    label
)
SELECT
    o.name,
    CASE split_part(o.name, '/', 1)
        WHEN 'djidiouf' THEN jsonb_build_object(
            'name', 'Djidiouf',
            'url', 'https://www.ashenquarter.com/',
            'suffix', '(AI-assisted)'
        )
        ELSE jsonb_build_object(
            'name', 'Carl R Johnston',
            'url', 'https://linktr.ee/underhiveart'
        )
    END,
    m.group_label,
    CASE split_part(o.name, '/', 1)
        WHEN 'djidiouf' THEN 'ai-assisted'
        WHEN 'carl_r_johnston-grey' THEN 'black & white'
        WHEN 'carl_r_johnston-colour' THEN 'colour'
    END,
    m.label
FROM storage.objects o
JOIN gang_portrait_seed m
    ON m.stem = regexp_replace(split_part(o.name, '/', 2), '\.webp$', '')
WHERE o.bucket_id = 'gang-type-images'
  AND split_part(o.name, '/', 1) IN (
      'djidiouf',
      'carl_r_johnston-grey',
      'carl_r_johnston-colour'
  );

DO $$
DECLARE
    unclassified text;
    missing_stems text;
    seeded_count integer;
BEGIN
    SELECT count(*)
    INTO seeded_count
    FROM public.gang_portraits;

    IF seeded_count = 0 THEN
        RAISE EXCEPTION 'gang_portraits seed inserted no rows';
    END IF;

    SELECT string_agg(o.name, ', ' ORDER BY o.name)
    INTO unclassified
    FROM storage.objects o
    LEFT JOIN public.gang_portraits p
        ON p.storage_path = o.name
    WHERE o.bucket_id = 'gang-type-images'
      AND o.name NOT IN ('unknown_fighter.webp', 'unknown_gang.webp')
      AND p.id IS NULL;

    IF unclassified IS NOT NULL THEN
        RAISE EXCEPTION 'gang-type-images files were not seeded: %', unclassified;
    END IF;

    SELECT string_agg(m.stem, ', ' ORDER BY m.stem)
    INTO missing_stems
    FROM gang_portrait_seed m
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.gang_portraits p
        WHERE regexp_replace(split_part(p.storage_path, '/', 2), '\.webp$', '') = m.stem
    );

    IF missing_stems IS NOT NULL THEN
        RAISE EXCEPTION 'gang portrait stems missing from storage: %', missing_stems;
    END IF;
END $$;

COMMIT;
