-- Add sort_order column to fighter_effect_types (template table)
ALTER TABLE fighter_effect_types
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- Add sort_order column to fighter_effects (instance table)
ALTER TABLE fighter_effects
  ADD COLUMN IF NOT EXISTS sort_order integer;
