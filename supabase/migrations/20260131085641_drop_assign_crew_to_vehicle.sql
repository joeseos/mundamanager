-- Migration to drop assign_crew_to_vehicle function
-- This function has been refactored into the TypeScript server action
-- Run this SQL in your Supabase SQL editor to complete the cleanup

DROP FUNCTION IF EXISTS public.assign_crew_to_vehicle(uuid, uuid);
