-- Atomically update gang credits, rating, and wealth using SELECT FOR UPDATE.
-- This serializes concurrent financial operations on the same gang row,
-- eliminating false negatives from optimistic CAS checks.

DROP FUNCTION IF EXISTS update_gang_financials(UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION update_gang_financials(
    p_gang_id UUID,
    p_credits_delta INTEGER DEFAULT 0,
    p_rating_delta INTEGER DEFAULT 0,
    p_stash_value_delta INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_current_credits INTEGER;
    v_current_rating INTEGER;
    v_current_wealth INTEGER;
    v_new_credits INTEGER;
    v_new_rating INTEGER;
    v_new_wealth INTEGER;
    v_wealth_delta INTEGER;
BEGIN
    -- Lock the row for the duration of this transaction
    SELECT credits, rating, wealth
    INTO v_current_credits, v_current_rating, v_current_wealth
    FROM gangs
    WHERE id = p_gang_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Gang not found'
        );
    END IF;

    -- Coalesce NULLs to 0
    v_current_credits := COALESCE(v_current_credits, 0);
    v_current_rating := COALESCE(v_current_rating, 0);
    v_current_wealth := COALESCE(v_current_wealth, 0);

    -- Overdraft check: fail fast if insufficient credits
    IF p_credits_delta < 0 AND v_current_credits + p_credits_delta < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient credits',
            'old_values', jsonb_build_object(
                'credits', v_current_credits,
                'rating', v_current_rating,
                'wealth', v_current_wealth
            )
        );
    END IF;

    -- Calculate new values with floor at 0
    v_wealth_delta := p_rating_delta + p_credits_delta + p_stash_value_delta;
    v_new_credits := GREATEST(0, v_current_credits + p_credits_delta);
    v_new_rating := GREATEST(0, v_current_rating + p_rating_delta);
    v_new_wealth := GREATEST(0, v_current_wealth + v_wealth_delta);

    -- Update the row (already locked, guaranteed to succeed)
    UPDATE gangs
    SET credits = v_new_credits,
        rating = v_new_rating,
        wealth = v_new_wealth
    WHERE id = p_gang_id;

    RETURN jsonb_build_object(
        'success', true,
        'old_values', jsonb_build_object(
            'credits', v_current_credits,
            'rating', v_current_rating,
            'wealth', v_current_wealth
        ),
        'new_values', jsonb_build_object(
            'credits', v_new_credits,
            'rating', v_new_rating,
            'wealth', v_new_wealth
        )
    );
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION update_gang_financials(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_gang_financials(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_gang_financials(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
