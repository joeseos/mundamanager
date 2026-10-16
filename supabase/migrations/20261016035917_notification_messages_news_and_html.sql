-- Notification messages, Munda Manager news, and HTML storage.
--
-- Replaces the unapplied splits of this change with one migration:
--   * keep a notification when its sender is deleted
--   * allow user_message, campaign_message, mm_staff_message, and mm_news
--   * queue email for the two official types only
--   * let only admins insert the two official types
--   * block authenticated inserts of user_message and campaign_message until a
--     composer checks the recipient (friendship or campaign role)
--   * record whether text is TipTap HTML
--
-- DEPLOY ORDER: apply BEFORE any application code that inserts the new types
-- or selects is_html. ADD CONSTRAINT validates existing rows. DROP and ADD of
-- the type check are one statement so a validation failure keeps the old check.

-- sender_id is nullable. ON DELETE CASCADE used to remove every notification
-- that user had sent, including admin broadcasts.
ALTER TABLE public.notifications
    DROP CONSTRAINT notifications_sender_id_fkey;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

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

-- Also defined in supabase/functions/enqueue_notification_email.sql (deployed on merge).
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

-- Authenticated users cannot insert the four new types, except admins may
-- insert mm_staff_message and mm_news (fixed official subjects, sent from the
-- app's own address). user_message and campaign_message stay closed until a
-- composer can check friendship or campaign role; the row has no campaign id.
-- Service-role inserts and SECURITY DEFINER triggers bypass RLS.
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

CREATE POLICY "Users can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid() AS uid)
    AND (
      (type)::text <> ALL (ARRAY[
        'user_message',
        'campaign_message',
        'mm_staff_message',
        'mm_news'
      ]::text[])
      OR (
        (type)::text = ANY (ARRAY['mm_staff_message', 'mm_news']::text[])
        AND (SELECT private.is_admin() AS is_admin)
      )
    )
  );

-- Existing rows are backfilled once when the text opens with a TipTap block
-- tag. A bare "<" (for example "<3") is left as plain text.
-- New writers set the column themselves.
ALTER TABLE public.notifications
  ADD COLUMN is_html boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notifications.is_html IS
  'True when text is sanitized TipTap HTML. False is plain text, with optional **bold**.';

UPDATE public.notifications
SET is_html = true
WHERE ltrim(text) ~* '^<(p|h[1-3]|ul|ol|blockquote)(\s|>)';
