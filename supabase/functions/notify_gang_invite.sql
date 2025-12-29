-- Trigger function to notify gang owner when their gang is invited to a campaign (PENDING status)
CREATE OR REPLACE FUNCTION notify_gang_invite()
RETURNS TRIGGER AS $$
DECLARE
   gang_name_var TEXT;
   campaign_name_var TEXT;
   inviter_name_var TEXT;
BEGIN
   -- Only notify for PENDING status (not for ACCEPTED - user added their own gang)
   IF NEW.status != 'PENDING' THEN
      RETURN NEW;
   END IF;

   -- Get the gang name
   SELECT name INTO gang_name_var
   FROM gangs
   WHERE id = NEW.gang_id;

   -- Get the campaign name
   SELECT campaign_name INTO campaign_name_var
   FROM campaigns
   WHERE id = NEW.campaign_id;

   -- Get the inviter's username
   SELECT username INTO inviter_name_var
   FROM profiles
   WHERE id = NEW.invited_by;

   -- Insert notification for the gang owner
   -- Link includes gangId as query param so UI can parse it for accept/decline
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed
   ) VALUES (
       NEW.user_id,  -- The gang owner receives the notification
       NEW.invited_by,  -- The person who added the gang
       'gang_invite',
       COALESCE(inviter_name_var, 'Someone') || ' wants to add your gang "' || COALESCE(gang_name_var, 'Unknown Gang') || '" to the campaign "' || COALESCE(campaign_name_var, 'Unknown Campaign') || '".',
       'https://www.mundamanager.com/campaigns/' || NEW.campaign_id || '?gangId=' || NEW.gang_id,
       false
   );

   RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on campaign_gangs table
DROP TRIGGER IF EXISTS on_gang_invite ON campaign_gangs;
CREATE TRIGGER on_gang_invite
    AFTER INSERT ON campaign_gangs
    FOR EACH ROW
    EXECUTE FUNCTION notify_gang_invite();
