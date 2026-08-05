-- N26 replaces the Damage characteristic on weapon profiles with Lethality.
-- Nullable everywhere: NULL means "stat does not apply", which covers every
-- pre-N26 profile. Text like the other stat columns on these tables.
ALTER TABLE public.weapon_profiles
  ADD COLUMN IF NOT EXISTS lethality text;

ALTER TABLE public.custom_weapon_profiles
  ADD COLUMN IF NOT EXISTS lethality text;

COMMENT ON COLUMN public.weapon_profiles.lethality IS
  'N26 Lethality characteristic. NULL for pre-N26 profiles, which use damage instead.';

COMMENT ON COLUMN public.custom_weapon_profiles.lethality IS
  'N26 Lethality characteristic. NULL for pre-N26 profiles, which use damage instead.';
