-- Set gangs.gang_portrait_id from the portrait URL at gangs.default_gang_image.
--
-- The index selects an entry in gang_types.default_image_urls, or in
-- custom_gang_types.default_image_urls for a custom gang. The entry's URL is
-- matched to gang_portraits.storage_path. image_url is left unchanged; a
-- custom upload still takes priority in the app.
--
-- Left null:
--   * default_gang_image is null (no catalogue selection)
--   * index 0, the shared silhouette in site-images
--   * index 1 when that slot is still the unknown image in site-images
--     (gang types with no AI-assisted portrait)
--
-- Measured before writing this file: 107,099 gangs match a catalogue file.
-- 9,301 eligible gangs point at site-images and stay null. No catalogue path
-- failed to match.

UPDATE public.gangs AS g
SET gang_portrait_id = matched.gang_portrait_id
FROM (
    SELECT
        g2.id AS gang_id,
        gp.id AS gang_portrait_id
    FROM public.gangs g2
    LEFT JOIN public.gang_types gt ON gt.id = g2.gang_type_id
    LEFT JOIN public.custom_gang_types cgt ON cgt.id = g2.custom_gang_type_id
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN g2.gang_type_id IS NOT NULL THEN gt.default_image_urls
            ELSE cgt.default_image_urls
        END AS urls
    ) lists
    CROSS JOIN LATERAL (
        SELECT jsonb_array_element(lists.urls, trunc(g2.default_gang_image)::int) AS elem
    ) picked
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN jsonb_typeof(picked.elem) = 'object' THEN picked.elem->>'url'
            WHEN jsonb_typeof(picked.elem) = 'string' THEN picked.elem #>> '{}'
        END AS url
    ) chosen
    JOIN public.gang_portraits gp
        ON gp.storage_path = substring(chosen.url FROM '/gang-type-images/(.+)$')
    WHERE g2.gang_portrait_id IS NULL
      AND g2.default_gang_image IS NOT NULL
      AND trunc(g2.default_gang_image) >= 1
      AND lists.urls IS NOT NULL
      AND trunc(g2.default_gang_image) < jsonb_array_length(lists.urls)
) AS matched
WHERE g.id = matched.gang_id;
