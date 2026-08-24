-- skills.xp_cost and skills.credit_cost are dead columns: every row is NULL,
-- no application code or SQL RPC ever reads them, and the only write path
-- (admin create-skill API) was orphaned when its UI inputs were removed
-- (commit 47f3f0e0, Feb 2025). Actual skill XP/credit costs are computed via
-- hardcoded tiers in get_available_skills.sql, not stored per-skill.
ALTER TABLE public.skills
  DROP COLUMN IF EXISTS xp_cost,
  DROP COLUMN IF EXISTS credit_cost;
