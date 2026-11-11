-- Insert due welcome and inactive_nudge notifications, then stamp the profile
-- so a later run cannot send again. Invoked by pg_cron every 5 minutes.
--
-- Welcome: 30 minutes after first_confirmed_session_at, whether or not they
-- have a gang. Inactive nudge: one month after first session, only if they
-- already got the welcome, and last app activity (sign-in or session refresh)
-- is still within 3 days of that first session. No upper age cap — a lagged
-- cron still picks them up; the profile stamp is the one-shot.
--
-- Existing users are never stamped, so they never match. The MundaManager
-- brand profile is the sender when it exists; otherwise sender_id is null.
-- Sender UUID must stay in sync with MM_ONBOARDING_SENDER_ID in
-- utils/notifications.ts. SQL is the source of truth at send time.
--
-- service_role / cron only. Authenticated clients cannot insert these types
-- (see the notifications INSERT policy).
--
-- Keep the HTML in step with the copy in the onboarding_notifications plan.
-- Visible text must stay under 1000 characters (NOTIFICATION_BROADCAST_MAX_LENGTH).

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
