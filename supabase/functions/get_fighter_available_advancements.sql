CREATE OR REPLACE FUNCTION public.get_fighter_available_advancements(
  fighter_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_fighter_xp integer;
  v_advancements_category_id UUID;
  v_fighter_subtypes jsonb;
  v_uses_flat_cost boolean; -- Flag for fighters that use flat costs (Ganger and Exotic Beast)
  v_edition_id UUID;
  v_cumulative_xp boolean; -- Edition earns Advancements by rank instead of buying them
BEGIN
  -- Get fighter's current XP, subtypes, and the edition of the gang it belongs
  -- to. The edition is resolved from the gang the same way add_fighter_injury
  -- does it: Advancement rows are edition-scoped, and without this an N23
  -- fighter would be offered N26 Advancements and vice versa.
  SELECT f.xp, f.fighter_subtypes, COALESCE(gt.edition_id, cgt.edition_id)
  INTO v_fighter_xp, v_fighter_subtypes, v_edition_id
  FROM fighters f
  JOIN gangs g ON g.id = f.gang_id
  LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
  LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;

  -- SQL cannot read the capability registry in types/edition.ts, so the slug is
  -- resolved to an id once here rather than compared per row. Mirrors the
  -- cumulativeXp capability: N26 earns Advancements by crossing a rank
  -- threshold and spends no XP on them.
  v_cumulative_xp := v_edition_id IS NOT NULL
    AND v_edition_id = (SELECT id FROM editions WHERE slug = 'n26');

  -- Determine if the fighter uses flat costs based on their subtypes.
  -- Only Gangers and Exotic Beasts use flat costs, and only where XP is spent:
  -- an edition that earns Advancements by rank has no cost to make flat.
  v_uses_flat_cost := NOT v_cumulative_xp
    AND v_fighter_subtypes ?| array['Ganger', 'Exotic Beast'];

  -- Get the advancements category ID
  SELECT id INTO v_advancements_category_id
  FROM fighter_effect_categories
  WHERE category_name = 'advancements';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advancements category not found';
  END IF;

  -- Build the final result as JSON
  WITH effect_type_costs AS (
    -- Get base costs from fighter_effect_types table
    SELECT 
      fet.id AS fighter_effect_type_id,
      fet.effect_name,
      COALESCE((fet.type_specific_data->>'xp_cost')::integer, 5) AS base_xp_cost,
      COALESCE((fet.type_specific_data->>'credits_increase')::integer, 10) AS base_credits_increase
    FROM fighter_effect_types fet
    WHERE fet.fighter_effect_category_id = v_advancements_category_id
      -- Edition-scoped: effect_name repeats across editions, so an unfiltered
      -- read would hand N26 rows to N23 fighters once the N26 catalog is seeded.
      AND fet.edition_id IS NOT DISTINCT FROM v_edition_id
  ),
  advancement_counts AS (
    -- Count how many times each fighter has advanced each characteristic
    SELECT 
      fe.fighter_effect_type_id,
      COUNT(*) as times_increased
    FROM fighter_effects fe
    JOIN fighter_effect_types fet ON fet.id = fe.fighter_effect_type_id
    WHERE fe.fighter_id = get_fighter_available_advancements.fighter_id
    AND fet.fighter_effect_category_id = v_advancements_category_id
    GROUP BY fe.fighter_effect_type_id
  ),
  available_advancements AS (
    -- Get all possible characteristic improvements and determine availability
    SELECT 
      etc.fighter_effect_type_id as id,
      etc.effect_name as characteristic_name,
      LOWER(REPLACE(etc.effect_name, ' ', '_')) as characteristic_code,
      etc.base_xp_cost,
      -- Calculate XP cost based on fighter subtype and characteristic
      CASE
        -- Advancements are earned by rank, not bought: there is nothing to pay
        WHEN v_cumulative_xp THEN 0
        -- For Gangers and Exotic Beasts: fixed 6 XP cost
        WHEN v_uses_flat_cost THEN 6
        -- For Juves and Prospects: base cost only (no escalating penalty)
        WHEN v_fighter_subtypes ?| array['Juve', 'Prospect'] THEN etc.base_xp_cost
        -- For other fighters: base cost + (2 * times increased)
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN etc.base_xp_cost
        ELSE etc.base_xp_cost + (2 * ac.times_increased)
      END as xp_cost,
      -- Calculate credits increase based on fighter subtype and characteristic
      CASE
        -- Flat per characteristic, straight off the edition's own catalog rows
        WHEN v_cumulative_xp THEN etc.base_credits_increase
        -- For Gangers and Exotic Beasts: credits based on advancement table
        WHEN v_uses_flat_cost THEN
          CASE
            -- Weapon Skill or Ballistic Skill
            WHEN etc.effect_name ILIKE '%weapon skill%' OR etc.effect_name ILIKE '%ballistic skill%' THEN 20
            -- Strength or Toughness
            WHEN etc.effect_name ILIKE '%strength%' OR etc.effect_name ILIKE '%toughness%' THEN 30
            -- Movement, Initiative, Leadership, or Cool
            WHEN etc.effect_name ILIKE '%movement%' OR etc.effect_name ILIKE '%initiative%' OR
                 etc.effect_name ILIKE '%leadership%' OR etc.effect_name ILIKE '%cool%' THEN 10
            -- Willpower or Intelligence
            WHEN etc.effect_name ILIKE '%willpower%' OR etc.effect_name ILIKE '%intelligence%' THEN 5
            -- Default for other characteristics
            ELSE 10
          END
        -- For all other fighters (including Juves and Prospects): use the base credits increase
        ELSE etc.base_credits_increase
      END as credits_increase,
      COALESCE(ac.times_increased, 0) as times_increased,
      true as is_available,
      -- Check if fighter has enough XP based on the calculated cost
      CASE
        -- Nothing is spent, so affordability never blocks. Whether an
        -- Advancement is actually owed is a rank question the caller answers.
        WHEN v_cumulative_xp THEN true
        WHEN v_uses_flat_cost THEN v_fighter_xp >= 6
        WHEN v_fighter_subtypes ?| array['Juve', 'Prospect'] THEN v_fighter_xp >= etc.base_xp_cost
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN v_fighter_xp >= etc.base_xp_cost
        ELSE v_fighter_xp >= (etc.base_xp_cost + (2 * ac.times_increased))
      END as has_enough_xp
    FROM effect_type_costs etc
    LEFT JOIN advancement_counts ac ON ac.fighter_effect_type_id = etc.fighter_effect_type_id
  ),
  categorized_advancements AS (
    SELECT
      characteristic_name,
      jsonb_build_object(
        'id', id,
        'characteristic_code', characteristic_code,
        'times_increased', times_increased,
        'base_xp_cost', base_xp_cost,
        'xp_cost', xp_cost,
        'credits_increase', credits_increase,
        'is_available', is_available,
        'has_enough_xp', has_enough_xp,
        'can_purchase', is_available AND has_enough_xp,
        'uses_flat_cost', v_uses_flat_cost -- Add flag to indicate flat costs are applied
      ) as advancement_info
    FROM available_advancements
  )
  SELECT jsonb_build_object(
    'fighter_id', get_fighter_available_advancements.fighter_id,
    'current_xp', v_fighter_xp,
    'fighter_subtypes', v_fighter_subtypes,
    'uses_flat_cost', v_uses_flat_cost,
    -- Ganger/Exotic Beast: Specialist table row (random Primary skill) — same flat costs as other ganger advances.
    -- v_uses_flat_cost is already false for rank-based editions, which promote Specialists by their own rules.
    'ganger_to_specialist_advancement', CASE WHEN v_uses_flat_cost THEN jsonb_build_object(
      'xp_cost', 6,
      'credits_increase', 20
    ) ELSE NULL END,
    'characteristics', COALESCE(
      (SELECT jsonb_object_agg(
        characteristic_name,
        advancement_info
      )
      FROM categorized_advancements),
      '{}'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fighter_available_advancements(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) TO service_role;