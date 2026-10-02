-- The Equipment modal's per-gang overlay: what the catalogue snapshot (get_equipment_catalogue)
-- cannot hold because it depends on the gang, its campaign, the fighter or the viewer. The modal
-- calls it from the browser when it opens; its version names the snapshot files to load.
--
-- It derives here, from the gang, what get_equipment_detailed_data is given by the client or
-- reads itself, and returns:
--
--   version         the current catalogue_version
--   gang            gang type, custom gang type, edition, origin, gang subtypes, alignment and
--                   affiliation
--   otherEditions   editions besides the gang's whose core files hold items the gang can reach:
--                   through its campaign's Trading Posts, or a custom fighter's equipment list
--   tradingPosts    the official Trading Posts the Trading Post tab sells from: the campaign's
--                   list when the gang has a campaign row, whatever its status (its own gang
--                   type's post only if listed), else its gang type's own post
--   fighter         p_fighter_id's fighter type (official, else custom), its own subtypes, its
--                   type's subtypes, its legacy's fighter type and its custom fighter type's
--                   equipment list. null without p_fighter_id or when the fighter is in another
--                   gang
--   customItems     custom equipment of the gang's edition the viewer can see: their own, any
--                   shared with the gang's campaign, and any the campaign's custom Trading
--                   Posts stock. tpOnly marks the last kind, which only the Trading Post tab
--                   shows
--   customTpOffers  for each item the campaign's custom Trading Posts stock, official or custom:
--                   the cost and rarity overrides, the price set for this gang, the resource
--                   cost, the ban and the posts' names. They apply on the Trading Post tab only
--
-- Only the gang's owner, an admin, or an owner or arbitrator of a campaign the gang has been
-- accepted into may call it: the rule behind canEdit (utils/user-permissions.ts), which every
-- way of opening the modal already requires.
--
-- Encoding (types/equipment-catalogue.ts has the same layout as TypeScript types): ids are
-- uuids; customItems and customTpOffers rows are positional arrays, with null for an absent
-- value and 0/1 for booleans.
--
-- DEPLOY ORDER: apply migration 20261002075353_add_equipment_catalogue.sql (which creates
-- catalogue_version) BEFORE this file is deployed. The guard below stops the deploy otherwise.

DO $$
BEGIN
  IF to_regclass('public.catalogue_version') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261002075353_add_equipment_catalogue.sql first';
  END IF;
END $$;

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
             g.alignment, g.gang_affiliation_id,
             COALESCE(gt.edition_id, cgt.edition_id) AS edition_id,
             gt.trading_post_type_id AS own_trading_post_id
      FROM gangs g
      LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
      LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
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
    -- The custom Trading Posts' stock with this gang's price and rarity rows, joined as
    -- get_equipment_detailed_data's custom_tp_override and custom_tp do. A stock row names
    -- exactly one item, official or custom (chk_equipment_exclusive).
    stock AS (
      SELECT COALESCE(ctpe.equipment_id, ctpe.custom_equipment_id) AS item_id,
             ctpe.equipment_id IS NOT NULL AS official,
             ctpe.cost_override, ctpe.cost_type_resource_id, ctpe.cost_campaign_resource_id,
             ctpe.cost_resource_amount, ctpe.cost_reputation, ctpe.availability_override,
             ctpe.sort_order, ctpe.created_at, ctpe.banned,
             ctp.custom_trading_post_name,
             p.adjusted_cost,
             a.availability
      FROM custom_trading_post_equipment ctpe
      JOIN custom_posts cp ON cp.id = ctpe.custom_trading_post_id
      JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
      CROSS JOIN gang gd
      CROSS JOIN campaign cmp
      LEFT JOIN custom_trading_post_pricing p
          ON p.custom_trading_post_equipment_id = ctpe.id
          AND (p.gang_type_id IS NULL OR p.gang_type_id = gd.gang_type_id)
          AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
          AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
          AND (p.fighter_type_id IS NULL)
      LEFT JOIN custom_trading_post_availability a
          ON a.custom_trading_post_equipment_id = ctpe.id
          AND (a.gang_type_id IS NULL OR a.gang_type_id = gd.gang_type_id)
          AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
          AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
          AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
          AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = cmp.campaign_type_allegiance_id)
          AND (a.alignment IS NULL OR a.alignment = gd.alignment)
    ),
    offers AS (
      SELECT
        s.item_id,
        bool_or(s.official) AS official,
        MIN(s.cost_override) FILTER (WHERE s.cost_override IS NOT NULL) AS cost_override,
        (array_agg(s.cost_type_resource_id ORDER BY s.cost_override NULLS LAST, COALESCE(s.sort_order, 999), s.created_at) FILTER (WHERE s.cost_type_resource_id IS NOT NULL))[1] AS cost_type_resource_id,
        (array_agg(s.cost_campaign_resource_id ORDER BY s.cost_override NULLS LAST, COALESCE(s.sort_order, 999), s.created_at) FILTER (WHERE s.cost_campaign_resource_id IS NOT NULL))[1] AS cost_campaign_resource_id,
        (array_agg(s.cost_resource_amount ORDER BY s.cost_override NULLS LAST, COALESCE(s.sort_order, 999), s.created_at) FILTER (WHERE s.cost_resource_amount IS NOT NULL))[1] AS cost_resource_amount,
        (array_agg(s.cost_reputation ORDER BY s.cost_override NULLS LAST, COALESCE(s.sort_order, 999), s.created_at) FILTER (WHERE s.cost_reputation))[1] AS cost_reputation,
        (array_agg(COALESCE(s.availability, s.availability_override) ORDER BY s.cost_override NULLS LAST, COALESCE(s.sort_order, 999), s.created_at) FILTER (WHERE COALESCE(s.availability, s.availability_override) IS NOT NULL))[1] AS availability_override,
        MIN(s.adjusted_cost) FILTER (WHERE s.adjusted_cost IS NOT NULL) AS adjusted_cost,
        bool_or(s.banned) AS banned,
        array_agg(DISTINCT s.custom_trading_post_name) FILTER (WHERE s.custom_trading_post_name IS NOT NULL) AS names
      FROM stock s
      GROUP BY s.item_id
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
      SELECT o.item_id, false
      FROM offers o
      WHERE NOT o.official
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
    reachable AS (
      SELECT tpe.equipment_id AS id
      FROM trading_post_equipment tpe
      JOIN official_posts op ON op.id = tpe.trading_post_type_id
      UNION
      SELECT o.item_id FROM offers o WHERE o.official
      UNION
      SELECT l.item_id FROM custom_list l WHERE l.official
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
        'affiliation', g.gang_affiliation_id
      ),
      'otherEditions', (
        SELECT COALESCE(jsonb_agg(DISTINCT e.edition_id), '[]'::jsonb)
        FROM reachable r
        JOIN equipment e ON e.id = r.id
        WHERE e.edition_id IS DISTINCT FROM g.edition_id
      ),
      'tradingPosts', (SELECT COALESCE(jsonb_agg(t.id ORDER BY t.id), '[]'::jsonb) FROM official_posts t),
      'fighter', (
        SELECT jsonb_build_object(
          'id', fr.id,
          'fighterType', fr.fighter_type_id,
          'customFighterType', fr.custom_fighter_type_id,
          'subtypes', COALESCE(fr.fighter_subtypes, '[]'::jsonb),
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

      -- [item, cost override, adjusted cost, rarity override, paid with a resource (0/1),
      --  resource name, resource amount, campaign type resource, campaign resource,
      --  banned (0/1), custom Trading Post names]
      'customTpOffers', (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(
          o.item_id, o.cost_override, o.adjusted_cost, o.availability_override,
          CASE WHEN o.cost_type_resource_id IS NOT NULL
                 OR o.cost_campaign_resource_id IS NOT NULL
                 OR o.cost_reputation THEN 1 ELSE 0 END,
          CASE WHEN o.cost_reputation THEN 'Reputation'
               ELSE COALESCE(ctr.resource_name, cr.resource_name) END,
          CASE WHEN o.cost_type_resource_id IS NOT NULL
                 OR o.cost_campaign_resource_id IS NOT NULL
                 OR o.cost_reputation THEN o.cost_resource_amount END,
          o.cost_type_resource_id, o.cost_campaign_resource_id,
          CASE WHEN o.banned THEN 1 ELSE 0 END,
          COALESCE(to_jsonb(o.names), '[]'::jsonb)
        ) ORDER BY o.item_id), '[]'::jsonb)
        FROM offers o
        LEFT JOIN campaign_type_resources ctr ON ctr.id = o.cost_type_resource_id
        LEFT JOIN campaign_resources cr ON cr.id = o.cost_campaign_resource_id
        WHERE o.official OR o.item_id IN (SELECT ci.id FROM custom_items ci)
      )
    )
    FROM gang g
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_overlay(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_equipment_overlay(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_overlay(uuid, uuid) TO authenticated, service_role;
