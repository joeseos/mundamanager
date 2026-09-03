-- Specialisation-scoped equipment lists.
--
-- The specialisation follows the fighter; the equipment list follows the fighter type. The N26
-- promotion paths decouple those, so a Van Saar Tek Sniper promoted to Prime loses Long las and
-- Refraction cloak: they live on the Tek/Sniper fighter_types row, and neither has an
-- equipment_availability nor a trading_post_equipment row, so after promotion they are
-- unreachable through the Equipment List and the Trading Post alike.
--
-- No fighter_type-based fix can express this. A promoted Prime is type=Prime,
-- subtypes=[Leader, Specialist], specialisation=Sniper -- a combination no fighter_types row has
-- or ever will. So the specialisation becomes a scope, joining the gang_variant_id /
-- fighter_subtype / excluded scopes added by 20260822120000.
--
-- The reader lives in supabase/functions/get_equipment_detailed_data.sql and is deployed
-- separately (see supabase/README.md). This migration must be applied BEFORE that deploy: until
-- the function is redeployed the moved rows below grant nothing, because the current join
-- requires a fighter_type match.

ALTER TABLE public.fighter_type_equipment
    ADD COLUMN IF NOT EXISTS fighter_specialisation_id uuid
        REFERENCES public.fighter_specialisations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.fighter_type_equipment.fighter_specialisation_id IS
  'Restricts the row to fighters carrying this specialisation, matched against '
  'fighters.fighter_specialisation_id. An FK rather than a name -- unlike fighter_subtype, which is '
  'text because subtypes live as names in jsonb arrays -- because specialisations are a catalogue '
  'table. NULL applies regardless of specialisation. Set with fighter_type_id NULL so the grant '
  'follows the fighter through a promotion that changes their type.';

-- Dead row from 2025-07-27 with no fighter type, vehicle, custom type or gang scope. It grants
-- nothing today because the join requires a type match, but once scope-only rows are legal it
-- would grant its equipment to every fighter in the game. Removed before the CHECK below, which
-- is what stops another one being created.
DELETE FROM public.fighter_type_equipment
WHERE fighter_type_id IS NULL
  AND vehicle_type_id IS NULL
  AND custom_fighter_type_id IS NULL
  AND gang_type_id IS NULL
  AND gang_origin_id IS NULL
  AND gang_variant_id IS NULL
  AND fighter_subtype IS NULL;

ALTER TABLE public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_scope_not_empty CHECK (
        fighter_type_id           IS NOT NULL
     OR vehicle_type_id           IS NOT NULL
     OR custom_fighter_type_id    IS NOT NULL
     OR gang_type_id              IS NOT NULL
     OR gang_origin_id            IS NOT NULL
     OR gang_variant_id           IS NOT NULL
     OR fighter_subtype           IS NOT NULL
     OR fighter_specialisation_id IS NOT NULL
    );

-- The scope key gains the new column. Without this, two rows differing only by specialisation
-- collide: the index is NULLS NOT DISTINCT, so both would key as the same all-NULL scope.
DROP INDEX IF EXISTS public.fighter_type_equipment_fighter_scope_uidx;
CREATE UNIQUE INDEX fighter_type_equipment_fighter_scope_uidx
    ON public.fighter_type_equipment
       (equipment_id, fighter_type_id, custom_fighter_type_id, fighter_subtype,
        gang_variant_id, gang_type_id, gang_origin_id, fighter_specialisation_id)
    NULLS NOT DISTINCT
    WHERE vehicle_type_id IS NULL;

-- No data move here. The 14 live rows that need it -- House Van Saar Tek (Sniper: Long las,
-- Refraction cloak; Tech: Augurspex, Vox array; Gunner: Carapace armour - light,
-- Flamer/man-catcher; Medic: Servo-Medicae) and Ash Waste Nomads Warrior (Brawler: seven melee
-- weapons) -- are re-authored by an admin through the Specialisation Equipment section of the
-- equipment modal once this ships. Until then those items stay on their cloned fighter_types rows
-- and behave exactly as they do today.
