DROP FUNCTION IF EXISTS add_fighter_effect(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION add_fighter_effect(
    input_fighter_id UUID,
    input_fighter_effect_category_id UUID,
    input_fighter_effect_type_id UUID
)
RETURNS TABLE (result JSON) AS $$
DECLARE
    new_effect_id UUID;
    effect_type_record RECORD;
    modifier_record RECORD;
    current_user_id UUID;
    skill_id_val UUID;
    new_fighter_skill_id UUID;
    new_fighter_effect_skill_id UUID;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    
    -- Get the effect type details from fighter_effect_types
    SELECT * INTO effect_type_record
    FROM fighter_effect_types
    WHERE id = input_fighter_effect_type_id;
    
    -- Validate that the effect type exists
    IF effect_type_record.id IS NULL THEN
        RAISE EXCEPTION 'The provided fighter effect type ID does not exist';
    END IF;
    
    -- Validate that the effect type belongs to the specified category
    IF effect_type_record.fighter_effect_category_id != input_fighter_effect_category_id THEN
        RAISE EXCEPTION 'The provided fighter effect type does not belong to the specified category';
    END IF;
    
    -- Insert the new fighter effect with user_id
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        user_id
    )
    VALUES (
        input_fighter_id,
        input_fighter_effect_type_id,
        effect_type_record.effect_name,
        effect_type_record.type_specific_data,
        current_user_id
    )
    RETURNING id INTO new_effect_id;
    
    -- Create the modifiers associated with this effect type
    FOR modifier_record IN 
        SELECT * FROM fighter_effect_type_modifiers
        WHERE fighter_effect_type_id = input_fighter_effect_type_id
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
    
    -- Check if there's a skill_id in the type_specific_data and add the skill relation
    IF effect_type_record.type_specific_data->>'skill_id' IS NOT NULL THEN
        skill_id_val := (effect_type_record.type_specific_data->>'skill_id')::UUID;
        
        -- Add the skill to fighter_skills if it doesn't already exist
        INSERT INTO fighter_skills (
            fighter_id,
            skill_id,
            user_id,
            fighter_effect_skill_id  -- Added fighter_effect_skill_id field
        )
        SELECT 
            input_fighter_id,
            skill_id_val,
            current_user_id,
            NULL  -- Initially NULL, will update after creating relation
        WHERE 
            NOT EXISTS (
                SELECT 1 FROM fighter_skills 
                WHERE fighter_id = input_fighter_id AND skill_id = skill_id_val
            )
        RETURNING id INTO new_fighter_skill_id;
        
        -- If the skill already exists, get its ID
        IF new_fighter_skill_id IS NULL THEN
            SELECT id INTO new_fighter_skill_id 
            FROM fighter_skills
            WHERE fighter_id = input_fighter_id AND skill_id = skill_id_val;
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
VOLATILE
SET search_path = public;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION add_fighter_effect(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_fighter_effect(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_fighter_effect(UUID, UUID, UUID) TO service_role;