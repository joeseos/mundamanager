-- Let a fighter's skill access override point at a custom skill set, the same
-- way fighter_type_skill_access does. skill_type_id references skill_types, so
-- saving an override for a custom skill set failed the foreign key.
ALTER TABLE public.fighter_skill_access_override
  ADD COLUMN custom_skill_type_id uuid REFERENCES public.custom_skill_types(id) ON DELETE CASCADE,
  ALTER COLUMN skill_type_id DROP NOT NULL;

ALTER TABLE public.fighter_skill_access_override
  ADD CONSTRAINT chk_fsao_skill_type_xor
  CHECK (
    (skill_type_id IS NOT NULL AND custom_skill_type_id IS NULL)
    OR (skill_type_id IS NULL AND custom_skill_type_id IS NOT NULL)
  );

ALTER TABLE public.fighter_skill_access_override
  ADD CONSTRAINT fighter_skill_access_override_fighter_id_custom_skill_type_id_key
  UNIQUE (fighter_id, custom_skill_type_id);
