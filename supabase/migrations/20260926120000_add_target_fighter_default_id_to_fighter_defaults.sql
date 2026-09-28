-- Lets a default weapon accessory (e.g. Infra-sight) name the default weapon it is fitted to.
-- add-fighter.ts turns the link into fighter_effects.target_equipment_id at recruitment.
-- SET NULL so deleting the weapon leaves the accessory as standalone gear instead of
-- silently removing it from the fighter type.
ALTER TABLE public.fighter_defaults
    ADD COLUMN IF NOT EXISTS target_fighter_default_id uuid
    REFERENCES public.fighter_defaults(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fighter_defaults_target_fighter_default_id_idx
    ON public.fighter_defaults (target_fighter_default_id);
