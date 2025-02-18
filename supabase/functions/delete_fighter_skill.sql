DROP FUNCTION IF EXISTS public.delete_fighter_skill;

CREATE OR REPLACE FUNCTION public.delete_fighter_skill(
    fighter_skill_id UUID
)
RETURNS JSONB AS $$
DECLARE
    deleted_skill JSONB;
    fighter_id_var UUID;
    updated_fighter JSONB;
    skill_count INTEGER;
    fighter_type_free_skill BOOLEAN;
BEGIN
    -- Check if fighter_skill exists and get fighter_id
    SELECT id, fighter_id INTO fighter_skill_id, fighter_id_var
    FROM fighter_skills 
    WHERE id = fighter_skill_id;

    IF fighter_skill_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Fighter skill not found'
        );
    END IF;

    -- Delete the skill and store deleted data
    WITH deleted AS (
        DELETE FROM fighter_skills
        WHERE id = fighter_skill_id
        RETURNING 
            fighter_skills.id,
            fighter_skills.fighter_id,
            fighter_skills.skill_id,
            fighter_skills.credits_increase,
            fighter_skills.xp_cost,
            fighter_skills.is_advance
    )
    SELECT row_to_json(deleted)::jsonb INTO deleted_skill
    FROM deleted;

    -- Get remaining skills count for this fighter
    SELECT COUNT(*)
    INTO skill_count
    FROM fighter_skills
    WHERE fighter_id = fighter_id_var;

    -- Check if fighter_type has free_skill = true
    SELECT ft.free_skill 
    INTO fighter_type_free_skill
    FROM fighter_types ft
    JOIN fighters f ON f.fighter_type_id = ft.id
    WHERE f.id = fighter_id_var;

    -- Update fighter and handle free_skill logic
    WITH updated AS (
        UPDATE fighters
        SET 
            -- Set free_skill to TRUE only if:
            -- 1. fighter_type has free_skill = true
            -- 2. fighter has no remaining skills
            free_skill = CASE 
                WHEN fighter_type_free_skill = true AND skill_count = 0 THEN true
                ELSE fighters.free_skill
            END,
            updated_at = NOW()
        WHERE id = fighter_id_var
        RETURNING 
            fighters.id,
            fighters.xp,
            fighters.free_skill
    )
    SELECT row_to_json(updated)::jsonb INTO updated_fighter
    FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'fighter', updated_fighter,
        'deleted_skill', deleted_skill
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;