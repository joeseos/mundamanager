-- Backfill the self-reference on weapons that grouped ammo hangs off.
--
-- A weapon's own profiles and the profiles of the ammo grouped onto it have to
-- agree on one group id, otherwise the fighter card can't tie them together and
-- the ammo rows vanish (reported for "Krak grenades (Subjugator grenade
-- launcher)"). The admin edit form has always written that self-reference; the
-- create form wrote NULL, so weapons that were created and never re-saved were
-- left without it.
--
-- Only touches profiles of weapons that something actually groups under -- an
-- ungrouped weapon's NULL is meaningless either way and is left alone.
UPDATE weapon_profiles wp
SET weapon_group_id = wp.weapon_id
WHERE wp.weapon_group_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM weapon_profiles ammo
    WHERE ammo.weapon_group_id = wp.weapon_id
      AND ammo.weapon_id <> wp.weapon_id
  );
