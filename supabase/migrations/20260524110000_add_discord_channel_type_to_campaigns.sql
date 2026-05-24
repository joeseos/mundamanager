ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS discord_channel_type integer NOT NULL DEFAULT 0;
