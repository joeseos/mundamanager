-- Drop existing function
DROP FUNCTION IF EXISTS public.add_fighter_advancement(UUID, UUID, INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.add_fighter_advancement(UUID, UUID, INTEGER, INTEGER);

-- Create function with proper XP cost handling
CREATE OR REPLACE FUNCTION public.add_fighter_advancement(
    p_fighter_effect_type_id UUID,
    p_fighter_id UUID,
    p_xp_cost INTEGER,
    p_credits_increase INTEGER
)
RETURNS JSONB AS $$
DECLARE
    fighter_exists BOOLEAN;
    has_enough_xp BOOLEAN;
    inserted_effect_id UUID;
    updated_fighter JSONB;
    v_effect_name TEXT;
    v_stat_name TEXT;
    times_increased INTEGER;
    v_type_specific_data JSONB;
    v_merged_type_data JSONB;
    v_modifier_id UUID;
    v_modifier_value INTEGER;
    v_raw_response TEXT;
    current_user_id UUID;
    v_fighter_owner_id UUID;
BEGIN
    -- Get the current user ID from auth context
    current_user_id := auth.uid();
    
    -- Validate user is authenticated
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required'
        );
    END IF;
    
    -- Check if fighter exists and belongs to the current user
    SELECT EXISTS (
        SELECT 1 FROM fighters 
        WHERE id = p_fighter_id
        AND user_id = current_user_id
    ) INTO fighter_exists;

    IF NOT fighter_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Fighter not found or access denied'
        );
    END IF;

    -- Get the fighter owner's user_id for the insert
    SELECT user_id INTO v_fighter_owner_id
    FROM fighters
    WHERE id = p_fighter_id;

    -- Check if fighter has enough XP
    SELECT (xp >= p_xp_cost) INTO has_enough_xp
    FROM fighters 
    WHERE id = p_fighter_id;

    IF NOT has_enough_xp THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient XP'
        );
    END IF;

    -- Get the effect type details
    SELECT effect_name, type_specific_data INTO v_effect_name, v_type_specific_data
    FROM fighter_effect_types
    WHERE id = p_fighter_effect_type_id;
    
    IF v_effect_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Effect type not found'
        );
    END IF;
    
    -- Determine stat name from effect name
    v_stat_name := LOWER(REPLACE(v_effect_name, ' ', '_'));

    -- Calculate times increased (count existing effects of this type for this fighter)
    SELECT COUNT(*) + 1 INTO times_increased
    FROM fighter_effects
    WHERE fighter_id = p_fighter_id 
    AND fighter_effect_type_id = p_fighter_effect_type_id;
    
    -- Preserve original type_specific_data but update with user values
    v_merged_type_data := v_type_specific_data || jsonb_build_object(
        'times_increased', times_increased,
        'xp_cost', p_xp_cost,
        'credits_increase', p_credits_increase
    );

    -- Insert the new advancement as a fighter effect with fighter owner's user_id
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        created_at,
        updated_at,
        user_id
    )
    VALUES (
        p_fighter_id,
        p_fighter_effect_type_id,
        v_effect_name,
        v_merged_type_data,
        NOW(),
        NOW(),
        v_fighter_owner_id
    )
    RETURNING id INTO inserted_effect_id;

    -- Get the template modifier ID and value
    SELECT id, default_numeric_value INTO v_modifier_id, v_modifier_value
    FROM fighter_effect_type_modifiers
    WHERE fighter_effect_type_id = p_fighter_effect_type_id
    AND stat_name = v_stat_name;
    
    -- Insert the modifier with the database value
    INSERT INTO fighter_effect_modifiers (
        fighter_effect_id,
        stat_name,
        numeric_value
    )
    VALUES (
        inserted_effect_id,
        v_stat_name,
        v_modifier_value
    );

    -- Update fighter's XP and get updated data
    UPDATE fighters
    SET 
        xp = xp - p_xp_cost,
        updated_at = NOW()
    WHERE id = p_fighter_id
    RETURNING jsonb_build_object(
        'id', id,
        'xp', xp
    ) INTO updated_fighter;
    
    -- Construct response as text to preserve exact value
    v_raw_response := '{' ||
        '"fighter_effect_id": "' || inserted_effect_id::TEXT || '",' ||
        '"fighter_effect_type_modifier_id": "' || v_modifier_id::TEXT || '",' ||
        '"effect_name": "' || v_effect_name || '",' ||
        '"stat_name": "' || v_stat_name || '",' ||
        '"xp_cost": ' || p_xp_cost || ',' ||
        '"fighter_id": "' || p_fighter_id::TEXT || '",' ||
        '"times_increased": ' || times_increased || ',' ||
        '"credits_increase": ' || p_credits_increase || ',' ||
        '"fighter_effect_type_id": "' || p_fighter_effect_type_id::TEXT || '",' ||
        '"default_numeric_value": ' || v_modifier_value ||
    '}';

    RETURN jsonb_build_object(
        'success', true,
        'fighter', updated_fighter,
        'advancement', v_raw_response::jsonb
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set appropriate permissions
REVOKE ALL ON FUNCTION public.add_fighter_advancement(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_fighter_advancement(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_fighter_advancement(UUID, UUID, INTEGER, INTEGER) TO service_role;