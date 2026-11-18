-- Place a bid on a pending open listing. Bidder is proposer; listing author
-- is counterparty; parent_trade_id is the listing. Selling listing → payment
-- only. Buying listing → one captive, one stash root, or custom text. One
-- pending bid per gang per listing. Auth is owner / is_gang_arb / admin of
-- the bidder. Requires allow_trading.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'not_pending',
-- 'trading_disabled', 'captive_unavailable', 'equipment_unavailable',
-- 'bid_exists', 'invalid'.
-- Insert payment rows: credits always, reputation when amount > 0, and each
-- campaign resource when amount > 0. Called from the create RPCs after the
-- goods item is inserted (or immediately for a selling-listing bid).
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

DROP FUNCTION IF EXISTS public.create_campaign_trade_bid(uuid, uuid, text, text, uuid, uuid, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.create_campaign_trade_bid(
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
