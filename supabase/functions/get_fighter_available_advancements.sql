
DECLARE
  v_result jsonb;
  v_fighter_xp integer;
BEGIN
  -- Get fighter's current XP
  SELECT xp INTO v_fighter_xp
  FROM fighters f
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;

  -- Build the final result as JSON
  WITH current_values AS (
    -- Get the current values for each characteristic
    SELECT
      fc.fighter_id,
      fc.characteristic_id,
      c.name as characteristic_name,
      fc.times_increased,
      c.xp_cost as base_xp_cost,
      c.credits_increase
    FROM fighter_characteristics fc
    JOIN characteristics c ON c.id = fc.characteristic_id
    WHERE fc.fighter_id = get_fighter_available_advancements.fighter_id
  ),
  fighter_type_info AS (
    -- Get fighter type information for base values
    SELECT
      ft.*
    FROM fighters f
    JOIN fighter_types ft ON ft.id = f.fighter_type_id
    WHERE f.id = get_fighter_available_advancements.fighter_id
  ),
  available_advancements AS (
    -- Get all possible characteristic improvements and determine availability
    SELECT
      c.id,
      c.name as characteristic_name,
      c.code as characteristic_code,
      c.xp_cost as base_xp_cost,
      -- Updated XP cost calculation: base_xp_cost + (2 * times_increased)
      CASE
        WHEN COALESCE(cv.times_increased, 0) = 0 THEN c.xp_cost
        ELSE c.xp_cost + (2 * COALESCE(cv.times_increased, 0))
      END as xp_cost,
      c.credits_increase,
      COALESCE(cv.times_increased, 0) as times_increased,
      true as is_available,
      CASE
        WHEN COALESCE(cv.times_increased, 0) = 0 THEN v_fighter_xp >= c.xp_cost
        ELSE v_fighter_xp >= (c.xp_cost + (2 * COALESCE(cv.times_increased, 0)))
      END as has_enough_xp
    FROM characteristics c
    CROSS JOIN fighter_type_info fti
    LEFT JOIN current_values cv ON cv.characteristic_id = c.id
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
        'can_purchase', is_available AND has_enough_xp
      ) as advancement_info
    FROM available_advancements
  )
  SELECT jsonb_build_object(
    'fighter_id', get_fighter_available_advancements.fighter_id,
    'current_xp', v_fighter_xp,
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
