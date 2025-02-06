
DECLARE
    fighter_data RECORD;
    advancement_data RECORD;
    current_level INTEGER;
BEGIN
    -- Get current level for this advancement type
    SELECT COUNT(*) INTO current_level
    FROM fighter_stat_changes
    WHERE fighter_id = p_fighter_id
    AND stat_change_id = p_advancement_id;

    -- Insert the new advancement with the next level
    INSERT INTO fighter_stat_changes (
        fighter_id,
        stat_change_id,
        level,
        xp_spent,
        credits_increase,
        weapon_skill_change,
        ballistic_skill_change,
        strength_change,
        toughness_change,
        wounds_change,
        initiative_change,
        attacks_change,
        leadership_change,
        cool_change,
        willpower_change,
        intelligence_change,
        movement_change
    )
    SELECT
        p_fighter_id,
        p_advancement_id,
        current_level + 1,
        sc.xp_cost,
        sc.credits_increase,
        sc.weapon_skill_change,
        sc.ballistic_skill_change,
        sc.strength_change,
        sc.toughness_change,
        sc.wounds_change,
        sc.initiative_change,
        sc.attacks_change,
        sc.leadership_change,
        sc.cool_change,
        sc.willpower_change,
        sc.intelligence_change,
        sc.movement_change
    FROM stat_changes sc
    WHERE sc.id = p_advancement_id
    RETURNING jsonb_build_object(
        'success', true,
        'new_level', current_level + 1,
        'advancement_id', p_advancement_id
    ) INTO STRICT advancement_data;

    RETURN advancement_data;
END;
