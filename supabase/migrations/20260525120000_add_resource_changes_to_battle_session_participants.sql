ALTER TABLE battle_session_participants
ADD COLUMN resource_changes jsonb NOT NULL DEFAULT '[]'::jsonb;
