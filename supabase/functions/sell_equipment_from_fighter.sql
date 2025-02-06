
DECLARE
  v_equipment_record record;
  v_result JSONB;
  v_sell_value INTEGER;
  v_gang_id UUID;
BEGIN
  -- Get all the necessary information using the fighter_equipment_id
  SELECT
    fe.id as fighter_equipment_id,
    fe.fighter_id,
    fe.vehicle_id,
    fe.equipment_id,
    fe.purchase_cost,
    CASE
      WHEN fe.fighter_id IS NOT NULL THEN f.gang_id
      WHEN fe.vehicle_id IS NOT NULL THEN v.gang_id
    END as gang_id
  INTO v_equipment_record
  FROM fighter_equipment fe
  LEFT JOIN fighters f ON f.id = fe.fighter_id
  LEFT JOIN vehicles v ON v.id = fe.vehicle_id
  WHERE fe.id = fighter_equipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter equipment with ID % not found', fighter_equipment_id;
  END IF;

  -- Determine sell value (manual or default to purchase cost)
  v_sell_value := COALESCE(manual_cost, v_equipment_record.purchase_cost);

  -- Start transaction
  BEGIN
    -- Delete the equipment from fighter's inventory
    DELETE FROM fighter_equipment
    WHERE id = fighter_equipment_id;

    -- Add credits to the gang using the determined sell value
    UPDATE gangs
    SET credits = credits + v_sell_value
    WHERE id = v_equipment_record.gang_id
    RETURNING jsonb_build_object(
      'id', id,
      'credits', credits
    ) INTO v_result;

    -- Return the result
    RETURN jsonb_build_object(
      'gang', v_result,
      'equipment_sold', jsonb_build_object(
        'id', v_equipment_record.fighter_equipment_id,
        'fighter_id', v_equipment_record.fighter_id,
        'vehicle_id', v_equipment_record.vehicle_id,
        'equipment_id', v_equipment_record.equipment_id,
        'sell_value', v_sell_value
      )
    );

    -- If anything fails, the transaction will be rolled back
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to sell equipment: %', SQLERRM;
  END;
END;
