-- The Equipment modal's catalogue snapshot: a version number that moves with the equipment
-- catalogue, one view over the equipment rule tables, and the function that builds the
-- snapshot files from them.
--
--   * catalogue_version: one row holding a number. bump_catalogue_version raises it once
--     per statement that changes one of the 16 tables the snapshot is built from.
--   * equipment_rules: the five rule tables (list, availability, discount, Trading Post
--     stock, count limit) in one shape: kind, scope columns, specificity and value.
--   * get_equipment_catalogue(edition, gang type): builds one snapshot file and returns it
--     with the catalogue_version it was built at, from the same statement.
--
-- The catalogue route (/api/equipment-catalogue) calls the function through the service
-- role; nothing else uses any of this yet.
--
-- Apply this migration BEFORE supabase/functions/bump_catalogue_version.sql and
-- supabase/functions/get_equipment_catalogue.sql are deployed. The function and trigger
-- statements below match those files.

CREATE TABLE IF NOT EXISTS public.catalogue_version (
    id         boolean PRIMARY KEY DEFAULT true CHECK (id),
    version    bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalogue_version IS
  'One row. version goes up on every statement that changes an equipment catalogue table '
  '(see bump_catalogue_version). Read-only for everyone else.';

INSERT INTO public.catalogue_version (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.catalogue_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view catalogue_version"
    ON public.catalogue_version
    FOR SELECT
    TO authenticated
    USING (true);

-- No write policies: only bump_catalogue_version (SECURITY DEFINER) changes the row.
REVOKE ALL ON public.catalogue_version FROM anon, authenticated;
GRANT SELECT ON public.catalogue_version TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bump_catalogue_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.catalogue_version
  SET version = version + 1,
      updated_at = now()
  WHERE id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_catalogue_version() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_catalogue_version() FROM anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'count_limits',
    'equipment',
    'equipment_availability',
    'equipment_discounts',
    'exotic_beasts',
    'fighter_effect_type_modifiers',
    'fighter_effect_types',
    'fighter_gang_legacy',
    'fighter_type_equipment',
    'fighter_types',
    'gang_affiliation',
    'gang_types',
    'trading_post_equipment',
    'trading_post_types',
    'vehicle_types',
    'weapon_profiles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS bump_catalogue_version ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER bump_catalogue_version
         AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I
         FOR EACH STATEMENT
         EXECUTE FUNCTION public.bump_catalogue_version()',
      t
    );
  END LOOP;
END $$;

-- Every equipment rule the Equipment modal resolves, in one shape: what kind of rule it is,
-- which item it is about, the scope it applies in (each scope column NULL = any), and its
-- value. One row per source row; nothing is resolved here.
--
--   kind          source table              value columns
--   list          fighter_type_equipment    excluded (true = deny)
--   availability  equipment_availability    availability, exclusive
--   discount      equipment_discounts       adjusted_cost, trade_points
--   trading_post  trading_post_equipment    (none: the item is Trading Post stock)
--   count_limit   count_limits              min_count, max_count
--
-- specificity orders rules of one kind the way get_equipment_detailed_data picks between
-- them; higher wins, rule_id breaks ties:
--   availability  origin 4, gang subtype 2, gang type 1
--   count_limit   item 16, for fighter type 8, gang subtype 4, origin 2, gang type 1
-- List rules all apply (a deny beats any grant) and the cheapest discount wins, so both
-- are 0. A count limit set on a beast's fighter type appears once per item that grants
-- that beast. Custom fighter type lists are per user and stay out of this view.
CREATE OR REPLACE VIEW public.equipment_rules
WITH (security_invoker = true) AS
SELECT
    'list'::text            AS kind,
    fte.id                  AS rule_id,
    fte.equipment_id,
    fte.fighter_type_id,
    fte.vehicle_type_id,
    fte.gang_type_id,
    fte.gang_origin_id,
    fte.gang_subtype_id,
    fte.fighter_subtype,
    NULL::uuid              AS trading_post_type_id,
    NULL::uuid              AS for_fighter_type_id,
    0                       AS specificity,
    fte.excluded,
    NULL::text              AS availability,
    NULL::boolean           AS exclusive,
    NULL::numeric           AS adjusted_cost,
    NULL::text              AS trade_points,
    NULL::integer           AS min_count,
    NULL::integer           AS max_count
FROM public.fighter_type_equipment fte
WHERE fte.custom_fighter_type_id IS NULL

UNION ALL

SELECT
    'availability', ea.id, ea.equipment_id,
    NULL, NULL, ea.gang_type_id, ea.gang_origin_id, ea.gang_subtype_id, NULL, NULL, NULL,
    (CASE WHEN ea.gang_origin_id  IS NOT NULL THEN 4 ELSE 0 END
   + CASE WHEN ea.gang_subtype_id IS NOT NULL THEN 2 ELSE 0 END
   + CASE WHEN ea.gang_type_id    IS NOT NULL THEN 1 ELSE 0 END),
    NULL, ea.availability, ea.exclusive, NULL, NULL, NULL, NULL
FROM public.equipment_availability ea

UNION ALL

SELECT
    'discount', ed.id, ed.equipment_id,
    ed.fighter_type_id, NULL, ed.gang_type_id, ed.gang_origin_id, NULL, NULL, NULL, NULL,
    0,
    NULL, NULL, NULL, ed.adjusted_cost, ed.trade_points, NULL, NULL
FROM public.equipment_discounts ed

UNION ALL

SELECT
    'trading_post', tpe.id, tpe.equipment_id,
    NULL, NULL, NULL, NULL, NULL, NULL, tpe.trading_post_type_id, NULL,
    0,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM public.trading_post_equipment tpe

UNION ALL

SELECT
    'count_limit', cl.id, item.equipment_id,
    NULL, NULL, cl.gang_type_id, cl.gang_origin_id, cl.gang_subtype_id, NULL, NULL, cl.for_fighter_type_id,
    (CASE WHEN cl.equipment_id        IS NOT NULL THEN 16 ELSE 0 END
   + CASE WHEN cl.for_fighter_type_id IS NOT NULL THEN 8  ELSE 0 END
   + CASE WHEN cl.gang_subtype_id     IS NOT NULL THEN 4  ELSE 0 END
   + CASE WHEN cl.gang_origin_id      IS NOT NULL THEN 2  ELSE 0 END
   + CASE WHEN cl.gang_type_id        IS NOT NULL THEN 1  ELSE 0 END),
    NULL, NULL, NULL, NULL, NULL, cl.min_count, cl.max_count
FROM public.count_limits cl
CROSS JOIN LATERAL (
    SELECT cl.equipment_id WHERE cl.equipment_id IS NOT NULL
    UNION
    SELECT eb.equipment_id FROM public.exotic_beasts eb
    WHERE cl.fighter_type_id IS NOT NULL AND eb.fighter_type_id = cl.fighter_type_id
) item;

REVOKE ALL ON public.equipment_rules FROM anon, authenticated;
GRANT SELECT ON public.equipment_rules TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_equipment_catalogue(
    p_edition_id   uuid,
    p_gang_type_id uuid DEFAULT NULL
)
RETURNS TABLE (version bigint, data jsonb)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_gang_type_id IS NULL THEN
    RETURN QUERY
    WITH
    items AS (
      SELECT e.id, e.equipment_name, e.equipment_category, e.equipment_type, e.cost,
             e.availability, e.trade_points, COALESCE(e.core_equipment, false) AS core_equipment,
             e.grants_equipment,
             (row_number() OVER (ORDER BY e.id) - 1)::int AS idx
      FROM equipment e
      WHERE e.edition_id = p_edition_id
    ),
    -- Fighter-type list rules live in the gang type files.
    rules AS (
      SELECT r.*, i.idx AS item_idx
      FROM equipment_rules r
      JOIN items i ON i.id = r.equipment_id
      WHERE r.kind <> 'list' OR r.fighter_type_id IS NULL
    ),
    gang_tps AS (
      SELECT gt.gang_type_id, gt.trading_post_type_id
      FROM gang_types gt
      WHERE gt.edition_id = p_edition_id AND gt.trading_post_type_id IS NOT NULL
    ),
    tps AS (
      SELECT t.id, t.trading_post_name
      FROM trading_post_types t
      WHERE t.edition_id = p_edition_id
         OR t.id IN (SELECT trading_post_type_id FROM gang_tps)
         OR t.id IN (SELECT trading_post_type_id FROM rules WHERE kind = 'trading_post')
    ),
    legacies AS (
      SELECT l.id, l.fighter_type_id, ft.gang_type_id
      FROM fighter_gang_legacy l
      JOIN fighter_types ft ON ft.id = l.fighter_type_id
      WHERE ft.edition_id = p_edition_id
    ),
    affiliations AS (
      SELECT a.id, a.fighter_type_id, ft.gang_type_id
      FROM gang_affiliation a
      JOIN fighter_types ft ON ft.id = a.fighter_type_id
      WHERE ft.edition_id = p_edition_id
    ),
    refs AS (
      SELECT u.id, (row_number() OVER (ORDER BY u.id) - 1)::int AS idx
      FROM (
        SELECT DISTINCT x.id
        FROM (
          SELECT unnest(ARRAY[r.fighter_type_id, r.vehicle_type_id, r.gang_type_id, r.gang_origin_id,
                              r.gang_subtype_id, r.trading_post_type_id, r.for_fighter_type_id]) FROM rules r
          UNION ALL SELECT gang_type_id FROM gang_tps
          UNION ALL SELECT trading_post_type_id FROM gang_tps
          UNION ALL SELECT id FROM tps
          UNION ALL SELECT unnest(ARRAY[id, fighter_type_id, gang_type_id]) FROM legacies
          UNION ALL SELECT unnest(ARRAY[id, fighter_type_id, gang_type_id]) FROM affiliations
        ) x(id)
        WHERE x.id IS NOT NULL
      ) u
    )
    SELECT cv.version, jsonb_build_object(
      'format', 1,
      'version', cv.version,
      'edition', p_edition_id,
      'refs', (SELECT COALESCE(jsonb_agg(f.id ORDER BY f.idx), '[]'::jsonb) FROM refs f),

      -- [id, name, category, type, cost, availability, trade_points, core (0/1),
      --  vehicle slot, grants with option names, profiles]
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          i.id, i.equipment_name, i.equipment_category, i.equipment_type, i.cost,
          i.availability, i.trade_points, CASE WHEN i.core_equipment THEN 1 ELSE 0 END,
          CASE WHEN i.equipment_type = 'vehicle_upgrade' THEN (
            SELECT CASE
              WHEN bool_or(m.stat_name = 'body_slots')   THEN 'Body'
              WHEN bool_or(m.stat_name = 'drive_slots')  THEN 'Drive'
              WHEN bool_or(m.stat_name = 'engine_slots') THEN 'Engine'
            END
            FROM fighter_effect_types fet
            JOIN fighter_effect_type_modifiers m ON m.fighter_effect_type_id = fet.id
            WHERE fet.type_specific_data->>'equipment_id' = i.id::text
              AND m.stat_name IN ('body_slots', 'drive_slots', 'engine_slots')
              AND m.default_numeric_value > 0
          ) END,
          CASE
            WHEN i.grants_equipment IS NOT NULL AND i.grants_equipment->'options' IS NOT NULL THEN
              jsonb_set(i.grants_equipment, '{options}', COALESCE(
                (SELECT jsonb_agg(
                          opt.value || jsonb_build_object('equipment_name', COALESCE(eq.equipment_name, 'Unknown'))
                          ORDER BY opt.ordinality)
                 FROM jsonb_array_elements(i.grants_equipment->'options') WITH ORDINALITY AS opt(value, ordinality)
                 LEFT JOIN equipment eq ON eq.id = (opt.value->>'equipment_id')::uuid),
                '[]'::jsonb))
            ELSE i.grants_equipment
          END,
          -- [id, profile_name, range_short, range_long, acc_short, acc_long, strength, ap,
          --  damage, ammo, traits, sort_order, lethality]
          (SELECT jsonb_agg(jsonb_build_array(
                    wp.id, wp.profile_name, wp.range_short, wp.range_long, wp.acc_short, wp.acc_long,
                    wp.strength, wp.ap, wp.damage, wp.ammo, wp.traits, wp.sort_order, wp.lethality)
                  ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name)
           FROM weapon_profiles wp WHERE wp.equipment_id = i.id)
        ) ORDER BY i.idx), '[]'::jsonb)
        FROM items i
      ),

      -- [gang type, its Trading Post]
      'gangTypes', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(g.idx, t.idx) ORDER BY g.idx), '[]'::jsonb)
        FROM gang_tps gt JOIN refs g ON g.id = gt.gang_type_id JOIN refs t ON t.id = gt.trading_post_type_id
      ),

      -- [Trading Post, name, [item, ...]]
      'tradingPosts', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(t.idx, tp.trading_post_name,
          COALESCE((SELECT jsonb_agg(r.item_idx ORDER BY r.item_idx)
                    FROM rules r WHERE r.kind = 'trading_post' AND r.trading_post_type_id = tp.id), '[]'::jsonb)
        ) ORDER BY t.idx), '[]'::jsonb)
        FROM tps tp JOIN refs t ON t.id = tp.id
      ),

      -- [legacy, fighter type, its gang type] and the same for affiliations
      'legacies', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(a.idx, b.idx, c.idx) ORDER BY a.idx), '[]'::jsonb)
        FROM legacies l JOIN refs a ON a.id = l.id JOIN refs b ON b.id = l.fighter_type_id JOIN refs c ON c.id = l.gang_type_id
      ),
      'affiliations', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(a.idx, b.idx, c.idx) ORDER BY a.idx), '[]'::jsonb)
        FROM affiliations l JOIN refs a ON a.id = l.id JOIN refs b ON b.id = l.fighter_type_id JOIN refs c ON c.id = l.gang_type_id
      ),

      -- [item, vehicle type (null: any), gang type, origin, gang subtype, fighter subtype, excluded (0/1)]
      'listRules', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          r.item_idx, vt.idx, gt.idx, o.idx, s.idx, r.fighter_subtype, CASE WHEN r.excluded THEN 1 ELSE 0 END
        ) ORDER BY r.item_idx, r.rule_id), '[]'::jsonb)
        FROM rules r
        LEFT JOIN refs vt ON vt.id = r.vehicle_type_id
        LEFT JOIN refs gt ON gt.id = r.gang_type_id
        LEFT JOIN refs o  ON o.id  = r.gang_origin_id
        LEFT JOIN refs s  ON s.id  = r.gang_subtype_id
        WHERE r.kind = 'list'
      ),

      -- [item, gang type, origin, gang subtype, availability, exclusive (0/1)], most specific first
      'availability', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          r.item_idx, gt.idx, o.idx, s.idx, r.availability, CASE WHEN r.exclusive THEN 1 ELSE 0 END
        ) ORDER BY r.item_idx, r.specificity DESC, r.rule_id), '[]'::jsonb)
        FROM rules r
        LEFT JOIN refs gt ON gt.id = r.gang_type_id
        LEFT JOIN refs o  ON o.id  = r.gang_origin_id
        LEFT JOIN refs s  ON s.id  = r.gang_subtype_id
        WHERE r.kind = 'availability'
      ),

      -- [item, gang type, fighter type, origin, adjusted cost, trade points]
      'discounts', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          r.item_idx, gt.idx, ft.idx, o.idx, r.adjusted_cost, r.trade_points
        ) ORDER BY r.item_idx, r.rule_id), '[]'::jsonb)
        FROM rules r
        LEFT JOIN refs gt ON gt.id = r.gang_type_id
        LEFT JOIN refs ft ON ft.id = r.fighter_type_id
        LEFT JOIN refs o  ON o.id  = r.gang_origin_id
        WHERE r.kind = 'discount'
      ),

      -- [item, for fighter type, gang type, origin, gang subtype, min, max], first match wins
      'countLimits', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          r.item_idx, ff.idx, gt.idx, o.idx, s.idx, r.min_count, r.max_count
        ) ORDER BY r.item_idx, r.specificity DESC, r.rule_id), '[]'::jsonb)
        FROM rules r
        LEFT JOIN refs ff ON ff.id = r.for_fighter_type_id
        LEFT JOIN refs gt ON gt.id = r.gang_type_id
        LEFT JOIN refs o  ON o.id  = r.gang_origin_id
        LEFT JOIN refs s  ON s.id  = r.gang_subtype_id
        WHERE r.kind = 'count_limit'
      )
    )
    FROM catalogue_version cv
    WHERE cv.id
      AND EXISTS (SELECT 1 FROM editions ed WHERE ed.id = p_edition_id);

  ELSE
    RETURN QUERY
    WITH
    items AS (
      SELECT e.id, (row_number() OVER (ORDER BY e.id) - 1)::int AS idx
      FROM equipment e
      WHERE e.edition_id = p_edition_id
    ),
    rules AS (
      SELECT r.*, i.idx AS item_idx
      FROM equipment_rules r
      JOIN fighter_types ft ON ft.id = r.fighter_type_id
      JOIN items i ON i.id = r.equipment_id
      WHERE r.kind = 'list' AND ft.gang_type_id = p_gang_type_id
    ),
    refs AS (
      SELECT u.id, (row_number() OVER (ORDER BY u.id) - 1)::int AS idx
      FROM (
        SELECT DISTINCT x.id
        FROM (
          SELECT unnest(ARRAY[r.fighter_type_id, r.gang_type_id, r.gang_origin_id, r.gang_subtype_id]) FROM rules r
        ) x(id)
        WHERE x.id IS NOT NULL
      ) u
    )
    SELECT cv.version, jsonb_build_object(
      'format', 1,
      'version', cv.version,
      'edition', p_edition_id,
      'gangType', p_gang_type_id,
      'refs', (SELECT COALESCE(jsonb_agg(f.id ORDER BY f.idx), '[]'::jsonb) FROM refs f),

      -- [item, fighter type, gang type, origin, gang subtype, fighter subtype, excluded (0/1)]
      'listRules', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          r.item_idx, ft.idx, gt.idx, o.idx, s.idx, r.fighter_subtype, CASE WHEN r.excluded THEN 1 ELSE 0 END
        ) ORDER BY r.item_idx, r.rule_id), '[]'::jsonb)
        FROM rules r
        JOIN refs ft ON ft.id = r.fighter_type_id
        LEFT JOIN refs gt ON gt.id = r.gang_type_id
        LEFT JOIN refs o  ON o.id  = r.gang_origin_id
        LEFT JOIN refs s  ON s.id  = r.gang_subtype_id
      )
    )
    FROM catalogue_version cv
    WHERE cv.id
      AND EXISTS (
        SELECT 1 FROM gang_types gt
        WHERE gt.gang_type_id = p_gang_type_id AND gt.edition_id = p_edition_id
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_catalogue(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_equipment_catalogue(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_catalogue(uuid, uuid) TO service_role;
