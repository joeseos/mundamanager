-- Migration to drop assign_crew_to_vehicle function
-- This function has been refactored into the TypeScript server action

DROP FUNCTION IF EXISTS public.assign_crew_to_vehicle(uuid, uuid);
