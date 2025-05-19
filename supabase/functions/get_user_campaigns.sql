DROP FUNCTION IF EXISTS get_user_campaigns(UUID);

CREATE OR REPLACE FUNCTION get_user_campaigns(user_id UUID)
RETURNS TABLE (
    id UUID,
    campaign_member_id UUID,
    campaign_name TEXT,
    campaign_type TEXT,
    campaign_type_id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    role TEXT,
    status TEXT
) AS $$
BEGIN
    -- Log the input for debugging
    RAISE NOTICE 'Getting campaigns for user: %', user_id;

    RETURN QUERY
    SELECT DISTINCT ON (c.id)
        c.id,
        cm.id as campaign_member_id,
        c.campaign_name,
        ct.campaign_type_name as campaign_type,
        c.campaign_type_id,
        c.created_at,
        cm.role,
        cm.status
    FROM campaigns c
    JOIN campaign_types ct ON ct.id = c.campaign_type_id
    JOIN campaign_members cm ON cm.campaign_id = c.id
    WHERE cm.user_id = get_user_campaigns.user_id
    ORDER BY c.id, cm.created_at DESC;  -- Order by creation date to get the most recent entry

    -- Log if no results were found
    IF NOT FOUND THEN
        RAISE NOTICE 'No campaigns found for user: %', user_id;
    END IF;
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION public.get_user_campaigns(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_campaigns(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_campaigns(UUID) TO service_role;
