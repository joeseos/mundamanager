-- Insert campaign_trade notifications for owners of ACCEPTED gangs in the
-- campaign. Client INSERT of type campaign_trade is blocked by RLS; this
-- SECURITY DEFINER RPC is the only path. The caller must be an admin, a
-- campaign arb, or own an ACCEPTED gang in the campaign. Each receiver must
-- own an ACCEPTED gang in the same campaign. Skips the caller.
--
-- Returns void. Invalid or unauthorised calls are no-ops.

CREATE OR REPLACE FUNCTION public.notify_campaign_trade(
    p_campaign_id uuid,
    p_text text,
    p_receiver_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_uid uuid;
    v_text text;
    v_receiver uuid;
BEGIN
    v_uid := (SELECT auth.uid());
    IF v_uid IS NULL OR p_campaign_id IS NULL THEN
        RETURN;
    END IF;

    v_text := btrim(COALESCE(p_text, ''));
    IF char_length(v_text) < 1 OR char_length(v_text) > 500 THEN
        RETURN;
    END IF;

    IF NOT (
        private.is_admin()
        OR private.is_arb(p_campaign_id)
        OR EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            JOIN gangs g ON g.id = cg.gang_id
            WHERE cg.campaign_id = p_campaign_id
              AND cg.status = 'ACCEPTED'
              AND g.user_id = v_uid
        )
    ) THEN
        RETURN;
    END IF;

    IF p_receiver_ids IS NULL THEN
        RETURN;
    END IF;

    FOREACH v_receiver IN ARRAY p_receiver_ids
    LOOP
        IF v_receiver IS NULL OR v_receiver = v_uid THEN
            CONTINUE;
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            JOIN gangs g ON g.id = cg.gang_id
            WHERE cg.campaign_id = p_campaign_id
              AND cg.status = 'ACCEPTED'
              AND g.user_id = v_receiver
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO notifications (
            receiver_id,
            sender_id,
            type,
            text,
            link,
            dismissed
        ) VALUES (
            v_receiver,
            v_uid,
            'campaign_trade',
            v_text,
            '/campaigns/' || p_campaign_id::text,
            false
        );
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_campaign_trade(uuid, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_campaign_trade(uuid, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_campaign_trade(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_campaign_trade(uuid, text, uuid[]) TO service_role;
