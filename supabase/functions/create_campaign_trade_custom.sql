-- Propose a custom trade (Territory, service, bounty, house-rule good).
-- Recorded only; accept unlocks the row and still moves payment. Direct:
-- counterparty set, payment given by the counterparty. Open listing:
-- counterparty null, payment is the author's ask. Auth is owner /
-- is_gang_arb / admin. Requires allow_trading.
--
-- Returns one of: 'ok', 'not_authorized', 'not_found', 'trading_disabled',
-- 'invalid'.
-- Insert payment rows: credits always, reputation when amount > 0, and each
-- campaign resource when amount > 0. Called from the create RPCs after the
-- goods item is inserted.
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

REVOKE ALL ON FUNCTION public.create_campaign_custom_trade(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_campaign_custom_trade(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_custom_trade(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_custom_trade(uuid, uuid, uuid, text, text, text, numeric, numeric, jsonb) TO service_role;
