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
