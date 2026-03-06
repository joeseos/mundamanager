-- Add is_consumable boolean column to equipment and custom_equipment tables
-- When true, the equipment can be consumed by the fighter (e.g. chem-alchemy, Limited ammo).
-- Matches the pattern of is_editable: boolean DEFAULT false

ALTER TABLE public.equipment
    ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false;

ALTER TABLE public.custom_equipment
    ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.equipment.is_consumable IS 'When true, equipment can be consumed by the fighter (e.g. chem-alchemy, Limited ammo).';
COMMENT ON COLUMN public.custom_equipment.is_consumable IS 'When true, equipment can be consumed by the fighter (e.g. chem-alchemy, Limited ammo).';
