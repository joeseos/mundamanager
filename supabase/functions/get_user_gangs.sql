CREATE OR REPLACE FUNCTION public.get_user_gangs(user_id uuid)
 RETURNS TABLE(id uuid, name text, gang_type text, gang_type_id uuid, image_url text, credits numeric, reputation numeric, meat numeric, exploration_points numeric, rating numeric, created_at timestamp with time zone, last_updated timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;
    RETURN QUERY
    WITH fighter_costs AS (
        SELECT 
            f.gang_id,
            f.id AS fighter_id,
            (f.credits + COALESCE(f.cost_adjustment, 0)) AS base_cost,
            COALESCE(
                (SELECT SUM(fe.purchase_cost)
                FROM fighter_equipment fe
                WHERE fe.fighter_id = f.id),
                0
            ) AS equipment_cost,
            COALESCE(
                (SELECT SUM(fc.credits_increase)
                FROM fighter_characteristics fc
                WHERE fc.fighter_id = f.id),
                0
            ) AS advancement_cost,
            COALESCE(
                (SELECT SUM(v.cost + COALESCE(
                    (SELECT SUM(fe.purchase_cost)
                    FROM fighter_equipment fe
                    WHERE fe.vehicle_id = v.id),
                    0
                ))
                FROM vehicles v
                WHERE v.fighter_id = f.id),
                0
            ) AS vehicle_cost
        FROM fighters f
        WHERE f.gang_id IN (SELECT g.id FROM gangs g WHERE g.user_id = get_user_gangs.user_id)
    ),
    gang_ratings AS (
        SELECT 
            gang_id,
            SUM(base_cost + equipment_cost + advancement_cost + vehicle_cost) AS total_rating
        FROM fighter_costs
        GROUP BY gang_id
    )
    SELECT 
        g.id,
        g.name,
        g.gang_type,
        g.gang_type_id,
        gt.image_url,
        g.credits,
        g.reputation,
        g.meat,
        g.exploration_points,
        COALESCE(gr.total_rating, 0) as rating,
        g.created_at,
        g.last_updated
    FROM gangs g
    LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
    LEFT JOIN gang_ratings gr ON gr.gang_id = g.id
    WHERE g.user_id = get_user_gangs.user_id
    ORDER BY g.created_at DESC;
END;
$function$;