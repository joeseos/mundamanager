
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
