-- Migration: Fix incorrect user_id assignments in fighter_effects and fighter_skills
-- These tables should have user_id = fighter owner, not the acting user (admin/arbitrator)
-- Run this migration to fix existing data after deploying the code changes

-- Fix fighter_effects: set user_id to fighter owner
-- This updates records where the effect's user_id doesn't match the fighter's user_id
UPDATE fighter_effects fe
SET user_id = f.user_id
FROM fighters f
WHERE fe.fighter_id = f.id
  AND fe.user_id IS DISTINCT FROM f.user_id;

-- Fix vehicle effects (fighter_effects with vehicle_id instead of fighter_id)
-- Vehicles don't have user_id directly, so we get it from the gang
UPDATE fighter_effects fe
SET user_id = g.user_id
FROM vehicles v
JOIN gangs g ON v.gang_id = g.id
WHERE fe.vehicle_id = v.id
  AND fe.fighter_id IS NULL
  AND fe.user_id IS DISTINCT FROM g.user_id;

-- Fix fighter_skills: set user_id to fighter owner
UPDATE fighter_skills fs
SET user_id = f.user_id
FROM fighters f
WHERE fs.fighter_id = f.id
  AND fs.user_id IS DISTINCT FROM f.user_id;

-- Verification queries (run these after the migration to confirm the fix):
-- SELECT COUNT(*) FROM fighter_effects fe
-- JOIN fighters f ON fe.fighter_id = f.id
-- WHERE fe.user_id IS DISTINCT FROM f.user_id;
-- Should return 0

-- SELECT COUNT(*) FROM fighter_skills fs
-- JOIN fighters f ON fs.fighter_id = f.id
-- WHERE fs.user_id IS DISTINCT FROM f.user_id;
-- Should return 0
