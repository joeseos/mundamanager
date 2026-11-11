-- Onboarding welcome (T+30m after first confirmed session) and month-1
-- inactive nudge. Stamps live on profiles so they survive notification expiry.
-- Canonical RPC copies: supabase/functions/stamp_first_confirmed_session.sql,
-- enqueue_onboarding_notifications.sql, enqueue_notification_email.sql,
-- claim_email_deliveries.sql. Auth trigger bind is also in
-- supabase/bootstrap/auth_trigger.sql.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_confirmed_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactive_nudge_notified_at timestamptz;

COMMENT ON COLUMN public.profiles.first_confirmed_session_at IS
  'First auth session after email confirm. Null for users who signed up before this column existed.';
COMMENT ON COLUMN public.profiles.welcome_notified_at IS
  'When the automated welcome notification was inserted. Survives notification expiry.';
COMMENT ON COLUMN public.profiles.inactive_nudge_notified_at IS
  'When the month-1 early-bounce nudge was inserted. Survives notification expiry.';

CREATE INDEX IF NOT EXISTS profiles_first_confirmed_session_at_idx
  ON public.profiles (first_confirmed_session_at)
  WHERE first_confirmed_session_at IS NOT NULL;

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
    'mm_announcement',
    'forum_reply',
    'forum_mention',
    'forum_article',
    'welcome',
    'inactive_nudge'
  ]::text[]));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_welcome_per_user
  ON public.notifications (receiver_id)
  WHERE type = 'welcome';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_inactive_nudge_per_user
  ON public.notifications (receiver_id)
  WHERE type = 'inactive_nudge';

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
        'mm_announcement',
        'welcome',
        'inactive_nudge'
      ]::text[])
      OR (
        (type)::text = ANY (ARRAY['mm_staff_message', 'mm_announcement']::text[])
        AND (SELECT private.is_admin() AS is_admin)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.stamp_first_confirmed_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.profiles
    SET first_confirmed_session_at = NEW.last_sign_in_at
    WHERE id = NEW.id
      AND first_confirmed_session_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_first_confirmed_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_first_confirmed_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_first_confirmed_session() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_first_confirmed_session() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_first_confirmed_session ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_first_confirmed_session_insert ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_first_confirmed_session_update ON auth.users;

CREATE TRIGGER on_auth_user_first_confirmed_session_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.stamp_first_confirmed_session();

CREATE TRIGGER on_auth_user_first_confirmed_session_update
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (
    NEW.email_confirmed_at IS NOT NULL
    AND NEW.last_sign_in_at IS NOT NULL
    AND (OLD.email_confirmed_at IS NULL OR OLD.last_sign_in_at IS NULL)
  )
  EXECUTE FUNCTION public.stamp_first_confirmed_session();

CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   IF NEW.type IN ('campaign_invite', 'gang_invite', 'friend_request', 'campaign_join_request', 'campaign_challenge', 'campaign_message', 'mm_staff_message', 'mm_announcement', 'welcome', 'inactive_nudge') THEN
      INSERT INTO email_deliveries (notification_id, user_id)
      VALUES (NEW.id, NEW.receiver_id)
      ON CONFLICT (notification_id) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_deliveries(batch_size integer DEFAULT 25)
RETURNS SETOF public.email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   RETURN QUERY
   WITH due AS (
      SELECT id
      FROM email_deliveries
      WHERE (status = 'pending' AND next_attempt_at <= now())
         OR (status = 'failed' AND attempts < 5 AND next_attempt_at <= now())
         OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
   )
   UPDATE email_deliveries d
      SET status = 'processing',
          attempts = d.attempts + 1,
          locked_at = now(),
          updated_at = now()
     FROM due
    WHERE d.id = due.id
   RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_onboarding_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_welcome_count integer := 0;
  v_nudge_count integer := 0;
  v_batch integer;
  v_iter integer;
  v_max_batches constant integer := 20;
  v_welcome_html text :=
    '<p>Welcome to Munda Manager.</p>'
    || '<p>The <a href="/user-guide">User Guide</a> is the place for the fiddly bits — Venator skill access and gang legacy, Spyrer tier upgrades, Gene-Smithing, Chem-alchemy, Archaeo-Cyberteknika, and more.</p>'
    || '<p>If you need a hand, join <a href="https://discord.gg/ZWXXqd5NUt">Discord</a> and post in #feature-requests-and-support. Catalogue or rules mistakes go in #data-is-wrong; bugs in #stuff-is-broken.</p>';
  v_nudge_no_gang_html text :=
    '<p>You signed up a month ago and don''t have a gang yet.</p>'
    || '<p>The <a href="/user-guide">User Guide</a> walks through creating a gang and those house-specific setups (Venator skill access, Spyrer tiers, Gene-Smithing, and so on).</p>'
    || '<p>If something is in the way, join <a href="https://discord.gg/ZWXXqd5NUt">Discord</a> and tell us in #feature-requests-and-support.</p>';
  v_nudge_has_gang_html text :=
    '<p>You started a gang on Munda Manager a while ago, then things went quiet.</p>'
    || '<p>The <a href="/user-guide">User Guide</a> is there when you pick it up again — Venator skill access, Spyrer tiers, Gene-Smithing, Chem-alchemy, and the rest of the fiddly bits.</p>'
    || '<p>If you got stuck, join <a href="https://discord.gg/ZWXXqd5NUt">Discord</a> and post in #feature-requests-and-support. Catalogue mistakes go in #data-is-wrong; bugs in #stuff-is-broken.</p>';
BEGIN
  -- Keep in sync with MM_ONBOARDING_SENDER_ID in utils/notifications.ts.
  SELECT id
  INTO v_sender_id
  FROM public.profiles
  WHERE id = 'b09cb332-f4a9-4c9c-815f-2d8a36f265cb';

  FOR v_iter IN 1..v_max_batches LOOP
    WITH due AS (
      SELECT p.id
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.first_confirmed_session_at IS NOT NULL
        AND p.first_confirmed_session_at <= now() - interval '30 minutes'
        AND p.welcome_notified_at IS NULL
        AND u.email_confirmed_at IS NOT NULL
      ORDER BY p.first_confirmed_session_at
      FOR UPDATE OF p SKIP LOCKED
      LIMIT 100
    ),
    ins AS (
      INSERT INTO public.notifications (
        text, type, is_html, sender_id, receiver_id, dismissed, link
      )
      SELECT
        v_welcome_html,
        'welcome',
        true,
        v_sender_id,
        due.id,
        false,
        '/user-guide'
      FROM due
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.receiver_id = due.id
          AND n.type = 'welcome'
      )
      RETURNING receiver_id
    ),
    stamped AS (
      UPDATE public.profiles p
      SET welcome_notified_at = now()
      FROM due
      LEFT JOIN ins ON ins.receiver_id = due.id
      WHERE p.id = due.id
        AND p.welcome_notified_at IS NULL
      RETURNING p.id
    )
    SELECT count(*)::integer INTO v_batch FROM stamped;

    v_welcome_count := v_welcome_count + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  FOR v_iter IN 1..v_max_batches LOOP
    WITH due AS (
      SELECT
        p.id,
        EXISTS (
          SELECT 1 FROM public.gangs g WHERE g.user_id = p.id
        ) AS has_gang
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.welcome_notified_at IS NOT NULL
        AND p.inactive_nudge_notified_at IS NULL
        AND p.first_confirmed_session_at IS NOT NULL
        AND p.first_confirmed_session_at <= now() - interval '1 month'
        AND u.last_sign_in_at IS NOT NULL
        AND u.last_sign_in_at <= p.first_confirmed_session_at + interval '3 days'
        AND NOT EXISTS (
          SELECT 1
          FROM auth.sessions s
          WHERE s.user_id = u.id
            AND (s.refreshed_at AT TIME ZONE 'UTC')
              > p.first_confirmed_session_at + interval '3 days'
        )
      ORDER BY p.first_confirmed_session_at
      FOR UPDATE OF p SKIP LOCKED
      LIMIT 100
    ),
    ins AS (
      INSERT INTO public.notifications (
        text, type, is_html, sender_id, receiver_id, dismissed, link
      )
      SELECT
        CASE WHEN due.has_gang THEN v_nudge_has_gang_html ELSE v_nudge_no_gang_html END,
        'inactive_nudge',
        true,
        v_sender_id,
        due.id,
        false,
        CASE WHEN due.has_gang THEN '/user-guide' ELSE '/' END
      FROM due
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.receiver_id = due.id
          AND n.type = 'inactive_nudge'
      )
      RETURNING receiver_id
    ),
    stamped AS (
      UPDATE public.profiles p
      SET inactive_nudge_notified_at = now()
      FROM due
      LEFT JOIN ins ON ins.receiver_id = due.id
      WHERE p.id = due.id
        AND p.inactive_nudge_notified_at IS NULL
      RETURNING p.id
    )
    SELECT count(*)::integer INTO v_batch FROM stamped;

    v_nudge_count := v_nudge_count + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'welcome', v_welcome_count,
    'inactive_nudge', v_nudge_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_onboarding_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_onboarding_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_onboarding_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_onboarding_notifications() TO service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'enqueue-onboarding-notifications') then
    perform cron.unschedule('enqueue-onboarding-notifications');
  end if;
end $$;

select cron.schedule(
  'enqueue-onboarding-notifications',
  '*/5 * * * *',
  $job$
    select public.enqueue_onboarding_notifications();
  $job$
);

COMMIT;
