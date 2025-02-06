
BEGIN
    -- Log the input for debugging
    RAISE NOTICE 'Getting campaigns for user: %', user_id;

    RETURN QUERY
    SELECT
        c.id,
        c.campaign_name,
        ct.campaign_type_name as campaign_type,
        c.campaign_type_id,
        c.created_at,
        cm.role,
        cm.status
    FROM campaigns c
    JOIN campaign_types ct ON ct.id = c.campaign_type_id
    JOIN campaign_members cm ON cm.campaign_id = c.id
    WHERE cm.user_id = get_user_campaigns.user_id;  -- Specify the function parameter explicitly

    -- Log if no results were found
    IF NOT FOUND THEN
        RAISE NOTICE 'No campaigns found for user: %', user_id;
    END IF;
END;
