-- Onboarding welcome (T+30m after confirm + first sign-in) and month-1 inactive
-- nudge, sent as mm_staff_message. Stamps live on profiles so they survive
-- notification expiry. Canonical copy: supabase/functions/enqueue_onboarding_notifications.sql.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactive_nudge_notified_at timestamptz;

COMMENT ON COLUMN public.profiles.welcome_notified_at IS
  'When the automated welcome notification was inserted. Survives notification expiry.';
COMMENT ON COLUMN public.profiles.inactive_nudge_notified_at IS
  'When the month-1 early-bounce nudge was inserted. Survives notification expiry.';

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
  -- Users created before this never match. Set to the UTC day this ships.
  v_launch_at constant timestamptz := timestamptz '2026-11-12 00:00:00+00';
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
  SELECT id
  INTO v_sender_id
  FROM public.profiles
  WHERE id = 'b09cb332-f4a9-4c9c-815f-2d8a36f265cb';

  WITH due AS (
    SELECT p.id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.welcome_notified_at IS NULL
      AND u.created_at >= v_launch_at
      AND u.email_confirmed_at IS NOT NULL
      AND u.last_sign_in_at IS NOT NULL
      AND GREATEST(u.email_confirmed_at, u.last_sign_in_at) <= now() - interval '30 minutes'
    FOR UPDATE OF p SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.notifications (
      text, type, is_html, sender_id, receiver_id, dismissed, link
    )
    SELECT
      v_welcome_html,
      'mm_staff_message',
      true,
      v_sender_id,
      due.id,
      false,
      '/user-guide'
    FROM due
    RETURNING receiver_id
  )
  UPDATE public.profiles p
  SET welcome_notified_at = now()
  FROM ins
  WHERE p.id = ins.receiver_id;

  GET DIAGNOSTICS v_welcome_count = ROW_COUNT;

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
      AND p.welcome_notified_at <= now() - interval '1 month'
      AND u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at <= p.welcome_notified_at + interval '3 days'
      AND NOT EXISTS (
        SELECT 1
        FROM auth.sessions s
        WHERE s.user_id = u.id
          AND (s.refreshed_at AT TIME ZONE 'UTC')
            > p.welcome_notified_at + interval '3 days'
      )
    FOR UPDATE OF p SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.notifications (
      text, type, is_html, sender_id, receiver_id, dismissed, link
    )
    SELECT
      CASE WHEN due.has_gang THEN v_nudge_has_gang_html ELSE v_nudge_no_gang_html END,
      'mm_staff_message',
      true,
      v_sender_id,
      due.id,
      false,
      CASE WHEN due.has_gang THEN '/user-guide' ELSE '/' END
    FROM due
    RETURNING receiver_id
  )
  UPDATE public.profiles p
  SET inactive_nudge_notified_at = now()
  FROM ins
  WHERE p.id = ins.receiver_id;

  GET DIAGNOSTICS v_nudge_count = ROW_COUNT;

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
