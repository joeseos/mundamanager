-- Drop any existing gang_logs function to avoid signature conflicts
DROP FUNCTION IF EXISTS public.gang_logs(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.gang_logs(uuid, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.gang_logs(p_gang_id uuid, p_action_type text, p_description text, p_fighter_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO gang_logs (
        gang_id,
        user_id,
        action_type,
        description,
        fighter_id,
        vehicle_id
    ) VALUES (
        p_gang_id,
        auth.uid(),
        p_action_type,
        p_description,
        p_fighter_id,
        p_vehicle_id
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$function$
