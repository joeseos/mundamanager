-- Gang-wide weapon rules: a change to every weapon a gang's own fighters carry, decided by the
-- gang's type, origin or subtype rather than stored per fighter or per weapon.
--
-- First user: the N26 Chymist Cult's "Deadly Poisons" -- weapons with Toxin and without Shred gain
-- Shred (6+). Without this the rule needs a duplicate of every Toxin weapon.
--
-- The change itself is an ordinary fighter_effect_types row in the new 'gang-weapon-rules'
-- category, so it reuses type_specific_data (requires_traits, excludes_traits, traits_to_add,
-- traits_to_remove) and fighter_effect_type_modifiers for stat changes, and the existing effect
-- editor. This table only says which gangs it applies to, in the same shape as
-- fighter_type_availability.
--
-- The app resolves the rules when it assembles a roster (utils/gangWeaponRules.ts) and applies
-- them only to fighters of the gang's own gang type: hired guns, Dramatis Personae and
-- subtype-granted fighters keep their own rules.

INSERT INTO public.fighter_effect_categories (category_name)
SELECT 'gang-weapon-rules'
WHERE NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_categories WHERE category_name = 'gang-weapon-rules'
);

CREATE TABLE public.gang_weapon_rules (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz,

    -- the change, kept in the effect's type_specific_data and modifiers
    fighter_effect_type_id uuid        NOT NULL REFERENCES public.fighter_effect_types(id) ON DELETE CASCADE,

    -- gang scope: every non-NULL axis must match, at least one must be set
    gang_type_id           uuid        REFERENCES public.gang_types(id) ON DELETE CASCADE,
    gang_origin_id         uuid        REFERENCES public.gang_origins(id) ON DELETE CASCADE,
    gang_subtype_id        uuid        REFERENCES public.gang_subtype_types(id) ON DELETE CASCADE,

    excluded               boolean     NOT NULL DEFAULT false,

    CONSTRAINT gang_weapon_rules_scope_chk CHECK (
        num_nonnulls(gang_type_id, gang_origin_id, gang_subtype_id) >= 1
    )
);

COMMENT ON TABLE public.gang_weapon_rules IS
  'Which gangs a gang-weapon-rules fighter effect type applies to. The rule applies when at least '
  'one of its non-excluded rows matches the gang and none of its excluded rows does.';
COMMENT ON COLUMN public.gang_weapon_rules.excluded IS
  'true denies the rule to gangs matching this row''s scope, e.g. a subtype that cancels a house '
  'rule. A deny wins over any grant of the same rule.';
COMMENT ON CONSTRAINT gang_weapon_rules_scope_chk ON public.gang_weapon_rules IS
  'At least one scope axis must be set; an all-NULL scope would apply to every gang in the game.';

-- excluded is deliberately not in the key, so a grant and a deny for one scope collide.
CREATE UNIQUE INDEX gang_weapon_rules_scope_uidx
    ON public.gang_weapon_rules
       (fighter_effect_type_id, gang_type_id, gang_origin_id, gang_subtype_id)
    NULLS NOT DISTINCT;

ALTER TABLE public.gang_weapon_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang_weapon_rules"
    ON public.gang_weapon_rules
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY gang_weapon_rules_admin_insert_policy
    ON public.gang_weapon_rules
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY gang_weapon_rules_admin_update_policy
    ON public.gang_weapon_rules
    FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin()))
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY gang_weapon_rules_admin_delete_policy
    ON public.gang_weapon_rules
    FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gang_weapon_rules
    TO authenticated, service_role;

-- N26 Chymist Cult: Deadly Poisons
DO $$
DECLARE
    c_chymist_cult constant uuid := 'd600367a-d82a-4923-a6da-b766da74c8bb';
    v_effect_type  uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.gang_types WHERE id = c_chymist_cult) THEN
        RAISE EXCEPTION 'gang_weapon_rules: Chymist Cult gang type % not found', c_chymist_cult;
    END IF;

    INSERT INTO public.fighter_effect_types (effect_name, fighter_effect_category_id, type_specific_data, edition_id)
    SELECT 'Deadly Poisons',
           c.id,
           '{"requires_traits": ["Toxin"], "excludes_traits": ["Shred"], "traits_to_add": ["Shred (6+)"]}'::jsonb,
           gt.edition_id
    FROM public.fighter_effect_categories c
    JOIN public.gang_types gt ON gt.id = c_chymist_cult
    WHERE c.category_name = 'gang-weapon-rules'
    RETURNING id INTO v_effect_type;

    INSERT INTO public.gang_weapon_rules (fighter_effect_type_id, gang_type_id)
    VALUES (v_effect_type, c_chymist_cult);
END $$;
