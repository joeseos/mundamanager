ALTER TABLE fighters ADD COLUMN captured_by_gang_id UUID REFERENCES gangs(id) ON DELETE SET NULL;
