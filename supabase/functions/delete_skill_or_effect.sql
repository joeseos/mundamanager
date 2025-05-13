DROP FUNCTION IF EXISTS delete_skill_or_effect(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION delete_skill_or_effect(
    input_fighter_id UUID,
    fighter_skill_id UUID DEFAULT NULL,
    fighter_effect_id UUID DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT, refunded_xp INTEGER, free_skill BOOLEAN) AS $$
DECLARE
    xp_to_refund INTEGER := 0;
    item_count INTEGER;
    item_fighter_id UUID;
    skill_count INTEGER;
    deleted_skill_id UUID;
    fighter_type_id_var UUID;
    default_skill_count INTEGER;
    fighter_type_free_skill BOOLEAN;
    is_free_skill BOOLEAN := FALSE;
BEGIN
    -- Input validation
    IF fighter_skill_id IS NULL AND fighter_effect_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Either fighter_skill_id or fighter_effect_id must be provided', 0, FALSE;
        RETURN;
    END IF;
    
    IF fighter_skill_id IS NOT NULL AND fighter_effect_id IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Only one of fighter_skill_id or fighter_effect_id should be provided', 0, FALSE;
        RETURN;
    END IF;

    -- Process skill deletion request
    IF fighter_skill_id IS NOT NULL THEN
        -- Check if skill exists and get fighter_id and skill_id
        SELECT fighter_id, skill_id INTO item_fighter_id, deleted_skill_id
        FROM fighter_skills
        WHERE id = fighter_skill_id;
        
        IF item_fighter_id IS NULL THEN
            RETURN QUERY SELECT FALSE, 'Skill not found', 0, FALSE;
            RETURN;
        END IF;
        
        -- Get fighter_type_id for the fighter
        SELECT fighter_type_id INTO fighter_type_id_var
        FROM fighters
        WHERE id = item_fighter_id;
        
        -- Get XP to refund
        SELECT COALESCE(xp_cost, 0) INTO xp_to_refund
        FROM fighter_skills
        WHERE id = fighter_skill_id;
        
        -- Delete the skill
        DELETE FROM fighter_skills
        WHERE id = fighter_skill_id;
        
        GET DIAGNOSTICS item_count = ROW_COUNT;
        
        IF item_count = 0 THEN
            RETURN QUERY SELECT FALSE, 'Failed to delete skill - permission denied', 0, FALSE;
            RETURN;
        END IF;
        
        -- Count the number of default skills for this fighter type
        SELECT COUNT(*) INTO default_skill_count
        FROM fighter_defaults
        WHERE fighter_type_id = fighter_type_id_var 
        AND skill_id IS NOT NULL;  -- Only count skill entries, not equipment
        
        -- Check remaining skills count for this fighter
        SELECT COUNT(*) INTO skill_count
        FROM fighter_skills
        WHERE fighter_id = item_fighter_id;
        
        -- Check if fighter_type has free_skill = true
        SELECT ft.free_skill INTO fighter_type_free_skill
        FROM fighter_types ft
        WHERE ft.id = fighter_type_id_var;
        
        -- Determine if free_skill should be true
        -- Key logic: If the fighter has ONLY their default skills (or fewer),
        -- AND the deleted skill was NOT a default skill, then free_skill should be true
        is_free_skill := (fighter_type_free_skill = true AND 
                        skill_count <= default_skill_count AND
                        NOT EXISTS (
                            SELECT 1 
                            FROM fighter_defaults 
                            WHERE fighter_type_id = fighter_type_id_var AND 
                                  skill_id = deleted_skill_id
                        ));
        
        -- Update fighter's XP and free_skill
        UPDATE fighters f
        SET xp = f.xp + xp_to_refund,
            free_skill = is_free_skill
        WHERE f.id = item_fighter_id;
        
        RETURN QUERY SELECT TRUE, 'Skill deleted and XP refunded', xp_to_refund, is_free_skill;
    
    -- Handle effect deletion
    ELSIF fighter_effect_id IS NOT NULL THEN
        -- Check if effect exists and get fighter_id
        SELECT fighter_id INTO item_fighter_id
        FROM fighter_effects
        WHERE id = fighter_effect_id;
        
        IF item_fighter_id IS NULL THEN
            RETURN QUERY SELECT FALSE, 'Effect not found', 0, FALSE;
            RETURN;
        END IF;
        
        -- Get current free_skill value for fighter
        SELECT f.free_skill INTO is_free_skill
        FROM fighters f
        WHERE f.id = item_fighter_id;
        
        -- Get XP to refund
        SELECT 
            COALESCE(
                (CASE 
                    WHEN type_specific_data->>'xp_cost' IS NOT NULL THEN 
                        (type_specific_data->>'xp_cost')::integer
                    ELSE 0
                END),
                0
            ) INTO xp_to_refund
        FROM fighter_effects
        WHERE id = fighter_effect_id;
        
        -- Delete the effect
        DELETE FROM fighter_effects
        WHERE id = fighter_effect_id;
        
        GET DIAGNOSTICS item_count = ROW_COUNT;
        
        IF item_count = 0 THEN
            RETURN QUERY SELECT FALSE, 'Failed to delete effect - permission denied', 0, FALSE;
            RETURN;
        END IF;
        
        -- Update fighter's XP
        UPDATE fighters f
        SET xp = f.xp + xp_to_refund
        WHERE f.id = item_fighter_id;
        
        RETURN QUERY SELECT TRUE, 'Effect deleted and XP refunded', xp_to_refund, is_free_skill;
    END IF;
END;
$$ 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth;