CREATE OR REPLACE FUNCTION public.auto_log_gang_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only log for the specific test gang
    IF NEW.id != 'f27cb215-b9c3-47ed-8cfa-f2219332266e' THEN
        RETURN NEW;
    END IF;

    -- Log credits changes (but skip if it matches a recent fighter addition or equipment purchase)
    IF TG_OP = 'UPDATE' AND OLD.credits IS DISTINCT FROM NEW.credits THEN
        -- Check if this credit change matches a fighter added in the last 5 seconds
        -- OR if it matches an equipment purchase in the last 5 seconds
        -- OR if it matches an equipment sale in the last 5 seconds
        -- OR if it matches a vehicle equipment purchase/sale in the last 5 seconds
        IF NOT EXISTS (
            SELECT 1 
            FROM gang_logs 
            WHERE gang_id = NEW.id 
                AND action_type = 'fighter_added'
                AND created_at > NOW() - INTERVAL '5 seconds'
                AND OLD.credits - NEW.credits = (
                    SELECT f.credits 
                    FROM fighters f 
                    JOIN gang_logs gl ON f.id = gl.fighter_id 
                    WHERE gl.gang_id = NEW.id 
                        AND gl.action_type = 'fighter_added'
                        AND gl.created_at > NOW() - INTERVAL '5 seconds'
                    LIMIT 1
                )
        ) AND NOT EXISTS (
            SELECT 1 
            FROM gang_logs 
            WHERE gang_id = NEW.id 
                AND action_type = 'equipment_purchased'
                AND created_at > NOW() - INTERVAL '5 seconds'
        ) AND NOT EXISTS (
            SELECT 1 
            FROM gang_logs 
            WHERE gang_id = NEW.id 
                AND action_type = 'equipment_sold'
                AND created_at > NOW() - INTERVAL '5 seconds'
        ) AND NOT EXISTS (
            SELECT 1 
            FROM gang_logs 
            WHERE gang_id = NEW.id 
                AND action_type = 'vehicle_equipment_purchased'
                AND created_at > NOW() - INTERVAL '5 seconds'
        ) AND NOT EXISTS (
            SELECT 1 
            FROM gang_logs 
            WHERE gang_id = NEW.id 
                AND action_type = 'vehicle_equipment_sold'
                AND created_at > NOW() - INTERVAL '5 seconds'
        ) THEN
            PERFORM gang_logs(
                NEW.id,
                CASE 
                    WHEN NEW.credits > OLD.credits THEN 'credits_earned'
                    WHEN NEW.credits < OLD.credits THEN 'credits_spent'
                    ELSE 'credits_changed'
                END,
                CASE 
                    WHEN NEW.credits > OLD.credits THEN 
                        'Credits increased from ' || OLD.credits || ' to ' || NEW.credits
                    WHEN NEW.credits < OLD.credits THEN 
                        'Credits decreased from ' || OLD.credits || ' to ' || NEW.credits
                    ELSE 
                        'Credits changed from ' || OLD.credits || ' to ' || NEW.credits
                END,
                NULL,
                NULL
            );
        END IF;
    END IF;

    -- Log reputation changes
    IF TG_OP = 'UPDATE' AND OLD.reputation IS DISTINCT FROM NEW.reputation THEN
        PERFORM gang_logs(
            NEW.id,
            'reputation_changed',
            'Reputation changed from ' || COALESCE(OLD.reputation::text, '0') || 
            ' to ' || COALESCE(NEW.reputation::text, '0'),
            NULL,
            NULL
        );
    END IF;

    -- Log meat changes
    IF TG_OP = 'UPDATE' AND OLD.meat IS DISTINCT FROM NEW.meat THEN
        PERFORM gang_logs(
            NEW.id,
            'meat_changed',
            'Meat changed from ' || COALESCE(OLD.meat::text, '0') || 
            ' to ' || COALESCE(NEW.meat::text, '0'),
            NULL,
            NULL
        );
    END IF;

    -- Log exploration points changes
    IF TG_OP = 'UPDATE' AND OLD.exploration_points IS DISTINCT FROM NEW.exploration_points THEN
        PERFORM gang_logs(
            NEW.id,
            'exploration_points_changed',
            'Exploration points changed from ' || COALESCE(OLD.exploration_points::text, '0') || 
            ' to ' || COALESCE(NEW.exploration_points::text, '0'),
            NULL,
            NULL
        );
    END IF;

    -- Log gang type changes
    IF TG_OP = 'UPDATE' AND OLD.gang_type IS DISTINCT FROM NEW.gang_type THEN
        PERFORM gang_logs(
            NEW.id,
            'gang_type_changed',
            'Gang type changed from "' || COALESCE(OLD.gang_type, 'None') || 
            '" to "' || COALESCE(NEW.gang_type, 'None') || '"',
            NULL,
            NULL
        );
    END IF;

    RETURN NEW;
END;
$function$