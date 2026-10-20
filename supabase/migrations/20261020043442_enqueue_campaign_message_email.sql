-- Campaign messages are sent by a route that checks the sender is the campaign
-- owner, an arbitrator, or an app admin, and that every recipient is a member.
-- user_message stays withheld until a composer checks the recipient.
-- CREATE OR REPLACE keeps the existing trigger and grants.

CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   IF NEW.type IN (
      'campaign_invite',
      'gang_invite',
      'friend_request',
      'campaign_join_request',
      'campaign_challenge',
      'campaign_message',
      'mm_staff_message',
      'mm_announcement'
   ) THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;
