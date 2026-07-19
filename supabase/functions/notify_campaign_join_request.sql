-- Trigger function to notify campaign OWNER/ARBITRATOR members when a user
-- requests to join their campaign (campaigns.allow_join_requests opt-in flow)
CREATE OR REPLACE FUNCTION notify_campaign_join_request()
RETURNS TRIGGER AS $$
DECLARE
   campaign_name_var TEXT;
   requester_name_var TEXT;
BEGIN
   -- Get the campaign name
   SELECT campaign_name INTO campaign_name_var
   FROM campaigns
   WHERE id = NEW.campaign_id;

   -- Get the requester's username
   SELECT username INTO requester_name_var
   FROM profiles
   WHERE id = NEW.user_id;

   -- One notification per OWNER/ARBITRATOR. DISTINCT because campaign_members
   -- can hold duplicate rows per user. sender_id carries the requester and the
   -- link carries the campaign, which is all the accept/decline UI needs.
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed
   )
   SELECT DISTINCT
       cm.user_id,
       NEW.user_id,
       'campaign_join_request',
       COALESCE(requester_name_var, 'Someone') || ' wants to join your campaign "' || COALESCE(campaign_name_var, 'Unknown Campaign') || '".',
       'https://www.mundamanager.com/campaigns/' || NEW.campaign_id,
       false
   FROM campaign_members cm
   WHERE cm.campaign_id = NEW.campaign_id
     AND cm.role IN ('OWNER', 'ARBITRATOR')
     AND cm.user_id <> NEW.user_id;

   RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on campaign_join_requests table
DROP TRIGGER IF EXISTS on_campaign_join_request ON campaign_join_requests;
CREATE TRIGGER on_campaign_join_request
    AFTER INSERT ON campaign_join_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_campaign_join_request();

REVOKE ALL ON FUNCTION public.notify_campaign_join_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_campaign_join_request() FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_campaign_join_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_campaign_join_request() TO service_role;
