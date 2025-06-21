-- Test script to debug buy_equipment_for_fighter function
-- This will help us see what's happening when manual_cost is 0

-- First, let's check what functions exist
SELECT 
    routine_name,
    routine_type,
    specific_name,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'buy_equipment_for_fighter' 
AND routine_schema = 'public';

-- Test the function with debug output
-- Replace these UUIDs with actual values from your database:
-- - Replace 'your_gang_id' with your actual gang ID
-- - Replace 'your_fighter_id' with your actual fighter ID  
-- - Replace 'your_equipment_id' with the equipment ID you're trying to buy

/*
SELECT buy_equipment_for_fighter(
    fighter_id := 'your_fighter_id'::UUID,
    equipment_id := 'your_equipment_id'::UUID,
    gang_id := 'your_gang_id'::UUID,
    manual_cost := 0,
    vehicle_id := NULL,
    master_crafted := FALSE,
    use_base_cost_for_rating := TRUE,
    custom_equipment_id := NULL,
    buy_for_gang_stash := FALSE
);
*/

-- Let's also check the gang credits to make sure we have the right data
-- SELECT id, name, credits FROM gangs WHERE user_id = auth.uid();

-- And check the equipment cost
-- SELECT id, equipment_name, cost FROM equipment WHERE equipment_name ILIKE '%ocular%'; 