-- Allow message notification types:
--   user_message     — a user sends a message to another user
--   campaign_message — a campaign arbitrator sends a message to one or more
--                      people in their campaign
--   mm_staff_message    — Munda Manager staff send a message to users
--
-- All three are email-eligible (see utils/notifications.ts).
--
-- DEPLOY ORDER: apply BEFORE any application code that inserts these types
-- ships, or those inserts violate the CHECK.
--
-- ADD CONSTRAINT validates existing rows. DROP and ADD are one statement so a
-- validation failure keeps the old constraint.

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check,
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
        'mm_staff_message'
    ]::text[]));

-- Also defined in supabase/functions/enqueue_notification_email.sql (deployed on merge);
-- repeated here so these message types queue email as soon as this migration runs.
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
      'user_message',
      'campaign_message',
      'mm_staff_message'
   ) THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;
