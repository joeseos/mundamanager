-- Player mutations for a direct captive ransom. Same bodies as
-- supabase/functions/create_campaign_trade_captive_ransom.sql,
-- supabase/functions/resolve_campaign_trade.sql and
-- supabase/functions/accept_campaign_trade.sql.
--
-- campaign_trades writes stay admin-only under RLS; these SECURITY DEFINER
-- RPCs are how gang owners and arbs create, decline, cancel and accept.

BEGIN;

-- Propose a direct captive ransom: the captor lists a captive and the
-- counterparty will pay credits if they accept. One SECURITY DEFINER
-- transaction inserts the trade and both items (captive locked). RLS on
-- campaign_trades is admin-only until this RPC; the function checks the
-- caller owns the proposer gang, is a campaign arb for it, or is admin.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'trading_disabled',
-- 'captive_unavailable', 'invalid'.
CREATE OR REPLACE FUNCTION public.create_campaign_trade_captive_ransom(
    p_campaign_id uuid,
    p_proposer_gang_id uuid,
    p_counterparty_gang_id uuid,
    p_title text,
    p_note text,
    p_fighter_id uuid,
    p_credits_amount numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_allow boolean;
    v_title text;
    v_trade_id uuid;
    v_fighter_name text;
    v_captured boolean;
    v_holder uuid;
BEGIN
    IF p_campaign_id IS NULL
        OR p_proposer_gang_id IS NULL
        OR p_counterparty_gang_id IS NULL
        OR p_fighter_id IS NULL
        OR p_credits_amount IS NULL
        OR p_credits_amount < 0
        OR p_proposer_gang_id = p_counterparty_gang_id THEN
        RETURN 'invalid';
    END IF;

    v_title := btrim(COALESCE(p_title, ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 100 THEN
        RETURN 'invalid';
    END IF;

    IF NOT (
        private.is_admin()
        OR private.is_gang_arb(p_proposer_gang_id)
        OR EXISTS (
            SELECT 1 FROM gangs g
            WHERE g.id = p_proposer_gang_id AND g.user_id = (SELECT auth.uid())
        )
    ) THEN
        RETURN 'not_authorized';
    END IF;

    SELECT allow_trading INTO v_allow
    FROM campaigns
    WHERE id = p_campaign_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF NOT v_allow THEN
        RETURN 'trading_disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM campaign_gangs
        WHERE campaign_id = p_campaign_id
          AND gang_id = p_proposer_gang_id
          AND status = 'ACCEPTED'
    ) OR NOT EXISTS (
        SELECT 1 FROM campaign_gangs
        WHERE campaign_id = p_campaign_id
          AND gang_id = p_counterparty_gang_id
          AND status = 'ACCEPTED'
    ) THEN
        RETURN 'invalid';
    END IF;

    SELECT fighter_name, captured, captured_by_gang_id
    INTO v_fighter_name, v_captured, v_holder
    FROM fighters
    WHERE id = p_fighter_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF NOT v_captured
        OR v_holder IS DISTINCT FROM p_proposer_gang_id
        OR char_length(btrim(COALESCE(v_fighter_name, ''))) < 1 THEN
        RETURN 'captive_unavailable';
    END IF;

    IF EXISTS (
        SELECT 1 FROM campaign_trade_items
        WHERE fighter_id = p_fighter_id AND locked
    ) THEN
        RETURN 'captive_unavailable';
    END IF;

    INSERT INTO campaign_trades (
        campaign_id,
        proposer_gang_id,
        counterparty_gang_id,
        parent_trade_id,
        title,
        note,
        status
    ) VALUES (
        p_campaign_id,
        p_proposer_gang_id,
        p_counterparty_gang_id,
        NULL,
        v_title,
        NULLIF(btrim(COALESCE(p_note, '')), ''),
        'pending'
    )
    RETURNING id INTO v_trade_id;

    INSERT INTO campaign_trade_items (
        trade_id,
        giving_gang_id,
        kind,
        fighter_id,
        description,
        locked
    ) VALUES (
        v_trade_id,
        p_proposer_gang_id,
        'captive',
        p_fighter_id,
        btrim(v_fighter_name),
        true
    );

    INSERT INTO campaign_trade_items (
        trade_id,
        giving_gang_id,
        kind,
        amount,
        locked
    ) VALUES (
        v_trade_id,
        p_counterparty_gang_id,
        'credits',
        p_credits_amount,
        true
    );

    RETURN 'ok';
EXCEPTION
    WHEN unique_violation THEN
        RETURN 'captive_unavailable';
END;
$$;

REVOKE ALL ON FUNCTION public.create_campaign_trade_captive_ransom(uuid, uuid, uuid, text, text, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_campaign_trade_captive_ransom(uuid, uuid, uuid, text, text, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_trade_captive_ransom(uuid, uuid, uuid, text, text, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_trade_captive_ransom(uuid, uuid, uuid, text, text, uuid, numeric) TO service_role;

-- Decline or cancel a pending campaign trade and unlock its items. Decline is
-- the counterparty; cancel is the proposer. Campaign arbs and site admins
-- may act for either side. Pending rows stay completable after allow_trading
-- is turned off, so this does not check the flag.
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
    v_actor uuid;
BEGIN
    IF p_action IS DISTINCT FROM 'decline' AND p_action IS DISTINCT FROM 'cancel' THEN
        RETURN 'invalid';
    END IF;

    SELECT proposer_gang_id, counterparty_gang_id, status
    INTO v_proposer, v_counterparty, v_status
    FROM campaign_trades
    WHERE id = p_trade_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_status IS DISTINCT FROM 'pending' THEN
        RETURN 'not_pending';
    END IF;

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

-- Accept a pending direct captive ransom in one transaction: lock the trade,
-- re-check the captive and credits, move credits/wealth, then either rescue
-- the fighter home or retarget captured_by_gang_id to a third gang. Does not
-- check allow_trading so a pending trade can still complete after the flag
-- is turned off.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'not_pending',
-- 'captive_unavailable', 'insufficient_credits', 'alignment_blocked', 'invalid'.
CREATE OR REPLACE FUNCTION public.accept_campaign_trade(
    p_trade_id uuid
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
    v_captor uuid;
    v_fighter_id uuid;
    v_payer uuid;
    v_payee uuid;
    v_amount numeric;
    v_receiver uuid;
    v_captured boolean;
    v_holder uuid;
    v_original uuid;
    v_fighter_name text;
    v_captor_alignment text;
    v_receiver_alignment text;
    v_low uuid;
    v_high uuid;
BEGIN
    SELECT proposer_gang_id, counterparty_gang_id, status
    INTO v_proposer, v_counterparty, v_status
    FROM campaign_trades
    WHERE id = p_trade_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_status IS DISTINCT FROM 'pending' THEN
        RETURN 'not_pending';
    END IF;
    IF v_counterparty IS NULL OR v_proposer IS NULL THEN
        RETURN 'invalid';
    END IF;

    IF NOT (
        private.is_admin()
        OR private.is_gang_arb(v_counterparty)
        OR EXISTS (
            SELECT 1 FROM gangs g
            WHERE g.id = v_counterparty AND g.user_id = (SELECT auth.uid())
        )
    ) THEN
        RETURN 'not_authorized';
    END IF;

    SELECT giving_gang_id, fighter_id
    INTO v_captor, v_fighter_id
    FROM campaign_trade_items
    WHERE trade_id = p_trade_id AND kind = 'captive';
    IF NOT FOUND OR v_fighter_id IS NULL THEN
        RETURN 'invalid';
    END IF;

    SELECT giving_gang_id, amount
    INTO v_payer, v_amount
    FROM campaign_trade_items
    WHERE trade_id = p_trade_id AND kind = 'credits';
    IF NOT FOUND OR v_amount IS NULL OR v_amount < 0 THEN
        RETURN 'invalid';
    END IF;

    v_receiver := CASE
        WHEN v_proposer = v_captor THEN v_counterparty
        ELSE v_proposer
    END;
    v_payee := CASE
        WHEN v_payer = v_proposer THEN v_counterparty
        ELSE v_proposer
    END;
    IF v_receiver IS NULL OR v_payee IS NULL THEN
        RETURN 'invalid';
    END IF;

    SELECT captured, captured_by_gang_id, gang_id, fighter_name
    INTO v_captured, v_holder, v_original, v_fighter_name
    FROM fighters
    WHERE id = v_fighter_id
    FOR UPDATE;
    IF NOT FOUND
        OR NOT v_captured
        OR v_holder IS DISTINCT FROM v_captor THEN
        RETURN 'captive_unavailable';
    END IF;

    SELECT alignment INTO v_captor_alignment FROM gangs WHERE id = v_captor;
    SELECT alignment INTO v_receiver_alignment FROM gangs WHERE id = v_receiver;
    IF v_captor_alignment = 'Law Abiding'
        AND v_receiver_alignment = 'Outlaw'
        AND v_receiver IS DISTINCT FROM v_original THEN
        RETURN 'alignment_blocked';
    END IF;

    IF v_amount > 0 THEN
        IF v_payer < v_payee THEN
            v_low := v_payer;
            v_high := v_payee;
        ELSE
            v_low := v_payee;
            v_high := v_payer;
        END IF;
        PERFORM 1 FROM gangs WHERE id = v_low FOR UPDATE;
        PERFORM 1 FROM gangs WHERE id = v_high FOR UPDATE;

        UPDATE gangs
        SET credits = COALESCE(credits, 0) - v_amount,
            wealth = GREATEST(0, COALESCE(wealth, 0) - v_amount)
        WHERE id = v_payer
          AND COALESCE(credits, 0) >= v_amount;
        IF NOT FOUND THEN
            RETURN 'insufficient_credits';
        END IF;

        UPDATE gangs
        SET credits = COALESCE(credits, 0) + v_amount,
            wealth = COALESCE(wealth, 0) + v_amount
        WHERE id = v_payee;
    END IF;

    IF v_receiver = v_original THEN
        UPDATE fighters
        SET captured = false,
            captured_by_gang_id = NULL,
            updated_at = now()
        WHERE id = v_fighter_id;

        DELETE FROM fighter_effects
        WHERE fighter_id = v_fighter_id
          AND effect_name = 'Captured';

        INSERT INTO gang_logs (gang_id, user_id, action_type, description, fighter_id)
        VALUES (
            v_original,
            (SELECT auth.uid()),
            'fighter_released',
            'Fighter "' || COALESCE(v_fighter_name, 'Unknown') || '" was released from captivity.',
            v_fighter_id
        );
    ELSE
        UPDATE fighters
        SET captured_by_gang_id = v_receiver,
            updated_at = now()
        WHERE id = v_fighter_id;
    END IF;

    UPDATE campaign_trades
    SET status = 'accepted',
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

REVOKE ALL ON FUNCTION public.accept_campaign_trade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) TO service_role;

COMMIT;
