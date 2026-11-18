-- Player mutations for custom trade items. Same bodies as
-- supabase/functions/insert_campaign_trade_payments.sql,
-- supabase/functions/create_campaign_trade_custom.sql,
-- supabase/functions/create_campaign_bid.sql and
-- supabase/functions/accept_campaign_trade.sql.
--
-- Drops the 9-arg create_campaign_bid signature (PostgreSQL cannot
-- CREATE OR REPLACE a changed argument list), then recreates it with
-- p_custom_description. Accept treats custom as goods and does not move it.

BEGIN;
-- Insert the counterparty's payment rows on a direct trade: credits always,
-- reputation when amount > 0, and each campaign resource when amount > 0.
-- Called from the create RPCs after the goods item is inserted.
--
-- Returns 'ok' or 'invalid'.
CREATE OR REPLACE FUNCTION private.insert_campaign_trade_payments(
    p_trade_id uuid,
    p_campaign_id uuid,
    p_giving_gang_id uuid,
    p_credits_amount numeric,
    p_reputation_amount numeric,
    p_resources jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_resources jsonb;
    v_resource jsonb;
    v_type_id uuid;
    v_custom_id uuid;
    v_amount numeric;
    v_name text;
    v_seen uuid[];
    v_key uuid;
BEGIN
    IF p_trade_id IS NULL
        OR p_campaign_id IS NULL
        OR p_giving_gang_id IS NULL
        OR p_credits_amount IS NULL
        OR p_credits_amount < 0 THEN
        RETURN 'invalid';
    END IF;
    IF p_reputation_amount IS NOT NULL AND p_reputation_amount < 0 THEN
        RETURN 'invalid';
    END IF;

    v_resources := COALESCE(p_resources, '[]'::jsonb);
    IF jsonb_typeof(v_resources) IS DISTINCT FROM 'array' THEN
        RETURN 'invalid';
    END IF;

    INSERT INTO campaign_trade_items (
        trade_id,
        giving_gang_id,
        kind,
        amount,
        locked
    ) VALUES (
        p_trade_id,
        p_giving_gang_id,
        'credits',
        p_credits_amount,
        true
    );

    IF p_reputation_amount IS NOT NULL AND p_reputation_amount > 0 THEN
        INSERT INTO campaign_trade_items (
            trade_id,
            giving_gang_id,
            kind,
            amount,
            locked
        ) VALUES (
            p_trade_id,
            p_giving_gang_id,
            'reputation',
            p_reputation_amount,
            true
        );
    END IF;

    v_seen := ARRAY[]::uuid[];
    FOR v_resource IN SELECT value FROM jsonb_array_elements(v_resources)
    LOOP
        BEGIN
            v_type_id := NULLIF(v_resource->>'campaign_type_resource_id', '')::uuid;
            v_custom_id := NULLIF(v_resource->>'campaign_resource_id', '')::uuid;
            v_amount := (v_resource->>'amount')::numeric;
        EXCEPTION
            WHEN invalid_text_representation THEN
                RETURN 'invalid';
        END;

        IF v_amount IS NULL OR v_amount < 0 THEN
            RETURN 'invalid';
        END IF;
        IF v_amount = 0 THEN
            CONTINUE;
        END IF;
        IF num_nonnulls(v_type_id, v_custom_id) IS DISTINCT FROM 1 THEN
            RETURN 'invalid';
        END IF;

        v_key := COALESCE(v_type_id, v_custom_id);
        IF v_key = ANY (v_seen) THEN
            RETURN 'invalid';
        END IF;
        v_seen := array_append(v_seen, v_key);

        IF v_type_id IS NOT NULL THEN
            SELECT ctr.resource_name INTO v_name
            FROM campaign_type_resources ctr
            JOIN campaigns c ON c.campaign_type_id = ctr.campaign_type_id
            WHERE c.id = p_campaign_id AND ctr.id = v_type_id;
        ELSE
            SELECT resource_name INTO v_name
            FROM campaign_resources
            WHERE id = v_custom_id AND campaign_id = p_campaign_id;
        END IF;
        IF NOT FOUND OR char_length(btrim(COALESCE(v_name, ''))) < 1 THEN
            RETURN 'invalid';
        END IF;

        INSERT INTO campaign_trade_items (
            trade_id,
            giving_gang_id,
            kind,
            amount,
            campaign_type_resource_id,
            campaign_resource_id,
            description,
            locked
        ) VALUES (
            p_trade_id,
            p_giving_gang_id,
            'campaign_resource',
            v_amount,
            v_type_id,
            v_custom_id,
            btrim(v_name),
            true
        );
    END LOOP;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION private.insert_campaign_trade_payments(uuid, uuid, uuid, numeric, numeric, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_campaign_trade_custom(
    p_campaign_id uuid,
    p_proposer_gang_id uuid,
    p_counterparty_gang_id uuid,
    p_title text,
    p_note text,
    p_custom_description text,
    p_credits_amount numeric,
    p_reputation_amount numeric,
    p_resources jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_allow boolean;
    v_title text;
    v_custom text;
    v_trade_id uuid;
    v_pay_giver uuid;
    v_payments text;
BEGIN
    IF p_campaign_id IS NULL
        OR p_proposer_gang_id IS NULL
        OR p_credits_amount IS NULL
        OR p_credits_amount < 0
        OR p_proposer_gang_id = p_counterparty_gang_id THEN
        RETURN 'invalid';
    END IF;
    IF p_reputation_amount IS NOT NULL AND p_reputation_amount < 0 THEN
        RETURN 'invalid';
    END IF;

    v_title := btrim(COALESCE(p_title, ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 100 THEN
        RETURN 'invalid';
    END IF;

    v_custom := btrim(COALESCE(p_custom_description, ''));
    IF char_length(v_custom) < 1 OR char_length(v_custom) > 40 THEN
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
    ) THEN
        RETURN 'invalid';
    END IF;

    IF p_counterparty_gang_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM campaign_gangs
            WHERE campaign_id = p_campaign_id
              AND gang_id = p_counterparty_gang_id
              AND status = 'ACCEPTED'
        ) THEN
            RETURN 'invalid';
        END IF;
        v_pay_giver := p_counterparty_gang_id;
    ELSE
        v_pay_giver := p_proposer_gang_id;
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
        description,
        locked
    ) VALUES (
        v_trade_id,
        p_proposer_gang_id,
        'custom',
        v_custom,
        true
    );

    v_payments := private.insert_campaign_trade_payments(
        v_trade_id,
        p_campaign_id,
        v_pay_giver,
        p_credits_amount,
        p_reputation_amount,
        p_resources
    );
    IF v_payments IS DISTINCT FROM 'ok' THEN
        RAISE EXCEPTION '%', v_payments;
    END IF;

    RETURN 'ok';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM = 'invalid' THEN
            RETURN 'invalid';
        END IF;
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_campaign_trade_custom(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_campaign_trade_custom(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_trade_custom(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_trade_custom(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.create_campaign_bid(uuid, uuid, text, text, uuid, uuid, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.create_campaign_bid(
    p_listing_id uuid,
    p_bidder_gang_id uuid,
    p_title text,
    p_note text,
    p_fighter_id uuid,
    p_fighter_equipment_id uuid,
    p_custom_description text,
    p_credits_amount numeric,
    p_reputation_amount numeric,
    p_resources jsonb
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
    v_campaign_id uuid;
    v_listing_proposer uuid;
    v_listing_counterparty uuid;
    v_listing_parent uuid;
    v_listing_status text;
    v_listing_has_goods boolean;
    v_fighter_name text;
    v_captured boolean;
    v_holder uuid;
    v_item_gang uuid;
    v_stash boolean;
    v_fighter_id uuid;
    v_vehicle_id uuid;
    v_granted uuid;
    v_item_name text;
    v_category text;
    v_payments text;
    v_constraint text;
    v_custom text;
    v_goods_count integer;
BEGIN
    IF p_listing_id IS NULL
        OR p_bidder_gang_id IS NULL THEN
        RETURN 'invalid';
    END IF;

    v_custom := NULLIF(btrim(COALESCE(p_custom_description, '')), '');
    IF v_custom IS NOT NULL AND char_length(v_custom) > 40 THEN
        RETURN 'invalid';
    END IF;

    v_goods_count := (p_fighter_id IS NOT NULL)::integer
        + (p_fighter_equipment_id IS NOT NULL)::integer
        + (v_custom IS NOT NULL)::integer;
    IF v_goods_count > 1 THEN
        RETURN 'invalid';
    END IF;
    IF p_reputation_amount IS NOT NULL AND p_reputation_amount < 0 THEN
        RETURN 'invalid';
    END IF;

    v_title := btrim(COALESCE(p_title, ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 100 THEN
        RETURN 'invalid';
    END IF;

    IF NOT (
        private.is_admin()
        OR private.is_gang_arb(p_bidder_gang_id)
        OR EXISTS (
            SELECT 1 FROM gangs g
            WHERE g.id = p_bidder_gang_id AND g.user_id = (SELECT auth.uid())
        )
    ) THEN
        RETURN 'not_authorized';
    END IF;

    SELECT campaign_id, proposer_gang_id, counterparty_gang_id, parent_trade_id, status
    INTO v_campaign_id, v_listing_proposer, v_listing_counterparty, v_listing_parent, v_listing_status
    FROM campaign_trades
    WHERE id = p_listing_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_listing_status IS DISTINCT FROM 'pending' THEN
        RETURN 'not_pending';
    END IF;
    IF v_listing_counterparty IS NOT NULL
        OR v_listing_parent IS NOT NULL
        OR v_listing_proposer IS NULL THEN
        RETURN 'invalid';
    END IF;
    IF p_bidder_gang_id = v_listing_proposer THEN
        RETURN 'invalid';
    END IF;

    SELECT allow_trading INTO v_allow
    FROM campaigns
    WHERE id = v_campaign_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF NOT v_allow THEN
        RETURN 'trading_disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM campaign_gangs
        WHERE campaign_id = v_campaign_id
          AND gang_id = p_bidder_gang_id
          AND status = 'ACCEPTED'
    ) OR NOT EXISTS (
        SELECT 1 FROM campaign_gangs
        WHERE campaign_id = v_campaign_id
          AND gang_id = v_listing_proposer
          AND status = 'ACCEPTED'
    ) THEN
        RETURN 'invalid';
    END IF;

    v_listing_has_goods := EXISTS (
        SELECT 1 FROM campaign_trade_items
        WHERE trade_id = p_listing_id AND kind IN ('captive', 'equipment', 'custom')
    );

    IF v_listing_has_goods THEN
        IF v_goods_count IS DISTINCT FROM 0 THEN
            RETURN 'invalid';
        END IF;
        IF p_credits_amount IS NULL OR p_credits_amount < 0 THEN
            RETURN 'invalid';
        END IF;
    ELSE
        IF v_goods_count IS DISTINCT FROM 1 THEN
            RETURN 'invalid';
        END IF;
    END IF;

    IF p_fighter_id IS NOT NULL THEN
        SELECT fighter_name, captured, captured_by_gang_id
        INTO v_fighter_name, v_captured, v_holder
        FROM fighters
        WHERE id = p_fighter_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RETURN 'not_found';
        END IF;
        IF NOT v_captured
            OR v_holder IS DISTINCT FROM p_bidder_gang_id
            OR char_length(btrim(COALESCE(v_fighter_name, ''))) < 1 THEN
            RETURN 'captive_unavailable';
        END IF;

        IF EXISTS (
            SELECT 1 FROM campaign_trade_items
            WHERE fighter_id = p_fighter_id AND locked
        ) THEN
            RETURN 'captive_unavailable';
        END IF;
    ELSIF p_fighter_equipment_id IS NOT NULL THEN
        SELECT
            fe.gang_id,
            fe.gang_stash,
            fe.fighter_id,
            fe.vehicle_id,
            fe.granted_by_equipment_id,
            btrim(COALESCE(e.equipment_name, ce.equipment_name, '')),
            lower(btrim(COALESCE(e.equipment_category, ce.equipment_category, '')))
        INTO
            v_item_gang,
            v_stash,
            v_fighter_id,
            v_vehicle_id,
            v_granted,
            v_item_name,
            v_category
        FROM fighter_equipment fe
        LEFT JOIN equipment e ON e.id = fe.equipment_id
        LEFT JOIN custom_equipment ce ON ce.id = fe.custom_equipment_id
        WHERE fe.id = p_fighter_equipment_id
        FOR UPDATE OF fe;
        IF NOT FOUND THEN
            RETURN 'not_found';
        END IF;
        IF v_stash IS NOT TRUE
            OR v_item_gang IS DISTINCT FROM p_bidder_gang_id
            OR v_fighter_id IS NOT NULL
            OR v_vehicle_id IS NOT NULL
            OR v_granted IS NOT NULL
            OR char_length(v_item_name) < 1
            OR v_category IN (
                'status items: exotic beasts',
                'pets',
                'exotic beast'
            ) THEN
            RETURN 'equipment_unavailable';
        END IF;

        IF EXISTS (
            SELECT 1 FROM campaign_trade_items
            WHERE fighter_equipment_id = p_fighter_equipment_id AND locked
        ) THEN
            RETURN 'equipment_unavailable';
        END IF;
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
        v_campaign_id,
        p_bidder_gang_id,
        v_listing_proposer,
        p_listing_id,
        v_title,
        NULLIF(btrim(COALESCE(p_note, '')), ''),
        'pending'
    )
    RETURNING id INTO v_trade_id;

    IF p_fighter_id IS NOT NULL THEN
        INSERT INTO campaign_trade_items (
            trade_id,
            giving_gang_id,
            kind,
            fighter_id,
            description,
            locked
        ) VALUES (
            v_trade_id,
            p_bidder_gang_id,
            'captive',
            p_fighter_id,
            btrim(v_fighter_name),
            true
        );
    ELSIF p_fighter_equipment_id IS NOT NULL THEN
        INSERT INTO campaign_trade_items (
            trade_id,
            giving_gang_id,
            kind,
            fighter_equipment_id,
            description,
            locked
        ) VALUES (
            v_trade_id,
            p_bidder_gang_id,
            'equipment',
            p_fighter_equipment_id,
            v_item_name,
            true
        );
    ELSIF v_custom IS NOT NULL THEN
        INSERT INTO campaign_trade_items (
            trade_id,
            giving_gang_id,
            kind,
            description,
            locked
        ) VALUES (
            v_trade_id,
            p_bidder_gang_id,
            'custom',
            v_custom,
            true
        );
    ELSE
        v_payments := private.insert_campaign_trade_payments(
            v_trade_id,
            v_campaign_id,
            p_bidder_gang_id,
            p_credits_amount,
            p_reputation_amount,
            p_resources
        );
        IF v_payments IS DISTINCT FROM 'ok' THEN
            RAISE EXCEPTION '%', v_payments;
        END IF;
    END IF;

    RETURN 'ok';
EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'campaign_trades_one_pending_bid'
            OR SQLERRM LIKE '%campaign_trades_one_pending_bid%' THEN
            RETURN 'bid_exists';
        ELSIF p_fighter_id IS NOT NULL THEN
            RETURN 'captive_unavailable';
        ELSIF p_fighter_equipment_id IS NOT NULL THEN
            RETURN 'equipment_unavailable';
        END IF;
        RETURN 'invalid';
    WHEN raise_exception THEN
        IF SQLERRM = 'invalid' THEN
            RETURN 'invalid';
        END IF;
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_campaign_bid(uuid, uuid, text, text, uuid, uuid, text, numeric, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_campaign_bid(uuid, uuid, text, text, uuid, uuid, text, numeric, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_bid(uuid, uuid, text, text, uuid, uuid, text, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_bid(uuid, uuid, text, text, uuid, uuid, text, numeric, numeric, jsonb) TO service_role;

-- Accept a pending trade in one transaction. Direct trades settle as before.
-- Accepting a bid locks the listing and all pending bids in id order, moves
-- listing goods (selling) or listing payment (buying) together with the bid
-- counterpart, skips a selling listing's asking-price rows, declines sibling
-- bids, then marks listing and winning bid accepted. Accepting an open
-- listing row is invalid. Does not check allow_trading so a pending trade
-- can still complete after the flag is turned off.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'not_pending',
-- 'captive_unavailable', 'equipment_unavailable', 'insufficient_credits',
-- 'insufficient_reputation', 'insufficient_resources', 'alignment_blocked',
-- 'invalid'.
CREATE OR REPLACE FUNCTION public.accept_campaign_trade(
    p_trade_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_campaign_id uuid;
    v_proposer uuid;
    v_counterparty uuid;
    v_status text;
    v_parent uuid;
    v_listing_proposer uuid;
    v_listing_counterparty uuid;
    v_listing_status text;
    v_listing_has_goods boolean;
    v_goods_trade_id uuid;
    v_pay_trade_id uuid;
    v_captor uuid;
    v_fighter_id uuid;
    v_has_captive boolean := false;
    v_equip_giver uuid;
    v_equip_id uuid;
    v_has_equipment boolean := false;
    v_has_custom boolean := false;
    v_has_credits boolean := false;
    v_credit_giver uuid;
    v_credit_amount numeric;
    v_credit_payee uuid;
    v_receiver uuid;
    v_captured boolean;
    v_holder uuid;
    v_original uuid;
    v_fighter_name text;
    v_captor_alignment text;
    v_receiver_alignment text;
    v_low uuid;
    v_high uuid;
    v_equip_gang uuid;
    v_equip_stash boolean;
    v_equip_fighter uuid;
    v_equip_vehicle uuid;
    v_equip_granted uuid;
    v_equip_cost numeric;
    v_child_cost numeric;
    v_stash_value numeric;
    v_equip_receiver uuid;
    v_item record;
    v_payee uuid;
    v_payer_cg uuid;
    v_payee_cg uuid;
    v_giver_row uuid;
    v_recv_row uuid;
BEGIN
    SELECT parent_trade_id
    INTO v_parent
    FROM campaign_trades
    WHERE id = p_trade_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    IF v_parent IS NOT NULL THEN
        PERFORM 1
        FROM campaign_trades
        WHERE id = v_parent
           OR id = p_trade_id
           OR (parent_trade_id = v_parent AND status = 'pending')
        ORDER BY id
        FOR UPDATE;
    ELSE
        PERFORM 1
        FROM campaign_trades
        WHERE id = p_trade_id
        FOR UPDATE;
    END IF;

    SELECT campaign_id, proposer_gang_id, counterparty_gang_id, status, parent_trade_id
    INTO v_campaign_id, v_proposer, v_counterparty, v_status, v_parent
    FROM campaign_trades
    WHERE id = p_trade_id;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_status IS DISTINCT FROM 'pending' THEN
        RETURN 'not_pending';
    END IF;
    IF v_proposer IS NULL THEN
        RETURN 'invalid';
    END IF;

    IF v_parent IS NOT NULL THEN
        IF v_counterparty IS NULL THEN
            RETURN 'invalid';
        END IF;

        SELECT proposer_gang_id, counterparty_gang_id, status
        INTO v_listing_proposer, v_listing_counterparty, v_listing_status
        FROM campaign_trades
        WHERE id = v_parent;
        IF NOT FOUND THEN
            RETURN 'not_found';
        END IF;
        IF v_listing_status IS DISTINCT FROM 'pending' THEN
            RETURN 'not_pending';
        END IF;
        IF v_listing_counterparty IS NOT NULL
            OR v_listing_proposer IS NULL
            OR v_counterparty IS DISTINCT FROM v_listing_proposer THEN
            RETURN 'invalid';
        END IF;

        v_listing_has_goods := EXISTS (
            SELECT 1 FROM campaign_trade_items
            WHERE trade_id = v_parent AND kind IN ('captive', 'equipment', 'custom')
        );
        IF v_listing_has_goods THEN
            v_goods_trade_id := v_parent;
            v_pay_trade_id := p_trade_id;
        ELSE
            v_goods_trade_id := p_trade_id;
            v_pay_trade_id := v_parent;
        END IF;
    ELSE
        IF v_counterparty IS NULL THEN
            RETURN 'invalid';
        END IF;
        v_goods_trade_id := p_trade_id;
        v_pay_trade_id := p_trade_id;
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

    SELECT giving_gang_id, amount
    INTO v_credit_giver, v_credit_amount
    FROM campaign_trade_items
    WHERE trade_id = v_pay_trade_id AND kind = 'credits';
    IF FOUND THEN
        IF v_credit_amount IS NULL OR v_credit_amount < 0 THEN
            RETURN 'invalid';
        END IF;
        v_has_credits := true;
        v_credit_payee := CASE
            WHEN v_credit_giver = v_proposer THEN v_counterparty
            ELSE v_proposer
        END;
        IF v_credit_payee IS NULL
            OR v_credit_giver IS DISTINCT FROM v_proposer
            AND v_credit_giver IS DISTINCT FROM v_counterparty THEN
            RETURN 'invalid';
        END IF;
    END IF;

    SELECT giving_gang_id, fighter_id
    INTO v_captor, v_fighter_id
    FROM campaign_trade_items
    WHERE trade_id = v_goods_trade_id AND kind = 'captive';
    IF FOUND AND v_fighter_id IS NOT NULL THEN
        v_has_captive := true;
    END IF;

    SELECT giving_gang_id, fighter_equipment_id
    INTO v_equip_giver, v_equip_id
    FROM campaign_trade_items
    WHERE trade_id = v_goods_trade_id AND kind = 'equipment';
    IF FOUND AND v_equip_id IS NOT NULL THEN
        v_has_equipment := true;
    END IF;

    v_has_custom := EXISTS (
        SELECT 1 FROM campaign_trade_items
        WHERE trade_id = v_goods_trade_id
          AND kind = 'custom'
          AND char_length(btrim(COALESCE(description, ''))) >= 1
    );

    IF NOT v_has_captive AND NOT v_has_equipment AND NOT v_has_custom THEN
        RETURN 'invalid';
    END IF;

    IF v_has_captive THEN
        v_receiver := CASE
            WHEN v_proposer = v_captor THEN v_counterparty
            ELSE v_proposer
        END;
        IF v_receiver IS NULL THEN
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
    END IF;

    IF v_has_equipment THEN
        v_equip_receiver := CASE
            WHEN v_proposer = v_equip_giver THEN v_counterparty
            ELSE v_proposer
        END;
        IF v_equip_receiver IS NULL THEN
            RETURN 'invalid';
        END IF;

        SELECT
            gang_id,
            gang_stash,
            fighter_id,
            vehicle_id,
            granted_by_equipment_id,
            COALESCE(purchase_cost, 0)
        INTO
            v_equip_gang,
            v_equip_stash,
            v_equip_fighter,
            v_equip_vehicle,
            v_equip_granted,
            v_equip_cost
        FROM fighter_equipment
        WHERE id = v_equip_id
        FOR UPDATE;
        IF NOT FOUND
            OR v_equip_stash IS NOT TRUE
            OR v_equip_gang IS DISTINCT FROM v_equip_giver
            OR v_equip_fighter IS NOT NULL
            OR v_equip_vehicle IS NOT NULL
            OR v_equip_granted IS NOT NULL THEN
            RETURN 'equipment_unavailable';
        END IF;

        PERFORM 1 FROM fighter_equipment
        WHERE granted_by_equipment_id = v_equip_id
        FOR UPDATE;

        SELECT COALESCE(SUM(COALESCE(purchase_cost, 0)), 0)
        INTO v_child_cost
        FROM fighter_equipment
        WHERE granted_by_equipment_id = v_equip_id;
        v_stash_value := COALESCE(v_equip_cost, 0) + COALESCE(v_child_cost, 0);
    END IF;

    IF v_proposer < v_counterparty THEN
        v_low := v_proposer;
        v_high := v_counterparty;
    ELSE
        v_low := v_counterparty;
        v_high := v_proposer;
    END IF;
    PERFORM 1 FROM gangs WHERE id = v_low FOR UPDATE;
    PERFORM 1 FROM gangs WHERE id = v_high FOR UPDATE;

    IF v_has_credits AND v_credit_amount > 0 THEN
        UPDATE gangs
        SET credits = COALESCE(credits, 0) - v_credit_amount,
            wealth = GREATEST(0, COALESCE(wealth, 0) - v_credit_amount)
        WHERE id = v_credit_giver
          AND COALESCE(credits, 0) >= v_credit_amount;
        IF NOT FOUND THEN
            RETURN 'insufficient_credits';
        END IF;

        UPDATE gangs
        SET credits = COALESCE(credits, 0) + v_credit_amount,
            wealth = COALESCE(wealth, 0) + v_credit_amount
        WHERE id = v_credit_payee;
    END IF;

    FOR v_item IN
        SELECT giving_gang_id, amount
        FROM campaign_trade_items
        WHERE trade_id = v_pay_trade_id AND kind = 'reputation'
    LOOP
        IF v_item.amount IS NULL OR v_item.amount < 0 THEN
            RETURN 'invalid';
        END IF;
        IF v_item.amount = 0 THEN
            CONTINUE;
        END IF;
        v_payee := CASE
            WHEN v_item.giving_gang_id = v_proposer THEN v_counterparty
            ELSE v_proposer
        END;
        IF v_payee IS NULL
            OR (
                v_item.giving_gang_id IS DISTINCT FROM v_proposer
                AND v_item.giving_gang_id IS DISTINCT FROM v_counterparty
            ) THEN
            RETURN 'invalid';
        END IF;

        UPDATE gangs
        SET reputation = COALESCE(reputation, 0) - v_item.amount
        WHERE id = v_item.giving_gang_id
          AND COALESCE(reputation, 0) >= v_item.amount;
        IF NOT FOUND THEN
            RETURN 'insufficient_reputation';
        END IF;

        UPDATE gangs
        SET reputation = COALESCE(reputation, 0) + v_item.amount
        WHERE id = v_payee;
    END LOOP;

    FOR v_item IN
        SELECT giving_gang_id, amount, campaign_type_resource_id, campaign_resource_id
        FROM campaign_trade_items
        WHERE trade_id = v_pay_trade_id AND kind = 'campaign_resource'
    LOOP
        IF v_item.amount IS NULL OR v_item.amount < 0 THEN
            RETURN 'invalid';
        END IF;
        IF v_item.amount = 0 THEN
            CONTINUE;
        END IF;
        IF num_nonnulls(v_item.campaign_type_resource_id, v_item.campaign_resource_id) IS DISTINCT FROM 1 THEN
            RETURN 'invalid';
        END IF;
        v_payee := CASE
            WHEN v_item.giving_gang_id = v_proposer THEN v_counterparty
            ELSE v_proposer
        END;
        IF v_payee IS NULL
            OR (
                v_item.giving_gang_id IS DISTINCT FROM v_proposer
                AND v_item.giving_gang_id IS DISTINCT FROM v_counterparty
            ) THEN
            RETURN 'invalid';
        END IF;

        SELECT id INTO v_payer_cg
        FROM campaign_gangs
        WHERE campaign_id = v_campaign_id
          AND gang_id = v_item.giving_gang_id
          AND status = 'ACCEPTED';
        IF NOT FOUND THEN
            RETURN 'invalid';
        END IF;
        SELECT id INTO v_payee_cg
        FROM campaign_gangs
        WHERE campaign_id = v_campaign_id
          AND gang_id = v_payee
          AND status = 'ACCEPTED';
        IF NOT FOUND THEN
            RETURN 'invalid';
        END IF;

        IF v_item.campaign_type_resource_id IS NOT NULL THEN
            INSERT INTO campaign_gang_resources (
                campaign_gang_id, campaign_type_resource_id, quantity
            ) VALUES (
                v_payee_cg, v_item.campaign_type_resource_id, 0
            )
            ON CONFLICT (campaign_gang_id, campaign_type_resource_id) DO NOTHING;
        ELSE
            INSERT INTO campaign_gang_resources (
                campaign_gang_id, campaign_resource_id, quantity
            ) VALUES (
                v_payee_cg, v_item.campaign_resource_id, 0
            )
            ON CONFLICT (campaign_gang_id, campaign_resource_id) DO NOTHING;
        END IF;

        SELECT id INTO v_giver_row
        FROM campaign_gang_resources
        WHERE campaign_gang_id = v_payer_cg
          AND campaign_type_resource_id IS NOT DISTINCT FROM v_item.campaign_type_resource_id
          AND campaign_resource_id IS NOT DISTINCT FROM v_item.campaign_resource_id;
        IF NOT FOUND THEN
            RETURN 'insufficient_resources';
        END IF;

        SELECT id INTO v_recv_row
        FROM campaign_gang_resources
        WHERE campaign_gang_id = v_payee_cg
          AND campaign_type_resource_id IS NOT DISTINCT FROM v_item.campaign_type_resource_id
          AND campaign_resource_id IS NOT DISTINCT FROM v_item.campaign_resource_id;
        IF NOT FOUND THEN
            RETURN 'invalid';
        END IF;

        IF v_giver_row < v_recv_row THEN
            PERFORM 1 FROM campaign_gang_resources WHERE id = v_giver_row FOR UPDATE;
            PERFORM 1 FROM campaign_gang_resources WHERE id = v_recv_row FOR UPDATE;
        ELSIF v_giver_row > v_recv_row THEN
            PERFORM 1 FROM campaign_gang_resources WHERE id = v_recv_row FOR UPDATE;
            PERFORM 1 FROM campaign_gang_resources WHERE id = v_giver_row FOR UPDATE;
        ELSE
            PERFORM 1 FROM campaign_gang_resources WHERE id = v_giver_row FOR UPDATE;
        END IF;

        UPDATE campaign_gang_resources
        SET quantity = quantity - v_item.amount,
            updated_at = now()
        WHERE id = v_giver_row
          AND quantity >= v_item.amount;
        IF NOT FOUND THEN
            RETURN 'insufficient_resources';
        END IF;

        UPDATE campaign_gang_resources
        SET quantity = quantity + v_item.amount,
            updated_at = now()
        WHERE id = v_recv_row;
    END LOOP;

    IF v_has_captive THEN
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
    END IF;

    IF v_has_equipment THEN
        IF v_stash_value > 0 THEN
            UPDATE gangs
            SET wealth = GREATEST(0, COALESCE(wealth, 0) - v_stash_value)
            WHERE id = v_equip_giver;

            UPDATE gangs
            SET wealth = COALESCE(wealth, 0) + v_stash_value
            WHERE id = v_equip_receiver;
        END IF;

        UPDATE fighter_equipment
        SET gang_id = v_equip_receiver,
            gang_stash = true,
            fighter_id = NULL,
            vehicle_id = NULL,
            updated_at = now()
        WHERE id = v_equip_id
           OR granted_by_equipment_id = v_equip_id;
    END IF;

    IF v_parent IS NOT NULL THEN
        UPDATE campaign_trade_items
        SET locked = false,
            updated_at = now()
        WHERE locked
          AND trade_id IN (
              SELECT id FROM campaign_trades
              WHERE parent_trade_id = v_parent
                AND id IS DISTINCT FROM p_trade_id
                AND status = 'pending'
          );

        UPDATE campaign_trades
        SET status = 'declined',
            resolved_at = now(),
            updated_at = now()
        WHERE parent_trade_id = v_parent
          AND id IS DISTINCT FROM p_trade_id
          AND status = 'pending';

        UPDATE campaign_trades
        SET status = 'accepted',
            resolved_at = now(),
            updated_at = now()
        WHERE id IN (p_trade_id, v_parent);

        UPDATE campaign_trade_items
        SET locked = false,
            updated_at = now()
        WHERE trade_id IN (p_trade_id, v_parent) AND locked;
    ELSE
        UPDATE campaign_trades
        SET status = 'accepted',
            resolved_at = now(),
            updated_at = now()
        WHERE id = p_trade_id;

        UPDATE campaign_trade_items
        SET locked = false,
            updated_at = now()
        WHERE trade_id = p_trade_id AND locked;
    END IF;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_campaign_trade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_campaign_trade(uuid) TO service_role;

COMMIT;
