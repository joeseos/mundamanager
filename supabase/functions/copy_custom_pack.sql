-- Deep-clone a pack and all of its custom items into the calling user's account.
-- SECURITY INVOKER: open-SELECT RLS reads the source owner's rows; owner-INSERT RLS
-- accepts the clones (user_id = auth.uid()). Runs atomically in one transaction.
-- Implemented with plpgsql array variables + jsonb id-maps (no temp tables) so the
-- body compiles under check_function_bodies and avoids cached-plan pitfalls.
-- Maps are jsonb objects keyed by old uuid (text) -> new uuid (text).
CREATE OR REPLACE FUNCTION public.copy_custom_pack(p_pack_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_new_pack uuid := gen_random_uuid();
  v_items jsonb;
  v_new_items jsonb;
  v_name text;
  v_description text;
  v_before bigint;
  v_after bigint;
  -- closure id-sets
  v_eq uuid[] := '{}';   -- custom_equipment
  v_st uuid[] := '{}';   -- custom_skill_types
  v_sk uuid[] := '{}';   -- custom_skills
  v_gt uuid[] := '{}';   -- custom_gang_types
  v_ft uuid[] := '{}';   -- custom_fighter_types
  v_tp uuid[] := '{}';   -- custom_trading_posts
  -- old(text) -> new(text) id maps
  v_map_eq jsonb;
  v_map_st jsonb;
  v_map_sk jsonb;
  v_map_gt jsonb;
  v_map_ft jsonb;
  v_map_tp jsonb;
  v_map_tpe jsonb;       -- custom_trading_post_equipment
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.items, p.name, p.description
    INTO v_items, v_name, v_description
  FROM public.custom_packs p
  WHERE p.id = p_pack_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pack not found';
  END IF;

  -- Seed closure id-sets from the pack's items jsonb.
  v_eq := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'equipment' AND x.id IS NOT NULL), '{}');
  v_ft := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'fighter_type' AND x.id IS NOT NULL), '{}');
  v_gt := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'gang_type' AND x.id IS NOT NULL), '{}');
  v_sk := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'skill' AND x.id IS NOT NULL), '{}');
  v_tp := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'trading_post' AND x.id IS NOT NULL), '{}');

  -- Transitive closure: pull in every custom item referenced by packed items so
  -- the copy is self-contained. Loop until no new ids are discovered.
  LOOP
    v_before := cardinality(v_eq) + cardinality(v_st) + cardinality(v_sk)
              + cardinality(v_gt) + cardinality(v_ft) + cardinality(v_tp);

    -- fighter types belonging to in-scope gang types
    v_ft := ARRAY(SELECT DISTINCT f FROM (
              SELECT unnest(v_ft) AS f
              UNION SELECT cft.id FROM public.custom_fighter_types cft WHERE cft.custom_gang_type_id = ANY(v_gt)
            ) s WHERE f IS NOT NULL);

    -- gang types referenced by in-scope fighter types and trading posts
    v_gt := ARRAY(SELECT DISTINCT g FROM (
              SELECT unnest(v_gt) AS g
              UNION SELECT cft.custom_gang_type_id FROM public.custom_fighter_types cft
                    WHERE cft.id = ANY(v_ft) AND cft.custom_gang_type_id IS NOT NULL
              UNION SELECT a.custom_gang_type_id FROM public.custom_trading_post_availability a
                    JOIN public.custom_trading_post_equipment te ON te.id = a.custom_trading_post_equipment_id
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND a.custom_gang_type_id IS NOT NULL
              UNION SELECT pr.custom_gang_type_id FROM public.custom_trading_post_pricing pr
                    JOIN public.custom_trading_post_equipment te ON te.id = pr.custom_trading_post_equipment_id
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND pr.custom_gang_type_id IS NOT NULL
            ) s WHERE g IS NOT NULL);

    -- skill types referenced by in-scope fighter skill access and skills
    v_st := ARRAY(SELECT DISTINCT t FROM (
              SELECT unnest(v_st) AS t
              UNION SELECT sa.custom_skill_type_id FROM public.fighter_type_skill_access sa
                    WHERE sa.custom_fighter_type_id = ANY(v_ft) AND sa.custom_skill_type_id IS NOT NULL
              UNION SELECT cs.custom_skill_type_id FROM public.custom_skills cs
                    WHERE cs.id = ANY(v_sk) AND cs.custom_skill_type_id IS NOT NULL
            ) s WHERE t IS NOT NULL);

    -- all skills belonging to in-scope skill types (clone the whole set)
    v_sk := ARRAY(SELECT DISTINCT k FROM (
              SELECT unnest(v_sk) AS k
              UNION SELECT cs.id FROM public.custom_skills cs WHERE cs.custom_skill_type_id = ANY(v_st)
            ) s WHERE k IS NOT NULL);

    -- equipment referenced by fighter defaults / fighter equipment / trading posts
    v_eq := ARRAY(SELECT DISTINCT e FROM (
              SELECT unnest(v_eq) AS e
              UNION SELECT fd.custom_equipment_id FROM public.fighter_defaults fd
                    WHERE fd.custom_fighter_type_id = ANY(v_ft) AND fd.custom_equipment_id IS NOT NULL
              UNION SELECT fe.custom_equipment_id FROM public.custom_fighter_type_equipment fe
                    WHERE fe.custom_fighter_type_id = ANY(v_ft) AND fe.custom_equipment_id IS NOT NULL
              UNION SELECT te.custom_equipment_id FROM public.custom_trading_post_equipment te
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND te.custom_equipment_id IS NOT NULL
            ) s WHERE e IS NOT NULL);

    v_after := cardinality(v_eq) + cardinality(v_st) + cardinality(v_sk)
             + cardinality(v_gt) + cardinality(v_ft) + cardinality(v_tp);

    EXIT WHEN v_after = v_before;
  END LOOP;

  -- Build old->new id maps (pre-generate new ids).
  v_map_st  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_st) u), '{}'::jsonb);
  v_map_sk  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_sk) u), '{}'::jsonb);
  v_map_eq  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_eq) u), '{}'::jsonb);
  v_map_gt  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_gt) u), '{}'::jsonb);
  v_map_ft  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_ft) u), '{}'::jsonb);
  v_map_tp  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_tp) u), '{}'::jsonb);
  v_map_tpe := COALESCE((SELECT jsonb_object_agg(te.id::text, gen_random_uuid()::text)
                         FROM public.custom_trading_post_equipment te
                         WHERE te.custom_trading_post_id = ANY(v_tp)), '{}'::jsonb);

  -- Clone in topological order. Custom FKs remapped via maps; standard/global FKs kept.

  INSERT INTO public.custom_skill_types (id, created_at, user_id, name)
  SELECT (v_map_st ->> st.id::text)::uuid, now(), v_user, st.name
  FROM public.custom_skill_types st WHERE st.id = ANY(v_st);

  INSERT INTO public.custom_skills (id, created_at, user_id, skill_name, skill_type_id, custom_skill_type_id, description)
  SELECT (v_map_sk ->> cs.id::text)::uuid, now(), v_user, cs.skill_name, cs.skill_type_id,
         (v_map_st ->> cs.custom_skill_type_id::text)::uuid, cs.description
  FROM public.custom_skills cs WHERE cs.id = ANY(v_sk);

  INSERT INTO public.custom_equipment (id, created_at, user_id, equipment_name, availability, cost, variant,
                                       equipment_category, equipment_category_id, equipment_type, is_editable,
                                       is_consumable, description)
  SELECT (v_map_eq ->> ce.id::text)::uuid, now(), v_user, ce.equipment_name, ce.availability, ce.cost, ce.variant,
         ce.equipment_category, ce.equipment_category_id, ce.equipment_type, true,
         ce.is_consumable, ce.description
  FROM public.custom_equipment ce WHERE ce.id = ANY(v_eq);

  INSERT INTO public.custom_weapon_profiles (id, custom_equipment_id, created_at, profile_name, range_short,
                                             range_long, acc_short, acc_long, strength, ap, damage, ammo,
                                             traits, weapon_group_id, sort_order, user_id)
  SELECT gen_random_uuid(), (v_map_eq ->> wp.custom_equipment_id::text)::uuid, now(), wp.profile_name, wp.range_short,
         wp.range_long, wp.acc_short, wp.acc_long, wp.strength, wp.ap, wp.damage, wp.ammo,
         wp.traits, (v_map_eq ->> wp.weapon_group_id::text)::uuid, wp.sort_order, v_user
  FROM public.custom_weapon_profiles wp WHERE wp.custom_equipment_id = ANY(v_eq);

  INSERT INTO public.custom_gang_types (id, created_at, user_id, gang_type, alignment, trading_post_type_id,
                                        default_image_urls, description)
  SELECT (v_map_gt ->> gt.id::text)::uuid, now(), v_user, gt.gang_type, gt.alignment, gt.trading_post_type_id,
         gt.default_image_urls, gt.description
  FROM public.custom_gang_types gt WHERE gt.id = ANY(v_gt);

  INSERT INTO public.custom_fighter_types (id, created_at, user_id, fighter_type, gang_type, cost, movement,
                                           weapon_skill, ballistic_skill, strength, toughness, wounds, initiative,
                                           attacks, leadership, cool, willpower, intelligence, gang_type_id,
                                           special_rules, free_skill, fighter_class, fighter_class_id,
                                           custom_gang_type_id, description)
  SELECT (v_map_ft ->> cft.id::text)::uuid, now(), v_user, cft.fighter_type, cft.gang_type, cft.cost, cft.movement,
         cft.weapon_skill, cft.ballistic_skill, cft.strength, cft.toughness, cft.wounds, cft.initiative,
         cft.attacks, cft.leadership, cft.cool, cft.willpower, cft.intelligence, cft.gang_type_id,
         cft.special_rules, cft.free_skill, cft.fighter_class, cft.fighter_class_id,
         (v_map_gt ->> cft.custom_gang_type_id::text)::uuid, cft.description
  FROM public.custom_fighter_types cft WHERE cft.id = ANY(v_ft);

  INSERT INTO public.fighter_type_skill_access (id, fighter_type_id, skill_type_id, access_level,
                                                custom_fighter_type_id, custom_skill_type_id)
  SELECT gen_random_uuid(), sa.fighter_type_id, sa.skill_type_id, sa.access_level,
         (v_map_ft ->> sa.custom_fighter_type_id::text)::uuid, (v_map_st ->> sa.custom_skill_type_id::text)::uuid
  FROM public.fighter_type_skill_access sa WHERE sa.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.fighter_defaults (id, created_at, fighter_type_id, equipment_id, skill_id,
                                       custom_fighter_type_id, custom_equipment_id)
  SELECT gen_random_uuid(), now(), fd.fighter_type_id, fd.equipment_id, fd.skill_id,
         (v_map_ft ->> fd.custom_fighter_type_id::text)::uuid, (v_map_eq ->> fd.custom_equipment_id::text)::uuid
  FROM public.fighter_defaults fd WHERE fd.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.custom_fighter_type_equipment (id, created_at, equipment_id, custom_equipment_id,
                                                    custom_fighter_type_id)
  SELECT gen_random_uuid(), now(), fe.equipment_id, (v_map_eq ->> fe.custom_equipment_id::text)::uuid,
         (v_map_ft ->> fe.custom_fighter_type_id::text)::uuid
  FROM public.custom_fighter_type_equipment fe WHERE fe.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.custom_trading_posts (id, created_at, user_id, custom_trading_post_name, description)
  SELECT (v_map_tp ->> tp.id::text)::uuid, now(), v_user, tp.custom_trading_post_name, tp.description
  FROM public.custom_trading_posts tp WHERE tp.id = ANY(v_tp);

  INSERT INTO public.custom_trading_post_equipment (id, created_at, user_id, custom_trading_post_id, equipment_id,
                                                    custom_equipment_id, cost_override, availability_override,
                                                    sort_order, cost_type_resource_id, cost_campaign_resource_id,
                                                    cost_reputation, cost_resource_amount)
  SELECT (v_map_tpe ->> te.id::text)::uuid, now(), v_user, (v_map_tp ->> te.custom_trading_post_id::text)::uuid,
         te.equipment_id, (v_map_eq ->> te.custom_equipment_id::text)::uuid, te.cost_override, te.availability_override,
         te.sort_order, te.cost_type_resource_id, te.cost_campaign_resource_id,
         te.cost_reputation, te.cost_resource_amount
  FROM public.custom_trading_post_equipment te WHERE te.custom_trading_post_id = ANY(v_tp);

  INSERT INTO public.custom_trading_post_availability (id, created_at, user_id, custom_trading_post_equipment_id,
                                                       gang_type_id, custom_gang_type_id, gang_origin_id,
                                                       gang_variant_id, campaign_type_allegiance_id, alignment,
                                                       availability)
  SELECT gen_random_uuid(), now(), v_user, (v_map_tpe ->> a.custom_trading_post_equipment_id::text)::uuid,
         a.gang_type_id, (v_map_gt ->> a.custom_gang_type_id::text)::uuid, a.gang_origin_id,
         a.gang_variant_id, a.campaign_type_allegiance_id, a.alignment, a.availability
  FROM public.custom_trading_post_availability a
  WHERE (v_map_tpe ? a.custom_trading_post_equipment_id::text);

  INSERT INTO public.custom_trading_post_pricing (id, created_at, user_id, custom_trading_post_equipment_id,
                                                  gang_type_id, custom_gang_type_id, gang_origin_id,
                                                  fighter_type_id, adjusted_cost)
  SELECT gen_random_uuid(), now(), v_user, (v_map_tpe ->> pr.custom_trading_post_equipment_id::text)::uuid,
         pr.gang_type_id, (v_map_gt ->> pr.custom_gang_type_id::text)::uuid, pr.gang_origin_id,
         pr.fighter_type_id, pr.adjusted_cost
  FROM public.custom_trading_post_pricing pr
  WHERE (v_map_tpe ? pr.custom_trading_post_equipment_id::text);

  -- Build the new pack's items, remapping each entry's id; drop unresolved entries.
  v_new_items := COALESCE((
    SELECT jsonb_agg(jsonb_build_object('type', x.type, 'id', mapped.nid))
    FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
    CROSS JOIN LATERAL (
      SELECT CASE x.type
        WHEN 'equipment'    THEN v_map_eq ->> x.id::text
        WHEN 'fighter_type' THEN v_map_ft ->> x.id::text
        WHEN 'gang_type'    THEN v_map_gt ->> x.id::text
        WHEN 'skill'        THEN v_map_sk ->> x.id::text
        WHEN 'trading_post' THEN v_map_tp ->> x.id::text
      END AS nid
    ) mapped
    WHERE mapped.nid IS NOT NULL
  ), '[]'::jsonb);

  INSERT INTO public.custom_packs (id, created_at, user_id, name, description, items)
  VALUES (v_new_pack, now(), v_user, v_name || ' (Copy)', v_description, v_new_items);

  RETURN v_new_pack;
END;
$$;
