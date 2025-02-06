
DECLARE
   v_gang_id UUID;
   v_equipment_id UUID;
   v_cost NUMERIC;
BEGIN
   SELECT gs.gang_id, gs.equipment_id, gs.cost
   INTO v_gang_id, v_equipment_id, v_cost
   FROM gang_stash gs
   WHERE gs.id = p_stash_id;

   IF NOT FOUND THEN
       RAISE EXCEPTION 'Stash item not found';
   END IF;

   IF NOT EXISTS (
       SELECT 1 FROM fighters
       WHERE id = p_fighter_id AND gang_id = v_gang_id
   ) THEN
       RAISE EXCEPTION 'Fighter does not belong to the same gang';
   END IF;

   INSERT INTO fighter_equipment (
       fighter_id, equipment_id, purchase_cost, created_at
   ) VALUES (
       p_fighter_id, v_equipment_id, v_cost, NOW()
   );

   DELETE FROM gang_stash WHERE id = p_stash_id;

   RETURN json_build_object(
       'success', true,
       'message', 'Equipment moved from stash to fighter',
       'stash_id', p_stash_id,
       'fighter_id', p_fighter_id,
       'equipment_id', v_equipment_id,
       'cost', v_cost
   );
EXCEPTION WHEN OTHERS THEN
   RETURN json_build_object(
       'success', false,
       'error', SQLERRM
   );
END;
