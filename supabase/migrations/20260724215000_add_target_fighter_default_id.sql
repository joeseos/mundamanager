-- Adds target_fighter_default_id to fighter_defaults to support linking
-- default wargear / weapon extensions (e.g. Infra sight) to specific default weapons.

ALTER TABLE public.fighter_defaults 
    ADD COLUMN IF NOT EXISTS target_fighter_default_id uuid REFERENCES public.fighter_defaults(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS fighter_defaults_target_fighter_default_id_idx 
    ON public.fighter_defaults (target_fighter_default_id);
