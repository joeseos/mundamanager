ALTER TABLE campaign_battles
  DROP COLUMN IF EXISTS attacker_id,
  DROP COLUMN IF EXISTS defender_id;
