-- Decline or cancel a pending campaign trade and unlock its items. Decline is
-- the counterparty; cancel is the proposer. Campaign arbs and site admins
-- may act for either side. Pending rows stay completable after allow_trading
-- is turned off, so this does not check the flag.
--
-- Cancelling an open listing also declines its pending bids and unlocks them
-- in the same transaction. Decline of a listing (no counterparty) stays
-- invalid.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'not_pending', 'invalid'.
CREATE OR REPLACE FUNCTION public.resolve_campaign_trade(
    p_trade_id uuid,
    p_action text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_proposer uuid;
    v_counterparty uuid;
    v_status text;
    v_parent uuid;
    v_actor uuid;
    v_is_listing boolean;
BEGIN
    IF p_action IS DISTINCT FROM 'decline' AND p_action IS DISTINCT FROM 'cancel' THEN
        RETURN 'invalid';
    END IF;

    SELECT proposer_gang_id, counterparty_gang_id, status, parent_trade_id
    INTO v_proposer, v_counterparty, v_status, v_parent
    FROM campaign_trades
    WHERE id = p_trade_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    v_is_listing := v_parent IS NULL AND v_counterparty IS NULL;

    IF p_action = 'cancel' AND v_is_listing THEN
        PERFORM 1
        FROM campaign_trades
        WHERE id = p_trade_id
           OR (parent_trade_id = p_trade_id AND status = 'pending')
        ORDER BY id
        FOR UPDATE;
    ELSE
        PERFORM 1
        FROM campaign_trades
        WHERE id = p_trade_id
        FOR UPDATE;
    END IF;

    SELECT proposer_gang_id, counterparty_gang_id, status, parent_trade_id
    INTO v_proposer, v_counterparty, v_status, v_parent
    FROM campaign_trades
    WHERE id = p_trade_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_status IS DISTINCT FROM 'pending' THEN
        RETURN 'not_pending';
    END IF;

    v_is_listing := v_parent IS NULL AND v_counterparty IS NULL;
    v_actor := CASE WHEN p_action = 'cancel' THEN v_proposer ELSE v_counterparty END;
    IF v_actor IS NULL THEN
        RETURN 'invalid';
    END IF;

    IF NOT (
        private.is_admin()
        OR private.is_gang_arb(v_actor)
        OR EXISTS (
            SELECT 1 FROM gangs g
            WHERE g.id = v_actor AND g.user_id = (SELECT auth.uid())
        )
    ) THEN
        RETURN 'not_authorized';
    END IF;

    IF p_action = 'cancel' AND v_is_listing THEN
        UPDATE campaign_trade_items
        SET locked = false,
            updated_at = now()
        WHERE locked
          AND trade_id IN (
              SELECT id FROM campaign_trades
              WHERE parent_trade_id = p_trade_id AND status = 'pending'
          );

        UPDATE campaign_trades
        SET status = 'declined',
            resolved_at = now(),
            updated_at = now()
        WHERE parent_trade_id = p_trade_id
          AND status = 'pending';
    END IF;

    UPDATE campaign_trades
    SET status = CASE WHEN p_action = 'cancel' THEN 'cancelled' ELSE 'declined' END,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_trade_id;

    UPDATE campaign_trade_items
    SET locked = false,
        updated_at = now()
    WHERE trade_id = p_trade_id AND locked;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_campaign_trade(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_campaign_trade(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_campaign_trade(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_campaign_trade(uuid, text) TO service_role;
