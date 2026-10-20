-- One row per admin send (announcement or staff message), for the Sent list.
--
-- Notifications has no batch id. A send is every row that shares sender, type,
-- text, link, and expiry. Grouping here returns that send once, with a recipient
-- count and three sample usernames, instead of shipping one row per recipient.
--
-- service_role only. The admin route checks the caller is an admin, then calls
-- this with the service-role key. The function reads every matching notification.

CREATE OR REPLACE FUNCTION public.list_admin_sent_notifications()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grouped AS (
    SELECT
      (array_agg(n.id ORDER BY n.created_at ASC, n.id ASC))[1] AS id,
      n.type::text AS type,
      n.text::text AS body,
      COALESCE(n.link, '') AS link,
      MIN(n.created_at) AS sent_at,
      n.sender_id,
      COUNT(DISTINCT n.receiver_id) AS recipient_count,
      (array_agg(DISTINCT n.receiver_id ORDER BY n.receiver_id))[1:3] AS sample_receiver_ids
    FROM public.notifications n
    WHERE n.type IN ('mm_announcement', 'mm_staff_message')
    GROUP BY n.sender_id, n.type, n.text, COALESCE(n.link, ''), n.expires_at
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'type', g.type,
        'text', g.body,
        'link', g.link,
        'sentAt', g.sent_at,
        'senderUsername', COALESCE(NULLIF(sender.username, ''), 'Unknown'),
        'recipientCount', g.recipient_count,
        'recipientUsernames', COALESCE(names.usernames, '[]'::jsonb)
      )
      ORDER BY g.sent_at DESC
    ),
    '[]'::jsonb
  )
  FROM grouped g
  LEFT JOIN public.profiles sender ON sender.id = g.sender_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(p.username ORDER BY p.username) AS usernames
    FROM unnest(g.sample_receiver_ids) AS sample(receiver_id)
    JOIN public.profiles p ON p.id = sample.receiver_id
    WHERE p.username IS NOT NULL AND p.username <> ''
  ) names ON true;
$$;

REVOKE ALL ON FUNCTION public.list_admin_sent_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_admin_sent_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_admin_sent_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_sent_notifications() TO service_role;
