ALTER TABLE campaign_members
  ADD COLUMN is_favourite BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN favourite_order INTEGER;
