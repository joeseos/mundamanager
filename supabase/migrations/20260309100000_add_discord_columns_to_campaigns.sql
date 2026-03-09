ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discord_channel_id text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discord_guild_id text;
