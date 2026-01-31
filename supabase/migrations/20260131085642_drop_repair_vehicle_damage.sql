-- Migration to drop repair_vehicle_damage function
-- This function has been refactored into the TypeScript server action
-- Run this SQL in your Supabase SQL editor to complete the cleanup

DROP FUNCTION IF EXISTS public.repair_vehicle_damage(uuid[], integer, uuid);
