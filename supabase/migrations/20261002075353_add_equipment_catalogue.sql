-- The Equipment modal's catalogue snapshot: a version number that moves with the equipment
-- catalogue, one view over the equipment rule tables, the function that builds the snapshot
-- files from them, and the per-gang overlay that goes with them.
--
--   * catalogue_version: one row holding a number. bump_catalogue_version raises it once
--     per statement that changes one of the 16 tables the snapshot is built from.
--   * equipment_rules: the five rule tables (list, availability, discount, Trading Post
--     stock, count limit) in one shape: kind, scope columns, specificity and value.
--   * get_equipment_catalogue(edition, gang type): builds one snapshot file and returns it
--     with the catalogue_version it was built at, from the same statement.
--   * get_equipment_overlay(gang, fighter): what the snapshot cannot hold because it
--     depends on the gang, its campaign, the fighter or the viewer, with the current
--     catalogue_version.
--
-- The catalogue route (/api/equipment/catalogue) calls get_equipment_catalogue through the
-- service role. A signed-in user who can edit a gang may call get_equipment_overlay for it:
-- the Equipment modal does when it opens, and the buy action does to resolve the listed price.
--
-- Apply this migration BEFORE supabase/functions/bump_catalogue_version.sql,
-- supabase/functions/get_equipment_catalogue.sql and
-- supabase/functions/get_equipment_overlay.sql are deployed. The function and trigger
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

-- Only get_equipment_catalogue reads it, as the service role.
REVOKE ALL ON public.equipment_rules FROM anon, authenticated;
GRANT SELECT ON public.equipment_rules TO service_role;

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

CREATE OR REPLACE FUNCTION public.get_equipment_overlay(
    p_gang_id    uuid,
    p_fighter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
BEGIN
  SELECT g.user_id INTO v_owner FROM gangs g WHERE g.id = p_gang_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gang not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NULL OR NOT (
       v_owner IS NOT DISTINCT FROM v_uid
       OR private.is_admin()
       OR EXISTS (
         SELECT 1
         FROM campaign_gangs cg
         JOIN campaign_members cm ON cm.campaign_id = cg.campaign_id
         WHERE cg.gang_id = p_gang_id
           AND cg.status = 'ACCEPTED'
           AND cm.user_id = v_uid
           AND cm.role IN ('OWNER', 'ARBITRATOR')
       )
     ) THEN
    RAISE EXCEPTION 'Not allowed to edit this gang' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
    gang AS (
      SELECT g.id, g.gang_type_id, g.custom_gang_type_id, g.gang_origin_id, g.gang_subtypes,
             g.alignment, g.gang_affiliation_id, ga.fighter_type_id AS affiliation_fighter_type_id,
             COALESCE(gt.edition_id, cgt.edition_id) AS edition_id,
             gt.trading_post_type_id AS own_trading_post_id
      FROM gangs g
      LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
      LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
      LEFT JOIN gang_affiliation ga ON ga.id = g.gang_affiliation_id
      WHERE g.id = p_gang_id
    ),
    -- No gang has two campaign rows. Should one ever, the earliest is used every time.
    campaign AS (
      SELECT cg.campaign_type_allegiance_id,
             COALESCE(c.trading_posts, '[]'::jsonb) AS trading_posts,
             COALESCE(c.custom_trading_posts, '[]'::jsonb) AS custom_trading_posts
      FROM campaign_gangs cg
      JOIN campaigns c ON c.id = cg.campaign_id
      WHERE cg.gang_id = p_gang_id
      ORDER BY cg.created_at, cg.id
      LIMIT 1
    ),
    official_posts AS (
      SELECT DISTINCT t.id::uuid AS id
      FROM campaign c, jsonb_array_elements_text(c.trading_posts) AS t(id)
      UNION ALL
      SELECT g.own_trading_post_id
      FROM gang g
      WHERE g.own_trading_post_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM campaign)
    ),
    custom_posts AS (
      SELECT DISTINCT t.id::uuid AS id
      FROM campaign c, jsonb_array_elements_text(c.custom_trading_posts) AS t(id)
    ),
    -- One row per stock row of the campaign's custom Trading Posts, with this gang's price and
    -- rarity rows matched as get_equipment_detailed_data's custom_tp_override and custom_tp
    -- match them. Price rows set for a fighter type are not used. Should two rarity rows match
    -- one stock row (none does), the first by id is used. A stock row names exactly one item,
    -- official or custom (chk_equipment_exclusive).
    stock AS (
      SELECT ctpe.id,
             COALESCE(ctpe.equipment_id, ctpe.custom_equipment_id) AS item_id,
             ctpe.equipment_id IS NOT NULL AS official,
             ctp.id AS post_id,
             ctp.custom_trading_post_name AS post_name,
             ctpe.cost_override,
             (SELECT MIN(p.adjusted_cost)
              FROM custom_trading_post_pricing p
              WHERE p.custom_trading_post_equipment_id = ctpe.id
                AND (p.gang_type_id IS NULL OR p.gang_type_id = gd.gang_type_id)
                AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
                AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
                AND p.fighter_type_id IS NULL) AS adjusted_cost,
             COALESCE(
               (SELECT a.availability
                FROM custom_trading_post_availability a
                WHERE a.custom_trading_post_equipment_id = ctpe.id
                  AND a.availability IS NOT NULL
                  AND (a.gang_type_id IS NULL OR a.gang_type_id = gd.gang_type_id)
                  AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
                  AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
                  AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
                  AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = cmp.campaign_type_allegiance_id)
                  AND (a.alignment IS NULL OR a.alignment = gd.alignment)
                ORDER BY a.id
                LIMIT 1),
               ctpe.availability_override
             ) AS availability,
             ctpe.cost_type_resource_id,
             ctpe.cost_campaign_resource_id,
             COALESCE(ctr.resource_name, cr.resource_name) AS resource_name,
             ctpe.cost_resource_amount,
             ctpe.cost_reputation,
             ctpe.banned,
             ctpe.sort_order,
             ctpe.created_at
      FROM custom_trading_post_equipment ctpe
      JOIN custom_posts cp ON cp.id = ctpe.custom_trading_post_id
      JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
      CROSS JOIN gang gd
      CROSS JOIN campaign cmp
      LEFT JOIN campaign_type_resources ctr ON ctr.id = ctpe.cost_type_resource_id
      LEFT JOIN campaign_resources cr ON cr.id = ctpe.cost_campaign_resource_id
    ),
    custom_sources AS (
      SELECT ce.id, true AS listed
      FROM custom_equipment ce
      WHERE ce.user_id = v_uid
      UNION ALL
      SELECT cs.custom_equipment_id, true
      FROM custom_shared cs
      JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
      WHERE cg.gang_id = p_gang_id
        AND cs.custom_equipment_id IS NOT NULL
      UNION ALL
      SELECT s.item_id, false
      FROM stock s
      WHERE NOT s.official
    ),
    custom_items AS (
      SELECT ce.id, ce.equipment_name, ce.equipment_category, ce.equipment_type, ce.cost,
             ce.availability, ce.trade_points, NOT src.listed AS tp_only
      FROM (SELECT id, bool_or(listed) AS listed FROM custom_sources GROUP BY id) src
      JOIN custom_equipment ce ON ce.id = src.id
      CROSS JOIN gang gd
      WHERE gd.edition_id IS NULL OR ce.edition_id = gd.edition_id
    ),
    -- The modal's fighter type is the official one, else the custom one
    -- (app/fighter/[id]/page.tsx). Only a fighter without an official type uses its custom
    -- type's list and subtypes.
    fighter AS (
      SELECT f.id,
             ft.id AS fighter_type_id,
             CASE WHEN ft.id IS NULL THEN f.custom_fighter_type_id END AS custom_fighter_type_id,
             f.fighter_subtypes,
             COALESCE(ft.fighter_subtypes, cft.fighter_subtypes) AS type_subtypes,
             fgl.fighter_type_id AS legacy_fighter_type_id
      FROM fighters f
      LEFT JOIN fighter_types ft ON ft.id = f.fighter_type_id
      LEFT JOIN custom_fighter_types cft ON cft.id = f.custom_fighter_type_id AND ft.id IS NULL
      LEFT JOIN fighter_gang_legacy fgl ON fgl.id = f.fighter_gang_legacy_id
      WHERE f.id = p_fighter_id
        AND f.gang_id = p_gang_id
    ),
    custom_list AS (
      SELECT DISTINCT COALESCE(cfte.equipment_id, cfte.custom_equipment_id) AS item_id,
             cfte.equipment_id IS NOT NULL AS official
      FROM custom_fighter_type_equipment cfte
      JOIN fighter fr ON fr.custom_fighter_type_id = cfte.custom_fighter_type_id
      WHERE COALESCE(cfte.equipment_id, cfte.custom_equipment_id) IS NOT NULL
    ),
    -- Fighter types whose equipment lists can apply: the fighter's own, its legacy's and the
    -- gang's affiliation's. Each list lives in the file of the gang type owning that type.
    rule_files AS (
      SELECT DISTINCT gt.edition_id, gt.gang_type_id
      FROM (
        SELECT fr.fighter_type_id AS id FROM fighter fr
        UNION ALL
        SELECT fr.legacy_fighter_type_id FROM fighter fr
        UNION ALL
        SELECT g.affiliation_fighter_type_id FROM gang g
      ) t
      JOIN fighter_types ft ON ft.id = t.id
      JOIN gang_types gt ON gt.gang_type_id = ft.gang_type_id
    ),
    -- Official items the gang can reach outside its fighters' own lists: Trading Post stock,
    -- a custom list, gang-wide list rules (no fighter type) and rarity rows for its origin or
    -- subtypes, which also put an item on a list.
    reachable AS (
      SELECT tpe.equipment_id AS id
      FROM trading_post_equipment tpe
      JOIN official_posts op ON op.id = tpe.trading_post_type_id
      UNION
      SELECT s.item_id FROM stock s WHERE s.official
      UNION
      SELECT l.item_id FROM custom_list l WHERE l.official
      UNION
      SELECT fte.equipment_id
      FROM fighter_type_equipment fte
      CROSS JOIN gang g
      WHERE fte.fighter_type_id IS NULL
        AND fte.vehicle_type_id IS NULL
        AND fte.custom_fighter_type_id IS NULL
        AND fte.fighter_subtype IS NOT NULL
        AND NOT fte.excluded
        AND (fte.gang_type_id IS NULL OR fte.gang_type_id = g.gang_type_id)
        AND (fte.gang_origin_id IS NULL OR fte.gang_origin_id = g.gang_origin_id)
        AND (fte.gang_subtype_id IS NULL OR g.gang_subtypes ? fte.gang_subtype_id::text)
      UNION
      SELECT ea.equipment_id
      FROM equipment_availability ea
      CROSS JOIN gang g
      WHERE (ea.gang_origin_id IS NOT NULL AND ea.gang_origin_id = g.gang_origin_id)
         OR (ea.gang_subtype_id IS NOT NULL AND g.gang_subtypes ? ea.gang_subtype_id::text)
    )
    SELECT jsonb_build_object(
      'format', 1,
      'version', (SELECT cv.version FROM catalogue_version cv WHERE cv.id),
      'gang', jsonb_build_object(
        'id', g.id,
        'gangType', g.gang_type_id,
        'customGangType', g.custom_gang_type_id,
        'edition', g.edition_id,
        'origin', g.gang_origin_id,
        'subtypes', COALESCE(g.gang_subtypes, '[]'::jsonb),
        'alignment', g.alignment,
        'affiliation', g.gang_affiliation_id,
        'affiliationFighterType', g.affiliation_fighter_type_id
      ),
      'ruleFiles', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(rf.edition_id, rf.gang_type_id) ORDER BY rf.edition_id, rf.gang_type_id), '[]'::jsonb)
        FROM rule_files rf
      ),
      'otherEditions', (
        SELECT COALESCE(jsonb_agg(DISTINCT x.edition_id), '[]'::jsonb)
        FROM (
          SELECT e.edition_id FROM reachable r JOIN equipment e ON e.id = r.id
          UNION
          SELECT rf.edition_id FROM rule_files rf
        ) x
        WHERE x.edition_id IS DISTINCT FROM g.edition_id
      ),
      'tradingPosts', (SELECT COALESCE(jsonb_agg(t.id ORDER BY t.id), '[]'::jsonb) FROM official_posts t),
      'fighter', (
        SELECT jsonb_build_object(
          'id', fr.id,
          'fighterType', fr.fighter_type_id,
          'customFighterType', fr.custom_fighter_type_id,
          'subtypes', fr.fighter_subtypes,
          'typeSubtypes', COALESCE(fr.type_subtypes, '[]'::jsonb),
          'legacyFighterType', fr.legacy_fighter_type_id,
          'list', (SELECT COALESCE(jsonb_agg(l.item_id ORDER BY l.item_id), '[]'::jsonb) FROM custom_list l)
        )
        FROM fighter fr
      ),

      -- [id, name, category, type, cost, availability, trade_points, profiles, tpOnly (0/1)]
      'customItems', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          ci.id, ci.equipment_name, ci.equipment_category, ci.equipment_type, ci.cost,
          ci.availability, ci.trade_points,
          -- [id, profile_name, range_short, range_long, acc_short, acc_long, strength, ap,
          --  damage, ammo, traits, sort_order, lethality]
          (SELECT jsonb_agg(jsonb_build_array(
                    cwp.id, cwp.profile_name, cwp.range_short, cwp.range_long, cwp.acc_short, cwp.acc_long,
                    cwp.strength, cwp.ap, cwp.damage, cwp.ammo, cwp.traits, cwp.sort_order, cwp.lethality)
                  ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name)
           FROM custom_weapon_profiles cwp WHERE cwp.custom_equipment_id = ci.id),
          CASE WHEN ci.tp_only THEN 1 ELSE 0 END
        ) ORDER BY ci.id), '[]'::jsonb)
        FROM custom_items ci
      ),

      -- [item, post, post name, cost override, adjusted cost, rarity, campaign type resource,
      --  campaign resource, resource name, resource amount, Reputation (0/1), banned (0/1),
      --  sort order, created at]
      'customTpStock', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          s.item_id, s.post_id, s.post_name, s.cost_override, s.adjusted_cost, s.availability,
          s.cost_type_resource_id, s.cost_campaign_resource_id, s.resource_name, s.cost_resource_amount,
          CASE WHEN s.cost_reputation THEN 1 ELSE 0 END,
          CASE WHEN s.banned THEN 1 ELSE 0 END,
          s.sort_order,
          to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        ) ORDER BY s.item_id, s.post_id, s.id), '[]'::jsonb)
        FROM stock s
        WHERE s.official OR s.item_id IN (SELECT ci.id FROM custom_items ci)
      )
    )
    FROM gang g
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_overlay(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_equipment_overlay(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_overlay(uuid, uuid) TO authenticated, service_role;
