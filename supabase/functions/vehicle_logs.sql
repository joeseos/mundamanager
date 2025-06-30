CREATE OR REPLACE FUNCTION public.vehicle_logs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    vehicle_name TEXT;
    fighter_name TEXT;
    gang_id_val UUID;
    new_gang_rating NUMERIC;
    gang_exists BOOLEAN := FALSE;
BEGIN
    -- Get vehicle information and gang_id
    IF TG_OP = 'INSERT' THEN
        vehicle_name := NEW.vehicle_name;
        gang_id_val := NEW.gang_id;
        IF NEW.fighter_id IS NOT NULL THEN
            SELECT f.fighter_name INTO fighter_name FROM fighters f WHERE f.id = NEW.fighter_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        vehicle_name := COALESCE(NEW.vehicle_name, OLD.vehicle_name);
        gang_id_val := NEW.gang_id;
        IF NEW.fighter_id IS NOT NULL THEN
            SELECT f.fighter_name INTO fighter_name FROM fighters f WHERE f.id = NEW.fighter_id;
        ELSIF OLD.fighter_id IS NOT NULL THEN
            SELECT f.fighter_name INTO fighter_name FROM fighters f WHERE f.id = OLD.fighter_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        vehicle_name := OLD.vehicle_name;
        gang_id_val := OLD.gang_id;
        IF OLD.fighter_id IS NOT NULL THEN
            SELECT f.fighter_name INTO fighter_name FROM fighters f WHERE f.id = OLD.fighter_id;
        END IF;
    END IF;

    -- Check if the gang still exists (to avoid foreign key violations during gang deletion)
    SELECT EXISTS(SELECT 1 FROM gangs WHERE id = gang_id_val) INTO gang_exists;
    
    -- Skip logging if gang doesn't exist (gang is being deleted)
    IF NOT gang_exists THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Log vehicle addition
    IF TG_OP = 'INSERT' THEN
        -- Calculate gang rating
        SELECT COALESCE(SUM(
            f.credits + 
            COALESCE(f.cost_adjustment, 0) +
            COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id), 0) +
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
        WHERE f.gang_id = gang_id_val 
        AND f.killed = FALSE 
        AND f.retired = FALSE
        AND f.enslaved = FALSE;
        
        PERFORM gang_logs(
            gang_id_val,
            'vehicle_added',
            'Added vehicle "' || vehicle_name || '" (' || COALESCE(NEW.cost::text, '0') || ' credits)' ||
            CASE 
                WHEN NEW.fighter_id IS NOT NULL THEN ' assigned to fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '"'
                ELSE ' (unassigned)'
            END ||
            '. New gang rating: ' || COALESCE(new_gang_rating::text, '0'),
            NEW.fighter_id,
            NEW.id
        );
        RETURN NEW;
    END IF;

    -- Log vehicle removal
    IF TG_OP = 'DELETE' THEN
        -- Calculate gang rating (excluding the vehicle being deleted)
        SELECT COALESCE(SUM(
            f.credits + 
            COALESCE(f.cost_adjustment, 0) +
            COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(
                CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                     THEN (ffe.type_specific_data->>'credits_increase')::integer 
                     ELSE 0 END
            ) FROM fighter_effects ffe WHERE ffe.fighter_id = f.id), 0) +
            COALESCE((SELECT SUM(v.cost + 
                COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id), 0)
            ) FROM vehicles v WHERE v.fighter_id = f.id AND v.id != OLD.id), 0)
        ), 0) INTO new_gang_rating
        FROM fighters f 
        WHERE f.gang_id = gang_id_val 
        AND f.killed = FALSE 
        AND f.retired = FALSE
        AND f.enslaved = FALSE;
        
        PERFORM gang_logs(
            gang_id_val,
            'vehicle_removed',
            'Removed vehicle "' || vehicle_name || '" (' || COALESCE(OLD.cost::text, '0') || ' credits)' ||
            CASE 
                WHEN OLD.fighter_id IS NOT NULL THEN ' from fighter "' || COALESCE(fighter_name, 'Unknown Fighter') || '"'
                ELSE ' (was unassigned)'
            END ||
            '. New gang rating: ' || COALESCE(new_gang_rating::text, '0'),
            OLD.fighter_id,
            OLD.id
        );
        RETURN OLD;
    END IF;

    -- Log vehicle updates
    IF TG_OP = 'UPDATE' THEN
        -- Log cost changes
        IF OLD.cost IS DISTINCT FROM NEW.cost THEN
            -- Calculate gang rating
            SELECT COALESCE(SUM(
                f.credits + 
                COALESCE(f.cost_adjustment, 0) +
                COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id), 0) +
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
            WHERE f.gang_id = gang_id_val 
            AND f.killed = FALSE 
            AND f.retired = FALSE
            AND f.enslaved = FALSE;
            
            PERFORM gang_logs(
                gang_id_val,
                'vehicle_cost_changed',
                'Vehicle "' || vehicle_name || '" cost changed from ' || COALESCE(OLD.cost::text, '0') || 
                ' to ' || COALESCE(NEW.cost::text, '0') || ' credits. New gang rating: ' || 
                COALESCE(new_gang_rating::text, '0'),
                NEW.fighter_id,
                NEW.id
            );
        END IF;

        -- Log fighter assignment changes
        IF OLD.fighter_id IS DISTINCT FROM NEW.fighter_id THEN
            DECLARE
                old_fighter_name TEXT;
                new_fighter_name TEXT;
                assignment_new_gang_rating NUMERIC;
            BEGIN
                IF OLD.fighter_id IS NOT NULL THEN
                    SELECT f.fighter_name INTO old_fighter_name FROM fighters f WHERE f.id = OLD.fighter_id;
                END IF;
                IF NEW.fighter_id IS NOT NULL THEN
                    SELECT f.fighter_name INTO new_fighter_name FROM fighters f WHERE f.id = NEW.fighter_id;
                END IF;

                -- Calculate gang rating after assignment change
                SELECT COALESCE(SUM(
                    f.credits + 
                    COALESCE(f.cost_adjustment, 0) +
                    COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = f.id), 0) +
                    COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = f.id), 0) +
                    COALESCE((SELECT SUM(
                        CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                             THEN (ffe.type_specific_data->>'credits_increase')::integer 
                             ELSE 0 END
                    ) FROM fighter_effects ffe WHERE ffe.fighter_id = f.id), 0) +
                    COALESCE((SELECT SUM(v.cost + 
                        COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id), 0)
                    ) FROM vehicles v WHERE v.fighter_id = f.id), 0)
                ), 0) INTO assignment_new_gang_rating
                FROM fighters f 
                WHERE f.gang_id = gang_id_val 
                AND f.killed = FALSE 
                AND f.retired = FALSE
                AND f.enslaved = FALSE;

                -- Create more descriptive log message
                IF OLD.fighter_id IS NULL AND NEW.fighter_id IS NOT NULL THEN
                    -- Assigning vehicle to fighter
                    PERFORM gang_logs(
                        gang_id_val,
                        'vehicle_assignment_changed',
                        'Assigned vehicle "' || vehicle_name || '" (' || COALESCE(NEW.cost::text, '0') || ' credits) to "' || COALESCE(new_fighter_name, 'Unknown Fighter') || '". New gang rating: ' || COALESCE(assignment_new_gang_rating::text, '0'),
                        NEW.fighter_id,
                        NEW.id
                    );
                ELSIF OLD.fighter_id IS NOT NULL AND NEW.fighter_id IS NULL THEN
                    -- Unassigning vehicle from fighter
                    PERFORM gang_logs(
                        gang_id_val,
                        'vehicle_assignment_changed',
                        'Unassigned vehicle "' || vehicle_name || '" (' || COALESCE(NEW.cost::text, '0') || ' credits) from "' || COALESCE(old_fighter_name, 'Unknown Fighter') || '". New gang rating: ' || COALESCE(assignment_new_gang_rating::text, '0'),
                        OLD.fighter_id,
                        NEW.id
                    );
                ELSE
                    -- Reassigning vehicle from one fighter to another
                    PERFORM gang_logs(
                        gang_id_val,
                        'vehicle_assignment_changed',
                        'Reassigned vehicle "' || vehicle_name || '" (' || COALESCE(NEW.cost::text, '0') || ' credits) from "' || COALESCE(old_fighter_name, 'Unknown Fighter') || '" to "' || COALESCE(new_fighter_name, 'Unknown Fighter') || '". New gang rating: ' || COALESCE(assignment_new_gang_rating::text, '0'),
                        NEW.fighter_id,
                        NEW.id
                    );
                END IF;
            END;
        END IF;

        -- Log name changes
        IF OLD.vehicle_name IS DISTINCT FROM NEW.vehicle_name THEN
            PERFORM gang_logs(
                gang_id_val,
                'vehicle_name_changed',
                'Vehicle name changed from "' || COALESCE(OLD.vehicle_name, 'Unnamed Vehicle') || 
                '" to "' || COALESCE(NEW.vehicle_name, 'Unnamed Vehicle') || '"',
                NEW.fighter_id,
                NEW.id
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$ 