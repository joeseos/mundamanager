
BEGIN
    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', id,
                'category_name', category_name,
                'description', description
            )
            ORDER BY category_name
        )
        FROM stat_change_categories
    );
END;
