CREATE OR REPLACE FUNCTION notify_campaign_member_added()
RETURNS TRIGGER AS $$
DECLARE
   campaign_name_var TEXT;
BEGIN
   -- Get the campaign name
   SELECT campaign_name INTO campaign_name_var
   FROM campaigns 
   WHERE id = NEW.campaign_id;
   
   -- Insert notification for the newly added member
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed
   ) VALUES (
       NEW.user_id,
       NEW.invited_by,
       'invite',
       'You have been invited to the campaign "' || COALESCE(campaign_name_var, 'Unknown Campaign') || '". Click this notification to go to the campaign.',
       'https://www.mundamanager.com/campaigns/' || NEW.campaign_id,
       false
   );
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on campaign_members table
DROP TRIGGER IF EXISTS trigger_campaign_member_notification ON campaign_members;
CREATE TRIGGER trigger_campaign_member_notification
    AFTER INSERT ON campaign_members
    FOR EACH ROW
    EXECUTE FUNCTION notify_campaign_member_added();