CREATE OR REPLACE FUNCTION public.fighter_logs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    fighter_name TEXT;
    gang_name TEXT;
    test_gang_id UUID := 'f27cb215-b9c3-47ed-8cfa-f2219332266e';
BEGIN
    -- Only log for fighters belonging to the specific test gang
    IF TG_OP = 'INSERT' AND NEW.gang_id != test_gang_id THEN
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND NEW.gang_id != test_gang_id THEN
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.gang_id != test_gang_id THEN
        RETURN OLD;
    END IF;

    -- Get fighter name and gang name for logging
    IF TG_OP = 'INSERT' THEN
        fighter_name := COALESCE(NEW.fighter_name, 'Unnamed Fighter');
        SELECT name INTO gang_name FROM gangs WHERE id = NEW.gang_id;
    ELSIF TG_OP = 'UPDATE' THEN
        fighter_name := COALESCE(NEW.fighter_name, OLD.fighter_name, 'Unnamed Fighter');
        SELECT name INTO gang_name FROM gangs WHERE id = NEW.gang_id;
    ELSIF TG_OP = 'DELETE' THEN
        fighter_name := COALESCE(OLD.fighter_name, 'Unnamed Fighter');
        SELECT name INTO gang_name FROM gangs WHERE id = OLD.gang_id;
    END IF;

    -- Log fighter addition
    IF TG_OP = 'INSERT' THEN
        DECLARE
            new_gang_rating NUMERIC;
            fighter_total_credits NUMERIC;
        BEGIN
            -- Calculate the fighter's total credit value using the same method as the system
            SELECT COALESCE(
                NEW.credits + 
                COALESCE(NEW.cost_adjustment, 0) +
                COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = NEW.id), 0) +
                COALESCE((SELECT SUM(fc.credits_increase) FROM fighter_characteristics fc WHERE fc.fighter_id = NEW.id), 0) +
                COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = NEW.id), 0) +
                COALESCE((SELECT SUM(
                    CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                         THEN (ffe.type_specific_data->>'credits_increase')::integer 
                         ELSE 0 END
                ) FROM fighter_effects ffe WHERE ffe.fighter_id = NEW.id), 0) +
                COALESCE((SELECT SUM(v.cost + 
                    COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id), 0)
                ) FROM vehicles v WHERE v.fighter_id = NEW.id), 0)
            , 0) INTO fighter_total_credits;

            -- Calculate the new gang rating including this fighter
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
            WHERE f.gang_id = NEW.gang_id 
            AND f.killed = FALSE 
            AND f.retired = FALSE
            AND f.enslaved = FALSE;

            PERFORM gang_logs(
                NEW.gang_id,
                'fighter_added',
                'Added fighter "' || fighter_name || '" (' || COALESCE(fighter_total_credits::text, '0') || ' credits). New gang rating: ' || COALESCE(new_gang_rating::text, '0'),
                NEW.id,
                NULL
            );
        END;
        RETURN NEW;
    END IF;

    -- Log fighter removal
    IF TG_OP = 'DELETE' THEN
        DECLARE
            new_gang_rating NUMERIC;
            fighter_total_credits NUMERIC;
        BEGIN
            -- Calculate the fighter's total credit value IMMEDIATELY using the same method as the system
            -- This must be done first to capture vehicle costs before any potential cascade operations
            SELECT COALESCE(
                OLD.credits + 
                COALESCE(OLD.cost_adjustment, 0) +
                COALESCE((SELECT SUM(fe.purchase_cost) FROM fighter_equipment fe WHERE fe.fighter_id = OLD.id), 0) +
                COALESCE((SELECT SUM(fc.credits_increase) FROM fighter_characteristics fc WHERE fc.fighter_id = OLD.id), 0) +
                COALESCE((SELECT SUM(fs.credits_increase) FROM fighter_skills fs WHERE fs.fighter_id = OLD.id), 0) +
                COALESCE((SELECT SUM(
                    CASE WHEN ffe.type_specific_data->>'credits_increase' IS NOT NULL 
                         THEN (ffe.type_specific_data->>'credits_increase')::integer 
                         ELSE 0 END
                ) FROM fighter_effects ffe WHERE ffe.fighter_id = OLD.id), 0) +
                COALESCE((SELECT SUM(v.cost + 
                    COALESCE((SELECT SUM(ve.purchase_cost) FROM fighter_equipment ve WHERE ve.vehicle_id = v.id), 0)
                ) FROM vehicles v WHERE v.fighter_id = OLD.id), 0)
            , 0) INTO fighter_total_credits;

            -- Calculate the new gang rating using the same method as the system
            -- This matches the calculation from get_gang_details.sql
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
            WHERE f.gang_id = OLD.gang_id 
            AND f.id != OLD.id 
            AND f.killed = FALSE 
            AND f.retired = FALSE
            AND f.enslaved = FALSE;
            
            PERFORM gang_logs(
                OLD.gang_id,
                'fighter_removed',
                'Removed fighter "' || fighter_name || '" (' || COALESCE(fighter_total_credits::text, '0') || ' credits)' ||
                CASE 
                    WHEN OLD.killed THEN ' (killed)'
                    WHEN OLD.retired THEN ' (retired)'
                    WHEN OLD.enslaved THEN ' (enslaved)'
                    ELSE ''
                END ||
                '. New gang rating: ' || COALESCE(new_gang_rating::text, '0'),
                OLD.id,
                NULL
            );
        END;
        RETURN OLD;
    END IF;

    -- Log fighter updates (only significant changes)
    IF TG_OP = 'UPDATE' THEN
        -- Log XP changes (consolidated to avoid duplicates)
        IF OLD.xp IS DISTINCT FROM NEW.xp OR OLD.total_xp IS DISTINCT FROM NEW.total_xp THEN
            -- Prioritize regular XP changes, only show total XP if regular XP didn't change
            IF OLD.xp IS DISTINCT FROM NEW.xp THEN
                -- Regular XP changed - this is the primary XP metric
                PERFORM gang_logs(
                    NEW.gang_id,
                    'fighter_xp_changed',
                    'Fighter "' || fighter_name || '" XP changed from ' || COALESCE(OLD.xp::text, '0') || ' to ' || COALESCE(NEW.xp::text, '0'),
                    NEW.id,
                    NULL
                );
            ELSIF OLD.total_xp IS DISTINCT FROM NEW.total_xp THEN
                -- Only total XP changed (rare case)
                PERFORM gang_logs(
                    NEW.gang_id,
                    'fighter_total_xp_changed',
                    'Fighter "' || fighter_name || '" total XP changed from ' || COALESCE(OLD.total_xp::text, '0') || ' to ' || COALESCE(NEW.total_xp::text, '0'),
                    NEW.id,
                    NULL
                );
            END IF;
        END IF;

        -- Log kills changes
        IF OLD.kills IS DISTINCT FROM NEW.kills THEN
            PERFORM gang_logs(
                NEW.gang_id,
                'fighter_kills_changed',
                'Fighter "' || fighter_name || '" kills changed from ' || COALESCE(OLD.kills::text, '0') || ' to ' || COALESCE(NEW.kills::text, '0'),
                NEW.id,
                NULL
            );
        END IF;

        -- Log status changes
        IF OLD.killed IS DISTINCT FROM NEW.killed AND NEW.killed = true THEN
            PERFORM gang_logs(
                NEW.gang_id,
                'fighter_killed',
                'Fighter "' || fighter_name || '" was killed',
                NEW.id,
                NULL
            );
        END IF;

        IF OLD.retired IS DISTINCT FROM NEW.retired AND NEW.retired = true THEN
            PERFORM gang_logs(
                NEW.gang_id,
                'fighter_retired',
                'Fighter "' || fighter_name || '" retired',
                NEW.id,
                NULL
            );
        END IF;

        IF OLD.enslaved IS DISTINCT FROM NEW.enslaved AND NEW.enslaved = true THEN
            PERFORM gang_logs(
                NEW.gang_id,
                'fighter_enslaved',
                'Fighter "' || fighter_name || '" was enslaved',
                NEW.id,
                NULL
            );
        END IF;

        -- Log cost adjustment changes
        IF OLD.cost_adjustment IS DISTINCT FROM NEW.cost_adjustment THEN
            DECLARE
                old_adjustment NUMERIC := COALESCE(OLD.cost_adjustment, 0);
                new_adjustment NUMERIC := COALESCE(NEW.cost_adjustment, 0);
                new_gang_rating NUMERIC;
            BEGIN
                -- Calculate the new gang rating after cost adjustment
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
                WHERE f.gang_id = NEW.gang_id 
                AND f.killed = FALSE 
                AND f.retired = FALSE
                AND f.enslaved = FALSE;

                PERFORM gang_logs(
                    NEW.gang_id,
                    'fighter_cost_adjusted',
                    'Fighter "' || fighter_name || '" cost adjustment changed from ' || 
                    old_adjustment::text || ' to ' || new_adjustment::text || ' credits. New gang rating: ' || 
                    COALESCE(new_gang_rating::text, '0'),
                    NEW.id,
                    NULL
                );
            END;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$ 