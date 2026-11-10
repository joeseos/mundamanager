-- Campaigns can post their players' dice rolls to Discord, to a text channel
-- of their own or, with no channel set, the Battle Log channel.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS discord_dice_rolls boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discord_dice_roll_channel_id text;
