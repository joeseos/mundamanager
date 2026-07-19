ALTER TABLE fighter_types
  ADD COLUMN IF NOT EXISTS is_dramatis_personae boolean NOT NULL DEFAULT false;
