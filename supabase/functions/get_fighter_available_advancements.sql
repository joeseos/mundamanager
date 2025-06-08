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
  v_fighter_type text;
  v_fighter_class text;
  v_uses_flat_cost boolean; -- Flag for fighters that use flat costs (Ganger or Crew)
BEGIN
  -- Get fighter's current XP, fighter type, and fighter class
  SELECT f.xp, ft.fighter_type, ft.fighter_class 
  INTO v_fighter_xp, v_fighter_type, v_fighter_class
  FROM fighters f
  JOIN fighter_types ft ON ft.id = f.fighter_type_id
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;
  
  -- Determine if the fighter uses flat costs based on fighter_class
  -- Gangers, Exotic Beasts, and Brutes use flat costs
  v_uses_flat_cost := 
    v_fighter_class IN ('Ganger', 'Exotic Beast', 'Brute');
  
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
  fighter_type_info AS (
    -- Get fighter type information
    SELECT 
      ft.*
    FROM fighters f
    JOIN fighter_types ft ON ft.id = f.fighter_type_id
    WHERE f.id = get_fighter_available_advancements.fighter_id
  ),
  available_advancements AS (
    -- Get all possible characteristic improvements and determine availability
    SELECT 
      etc.fighter_effect_type_id as id,
      etc.effect_name as characteristic_name,
      LOWER(REPLACE(etc.effect_name, ' ', '_')) as characteristic_code,
      etc.base_xp_cost,
      -- Calculate XP cost based on fighter class and characteristic
      CASE
        -- For Gangers: fixed 6 XP cost
        WHEN v_uses_flat_cost THEN 6
        -- For other fighters: base cost + (2 * times increased)
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN etc.base_xp_cost
        ELSE etc.base_xp_cost + (2 * ac.times_increased)
      END as xp_cost,
      -- Calculate credits increase based on fighter class and characteristic
      CASE
        -- For Gangers: credits based on advancement table
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
        -- For other fighters: use the base credits increase
        ELSE etc.base_credits_increase
      END as credits_increase,
      COALESCE(ac.times_increased, 0) as times_increased,
      true as is_available,
      -- Check if fighter has enough XP based on the calculated cost
      CASE
        WHEN v_uses_flat_cost THEN v_fighter_xp >= 6
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN v_fighter_xp >= etc.base_xp_cost
        ELSE v_fighter_xp >= (etc.base_xp_cost + (2 * ac.times_increased))
      END as has_enough_xp
    FROM effect_type_costs etc
    CROSS JOIN fighter_type_info fti
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
    'fighter_type', v_fighter_type,
    'fighter_class', v_fighter_class,
    'uses_flat_cost', v_uses_flat_cost,
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