CREATE OR REPLACE FUNCTION move_fighter_position(
    p_gang_id INTEGER,
    p_fighter_id INTEGER,
    p_current_index INTEGER,
    p_target_index INTEGER
) RETURNS VOID AS $$
BEGIN
    -- Just perform the swap with the provided indices
    UPDATE gangs
    SET positioning = (
        SELECT jsonb_agg(
            CASE 
                WHEN ordinality - 1 = p_current_index THEN 
                    positioning->p_target_index
                WHEN ordinality - 1 = p_target_index THEN 
                    positioning->p_current_index
                ELSE 
                    value
            END
        )
        FROM jsonb_array_elements(positioning) WITH ORDINALITY
    )
    WHERE id = p_gang_id;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT move_fighter_position(1, 123, 2, 3);  -- Move fighter from position 2 to 3