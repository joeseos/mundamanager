-- Drop all versions of the function to prevent overload conflicts
DROP FUNCTION IF EXISTS add_fighter_injury(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS add_fighter_injury(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS add_fighter_injury(UUID, UUID, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS add_fighter_injury(UUID, UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.add_fighter_injury(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.add_fighter_injury(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.add_fighter_injury(UUID, UUID, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.add_fighter_injury(UUID, UUID, UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION add_fighter_injury(
    in_fighter_id UUID,
    in_injury_type_id UUID,
    in_user_id UUID,
    in_target_equipment_id UUID DEFAULT NULL
)
RETURNS TABLE (result JSON) AS $$
DECLARE
    new_effect_id UUID;
    effect_type_record RECORD;
    modifier_record RECORD;
    skill_id_val UUID;
    new_fighter_skill_id UUID;
    new_fighter_effect_skill_id UUID;
    v_is_admin BOOLEAN;
    v_user_has_access BOOLEAN;
    v_gang_id UUID;
    injury_count INTEGER;
    is_partially_deafened BOOLEAN;
BEGIN
    -- Set user context for is_admin check
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);
    
    -- Check if user is an admin
    SELECT private.is_admin() INTO v_is_admin;
    
    -- Get the gang_id for the fighter
    SELECT gang_id INTO v_gang_id
    FROM fighters
    WHERE id = in_fighter_id;
    
    -- If not admin, check if user owns the gang OR is an arbitrator for a campaign containing the gang
    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1
            FROM gangs
            WHERE id = v_gang_id AND user_id = in_user_id
        ) OR EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            WHERE cg.gang_id = v_gang_id AND private.is_arb(cg.campaign_id)
        ) INTO v_user_has_access;

        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to add effects to this fighter';
        END IF;
    END IF;
    
    -- Get the effect type details from fighter_effect_types
    SELECT * INTO effect_type_record
    FROM fighter_effect_types
    WHERE id = in_injury_type_id;
    
    -- Validate that the effect type exists
    IF effect_type_record.id IS NULL THEN
        RAISE EXCEPTION 'The provided fighter effect type ID does not exist';
    END IF;
    
    -- Validate that the effect type belongs to the injuries or rig-glitches category
    IF effect_type_record.fighter_effect_category_id NOT IN (
        SELECT id FROM fighter_effect_categories WHERE category_name IN ('injuries', 'rig-glitches')
    ) THEN
        RAISE EXCEPTION 'The provided fighter effect type is not an injury or rig glitch';
    END IF;
    
    -- Check if this is "Partially Deafened"
    is_partially_deafened := effect_type_record.effect_name = 'Partially Deafened';
    
    -- Count existing instances of this injury for the fighter
    SELECT COUNT(*) INTO injury_count
    FROM fighter_effects
    WHERE fighter_id = in_fighter_id 
    AND fighter_effect_type_id = in_injury_type_id;
    
    -- Insert the new fighter effect with user_id
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        user_id,
        fighter_equipment_id
    )
    VALUES (
        in_fighter_id,
        in_injury_type_id,
        effect_type_record.effect_name,
        effect_type_record.type_specific_data,
        in_user_id,
        in_target_equipment_id
    )
    RETURNING id INTO new_effect_id;
    
    -- Create the modifiers associated with this effect type
    -- For "Partially Deafened", only add the leadership modifier if this isn't the first instance
    FOR modifier_record IN 
        SELECT * FROM fighter_effect_type_modifiers
        WHERE fighter_effect_type_id = in_injury_type_id
    LOOP
        -- Skip leadership modifier for first instance of Partially Deafened
        IF NOT (is_partially_deafened AND injury_count = 0 AND modifier_record.stat_name = 'leadership') THEN
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
        END IF;
    END LOOP;
    
    -- Check if there's a skill_id in the type_specific_data and add the skill relation
    IF effect_type_record.type_specific_data->>'skill_id' IS NOT NULL THEN
        skill_id_val := (effect_type_record.type_specific_data->>'skill_id')::UUID;
        
        -- Add the skill to fighter_skills if it doesn't already exist
        INSERT INTO fighter_skills (
            fighter_id,
            skill_id,
            user_id,
            fighter_effect_skill_id
        )
        SELECT 
            in_fighter_id,
            skill_id_val,
            in_user_id,
            NULL  -- Initially NULL, will update after creating relation
        WHERE 
            NOT EXISTS (
                SELECT 1 FROM fighter_skills 
                WHERE fighter_id = in_fighter_id AND skill_id = skill_id_val
            )
        RETURNING id INTO new_fighter_skill_id;
        
        -- If the skill already exists, get its ID
        IF new_fighter_skill_id IS NULL THEN
            SELECT id INTO new_fighter_skill_id 
            FROM fighter_skills
            WHERE fighter_id = in_fighter_id AND skill_id = skill_id_val;
        END IF;
        
        -- Create the relation in fighter_effect_skills
        IF new_fighter_skill_id IS NOT NULL THEN
            INSERT INTO fighter_effect_skills (
                fighter_effect_id,
                fighter_skill_id
            )
            VALUES (
                new_effect_id,
                new_fighter_skill_id
            )
            RETURNING id INTO new_fighter_effect_skill_id;
            
            -- Update the fighter_skills record with the relation ID
            UPDATE fighter_skills
            SET fighter_effect_skill_id = new_fighter_effect_skill_id
            WHERE id = new_fighter_skill_id;
        END IF;
    END IF;
    
    -- Return the newly created effect
    RETURN QUERY
    SELECT json_build_object(
        'id', fe.id,
        'created_at', fe.created_at,
        'fighter_id', fe.fighter_id,
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
        'modifiers', (
            SELECT json_agg(
                json_build_object(
                    'id', fem.id,
                    'stat_name', fem.stat_name,
                    'numeric_value', fem.numeric_value
                )
            )
            FROM fighter_effect_modifiers fem
            WHERE fem.fighter_effect_id = fe.id
        ),
        'related_skills', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'fighter_skill_id', fs.id,
                    'skill_id', fs.skill_id,
                    'fighter_effect_skill_id', fs.fighter_effect_skill_id
                )
            ), '[]'::json)
            FROM fighter_effect_skills fes
            JOIN fighter_skills fs ON fes.fighter_skill_id = fs.id
            WHERE fes.fighter_effect_id = fe.id
        )
    ) as result
    FROM fighter_effects fe
    WHERE fe.id = new_effect_id;
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION add_fighter_injury(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_fighter_injury(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_fighter_injury(UUID, UUID, UUID, UUID) TO service_role;