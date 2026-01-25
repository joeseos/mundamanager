CREATE OR REPLACE FUNCTION notify_friend_request_sent()
RETURNS TRIGGER AS $$
DECLARE
   requester_username_var TEXT;
BEGIN
   -- Get the requester's username
   SELECT username INTO requester_username_var
   FROM profiles 
   WHERE id = NEW.requester_id;
   
   -- Insert notification for the addressee (person receiving the friend request)
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed,
       expires_at
   ) VALUES (
       NEW.addressee_id,
       NEW.requester_id,
       'friend_request',
       COALESCE(requester_username_var, 'Someone') || ' sent you a friend request.',
       NULL,
       false,
       NOW() + INTERVAL '30 days'
   );
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on friends table
DROP TRIGGER IF EXISTS trigger_friend_request_notification ON friends;
CREATE TRIGGER trigger_friend_request_notification
    AFTER INSERT ON friends
    FOR EACH ROW
    EXECUTE FUNCTION notify_friend_request_sent();
