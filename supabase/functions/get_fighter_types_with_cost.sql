
begin
    return query
    select
        ft.id,
        ft.fighter_type,
        fc.class_name,  -- Fixed to use class_name instead of fighter_class
        ft.gang_type,
        ft.cost,
        ft.gang_type_id,
        ft.special_rules::text[],
        ft.movement,
        ft.weapon_skill,
        ft.ballistic_skill,
        ft.strength,
        ft.toughness,
        ft.wounds,
        ft.initiative,
        ft.leadership,
        ft.cool,
        ft.willpower,
        ft.intelligence,
        ft.attacks,
        (
            select jsonb_agg(
                jsonb_build_object(
                    'id', e.id,
                    'equipment_name', e.equipment_name,
                    'equipment_type', e.equipment_type,
                    'equipment_category', e.equipment_category,
                    'cost', 0,  -- Always show 0 for default equipment
                    'availability', e.availability,
                    'faction', e.faction
                )
            )
            from fighter_defaults fd
            join equipment e on e.id = fd.equipment_id
            where fd.fighter_type_id = ft.id
        ) as default_equipment,
        ft.cost as total_cost  -- Total cost is just the fighter's cost since default equipment is free
    from fighter_types ft
    join fighter_classes fc on fc.id = ft.fighter_class_id
    where ft.gang_type_id = p_gang_type_id;
end;
