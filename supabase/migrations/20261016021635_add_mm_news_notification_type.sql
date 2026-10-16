-- Allow the mm_news notification type, used for Munda Manager news,
-- general announcements, and feature announcements (email-eligible, see
-- utils/notifications.ts).
--
-- DEPLOY ORDER: apply BEFORE any application code that inserts
-- type = 'mm_news' ships, or those inserts violate the CHECK.
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
        'mm_staff_message',
        'mm_news'
    ]::text[]));

-- Also defined in supabase/functions/enqueue_notification_email.sql (deployed on merge);
-- repeated here so mm_news emails queue as soon as this migration runs.
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
      'mm_staff_message',
      'mm_news'
   ) THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;
