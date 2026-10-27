-- Insert one notification send and every recipient row in a single transaction.
--
-- The Sent lists read notification_sends. Recipient rows in notifications can expire
-- or be deleted without changing that history. Campaign messages email every current
-- campaign member (not only members with an accepted gang) and are capped at 5 sends
-- per campaign per UTC day, and at 10 campaign messages per sender per UTC day.
--
-- Admin all-user sends may pass p_logged_in_since. Those recipients are profiles
-- who logged in at or after that instant, either via auth.users.last_sign_in_at
-- or a session refresh. auth.sessions.refreshed_at is a UTC timestamp without a
-- time zone. A null value keeps every profile. A cutoff on a campaign message or
-- a hand-picked list is rejected.
--
-- service_role only. The Next.js routes check the caller is an admin, or a campaign
-- owner, arbitrator, or app admin, before calling this.
--
-- Apply supabase/migrations/20261021234309_notification_sends.sql before this file
-- is deployed: the function inserts into notification_sends. The replacement
-- signature is also in supabase/migrations/20261023153535_notification_send_logged_in_since.sql.

DROP FUNCTION IF EXISTS public.create_notification_send(uuid, text, uuid, text, integer, text, uuid[]);

CREATE OR REPLACE FUNCTION public.create_notification_send(
  p_sender_id uuid,
  p_type text,
  p_campaign_id uuid,
  p_text text,
  p_expires_in_days integer,
  p_audience text,
  p_receiver_ids uuid[],
  p_logged_in_since timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_ids uuid[];
  v_sample uuid[];
  v_expires_at timestamptz;
  v_send_id uuid;
  v_link text;
  v_today_start timestamptz;
BEGIN
  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 365 THEN
    RAISE EXCEPTION 'expires_in_days must be between 1 and 365';
  END IF;

  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RAISE EXCEPTION 'message text is required';
  END IF;

  -- Same visible-text cap as NOTIFICATION_BROADCAST_MAX_LENGTH in utils/notifications.ts.
  IF char_length(regexp_replace(p_text, '<[^>]*>', '', 'g')) > 1000 THEN
    RAISE EXCEPTION 'message must be at most 1000 characters';
  END IF;

  IF p_audience NOT IN ('all', 'selected') THEN
    RAISE EXCEPTION 'audience must be all or selected';
  END IF;

  IF p_type NOT IN ('mm_announcement', 'mm_staff_message', 'campaign_message') THEN
    RAISE EXCEPTION 'unsupported notification type';
  END IF;

  IF p_type = 'campaign_message' THEN
    IF p_campaign_id IS NULL THEN
      RAISE EXCEPTION 'campaign_id is required';
    END IF;
  ELSIF p_campaign_id IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_id must be null';
  END IF;

  v_link := CASE
    WHEN p_type = 'campaign_message' THEN '/campaigns/' || p_campaign_id::text
  END;

  IF p_logged_in_since IS NOT NULL
     AND (p_type = 'campaign_message' OR p_audience = 'selected') THEN
    RAISE EXCEPTION 'logged_in_since only applies to all-user sends';
  END IF;

  IF p_audience = 'all' AND p_type = 'campaign_message' THEN
    SELECT COALESCE(array_agg(DISTINCT cm.user_id), '{}'::uuid[])
    INTO v_receiver_ids
    FROM public.campaign_members cm
    WHERE cm.campaign_id = p_campaign_id
      AND cm.user_id IS NOT NULL;
  ELSIF p_audience = 'all' THEN
    -- Null keeps every profile. Otherwise keep a login or a session refresh at or
    -- after the cutoff. refreshed_at has no time zone and is stored as UTC.
    SELECT COALESCE(array_agg(p.id), '{}'::uuid[])
    INTO v_receiver_ids
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p_logged_in_since IS NULL
       OR u.last_sign_in_at >= p_logged_in_since
       OR EXISTS (
         SELECT 1
         FROM auth.sessions s
         WHERE s.user_id = u.id
           AND (s.refreshed_at AT TIME ZONE 'UTC') >= p_logged_in_since
       );
  ELSE
    SELECT COALESCE(array_agg(DISTINCT receiver.receiver_id), '{}'::uuid[])
    INTO v_receiver_ids
    FROM unnest(COALESCE(p_receiver_ids, '{}')) AS receiver(receiver_id)
    WHERE receiver.receiver_id IS NOT NULL;
  END IF;

  IF v_receiver_ids IS NULL OR cardinality(v_receiver_ids) = 0 THEN
    RAISE EXCEPTION 'no recipients';
  END IF;

  IF p_type = 'campaign_message' AND p_audience = 'selected' THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_receiver_ids) AS receiver(receiver_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.campaign_members cm
        WHERE cm.campaign_id = p_campaign_id
          AND cm.user_id = receiver.receiver_id
      )
    ) THEN
      RAISE EXCEPTION 'recipients must be campaign members';
    END IF;
  ELSIF p_type <> 'campaign_message' AND p_audience = 'selected' THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_receiver_ids) AS receiver(receiver_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = receiver.receiver_id
      )
    ) THEN
      RAISE EXCEPTION 'recipients must be existing users';
    END IF;
  END IF;

  IF p_type = 'campaign_message' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));
    v_today_start := (timezone('utc', now()))::date::timestamp AT TIME ZONE 'utc';
    IF (
      SELECT count(*)
      FROM public.notification_sends
      WHERE campaign_id = p_campaign_id
        AND type = 'campaign_message'
        AND created_at >= v_today_start
    ) >= 5 THEN
      RAISE EXCEPTION 'campaign_message_daily_cap';
    END IF;

    -- Same sender cap as CAMPAIGN_MESSAGE_SENDER_DAILY_CAP in utils/notifications.ts.
    -- App admins are not exempt: this counts every campaign_message they send.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_sender_id::text, 1));
    IF (
      SELECT count(*)
      FROM public.notification_sends
      WHERE sender_id = p_sender_id
        AND type = 'campaign_message'
        AND created_at >= v_today_start
    ) >= 10 THEN
      RAISE EXCEPTION 'campaign_message_sender_daily_cap';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(sample_id ORDER BY sample_id), '{}'::uuid[])
  INTO v_sample
  FROM (
    SELECT receiver.receiver_id AS sample_id
    FROM unnest(v_receiver_ids) AS receiver(receiver_id)
    ORDER BY receiver.receiver_id
    LIMIT 3
  ) sample;

  v_expires_at := now() + make_interval(days => p_expires_in_days);

  INSERT INTO public.notification_sends (
    sender_id,
    type,
    campaign_id,
    text,
    recipient_count,
    sample_receiver_ids,
    logged_in_since
  ) VALUES (
    p_sender_id,
    p_type,
    p_campaign_id,
    p_text,
    cardinality(v_receiver_ids),
    v_sample,
    p_logged_in_since
  )
  RETURNING id INTO v_send_id;

  INSERT INTO public.notifications (
    text,
    type,
    is_html,
    sender_id,
    receiver_id,
    dismissed,
    link,
    expires_at,
    send_id
  )
  SELECT
    p_text,
    p_type,
    true,
    p_sender_id,
    receiver.receiver_id,
    false,
    v_link,
    v_expires_at,
    v_send_id
  FROM unnest(v_receiver_ids) AS receiver(receiver_id);

  RETURN jsonb_build_object('id', v_send_id, 'count', cardinality(v_receiver_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_send(uuid, text, uuid, text, integer, text, uuid[], timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification_send(uuid, text, uuid, text, integer, text, uuid[], timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification_send(uuid, text, uuid, text, integer, text, uuid[], timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_send(uuid, text, uuid, text, integer, text, uuid[], timestamptz) TO service_role;
