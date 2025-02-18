DROP FUNCTION IF EXISTS public.move_from_stash(uuid, uuid);
DROP FUNCTION IF EXISTS public.move_from_stash(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.move_from_stash(
   p_stash_id uuid,
   p_fighter_id uuid DEFAULT NULL,
   p_vehicle_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
   v_gang_id UUID;
   v_equipment_id UUID;
   v_cost NUMERIC;
   v_debug_count INTEGER;
BEGIN
   IF p_fighter_id IS NULL AND p_vehicle_id IS NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Either fighter_id or vehicle_id must be provided'
       );
   END IF;
   
   IF p_fighter_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Cannot provide both fighter_id and vehicle_id'
       );
   END IF;

   -- Debug: Check if p_stash_id is NULL
   IF p_stash_id IS NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Stash ID cannot be NULL'
       );
   END IF;

   -- Debug: Check if the stash item exists
   SELECT COUNT(*) INTO v_debug_count
   FROM gang_stash gs
   WHERE gs.id = p_stash_id;

   RAISE NOTICE 'Found % matching stash items for ID: %', v_debug_count, p_stash_id;

   IF v_debug_count = 0 THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Stash item not found with ID: %s', p_stash_id)
       );
   END IF;

   SELECT gs.gang_id, gs.equipment_id, gs.cost::numeric
   INTO v_gang_id, v_equipment_id, v_cost
   FROM gang_stash gs
   WHERE gs.id = p_stash_id;

   -- Debug: Log the values we found
   RAISE NOTICE 'Found gang_id: %, equipment_id: %, cost: %', v_gang_id, v_equipment_id, v_cost;

   -- Check ownership based on provided ID
   IF p_fighter_id IS NOT NULL THEN
       IF NOT EXISTS (
           SELECT 1 FROM fighters 
           WHERE id = p_fighter_id AND gang_id = v_gang_id
       ) THEN
           RETURN json_build_object(
               'success', false,
               'error', 'Fighter does not belong to the same gang'
           );
       END IF;
   ELSE
       IF NOT EXISTS (
           SELECT 1 FROM vehicles 
           WHERE id = p_vehicle_id AND gang_id = v_gang_id
       ) THEN
           RETURN json_build_object(
               'success', false,
               'error', 'Vehicle does not belong to the same gang'
           );
       END IF;
   END IF;

   -- Insert into fighter_equipment
   BEGIN
       INSERT INTO fighter_equipment (
           fighter_id, vehicle_id, equipment_id, purchase_cost, created_at
       ) VALUES (
           p_fighter_id,
           p_vehicle_id,
           v_equipment_id,
           v_cost,
           NOW()
       );
   EXCEPTION WHEN OTHERS THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Error inserting into fighter_equipment: %s', SQLERRM)
       );
   END;

   -- Delete from gang_stash
   BEGIN
       DELETE FROM gang_stash WHERE id = p_stash_id;
   EXCEPTION WHEN OTHERS THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Error deleting from gang_stash: %s', SQLERRM)
       );
   END;

   RETURN json_build_object(
       'success', true,
       'message', CASE 
           WHEN p_fighter_id IS NOT NULL THEN 'Equipment moved from stash to fighter'
           ELSE 'Equipment moved from stash to vehicle'
       END,
       'stash_id', p_stash_id,
       'fighter_id', p_fighter_id,
       'vehicle_id', p_vehicle_id,
       'equipment_id', v_equipment_id,
       'cost', v_cost
   );
EXCEPTION WHEN OTHERS THEN
   RETURN json_build_object(
       'success', false,
       'error', format('Unexpected error: %s', SQLERRM)
   );
END;
$function$;