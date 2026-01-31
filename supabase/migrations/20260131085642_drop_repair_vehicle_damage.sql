-- Migration to drop repair_vehicle_damage function
-- This function has been refactored into the TypeScript server action

DROP FUNCTION IF EXISTS public.repair_vehicle_damage(uuid[], integer, uuid);
