-- Notification messages, Munda Manager announcements, and HTML storage.
--
-- Replaces the unapplied splits of this change with one migration:
--   * keep a notification when its sender is deleted
--   * allow user_message, campaign_message, mm_staff_message, and mm_announcement
--   * queue email for the two official types only
--   * let only admins insert the two official types
--   * block authenticated inserts of user_message and campaign_message until a
--     composer checks the recipient (friendship or campaign role)
--   * record whether text is TipTap HTML
--
-- DEPLOY ORDER: apply BEFORE any application code that inserts the new types
-- or selects is_html. ADD CONSTRAINT validates existing rows. DROP and ADD of
-- the type check are one statement so a validation failure keeps the old check.

-- sender_id is nullable and points at profiles so the list can join the
-- username. Deleting a user deletes the profile (profiles.id references
-- auth.users ON DELETE CASCADE), which sets sender_id null here.
-- A sender with no profile row cannot satisfy the new FK, so clear it first.
UPDATE public.notifications AS n
SET sender_id = NULL
WHERE n.sender_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = n.sender_id
  );

ALTER TABLE public.notifications
    DROP CONSTRAINT notifications_sender_id_fkey;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES public.profiles(id)
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
        'mm_announcement'
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
      'mm_announcement'
   ) THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;

-- The insert policy below checks is_html, so the column has to exist first.
-- Existing admin broadcasts, including ones sent before a sender was stored,
-- are marked HTML when they open with a TipTap block tag. User-written rows
-- stay plain text. A bare "<" (for example "<3") is left as plain text.
-- New writers set the column themselves.
ALTER TABLE public.notifications
  ADD COLUMN is_html boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notifications.is_html IS
  'True when text is sanitized TipTap HTML. False is plain text, with optional **bold**.';

-- Authenticated users cannot insert the four new types, except admins may
-- insert mm_staff_message and mm_announcement (fixed official subjects, sent from the
-- app's own address). user_message and campaign_message stay closed until a
-- composer can check friendship or campaign role; the row has no campaign id.
-- Service-role inserts (the admin composer sets is_html) and SECURITY DEFINER
-- triggers bypass RLS. A signed-in user cannot store HTML: an info row with
-- headings and a link would render with no "From" line.
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

CREATE POLICY "Users can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid() AS uid)
    AND is_html = false
    AND (
      (type)::text <> ALL (ARRAY[
        'user_message',
        'campaign_message',
        'mm_staff_message',
        'mm_announcement'
      ]::text[])
      OR (
        (type)::text = ANY (ARRAY['mm_staff_message', 'mm_announcement']::text[])
        AND (SELECT private.is_admin() AS is_admin)
      )
    )
  );

UPDATE public.notifications
SET is_html = true
WHERE ltrim(text) ~* '^<(p|h[1-3]|ul|ol|blockquote)(\s|>)'
  AND (
    sender_id IS NULL
    OR sender_id IN (
      SELECT id FROM public.profiles WHERE user_role = 'admin'
    )
  );
