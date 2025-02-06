
DECLARE
  deleted_gang_id UUID;
  deleted_fighters_count INTEGER;
  deleted_fighter_weapons_count INTEGER;
BEGIN
  -- Delete fighter_weapons entries
  WITH deleted_weapons AS (
    DELETE FROM fighter_weapons fw
    USING fighters f
    WHERE f.id = fw.fighter_id AND f.gang_id = input_gang_id
    RETURNING fw.id
  )
  SELECT COUNT(*) INTO deleted_fighter_weapons_count FROM deleted_weapons;

  -- Delete fighters
  WITH deleted_fighters AS (
    DELETE FROM fighters
    WHERE gang_id = input_gang_id
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_fighters_count FROM deleted_fighters;

  -- Delete the gang
  DELETE FROM gangs
  WHERE id = input_gang_id
  RETURNING id INTO deleted_gang_id;

  -- Check if gang was actually deleted
  IF deleted_gang_id IS NULL THEN
    RAISE EXCEPTION 'Gang not found';
  END IF;

  -- Return a JSON object with the results
  RETURN jsonb_build_object(
    'success', true,
    'deleted_gang_id', deleted_gang_id,
    'deleted_fighters_count', deleted_fighters_count,
    'deleted_fighter_weapons_count', deleted_fighter_weapons_count
  );
EXCEPTION WHEN OTHERS THEN
  -- If there's any error, return it as a JSON object
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
