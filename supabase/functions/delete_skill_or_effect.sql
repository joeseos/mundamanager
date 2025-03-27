DROP FUNCTION IF EXISTS delete_skill_or_effect(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION delete_skill_or_effect(
    input_fighter_id UUID,
    fighter_skill_id UUID DEFAULT NULL,
    fighter_effect_id UUID DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT, refunded_xp INTEGER) AS $$
DECLARE
    xp_to_refund INTEGER := 0;
    fighter_exists BOOLEAN;
    effect_id UUID;
BEGIN
    -- Check if fighter exists
    -- RLS policies will ensure we only see fighters the user has access to
    SELECT EXISTS(SELECT 1 FROM fighters WHERE id = input_fighter_id) INTO fighter_exists;
    
    IF NOT fighter_exists THEN
        RETURN QUERY SELECT FALSE, 'Fighter not found', 0;
        RETURN;
    END IF;

    -- Validate input parameters
    IF fighter_skill_id IS NULL AND fighter_effect_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Either fighter_skill_id or fighter_effect_id must be provided', 0;
        RETURN;
    END IF;
    
    IF fighter_skill_id IS NOT NULL AND fighter_effect_id IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Only one of fighter_skill_id or fighter_effect_id should be provided', 0;
        RETURN;
    END IF;

    -- Handle skill deletion
    IF fighter_skill_id IS NOT NULL THEN
        -- Check if skill exists for this fighter
        IF NOT EXISTS(SELECT 1 FROM fighter_skills WHERE fighter_id = input_fighter_id AND id = fighter_skill_id) THEN
            RETURN QUERY SELECT FALSE, 'Skill not found for this fighter', 0;
            RETURN;
        END IF;
        
        -- Get the XP cost to refund
        SELECT COALESCE(fs.xp_cost, 0) INTO xp_to_refund
        FROM fighter_skills fs
        WHERE fs.id = fighter_skill_id AND fs.fighter_id = input_fighter_id;
        
        -- Delete the skill
        DELETE FROM fighter_skills
        WHERE id = fighter_skill_id AND fighter_id = input_fighter_id;
        
        -- Update fighter's XP
        UPDATE fighters
        SET xp = xp + xp_to_refund
        WHERE id = input_fighter_id;
        
        RETURN QUERY SELECT TRUE, 'Skill deleted and XP refunded', xp_to_refund;
    
    -- Handle effect deletion
    ELSIF fighter_effect_id IS NOT NULL THEN
        -- Assign the effect_id to a local variable to avoid ambiguity
        effect_id := fighter_effect_id;
        
        -- Check if effect exists for this fighter
        IF NOT EXISTS(SELECT 1 FROM fighter_effects WHERE fighter_id = input_fighter_id AND id = effect_id) THEN
            RETURN QUERY SELECT FALSE, 'Effect not found for this fighter', 0;
            RETURN;
        END IF;
        
        -- Get the XP cost to refund from the type_specific_data JSON
        SELECT 
            COALESCE(
                (CASE 
                    WHEN fe.type_specific_data->>'xp_cost' IS NOT NULL THEN 
                        (fe.type_specific_data->>'xp_cost')::integer
                    ELSE 0
                END),
                0
            ) INTO xp_to_refund
        FROM fighter_effects fe
        WHERE fe.id = effect_id AND fe.fighter_id = input_fighter_id;
        
        -- Delete the effect (cascading delete will handle related modifiers)
        DELETE FROM fighter_effects
        WHERE id = effect_id AND fighter_id = input_fighter_id;
        
        -- Update fighter's XP
        UPDATE fighters
        SET xp = xp + xp_to_refund
        WHERE id = input_fighter_id;
        
        RETURN QUERY SELECT TRUE, 'Effect deleted and XP refunded', xp_to_refund;
    END IF;
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, auth;

COMMENT ON FUNCTION delete_skill_or_effect(UUID, UUID, UUID) IS 
'Deletes a skill or effect for a fighter and refunds the XP cost back to the fighter.
Row-Level Security (RLS) policies handle authorization through auth.uid().
Note: Cascade deletion is configured to automatically remove related fighter_effect_modifiers.
Parameters:
- input_fighter_id: UUID of the fighter
- fighter_skill_id: UUID of the skill to delete (pass NULL if deleting an effect)
- fighter_effect_id: UUID of the effect to delete (pass NULL if deleting a skill)
Returns:
- success: Boolean indicating whether the operation was successful
- message: Text message describing the result
- refunded_xp: Integer amount of XP refunded to the fighter';

REVOKE ALL ON FUNCTION delete_skill_or_effect(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_skill_or_effect(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_skill_or_effect(UUID, UUID, UUID) TO service_role;