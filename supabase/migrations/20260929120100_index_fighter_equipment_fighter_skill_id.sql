-- Index for fighter_equipment.fighter_skill_id (added in the previous
-- migration). Needed so deleting a fighter_skills row finds its granted
-- equipment without scanning fighter_equipment.
--
-- Kept in its own migration so the full-table scan runs under CREATE INDEX's
-- SHARE lock (blocks writes, not reads) rather than under the ACCESS EXCLUSIVE
-- lock the ALTER TABLE takes. Partial: almost every row is null.

CREATE INDEX IF NOT EXISTS idx_fighter_equipment_fighter_skill_id
  ON public.fighter_equipment (fighter_skill_id)
  WHERE fighter_skill_id IS NOT NULL;
