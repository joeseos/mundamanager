
DECLARE
  op JSONB;
  result TEXT := '';
  param_key TEXT;
  param_value TEXT;
  where_clause TEXT;
  fighter_credits INTEGER;
  fighter_gang_id UUID;
  rows_affected INTEGER;
BEGIN
  -- Start a transaction
  BEGIN
    -- First, get the fighter's credits and gang_id
    SELECT
      credits,
      gang_id
    INTO fighter_credits, fighter_gang_id
    FROM fighters
    WHERE id = fighter_id;

    IF fighter_credits IS NULL OR fighter_gang_id IS NULL THEN
      RAISE EXCEPTION 'Fighter not found or missing required data';
    END IF;

    -- Execute each operation in the JSONB array
    FOR op IN SELECT * FROM jsonb_array_elements(operations)
    LOOP
      where_clause := '';
      FOR param_key, param_value IN SELECT * FROM jsonb_each_text(op->'params')
      LOOP
        -- Remove 'eq.' prefix if it exists
        IF param_value LIKE 'eq.%' THEN
          param_value := substring(param_value FROM 4);
        END IF;

        -- Build WHERE clause
        IF where_clause <> '' THEN
          where_clause := where_clause || ' AND ';
        END IF;
        where_clause := where_clause || format('%I = %L', param_key, param_value);
      END LOOP;

      BEGIN
        EXECUTE format('DELETE FROM %I WHERE %s',
          (op->>'path')::regclass,
          where_clause
        );
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        result := result || 'Deleted ' || rows_affected || ' row(s) from ' || (op->>'path') || '. ';
      EXCEPTION WHEN OTHERS THEN
        result := result || 'Error deleting from ' || (op->>'path') || ': ' || SQLERRM || '. ';
        RAISE;
      END;
    END LOOP;

    -- Update the gang's rating
    UPDATE gangs
    SET rating = GREATEST(0, rating - fighter_credits)
    WHERE id = fighter_gang_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    IF rows_affected = 0 THEN
      result := result || 'Warning: No gang was updated. ';
    ELSE
      result := result || format('Updated gang rating (reduced by %s credits). ', fighter_credits);
    END IF;

    RETURN 'Success: ' || result;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'Transaction failed: ' || result || SQLERRM;
  END;
END;
