CREATE OR REPLACE FUNCTION create_campaign(
    p_campaign_type_id UUID,
    p_campaign_name TEXT,
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    campaign_name TEXT,
    campaign_type TEXT,
    campaign_type_id UUID,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH new_campaign AS (
        INSERT INTO campaigns (
            campaign_type_id,
            campaign_name
        )
        VALUES (
            p_campaign_type_id,
            p_campaign_name
        )
        RETURNING *
    ),
    add_member AS (
        INSERT INTO campaign_members (
            campaign_id,
            user_id,
            role,
            invited_by
        )
        SELECT 
            new_campaign.id,
            p_user_id,
            'OWNER',
            p_user_id
        FROM new_campaign
    )
    SELECT 
        nc.id,
        nc.campaign_name,
        ct.campaign_type_name as campaign_type,
        nc.campaign_type_id,
        nc.created_at
    FROM new_campaign nc
    LEFT JOIN campaign_types ct ON ct.id = nc.campaign_type_id;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_campaign(UUID, TEXT, UUID) TO authenticated;