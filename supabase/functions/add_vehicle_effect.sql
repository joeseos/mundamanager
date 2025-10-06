-- Drop the old function first (required if changing return type)
DROP FUNCTION IF EXISTS add_vehicle_effect(UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION add_vehicle_effect(
    in_vehicle_id UUID,
    in_fighter_effect_type_id UUID,
    in_user_id UUID,
    in_fighter_effect_category_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_effect_id UUID;
    effect_type_record RECORD;
    modifier_record RECORD;
    v_is_admin BOOLEAN;
    v_user_has_access BOOLEAN;
    v_gang_id UUID;
    v_category_id UUID;
BEGIN
    -- Validate inputs
    IF in_vehicle_id IS NULL THEN
        RAISE EXCEPTION 'vehicle_id must be provided';
    END IF;
    IF in_fighter_effect_type_id IS NULL THEN
        RAISE EXCEPTION 'fighter_effect_type_id must be provided';
    END IF;
    IF in_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id must be provided';
    END IF;

    -- Set user context for is_admin check
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);

    -- Admin check
    SELECT private.is_admin() INTO v_is_admin;

    -- Authorize via vehicle.gang_id
    SELECT gang_id INTO v_gang_id
    FROM vehicles
    WHERE id = in_vehicle_id;

    IF v_gang_id IS NULL THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;

    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1 FROM gangs WHERE id = v_gang_id AND user_id = in_user_id
        ) OR EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            WHERE cg.gang_id = v_gang_id AND private.is_arb(cg.campaign_id)
        ) INTO v_user_has_access;

        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to add effects to this vehicle';
        END IF;
    END IF;

    -- Get effect type
    SELECT * INTO effect_type_record
    FROM fighter_effect_types
    WHERE id = in_fighter_effect_type_id;

    IF effect_type_record.id IS NULL THEN
        RAISE EXCEPTION 'The provided fighter effect type ID does not exist';
    END IF;

    -- Determine category
    IF in_fighter_effect_category_id IS NULL THEN
        v_category_id := effect_type_record.fighter_effect_category_id;
    ELSE
        v_category_id := in_fighter_effect_category_id;
        IF effect_type_record.fighter_effect_category_id != v_category_id THEN
            RAISE EXCEPTION 'The provided fighter effect type does not belong to the specified category';
        END IF;
    END IF;

    -- Insert effect linked only to vehicle_id (fighter_id = NULL)
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        user_id,
        vehicle_id
    )
    VALUES (
        NULL,
        in_fighter_effect_type_id,
        effect_type_record.effect_name,
        effect_type_record.type_specific_data,
        in_user_id,
        in_vehicle_id
    )
    RETURNING id INTO new_effect_id;

    -- Insert default modifiers
    FOR modifier_record IN
        SELECT * FROM fighter_effect_type_modifiers
        WHERE fighter_effect_type_id = in_fighter_effect_type_id
    LOOP
        INSERT INTO fighter_effect_modifiers (
            fighter_effect_id,
            stat_name,
            numeric_value
        )
        VALUES (
            new_effect_id,
            modifier_record.stat_name,
            modifier_record.default_numeric_value
        );
    END LOOP;

    -- Return created effect
    RETURN (
      SELECT json_build_object(
        'id', fe.id,
        'created_at', fe.created_at,
        'fighter_id', fe.fighter_id,   -- will be null
        'vehicle_id', fe.vehicle_id,
        'user_id', fe.user_id,
        'effect_name', fe.effect_name,
        'effect_type', (
            SELECT json_build_object(
                'id', fet.id,
                'effect_name', fet.effect_name,
                'category', (
                    SELECT json_build_object(
                        'id', fec.id,
                        'category_name', fec.category_name
                    )
                    FROM fighter_effect_categories fec
                    WHERE fec.id = fet.fighter_effect_category_id
                )
            )
            FROM fighter_effect_types fet
            WHERE fet.id = fe.fighter_effect_type_id
        ),
        'type_specific_data', fe.type_specific_data,
        'fighter_effect_modifiers', (
            SELECT json_agg(
                json_build_object(
                    'id', fem.id,
                    'stat_name', fem.stat_name,
                    'numeric_value', fem.numeric_value
                )
            )
            FROM fighter_effect_modifiers fem
            WHERE fem.fighter_effect_id = fe.id
        )
      )
      FROM fighter_effects fe
      WHERE fe.id = new_effect_id
    );
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private;

REVOKE ALL ON FUNCTION add_vehicle_effect(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_vehicle_effect(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_vehicle_effect(UUID, UUID, UUID, UUID) TO service_role;