-- Drop all versions of the old function (with different parameter combinations)
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean, boolean);

-- Create the new function with all parameters
create or replace function get_equipment_with_discounts(
    "gang_type_id" uuid default null,
    "equipment_category" text default null,
    "fighter_type_id" uuid default null,
    "fighter_type_equipment" boolean default null,
    "equipment_tradingpost" boolean default null
)
returns table (
    id uuid,
    equipment_name text,
    trading_post_category text,
    availability text,
    base_cost numeric,
    discounted_cost numeric,
    adjusted_cost numeric,
    equipment_category text,
    equipment_type text,
    created_at timestamptz,
    fighter_type_equipment boolean,
    equipment_tradingpost boolean,
    is_custom boolean
)
language sql
security definer
stable
as $$
    -- Regular equipment
    select DISTINCT
        e.id,
        e.equipment_name,
        e.trading_post_category,
        -- Check for gang-specific availability, default to equipment table's availability if none found
        COALESCE(ea.availability, e.availability) as availability,
        e.cost::numeric as base_cost,
        case
            when ed.discount is not null 
            then e.cost::numeric - ed.discount::numeric
            else e.cost::numeric
        end as discounted_cost,
        case
            when ed.adjusted_cost is not null
            then ed.adjusted_cost::numeric
            else e.cost::numeric
        end as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        case
            when fte.fighter_type_id is not null or fte.vehicle_type_id is not null then true
            else false
        end as fighter_type_equipment,
        case
            -- Gang-level access: only check gang's trading post type
            when get_equipment_with_discounts.fighter_type_id is null then 
                exists (
                    select 1
                    from gang_types gt, trading_post_equipment tpe
                    where gt.gang_type_id = get_equipment_with_discounts.gang_type_id
                    and tpe.trading_post_type_id = gt.trading_post_type_id
                    and tpe.equipment_id = e.id
                )
            -- Fighter-level access: check BOTH fighter's trading post AND gang's trading post
            else (
                exists (
                    select 1
                    from fighter_equipment_tradingpost fet,
                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                    where fet.fighter_type_id = get_equipment_with_discounts.fighter_type_id
                    and equip_id = e.id::text
                ) OR exists (
                    select 1
                    from gang_types gt, trading_post_equipment tpe
                    where gt.gang_type_id = get_equipment_with_discounts.gang_type_id
                    and tpe.trading_post_type_id = gt.trading_post_type_id
                    and tpe.equipment_id = e.id
                )
            )
        end as equipment_tradingpost,
        false as is_custom
    from equipment e
    -- Join with equipment_availability to get gang-specific availability
    left join equipment_availability ea on e.id = ea.equipment_id 
        and ea.gang_type_id = get_equipment_with_discounts.gang_type_id
    left join equipment_discounts ed on e.id = ed.equipment_id 
        and (
            -- Gang-level access: only gang-level discounts
            (get_equipment_with_discounts.fighter_type_id is null 
             and ed.gang_type_id = get_equipment_with_discounts.gang_type_id 
             and ed.fighter_type_id is null)
            or 
            -- Fighter-level access: both gang-level and fighter-specific discounts
            (get_equipment_with_discounts.fighter_type_id is not null 
             and (
                 (ed.gang_type_id = get_equipment_with_discounts.gang_type_id and ed.fighter_type_id is null)
                 or 
                 (ed.fighter_type_id = get_equipment_with_discounts.fighter_type_id)
             ))
        )
    left join fighter_type_equipment fte on e.id = fte.equipment_id
        and (get_equipment_with_discounts.fighter_type_id is null 
             or fte.fighter_type_id = get_equipment_with_discounts.fighter_type_id
             or fte.vehicle_type_id = get_equipment_with_discounts.fighter_type_id)
    where 
        (
            coalesce(e.core_equipment, false) = false
            OR 
            (
                e.core_equipment = true 
                AND (fte.fighter_type_id is not null OR get_equipment_with_discounts.fighter_type_id is null)
            )
        )
        and
        (get_equipment_with_discounts.equipment_category is null 
         or trim(both from e.equipment_category) = trim(both from get_equipment_with_discounts.equipment_category))
        and
        (
            get_equipment_with_discounts.gang_type_id is null
            or ed.gang_type_id = get_equipment_with_discounts.gang_type_id
            or ed.gang_type_id is null
        )
        and
        (
            get_equipment_with_discounts.fighter_type_id is null
            or ed.fighter_type_id = get_equipment_with_discounts.fighter_type_id
            or ed.fighter_type_id is null
        )
        and
        (
            get_equipment_with_discounts.fighter_type_equipment is null
            or (
                case
                    when fte.fighter_type_id is not null or fte.vehicle_type_id is not null then true
                    else false
                end
            ) = get_equipment_with_discounts.fighter_type_equipment
        )
        and
        (
            get_equipment_with_discounts.equipment_tradingpost is null
            or (
                case
                    -- Gang-level access: only check gang's trading post type
                    when get_equipment_with_discounts.fighter_type_id is null then 
                        exists (
                            select 1
                            from gang_types gt, trading_post_equipment tpe
                            where gt.gang_type_id = get_equipment_with_discounts.gang_type_id
                            and tpe.trading_post_type_id = gt.trading_post_type_id
                            and tpe.equipment_id = e.id
                        )
                    -- Fighter-level access: check BOTH fighter's trading post AND gang's trading post
                    else (
                        exists (
                            select 1
                            from fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            where fet.fighter_type_id = get_equipment_with_discounts.fighter_type_id
                            and equip_id = e.id::text
                        ) OR exists (
                            select 1
                            from gang_types gt, trading_post_equipment tpe
                            where gt.gang_type_id = get_equipment_with_discounts.gang_type_id
                            and tpe.trading_post_type_id = gt.trading_post_type_id
                            and tpe.equipment_id = e.id
                        )
                    )
                end
            ) = get_equipment_with_discounts.equipment_tradingpost
        )

    UNION ALL

    -- Custom equipment
    select 
        ce.id,
        ce.equipment_name,
        'Custom' as trading_post_category,
        ce.availability as availability,
        ce.cost::numeric as base_cost,
        ce.cost::numeric as discounted_cost, -- No discounts for custom equipment
        ce.cost::numeric as adjusted_cost,   -- No adjustments for custom equipment
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,      -- Custom equipment is available for fighters
        true as equipment_tradingpost,       -- Custom equipment is available in trading post
        true as is_custom
    from custom_equipment ce
    where 
        ce.user_id = auth.uid() -- Only show user's own custom equipment
        and (get_equipment_with_discounts.equipment_category is null 
         or trim(both from ce.equipment_category) = trim(both from get_equipment_with_discounts.equipment_category))
$$;