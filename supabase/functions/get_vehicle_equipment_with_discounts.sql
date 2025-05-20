create or replace function get_vehicle_equipment_with_discounts(
    "gang_type_id" uuid default null,
    "equipment_category" text default null,
    "fighter_type_id" uuid default null
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
    fighter_type_equipment boolean
)
language sql
security definer
stable
as $$
    select 
        e.id,
        e.equipment_name,
        e.trading_post_category,
        e.availability,
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
            when fte.fighter_type_id is not null then true
            else false
        end as fighter_type_equipment
    from equipment e
    left join equipment_discounts ed on e.id = ed.equipment_id 
        and (
            (ed.gang_type_id = get_vehicle_equipment_with_discounts.gang_type_id and ed.fighter_type_id is null)
            or 
            (ed.fighter_type_id = get_vehicle_equipment_with_discounts.fighter_type_id and ed.gang_type_id is null)
        )
    left join fighter_type_equipment fte on e.id = fte.equipment_id
        and (get_vehicle_equipment_with_discounts.fighter_type_id is null 
             or fte.fighter_type_id = get_vehicle_equipment_with_discounts.fighter_type_id)
    where 
        coalesce(e.core_equipment, false) = false
        and
        (get_vehicle_equipment_with_discounts.equipment_category is null 
         or trim(both from e.equipment_category) = trim(both from get_vehicle_equipment_with_discounts.equipment_category))
        and
        (
            get_vehicle_equipment_with_discounts.gang_type_id is null
            or ed.gang_type_id = get_vehicle_equipment_with_discounts.gang_type_id
            or ed.gang_type_id is null
        )
        and e.equipment_category in ('Vehicle Upgrades', 'Vehicle Wargear', 'Vehicle Weapons');
$$;