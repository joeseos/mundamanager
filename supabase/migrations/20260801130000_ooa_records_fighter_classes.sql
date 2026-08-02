-- Add fighter_classes JSONB columns to fighter_ooa_records
-- Same pattern as the fighter/fighter_types migration: add new columns, populate
-- from existing data, use only the new columns in code. Old columns
-- (causing_fighter_class, injured_fighter_class) are NOT dropped yet for rollback
-- safety — they will be removed in a follow-up migration after testing.

ALTER TABLE fighter_ooa_records
  ADD COLUMN IF NOT EXISTS causing_fighter_classes jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS injured_fighter_classes jsonb NOT NULL DEFAULT '[]';

-- Populate from existing single-value columns
UPDATE fighter_ooa_records
SET causing_fighter_classes = jsonb_build_array(causing_fighter_class)
WHERE causing_fighter_class IS NOT NULL AND causing_fighter_class != '';

UPDATE fighter_ooa_records
SET injured_fighter_classes = jsonb_build_array(injured_fighter_class)
WHERE injured_fighter_class IS NOT NULL AND injured_fighter_class != '';
