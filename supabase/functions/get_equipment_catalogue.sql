-- The Equipment modal's catalogue snapshot, built from equipment_rules. Returns the current
-- catalogue_version and the file's data from the same statement, so the two always belong
-- together.
--
--   p_gang_type_id NULL  the edition's core file: items, profiles, grants, vehicle slots,
--                        Trading Post stock, rarity, discounts, count limits, legacy and
--                        affiliation fighter types, and the list rules not tied to a fighter
--                        type (N23 vehicle types and gang-wide subtype rules)
--   p_gang_type_id set   the list rules of the fighter types that belong to that gang type
--
-- No row when the edition (or the gang type within it) does not exist.
--
-- Encoding (types/equipment-catalogue.ts has the same layout as TypeScript types):
--   * items are referred to by their position in the core file's items array, ordered by id,
--     so a gang type file only matches the core file of the same version and edition;
--   * every other id is a position in the file's own refs array;
--   * rows are positional arrays, with null for an absent value and 0/1 for booleans.
--
-- Called only by the catalogue route through the service role.
--
-- DEPLOY ORDER: apply migration 20261002075353_add_equipment_catalogue.sql (which creates the
-- equipment_rules view) BEFORE this file is deployed. The guard below stops the deploy
-- otherwise.

DO $$
BEGIN
  IF to_regclass('public.equipment_rules') IS NULL OR to_regclass('public.catalogue_version') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261002075353_add_equipment_catalogue.sql first';
  END IF;
END $$;

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
