
BEGIN
    RETURN QUERY
    SELECT
        f.id as fighter_id,
        f.fighter_name,
        sc.id as change_id,
        sc.credits_increase,
        CASE
            WHEN sc.credits_increase IS NULL THEN 'NULL'
            WHEN sc.credits_increase = '' THEN 'EMPTY'
            WHEN sc.credits_increase ~ '^[0-9]+$' THEN 'NUMERIC'
            ELSE 'OTHER'
        END as value_type
    FROM fighters f
    LEFT JOIN fighter_stat_changes sc ON f.id = sc.fighter_id
    WHERE f.gang_id = p_gang_id
    ORDER BY f.fighter_name, sc.applied_at DESC;
END;
