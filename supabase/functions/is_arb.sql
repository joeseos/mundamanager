CREATE OR REPLACE FUNCTION private.is_arb(campaign_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM campaign_members cm
    WHERE cm.campaign_id = campaign_id_param
    AND cm.user_id = auth.uid()
    AND cm.role IN ('OWNER', 'ARBITRATOR')
  );
$$;