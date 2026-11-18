-- Allow the campaign_trade notification type, sent to a gang's owner when
-- another gang proposes, bids on, accepts, declines, or cancels a campaign
-- trade (email-eligible, see utils/notifications.ts).
--
-- DEPLOY ORDER: apply BEFORE the application code that inserts
-- type = 'campaign_trade' ships, or those inserts violate the CHECK.

BEGIN;

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
        'info',
        'warning',
        'error',
        'campaign_invite',
        'friend_request',
        'battle_invite',
        'gang_invite',
        'campaign_join_request',
        'campaign_challenge',
        'user_message',
        'campaign_message',
        'mm_staff_message',
        'mm_announcement',
        'forum_reply',
        'forum_mention',
        'forum_article',
        'campaign_trade'
    ]::text[]));

-- Also defined in supabase/functions/enqueue_notification_email.sql (deployed on merge);
-- repeated here so campaign_trade emails queue as soon as this migration runs.
-- CREATE OR REPLACE keeps the existing trigger and grants.
CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   IF NEW.type IN ('campaign_invite', 'gang_invite', 'friend_request', 'campaign_join_request', 'campaign_challenge', 'campaign_message', 'mm_staff_message', 'mm_announcement', 'campaign_trade') THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;

COMMIT;
