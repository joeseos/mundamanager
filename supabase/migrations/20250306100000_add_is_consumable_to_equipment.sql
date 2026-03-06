-- Add is_consumable boolean column to equipment and custom_equipment tables
-- When true, the equipment can be consumed and removed from the fighter (e.g. stimm, grenades)
-- Matches the pattern of is_editable: boolean DEFAULT false

ALTER TABLE public.equipment
    ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false;

ALTER TABLE public.custom_equipment
    ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.equipment.is_consumable IS 'When true, equipment can be consumed and deleted from fighter/vehicle (e.g. stimm, grenades)';
COMMENT ON COLUMN public.custom_equipment.is_consumable IS 'When true, equipment can be consumed and deleted from fighter/vehicle (e.g. stimm, grenades)';
