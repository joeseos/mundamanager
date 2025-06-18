CREATE OR REPLACE FUNCTION public.fighter_equipment_logs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    fighter_name TEXT;
    vehicle_name TEXT;
    equipment_name TEXT;
    new_gang_rating NUMERIC;
    test_gang_id UUID := 'f27cb215-b9c3-47ed-8cfa-f2219332266e';
    target_gang_id UUID;
    is_vehicle_equipment BOOLEAN := FALSE;
BEGIN
    -- Determine if this is fighter equipment or vehicle equipment
    IF TG_OP = 'INSERT' THEN
        IF NEW.vehicle_id IS NOT NULL THEN
            -- Vehicle equipment (prioritize vehicle_id when present)
            is_vehicle_equipment := TRUE;
            SELECT v.gang_id, v.vehicle_name INTO target_gang_id, vehicle_name
            FROM vehicles v WHERE v.id = NEW.vehicle_id;
        ELSIF NEW.fighter_id IS NOT NULL THEN
            -- Fighter equipment
            SELECT f.gang_id, f.fighter_name INTO target_gang_id, fighter_name
            FROM fighters f WHERE f.id = NEW.fighter_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.vehicle_id IS NOT NULL THEN
            -- Vehicle equipment (prioritize vehicle_id when present)
            is_vehicle_equipment := TRUE;
            SELECT v.gang_id, v.vehicle_name INTO target_gang_id, vehicle_name
            FROM vehicles v WHERE v.id = OLD.vehicle_id;
        ELSIF OLD.fighter_id IS NOT NULL THEN
            -- Fighter equipment
            SELECT f.gang_id, f.fighter_name INTO target_gang_id, fighter_name
            FROM fighters f WHERE f.id = OLD.fighter_id;
        END IF;
    END IF;

    -- Only log for equipment belonging to the specific test gang
    IF target_gang_id != test_gang_id THEN
        IF TG_OP = 'INSERT' THEN
            RETURN NEW;
        ELSE
            RETURN OLD;
        END IF;
    END IF;

    -- Log equipment purchase
    IF TG_OP = 'INSERT' THEN
        -- Get equipment name
        IF NEW.equipment_id IS NOT NULL THEN
            SELECT e.equipment_name INTO equipment_name 
            FROM equipment e WHERE e.id = NEW.equipment_id;
        ELSIF NEW.custom_equipment_id IS NOT NULL THEN
            SELECT ce.equipment_name INTO equipment_name 
            FROM custom_equipment ce WHERE ce.id = NEW.custom_equipment_id;
        ELSE
            equipment_name := 'Unknown Equipment';
        END IF;

        -- Calculate the new gang rating after equipment purchase
        SELECT COALESCE(SUM(
            f.credits + 
            COALESCE(f.cost_adjustment, 0) +
            COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(fc.credits_increase) FROM fighter_characteristics fc WHERE fc.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(
                CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                     THEN (ffe.type_specific_data->>'credits_increase')::integer 
                     ELSE 0 END
            ) FROM fighter_effects ffe WHERE ffe.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(v.cost + 
                COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id), 0)
            ) FROM vehicles v WHERE v.fighter_id = f.id), 0)
        ), 0) INTO new_gang_rating
        FROM fighters f 
        WHERE f.gang_id = target_gang_id 
        AND f.killed = FALSE 
        AND f.retired = FALSE
        AND f.enslaved = FALSE;

        -- Check if this is a move from stash (equipment exists in gang_stash with same cost)
        IF EXISTS (
            SELECT 1 FROM gang_stash gs 
            WHERE gs.gang_id = target_gang_id 
            AND (gs.equipment_id = NEW.equipment_id OR gs.custom_equipment_id = NEW.custom_equipment_id)
            AND gs.cost = NEW.purchase_cost
            AND gs.created_at < NEW.created_at
        ) THEN
            -- This is equipment being moved from stash
            IF is_vehicle_equipment THEN
                PERFORM gang_logs(
                    target_gang_id,
                    'vehicle_equipment_moved_from_stash',
                    'Vehicle "' || COALESCE(vehicle_name, 'Unknown Vehicle') || '" took ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' (' || COALESCE(NEW.purchase_cost::text, '0') || ' credits) from gang stash. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    NEW.fighter_id,
                    NEW.vehicle_id
                );
            ELSE
                PERFORM gang_logs(
                    target_gang_id,
                    'equipment_moved_from_stash',
                    'Fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '" took ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' (' || COALESCE(NEW.purchase_cost::text, '0') || ' credits) from gang stash. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    NEW.fighter_id,
                    NULL
                );
            END IF;
        ELSE
            -- This is a regular equipment purchase
            IF is_vehicle_equipment THEN
                PERFORM gang_logs(
                    target_gang_id,
                    'vehicle_equipment_purchased',
                    'Vehicle "' || COALESCE(vehicle_name, 'Unknown Vehicle') || '" bought ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' for ' || 
                    COALESCE(NEW.purchase_cost::text, '0') || ' credits. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    NEW.fighter_id,
                    NEW.vehicle_id
                );
            ELSE
                PERFORM gang_logs(
                    target_gang_id,
                    'equipment_purchased',
                    'Fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '" bought ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' for ' || 
                    COALESCE(NEW.purchase_cost::text, '0') || ' credits. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    NEW.fighter_id,
                    NULL
                );
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- Log equipment sale/removal
    IF TG_OP = 'DELETE' THEN
        -- Get equipment name
        IF OLD.equipment_id IS NOT NULL THEN
            SELECT e.equipment_name INTO equipment_name 
            FROM equipment e WHERE e.id = OLD.equipment_id;
        ELSIF OLD.custom_equipment_id IS NOT NULL THEN
            SELECT ce.equipment_name INTO equipment_name 
            FROM custom_equipment ce WHERE ce.id = OLD.custom_equipment_id;
        ELSE
            equipment_name := 'Unknown Equipment';
        END IF;

        -- Calculate the new gang rating after equipment removal
        SELECT COALESCE(SUM(
            f.credits + 
            COALESCE(f.cost_adjustment, 0) +
            COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id AND fe.id != OLD.id), 0) +
            COALESCE((SELECT SUM(fc.credits_increase) FROM fighter_characteristics fc WHERE fc.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(
                CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                     THEN (ffe.type_specific_data->>'credits_increase')::integer 
                     ELSE 0 END
            ) FROM fighter_effects ffe WHERE ffe.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(v.cost + 
                COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id AND ve.id != OLD.id), 0)
            ) FROM vehicles v WHERE v.fighter_id = f.id), 0)
        ), 0) INTO new_gang_rating
        FROM fighters f 
        WHERE f.gang_id = target_gang_id 
        AND f.killed = FALSE 
        AND f.retired = FALSE
        AND f.enslaved = FALSE;

        -- Check if this is a move to stash (equipment will appear in gang_stash shortly after)
        -- We use a small delay to allow the stash insert to complete
        PERFORM pg_sleep(0.1);
        
        IF EXISTS (
            SELECT 1 FROM gang_stash gs 
            WHERE gs.gang_id = target_gang_id 
            AND (gs.equipment_id = OLD.equipment_id OR gs.custom_equipment_id = OLD.custom_equipment_id)
            AND gs.cost = OLD.purchase_cost
            AND gs.created_at > OLD.created_at
        ) THEN
            -- This is equipment being moved to stash
            IF is_vehicle_equipment THEN
                PERFORM gang_logs(
                    target_gang_id,
                    'vehicle_equipment_moved_to_stash',
                    'Vehicle "' || COALESCE(vehicle_name, 'Unknown Vehicle') || '" moved ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' (' || COALESCE(OLD.purchase_cost::text, '0') || ' credits) to gang stash. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    OLD.fighter_id,
                    OLD.vehicle_id
                );
            ELSE
                PERFORM gang_logs(
                    target_gang_id,
                    'equipment_moved_to_stash',
                    'Fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '" moved ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' (' || COALESCE(OLD.purchase_cost::text, '0') || ' credits) to gang stash. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    OLD.fighter_id,
                    NULL
                );
            END IF;
        ELSE
            -- This is a regular equipment sale
            IF is_vehicle_equipment THEN
                PERFORM gang_logs(
                    target_gang_id,
                    'vehicle_equipment_sold',
                    'Vehicle "' || COALESCE(vehicle_name, 'Unknown Vehicle') || '" sold ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' for ' || 
                    COALESCE(OLD.purchase_cost::text, '0') || ' credits. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    OLD.fighter_id,
                    OLD.vehicle_id
                );
            ELSE
                PERFORM gang_logs(
                    target_gang_id,
                    'equipment_sold',
                    'Fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '" sold ' || 
                    COALESCE(equipment_name, 'Unknown Equipment') || ' for ' || 
                    COALESCE(OLD.purchase_cost::text, '0') || ' credits. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    OLD.fighter_id,
                    NULL
                );
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$function$; 