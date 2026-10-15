-- Rename gang_types.gang_type_id → id.
--
-- Every other table keys on a uuid named id. gang_types also had a bigint
-- identity column named id, but nothing used it: no foreign key, view, policy,
-- function or app query references it. Its only use was in the composite
-- primary key (id, gang_type_id). The uuid gang_type_id is the real key, and
-- every foreign key points at it. Drop the bigint, rename the uuid to id, and
-- make id the primary key on its own. The uuid values don't change, so every
-- gang_type_id column in other tables still points at the same rows.
--
-- DEPLOY ORDER: apply this migration BEFORE merging the PR that ships it.
-- The merge deploys supabase/functions/*.sql, whose bodies read gang_types.id,
-- and the new app code, which reads gang_types.id. Both break on the old
-- schema. The functions that read the column are recreated below, so the
-- database is consistent as soon as this commits, and the deploy-on-merge then
-- re-applies the same bodies.
--
-- Hard cutover: the app that is live until the merge deploys still reads
-- gang_types.gang_type_id, so merge right after applying this.

BEGIN;

-- Re-adding the foreign keys below needs ACCESS EXCLUSIVE on every table that
-- references gang_types. Take all the locks first, in one fixed order, and
-- give up after a few seconds rather than queue every gang read behind a long
-- query. If it times out, nothing has changed; run it again.
SET LOCAL lock_timeout = '5s';
LOCK TABLE
  public.gang_types,
  public.gangs,
  public.fighter_types,
  public.fighter_type_equipment,
  public.fighter_type_gang_cost,
  public.fighter_type_availability,
  public.count_limits,
  public.tactics_cards_packs
IN ACCESS EXCLUSIVE MODE;

-- No foreign key uses the composite primary key; they all use one of the
-- unique constraints handled below.
ALTER TABLE public.gang_types DROP CONSTRAINT gang_types_pkey;

-- Also drops its identity sequence, gang_types_id_seq.
ALTER TABLE public.gang_types DROP COLUMN id;

ALTER TABLE public.gang_types RENAME COLUMN gang_type_id TO id;

-- The single-column foreign keys are bound to the UNIQUE (gang_type_id) index,
-- which would duplicate the new primary key. Postgres can't rebind a foreign key
-- to another index, so drop them, swap the unique constraint for the primary
-- key, and re-add them with the same names and actions.
ALTER TABLE public.count_limits DROP CONSTRAINT count_limits_gang_type_id_fkey;
ALTER TABLE public.fighter_type_availability DROP CONSTRAINT fighter_type_availability_gang_type_id_fkey;
ALTER TABLE public.fighter_type_equipment DROP CONSTRAINT fighter_type_equipment_gang_type_id_fkey;
ALTER TABLE public.fighter_type_gang_cost DROP CONSTRAINT fighter_type_gang_cost_gang_type_id_fkey;
ALTER TABLE public.fighter_types DROP CONSTRAINT fighter_types_gang_type_id_fkey;
ALTER TABLE public.gangs DROP CONSTRAINT gangs_gang_type_id_fkey;
ALTER TABLE public.tactics_cards_packs DROP CONSTRAINT tactics_cards_packs_gang_type_id_fkey;

-- Fails, rolling everything back, if any foreign key not listed above still
-- depends on it.
ALTER TABLE public.gang_types DROP CONSTRAINT gang_types_gang_type_id_key;

ALTER TABLE public.gang_types ADD CONSTRAINT gang_types_pkey PRIMARY KEY (id);

ALTER TABLE public.count_limits
  ADD CONSTRAINT count_limits_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.fighter_type_availability
  ADD CONSTRAINT fighter_type_availability_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.fighter_type_equipment
  ADD CONSTRAINT fighter_type_equipment_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.fighter_type_gang_cost
  ADD CONSTRAINT fighter_type_gang_cost_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.fighter_types
  ADD CONSTRAINT fighter_types_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.gangs
  ADD CONSTRAINT gangs_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;
ALTER TABLE public.tactics_cards_packs
  ADD CONSTRAINT tactics_cards_packs_gang_type_id_fkey FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(id) ON DELETE CASCADE;

-- RENAME COLUMN already updated the definitions of this constraint, the three
-- composite foreign keys that use it (fighter_types, tactics_cards_packs and
-- the gang_types parent link), and gang_types_parent_not_self_check. Only this
-- name still says gang_type_id.
ALTER TABLE public.gang_types
  RENAME CONSTRAINT gang_types_gang_type_id_edition_id_key TO gang_types_id_edition_id_key;

COMMENT ON COLUMN public.gang_types.parent_gang_type_id IS 'House this gang list belongs to. House Escher: Wyld Hunt stores House Escher''s id here; House Escher itself stores null. Each row keeps its own fighter types.';

-- Function bodies are stored as text, so RENAME COLUMN does not touch them.
-- Same signatures and return types as before, so CREATE OR REPLACE keeps the
-- existing grants and the trigger. Bodies match supabase/functions/*.sql.

-- add_fighter_injury
CREATE OR REPLACE FUNCTION public.add_fighter_injury(
    in_fighter_id UUID,
    in_injury_type_id UUID,
    in_user_id UUID,
    in_target_equipment_id UUID DEFAULT NULL,
    in_hatred_target_id UUID DEFAULT NULL
)
RETURNS TABLE (result JSON) AS $$
DECLARE
    new_effect_id UUID;
    effect_type_record RECORD;
    modifier_record RECORD;
    skill_id_val UUID;
    new_fighter_skill_id UUID;
    new_fighter_effect_skill_id UUID;
    v_is_admin BOOLEAN;
    v_user_has_access BOOLEAN;
    v_gang_id UUID;
    v_fighter_owner_id UUID;
    injury_count INTEGER;
    is_partially_deafened BOOLEAN;
    v_merged_tsd JSONB;
    v_hatred_target TEXT;
    v_target_name TEXT;
    v_target_colour TEXT;
    v_target_gang_id UUID;
    v_fighter_edition_id UUID;
    v_shares_campaign BOOLEAN;
BEGIN
    -- Set user context for is_admin check
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);

    -- Check if user is an admin
    SELECT private.is_admin() INTO v_is_admin;

    -- Get the gang_id and user_id for the fighter
    SELECT gang_id, user_id INTO v_gang_id, v_fighter_owner_id
    FROM fighters
    WHERE id = in_fighter_id;

    -- If not admin, check if user owns the gang OR is an arbitrator for a campaign containing the gang
    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1
            FROM gangs
            WHERE id = v_gang_id AND user_id = in_user_id
        ) OR EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            WHERE cg.gang_id = v_gang_id AND cg.status = 'ACCEPTED' AND private.is_arb(cg.campaign_id)
        ) INTO v_user_has_access;

        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to add effects to this fighter';
        END IF;
    END IF;

    -- Get the effect type details from fighter_effect_types
    SELECT * INTO effect_type_record
    FROM fighter_effect_types
    WHERE id = in_injury_type_id;

    -- Validate that the effect type exists
    IF effect_type_record.id IS NULL THEN
        RAISE EXCEPTION 'The provided fighter effect type ID does not exist';
    END IF;

    -- Validate the effect type's category. 'lasting damages' is here because an
    -- N26 vehicle IS a fighter: it has no `vehicles` row, so its damage must hang
    -- off fighter_effects.fighter_id (which this function writes) rather than
    -- vehicle_id (which add_vehicle_effect writes, for N23 vehicles).
    IF effect_type_record.fighter_effect_category_id NOT IN (
        SELECT id FROM fighter_effect_categories
        WHERE category_name IN ('injuries', 'rig-glitches', 'lasting damages')
    ) THEN
        RAISE EXCEPTION 'The provided fighter effect type is not an injury, rig glitch or lasting damage';
    END IF;

    -- Check if this is "Partially Deafened"
    is_partially_deafened := effect_type_record.effect_name = 'Partially Deafened';
    
    -- Base type_specific_data for the new effect row (template + optional Hatred (X) target)
    v_merged_tsd := COALESCE(effect_type_record.type_specific_data, '{}'::jsonb);

    v_hatred_target := effect_type_record.type_specific_data->>'hatred_target';

    -- Always optional: skirmish play has no opponent to name.
    IF in_hatred_target_id IS NOT NULL THEN
        IF v_hatred_target IS NULL THEN
            RAISE EXCEPTION 'This lasting injury does not take a Hatred target';
        END IF;

        -- Membership must be ACCEPTED, matching the permission check above: this
        -- function is SECURITY DEFINER and directly callable, so it is the
        -- enforcement boundary, not the UI's candidate list.
        IF v_hatred_target = 'gang' THEN
            IF in_hatred_target_id = v_gang_id THEN
                RAISE EXCEPTION 'Hatred target gang cannot be the fighter''s own gang';
            END IF;

            SELECT EXISTS (
                SELECT 1
                FROM campaign_gangs cg1
                INNER JOIN campaign_gangs cg2 ON cg1.campaign_id = cg2.campaign_id
                WHERE cg1.gang_id = v_gang_id
                  AND cg2.gang_id = in_hatred_target_id
                  AND cg1.status = 'ACCEPTED'
                  AND cg2.status = 'ACCEPTED'
            ) INTO v_shares_campaign;

            IF NOT COALESCE(v_shares_campaign, false) THEN
                RAISE EXCEPTION 'Hatred target gang must share a campaign with the fighter''s gang';
            END IF;

            SELECT g.name, g.gang_colour::text
            INTO STRICT v_target_name, v_target_colour
            FROM gangs g
            WHERE g.id = in_hatred_target_id;

        ELSIF v_hatred_target = 'gang_type' THEN
            -- Global catalog, so no campaign constraint (works in skirmish).
            -- Edition must match, or an N23 type could land on an N26 fighter.
            -- Official types only.
            SELECT COALESCE(gt.edition_id, cgt.edition_id)
            INTO v_fighter_edition_id
            FROM gangs g
            LEFT JOIN gang_types gt ON gt.id = g.gang_type_id
            LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
            WHERE g.id = v_gang_id;

            SELECT gt.gang_type
            INTO v_target_name
            FROM gang_types gt
            WHERE gt.id = in_hatred_target_id
              AND gt.edition_id IS NOT DISTINCT FROM v_fighter_edition_id;

            IF v_target_name IS NULL THEN
                RAISE EXCEPTION 'Hatred target gang type does not exist in the fighter''s edition';
            END IF;

            v_target_colour := NULL;

        ELSIF v_hatred_target = 'fighter' THEN
            SELECT f.fighter_name, f.gang_id
            INTO v_target_name, v_target_gang_id
            FROM fighters f
            WHERE f.id = in_hatred_target_id;

            IF v_target_gang_id IS NULL THEN
                RAISE EXCEPTION 'Hatred target fighter does not exist';
            END IF;

            IF v_target_gang_id = v_gang_id THEN
                RAISE EXCEPTION 'Hatred target fighter cannot belong to the fighter''s own gang';
            END IF;

            SELECT EXISTS (
                SELECT 1
                FROM campaign_gangs cg1
                INNER JOIN campaign_gangs cg2 ON cg1.campaign_id = cg2.campaign_id
                WHERE cg1.gang_id = v_gang_id
                  AND cg2.gang_id = v_target_gang_id
                  AND cg1.status = 'ACCEPTED'
                  AND cg2.status = 'ACCEPTED'
            ) INTO v_shares_campaign;

            IF NOT COALESCE(v_shares_campaign, false) THEN
                RAISE EXCEPTION 'Hatred target fighter must belong to a gang sharing a campaign with the fighter''s gang';
            END IF;

            v_target_colour := NULL;

        ELSE
            RAISE EXCEPTION 'Unknown Hatred target kind: %', v_hatred_target;
        END IF;

        -- Denormalised snapshots; deliberately not kept in sync on rename.
        v_merged_tsd := v_merged_tsd || jsonb_build_object(
            'hatred_target_kind', v_hatred_target,
            'hatred_target_id', in_hatred_target_id::text,
            'hatred_target_name', v_target_name,
            'hatred_target_colour', v_target_colour
        );
    END IF;

    -- Count existing instances of this injury for the fighter
    SELECT COUNT(*) INTO injury_count
    FROM fighter_effects
    WHERE fighter_id = in_fighter_id
    AND fighter_effect_type_id = in_injury_type_id;

    -- Insert the new fighter effect with fighter owner's user_id
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        user_id,
        fighter_equipment_id
    )
    VALUES (
        in_fighter_id,
        in_injury_type_id,
        effect_type_record.effect_name,
        v_merged_tsd,
        v_fighter_owner_id,
        in_target_equipment_id
    )
    RETURNING id INTO new_effect_id;

    -- Create the modifiers associated with this effect type
    -- For "Partially Deafened", only add the leadership modifier if this isn't the first instance
    FOR modifier_record IN
        SELECT * FROM fighter_effect_type_modifiers
        WHERE fighter_effect_type_id = in_injury_type_id
    LOOP
        -- Skip leadership modifier for first instance of Partially Deafened
        IF NOT (is_partially_deafened AND injury_count = 0 AND modifier_record.stat_name = 'leadership') THEN
            INSERT INTO fighter_effect_modifiers (
                fighter_effect_id,
                stat_name,
                numeric_value
            )
            VALUES (
                new_effect_id,
                modifier_record.stat_name,
                modifier_record.default_numeric_value
            );
        END IF;
    END LOOP;

    -- Check if there's a skill_id in the type_specific_data and add the skill relation
    IF effect_type_record.type_specific_data->>'skill_id' IS NOT NULL THEN
        skill_id_val := (effect_type_record.type_specific_data->>'skill_id')::UUID;

        -- Add the skill to fighter_skills if it doesn't already exist
        INSERT INTO fighter_skills (
            fighter_id,
            skill_id,
            user_id,
            fighter_effect_skill_id
        )
        SELECT
            in_fighter_id,
            skill_id_val,
            v_fighter_owner_id,
            NULL  -- Initially NULL, will update after creating relation
        WHERE
            NOT EXISTS (
                SELECT 1 FROM fighter_skills
                WHERE fighter_id = in_fighter_id AND skill_id = skill_id_val
            )
        RETURNING id INTO new_fighter_skill_id;

        -- If the skill already exists, get its ID
        IF new_fighter_skill_id IS NULL THEN
            SELECT id INTO new_fighter_skill_id
            FROM fighter_skills
            WHERE fighter_id = in_fighter_id AND skill_id = skill_id_val;
        END IF;

        -- Create the relation in fighter_effect_skills
        IF new_fighter_skill_id IS NOT NULL THEN
            INSERT INTO fighter_effect_skills (
                fighter_effect_id,
                fighter_skill_id
            )
            VALUES (
                new_effect_id,
                new_fighter_skill_id
            )
            RETURNING id INTO new_fighter_effect_skill_id;

            -- Update the fighter_skills record with the relation ID
            UPDATE fighter_skills
            SET fighter_effect_skill_id = new_fighter_effect_skill_id
            WHERE id = new_fighter_skill_id;
        END IF;
    END IF;

    -- Return the newly created effect
    RETURN QUERY
    SELECT json_build_object(
        'id', fe.id,
        'created_at', fe.created_at,
        'fighter_id', fe.fighter_id,
        'user_id', fe.user_id,
        'effect_name', fe.effect_name,
        'effect_type', (
            SELECT json_build_object(
                'id', fet.id,
                'effect_name', fet.effect_name,
                'category', (
                    SELECT json_build_object(
                        'id', fec.id,
                        'category_name', fec.category_name
                    )
                    FROM fighter_effect_categories fec
                    WHERE fec.id = fet.fighter_effect_category_id
                )
            )
            FROM fighter_effect_types fet
            WHERE fet.id = fe.fighter_effect_type_id
        ),
        'type_specific_data', fe.type_specific_data,
        'modifiers', (
            SELECT json_agg(
                json_build_object(
                    'id', fem.id,
                    'stat_name', fem.stat_name,
                    'numeric_value', fem.numeric_value
                )
            )
            FROM fighter_effect_modifiers fem
            WHERE fem.fighter_effect_id = fe.id
        ),
        'related_skills', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'fighter_skill_id', fs.id,
                    'skill_id', fs.skill_id,
                    'fighter_effect_skill_id', fs.fighter_effect_skill_id
                )
            ), '[]'::json)
            FROM fighter_effect_skills fes
            JOIN fighter_skills fs ON fes.fighter_skill_id = fs.id
            WHERE fes.fighter_effect_id = fe.id
        )
    ) as result
    FROM fighter_effects fe
    WHERE fe.id = new_effect_id;
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private;

-- gang_types_parent_must_be_root (trigger on gang_types)
CREATE OR REPLACE FUNCTION public.gang_types_parent_must_be_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_gang_type_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.gang_types
      WHERE id = NEW.parent_gang_type_id
        AND parent_gang_type_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'parent_gang_type_id must reference a root gang type';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.gang_types
      WHERE parent_gang_type_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'cannot set parent_gang_type_id on a gang type that is already a parent of other gang lists';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- get_available_skills
CREATE OR REPLACE FUNCTION public.get_available_skills(
    fighter_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
    v_fighter_subtypes jsonb;
    v_gang_origin_id uuid;
    v_gang_id uuid;
    v_fighter_type_id uuid;
    v_custom_fighter_type_id uuid;
    v_origin_skill_type_id uuid;
    v_edition_id uuid;
    v_cumulative_xp boolean; -- Edition earns Advancements by rank instead of buying them
BEGIN
    -- Get fighter subtypes, gang origin ID, gang ID, fighter type IDs, the gang's
    -- edition, and verify fighter exists
    SELECT f.fighter_subtypes, g.gang_origin_id, f.gang_id, f.fighter_type_id, f.custom_fighter_type_id,
           COALESCE(gt.edition_id, cgt.edition_id)
    INTO v_fighter_subtypes, v_gang_origin_id, v_gang_id, v_fighter_type_id, v_custom_fighter_type_id,
         v_edition_id
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    LEFT JOIN gang_types gt ON gt.id = g.gang_type_id
    LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

    -- Resolved once here, as get_fighter_available_advancements does.
    v_cumulative_xp := v_edition_id IS NOT NULL
        AND v_edition_id = (SELECT id FROM editions WHERE slug = 'n26');

    -- Skill Set whose name matches the gang Origin (e.g. "Trocken Mining Clan")
    SELECT st.id
    INTO v_origin_skill_type_id
    FROM gang_origins go
    JOIN skill_types st ON lower(trim(st.name)) = lower(trim(go.origin_name))
    WHERE go.id = v_gang_origin_id;

    -- Build the result as JSON using CTEs to combine standard + custom skills
    WITH standard_skills AS (
        SELECT
            s.id AS skill_id,
            s.name AS skill_name,
            false AS is_custom,
            s.skill_type_id,
            st.name AS skill_type_name,
            st.legendary_name,
            COALESCE(
                sao.access_level,
                ftsa.access_level,
                CASE
                    WHEN s.skill_type_id = v_origin_skill_type_id THEN 'primary'
                    ELSE NULL
                END
            ) AS effective_access_level,
            NOT EXISTS (
                SELECT 1 FROM fighter_skills fs
                WHERE fs.fighter_id = get_available_skills.fighter_id
                AND fs.skill_id = s.id
            ) AS available,
            COALESCE(skill_effect.skill_cost, 0) AS skill_cost
        FROM skills s
        JOIN skill_types st ON st.id = s.skill_type_id
        LEFT JOIN fighter_type_skill_access ftsa ON ftsa.skill_type_id = s.skill_type_id
            AND (
                (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
                OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
            )
        LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
            AND sao.skill_type_id = s.skill_type_id
        LEFT JOIN LATERAL (
            SELECT COALESCE((fet.type_specific_data->>'cost')::int, 0) AS skill_cost
            FROM fighter_effect_types fet
            WHERE (fet.type_specific_data->>'skill_id')::uuid = s.id
            LIMIT 1
        ) skill_effect ON true
        WHERE (s.gang_origin_id IS NULL OR s.gang_origin_id = v_gang_origin_id)
        AND COALESCE(
            sao.access_level,
            ftsa.access_level,
            CASE
                WHEN s.skill_type_id = v_origin_skill_type_id THEN 'primary'
                ELSE 'none'
            END,
            'none'
        ) != 'denied'
    ),
    visible_custom_skills AS (
        SELECT
            cs.id AS skill_id,
            cs.skill_name AS skill_name,
            true AS is_custom,
            COALESCE(cs.skill_type_id, cs.custom_skill_type_id) AS skill_type_id,
            COALESCE(st.name, cst.name) AS skill_type_name,
            COALESCE(st.legendary_name, false) AS legendary_name,
            COALESCE(
                sao.access_level,
                ftsa.access_level,
                -- Origin grants apply to standard skill_types only, not custom_skill_type_id
                CASE
                    WHEN cs.skill_type_id = v_origin_skill_type_id THEN 'primary'
                    ELSE NULL
                END
            ) AS effective_access_level,
            NOT EXISTS (
                SELECT 1 FROM fighter_skills fs
                WHERE fs.fighter_id = get_available_skills.fighter_id
                AND fs.custom_skill_id = cs.id
            ) AS available,
            0 AS skill_cost
        FROM custom_skills cs
        LEFT JOIN skill_types st ON st.id = cs.skill_type_id
        LEFT JOIN custom_skill_types cst ON cst.id = cs.custom_skill_type_id
        -- Visibility: owned by current user OR shared to fighter's gang's campaign
        LEFT JOIN (
            SELECT DISTINCT csh.custom_skill_id
            FROM custom_shared csh
            JOIN campaign_gangs cg ON cg.campaign_id = csh.campaign_id
            WHERE cg.gang_id = v_gang_id
        ) shared ON shared.custom_skill_id = cs.id
        -- Access level joins: match on skill_type_id OR custom_skill_type_id
        LEFT JOIN fighter_type_skill_access ftsa ON (
                (ftsa.skill_type_id IS NOT NULL AND ftsa.skill_type_id = cs.skill_type_id)
                OR (ftsa.custom_skill_type_id IS NOT NULL AND ftsa.custom_skill_type_id = cs.custom_skill_type_id)
            )
            AND (
                (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
                OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
            )
        LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
            AND (sao.skill_type_id = cs.skill_type_id OR sao.skill_type_id = cs.custom_skill_type_id)
        WHERE (cs.user_id = auth.uid() OR shared.custom_skill_id IS NOT NULL)
        AND COALESCE(
            sao.access_level,
            ftsa.access_level,
            -- Origin grants apply to standard skill_types only, not custom_skill_type_id
            CASE
                WHEN cs.skill_type_id = v_origin_skill_type_id THEN 'primary'
                ELSE 'none'
            END,
            'none'
        ) != 'denied'
    ),
    all_skills AS (
        SELECT * FROM standard_skills
        UNION ALL
        SELECT * FROM visible_custom_skills
    )
    SELECT jsonb_build_object(
        'fighter_id', get_available_skills.fighter_id,
        'fighter_subtypes', v_fighter_subtypes,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'skill_id', a.skill_id,
                    'skill_name', a.skill_name,
                    'is_custom', a.is_custom,
                    'skill_type_id', a.skill_type_id,
                    'skill_type_name', a.skill_type_name,
                    'effective_access_level', a.effective_access_level,
                    'available', a.available,
                    'cost', a.skill_cost,
                    'available_acquisition_types', CASE
                        -- Special costs for Legendary Names
                        WHEN a.legendary_name = TRUE THEN
                            jsonb_build_array(
                                jsonb_build_object(
                                    'type_id', 'selected',
                                    'name', 'Selected',
                                    'xp_cost', 6,
                                    'credit_cost', 5
                                ),
                                jsonb_build_object(
                                    'type_id', 'random',
                                    'name', 'Random',
                                    'xp_cost', 3,
                                    'credit_cost', 5
                                )
                            )
                        -- Regular skill costs. The subtype list is an N23 rule — it omits
                        -- Gangers and Exotic Beasts, who buy at flat cost off their own
                        -- table. A rank-based edition has no such split.
                        WHEN v_cumulative_xp
                          OR v_fighter_subtypes ?| array['Leader', 'Champion', 'Juve', 'Specialist', 'Crew', 'Prospect', 'Brute', 'Exotic Beast Specialist']
                        THEN jsonb_build_array(
                            jsonb_build_object(
                                'type_id', 'primary_selected',
                                'name', 'Selected Primary',
                                'xp_cost', 9,
                                'credit_cost', 20
                            ),
                            jsonb_build_object(
                                'type_id', 'primary_random',
                                'name', 'Random Primary',
                                'xp_cost', 6,
                                'credit_cost', 20
                            ),
                            jsonb_build_object(
                                'type_id', 'secondary_selected',
                                'name', 'Selected Secondary',
                                'xp_cost', 12,
                                'credit_cost', 35
                            ),
                            jsonb_build_object(
                                'type_id', 'secondary_random',
                                'name', 'Random Secondary',
                                'xp_cost', 9,
                                'credit_cost', 35
                            ),
                            jsonb_build_object(
                                'type_id', 'any_random',
                                'name', 'Random Any',
                                'xp_cost', 15,
                                'credit_cost', 50
                            )
                        )
                        ELSE '[]'::jsonb
                    END
                )
                ORDER BY a.skill_type_name, a.skill_name
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM all_skills a;

    RETURN v_result;
END;
$$;

-- get_equipment_detailed_data
CREATE OR REPLACE FUNCTION public.get_equipment_detailed_data(
    gang_type_id uuid DEFAULT NULL,          -- $1
    equipment_category text DEFAULT NULL,     -- $2
    fighter_type_id uuid DEFAULT NULL,        -- $3
    fighter_type_equipment boolean DEFAULT NULL, -- $4
    equipment_tradingpost boolean DEFAULT NULL,  -- $5
    fighter_id uuid DEFAULT NULL,             -- $6
    only_equipment_id uuid DEFAULT NULL,      -- $7
    gang_id uuid DEFAULT NULL,               -- $8
    campaign_trading_post_type_ids uuid[] DEFAULT NULL, -- $9
    campaign_custom_trading_post_ids uuid[] DEFAULT NULL -- $10
)
RETURNS TABLE (
    id uuid,
    equipment_name text,
    availability text,
    base_cost numeric,
    adjusted_cost numeric,
    trade_points text,
    equipment_category text,
    equipment_type text,
    created_at timestamptz,
    fighter_type_equipment boolean,
    equipment_tradingpost boolean,
    is_custom boolean,
    weapon_profiles jsonb,
    vehicle_upgrade_slot text,
    grants_equipment jsonb,
    is_editable boolean,
    trading_post_names text[],
    cost_resource_name text,
    cost_resource_amount numeric,
    cost_type_resource_id uuid,
    cost_campaign_resource_id uuid,
    banned boolean,
    -- From count_limits; NULL is no limit
    min_count integer,
    max_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$

    -- =======================================================================
    -- 1. GANG CONTEXT (always exactly 1 row)
    -- =======================================================================
    WITH gang_data AS (
        SELECT
            g.gang_origin_id,
            g.gang_subtypes,
            g.alignment,
            g.custom_gang_type_id,
            cg.campaign_type_allegiance_id,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id  AS affiliation_ft_id,
            -- Empty for gang and vehicle calls, so a subtype rule matches nothing
            COALESCE(f.fighter_subtypes, ft_sub.fighter_subtypes, cft_sub.fighter_subtypes, '[]'::jsonb) AS fighter_subtypes,
            COALESCE(gt.edition_id, cgt.edition_id) AS edition_id
        FROM (SELECT 1) AS _dummy
        LEFT JOIN gangs g ON g.id = $8
        LEFT JOIN gang_types gt ON gt.id = g.gang_type_id
        LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
        LEFT JOIN fighter_types ft_sub ON ft_sub.id = $3
        LEFT JOIN custom_fighter_types cft_sub ON cft_sub.id = $3
        LEFT JOIN LATERAL (
            SELECT cg2.campaign_type_allegiance_id
            FROM campaign_gangs cg2
            WHERE cg2.gang_id = $8
            LIMIT 1
        ) cg ON true
        LEFT JOIN fighters f ON f.id = $6 AND f.gang_id = g.id
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
    ),

    -- =======================================================================
    -- 2. GANG'S OWN TRADING POST TYPE (cached once)
    -- =======================================================================
    gang_tp AS (
        SELECT gt.trading_post_type_id
        FROM gang_types gt
        WHERE gt.id = $1
          AND (
              $9 IS NULL
              OR gt.trading_post_type_id = ANY($9)
          )
    ),

    -- =======================================================================
    -- 3. TRADING POST ACCESS — computed once per equipment_id
    -- =======================================================================
    tp_access AS (
        -- Gang's own trading post
        SELECT tpe.equipment_id, tpt.trading_post_name
        FROM trading_post_equipment tpe
        JOIN gang_tp ON tpe.trading_post_type_id = gang_tp.trading_post_type_id
        JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id

        UNION

        -- Campaign authorised trading posts
        SELECT tpe.equipment_id, tpt.trading_post_name
        FROM trading_post_equipment tpe
        JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id
        WHERE $9 IS NOT NULL
          AND array_length($9, 1) > 0
          AND tpe.trading_post_type_id = ANY($9)

        UNION

        -- Custom trading post equipment (official equipment only)
        SELECT ctpe.equipment_id, ctp.custom_trading_post_name
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        WHERE ctpe.equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
    ),

    tp_summary AS (
        SELECT
            ta.equipment_id,
            true AS has_access,
            COALESCE(
                array_agg(DISTINCT ta.trading_post_name)
                    FILTER (WHERE ta.trading_post_name IS NOT NULL),
                '{}'::text[]
            ) AS tp_names
        FROM tp_access ta
        -- Gang-exclusive allow-list: an item flagged "available only to this gang"
        -- (an exclusive gang-type availability row) is hidden from the Trading Post
        -- of gangs that are not on its allow-list. Scoped to Trading Post access
        -- only, so the fighter's-list path is unaffected.
        WHERE NOT EXISTS (
                  SELECT 1 FROM equipment_availability xa
                  WHERE xa.equipment_id = ta.equipment_id
                    AND xa.exclusive AND xa.gang_type_id IS NOT NULL
              )
           OR EXISTS (
                  SELECT 1 FROM equipment_availability xa
                  WHERE xa.equipment_id = ta.equipment_id
                    AND xa.exclusive AND xa.gang_type_id = $1
              )
        GROUP BY ta.equipment_id
    ),

    -- =======================================================================
    -- 4. EQUIPMENT IDS WITH ORIGIN-SPECIFIC DISCOUNTS (for branching logic)
    -- =======================================================================
    origin_discount_equip AS (
        SELECT DISTINCT ed.equipment_id
        FROM equipment_discounts ed
        CROSS JOIN gang_data gd
        WHERE gd.gang_origin_id IS NOT NULL
          AND ed.gang_origin_id = gd.gang_origin_id
    ),

    -- =======================================================================
    -- 5. BEST ADJUSTED COST — computed once per equipment_id
    --    Replaces 2 correlated subqueries for adjusted_cost.
    -- =======================================================================
    best_adjusted_cost AS (
        SELECT
            ed.equipment_id,
            MIN(ed.adjusted_cost::numeric)
                FILTER (WHERE ed.adjusted_cost IS NOT NULL) AS best_adjusted_cost,
            -- Prefer any non-null trade_points override in the same discount scope.
            -- Cheapest numerically ("E"/non-numeric → 0); text ASC as stable tie-break.
            (ARRAY_AGG(
                ed.trade_points
                ORDER BY
                    CASE
                        WHEN upper(btrim(ed.trade_points)) = 'E' OR btrim(ed.trade_points) = '' THEN 0::numeric
                        WHEN ed.trade_points ~ '^[0-9]+$' THEN ed.trade_points::numeric
                        ELSE 0::numeric
                    END ASC,
                    ed.trade_points ASC
            ) FILTER (WHERE ed.trade_points IS NOT NULL))[1] AS best_trade_points
        FROM equipment_discounts ed
        CROSS JOIN gang_data gd
        WHERE
            (
                -- Origin-based path: equipment has origin-specific discounts
                ed.equipment_id IN (SELECT equipment_id FROM origin_discount_equip)
                AND (
                    ed.gang_origin_id = gd.gang_origin_id
                    OR ed.fighter_type_id = $3
                    OR (gd.legacy_ft_id IS NOT NULL AND ed.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                    OR (gd.affiliation_ft_id IS NOT NULL AND ed.fighter_type_id = gd.affiliation_ft_id)
                )
            )
            OR
            (
                -- Gang-type-based path: no origin-specific discounts
                ed.equipment_id NOT IN (SELECT equipment_id FROM origin_discount_equip)
                AND (
                    (ed.gang_type_id = $1 AND ed.fighter_type_id IS NULL)
                    OR ed.fighter_type_id = $3
                    OR (gd.legacy_ft_id IS NOT NULL AND ed.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                    OR (gd.affiliation_ft_id IS NOT NULL AND ed.fighter_type_id = gd.affiliation_ft_id)
                )
            )
        GROUP BY ed.equipment_id
    ),

    -- =======================================================================
    -- 6. CUSTOM TP OVERRIDES — per official equipment_id
    --    Resolves cost/availability overrides and adjusted cost from active
    --    custom TPs. Custom TP values take precedence over official values.
    --    Tiebreak: lowest sort_order, then earliest created_at.
    -- =======================================================================
    custom_tp_override AS (
        SELECT
            ctpe.equipment_id,
            MIN(ctpe.cost_override) FILTER (WHERE ctpe.cost_override IS NOT NULL) AS cost_override,
            (array_agg(ctpe.cost_type_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_type_resource_id IS NOT NULL))[1] AS cost_type_resource_id,
            (array_agg(ctpe.cost_campaign_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_campaign_resource_id IS NOT NULL))[1] AS cost_campaign_resource_id,
            (array_agg(ctpe.cost_resource_amount ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_amount IS NOT NULL))[1] AS cost_resource_amount,
            (array_agg(ctpe.cost_reputation ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_reputation))[1] AS cost_reputation,
            (array_agg(COALESCE(a.availability, ctpe.availability_override) ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE COALESCE(a.availability, ctpe.availability_override) IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost,
            bool_or(ctpe.banned) AS banned
        FROM custom_trading_post_equipment ctpe
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        LEFT JOIN custom_trading_post_availability a
            ON a.custom_trading_post_equipment_id = ctpe.id
            AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
            AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
            AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
            AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
            AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
            AND (a.alignment IS NULL OR a.alignment = gd.alignment)
        WHERE ctpe.equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
        GROUP BY ctpe.equipment_id
    ),

    -- =======================================================================
    -- 7. FIGHTER TYPE EQUIPMENT ROWS THAT CAN MATCH THIS REQUEST
    --    The main query's join condition, evaluated once. Joined per
    --    equipment row instead, it fetched every fighter type's rows for each
    --    item, which is the whole table on every call.
    -- =======================================================================
    fte_match AS MATERIALIZED (
        SELECT fte.id, fte.equipment_id, fte.fighter_type_id, fte.vehicle_type_id
        FROM fighter_type_equipment fte
        CROSS JOIN gang_data gd
        WHERE (fte.fighter_type_id = $3
               OR fte.vehicle_type_id = $3
               OR (gd.legacy_ft_id IS NOT NULL
                   AND (fte.fighter_type_id = gd.legacy_ft_id OR fte.vehicle_type_id = gd.legacy_ft_id)
                   AND $4 = true)
               OR (gd.affiliation_ft_id IS NOT NULL
                   AND (fte.fighter_type_id = gd.affiliation_ft_id OR fte.vehicle_type_id = gd.affiliation_ft_id))
               -- A subtype rule spanning every gang names no fighter of its own.
               -- fighter_subtype must be set, or an all-NULL row matches everything.
               OR (fte.fighter_type_id IS NULL
                   AND fte.vehicle_type_id IS NULL
                   AND fte.custom_fighter_type_id IS NULL
                   AND fte.fighter_subtype IS NOT NULL))
          AND (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gd.gang_origin_id)
          AND (fte.gang_subtype_id IS NULL OR gd.gang_subtypes ? fte.gang_subtype_id::text)
          AND (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
          AND (fte.fighter_subtype IS NULL OR gd.fighter_subtypes ? fte.fighter_subtype)
          -- Grants only: this join sets is_fighter_list, so a deny matching here would grant.
          AND NOT fte.excluded
    ),

    -- =======================================================================
    -- 8. CUSTOM EQUIPMENT THE CALLER CAN SEE
    --    The same three sources the custom branch filters on, gathered through
    --    their indexes so the branch no longer reads every user's custom
    --    equipment.
    -- =======================================================================
    custom_candidates AS MATERIALIZED (
        SELECT ce.id
        FROM custom_equipment ce
        WHERE ce.user_id = auth.uid()

        UNION

        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8
          AND cs.custom_equipment_id IS NOT NULL

        UNION

        SELECT ctpe.custom_equipment_id
        FROM custom_trading_post_equipment ctpe
        WHERE ctpe.custom_equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
    )

    -- =======================================================================
    -- MAIN QUERY — regular equipment
    -- =======================================================================
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Availability: trading post mode uses base, fighter list uses overrides
        CASE
            WHEN $5 = true THEN COALESCE(cto.availability_override, e.availability)
            ELSE COALESCE(
                cto.availability_override,
                (SELECT availability FROM equipment_availability
                 WHERE gang_origin_id = gd.gang_origin_id AND equipment_id = e.id LIMIT 1),
                ea_var.availability,
                ea.availability,
                e.availability
            )
        END AS availability,

        CASE
            WHEN cto.cost_type_resource_id IS NOT NULL
              OR cto.cost_campaign_resource_id IS NOT NULL
              OR cto.cost_reputation THEN e.cost::numeric
            ELSE COALESCE(cto.cost_override, e.cost::numeric)
        END AS base_cost,

        -- Adjusted cost: custom TP override wins, then official discounts, then base
        -- When paying with a resource, use original equipment cost for rating
        CASE
            WHEN cto.cost_type_resource_id IS NOT NULL
              OR cto.cost_campaign_resource_id IS NOT NULL
              OR cto.cost_reputation THEN e.cost::numeric
            WHEN cto.adjusted_cost IS NOT NULL THEN cto.adjusted_cost
            WHEN cto.cost_override IS NOT NULL THEN cto.cost_override
            WHEN $5 = true THEN e.cost::numeric
            ELSE COALESCE(bac.best_adjusted_cost, e.cost::numeric)
        END AS adjusted_cost,

        -- Trade Points: a Trading Post price, so the fighter's-list-only request pays none
        CASE
            WHEN $4 = true AND $5 IS NULL THEN '0'
            ELSE COALESCE(bac.best_trade_points, e.trade_points)
        END AS trade_points,

        e.equipment_category,
        e.equipment_type,
        e.created_at,

        -- Is in fighter's equipment list? (computed once in ftl_flag below)
        ftl_flag.is_fighter_list AS fighter_type_equipment,

        -- Has trading post access? (tp_summary is gang-exclusivity-aware)
        COALESCE(tp.has_access, false) AS equipment_tradingpost,

        false AS is_custom,

        -- Weapon profiles
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', wp.id,
                    'profile_name', wp.profile_name,
                    'range_short', wp.range_short,
                    'range_long', wp.range_long,
                    'acc_short', wp.acc_short,
                    'acc_long', wp.acc_long,
                    'strength', wp.strength,
                    'ap', wp.ap,
                    'damage', wp.damage,
                    'lethality', wp.lethality,
                    'ammo', wp.ammo,
                    'traits', wp.traits,
                    'sort_order', wp.sort_order
                ) ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
            ) FROM weapon_profiles wp WHERE wp.equipment_id = e.id),
            '[]'::jsonb
        ) AS weapon_profiles,

        -- Vehicle upgrade slot
        CASE
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'body_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Body'
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'drive_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Drive'
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'engine_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Engine'
                    ELSE NULL
                END
            )
            ELSE NULL
        END AS vehicle_upgrade_slot,

        -- Grants equipment
        CASE
            WHEN e.grants_equipment IS NOT NULL AND e.grants_equipment->'options' IS NOT NULL THEN
                jsonb_set(
                    e.grants_equipment,
                    '{options}',
                    COALESCE(
                        (SELECT jsonb_agg(
                            opt || jsonb_build_object('equipment_name', COALESCE(eq.equipment_name, 'Unknown'))
                        )
                        FROM jsonb_array_elements(e.grants_equipment->'options') opt
                        LEFT JOIN equipment eq ON eq.id = (opt->>'equipment_id')::uuid),
                        '[]'::jsonb
                    )
                )
            ELSE e.grants_equipment
        END AS grants_equipment,

        COALESCE(e.is_editable, false) AS is_editable,

        -- Trading post names (already aggregated in tp_summary)
        COALESCE(tp.tp_names, '{}'::text[]) AS trading_post_names,

        CASE WHEN cto.cost_reputation THEN 'Reputation'
             ELSE COALESCE(ctr_res.resource_name, cr_res.resource_name)
        END AS cost_resource_name,
        CASE WHEN cto.cost_type_resource_id IS NOT NULL
               OR cto.cost_campaign_resource_id IS NOT NULL
               OR cto.cost_reputation
             THEN cto.cost_resource_amount
        END AS cost_resource_amount,
        cto.cost_type_resource_id,
        cto.cost_campaign_resource_id,

        COALESCE(cto.banned, false) AS banned,

        lim.min_count,
        lim.max_count

    FROM equipment e
    CROSS JOIN gang_data gd

    -- Equipment availability joins (unchanged)
    LEFT JOIN equipment_availability ea
        ON e.id = ea.equipment_id AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var
        ON e.id = ea_var.equipment_id
        AND ea_var.gang_subtype_id IS NOT NULL
        AND gd.gang_subtypes ? ea_var.gang_subtype_id::text
    LEFT JOIN equipment_availability ea_origin
        ON e.id = ea_origin.equipment_id
        AND ea_origin.gang_origin_id IS NOT NULL
        AND ea_origin.gang_origin_id = gd.gang_origin_id

    -- Fighter type equipment (rows already filtered in fte_match)
    LEFT JOIN fte_match fte ON fte.equipment_id = e.id

    -- Is this system equipment on the current custom fighter type's equipment list?
    -- ($3 is a custom_fighter_types.id when the fighter is a custom fighter.)
    LEFT JOIN LATERAL (
        SELECT true AS is_ftl
        FROM custom_fighter_type_equipment cfte_sys
        WHERE cfte_sys.equipment_id = e.id
          AND cfte_sys.custom_fighter_type_id = $3
        LIMIT 1
    ) cftl ON true

    -- Single source of truth for "is this on the fighter's equipment list?"
    -- Referenced by the output column and the fighter-list filter branches below,
    -- so the predicate lives in exactly one place.
    LEFT JOIN LATERAL (
        SELECT (
            -- Any matched row counts, including a gang-wide subtype rule,
            -- which has neither id
            fte.id IS NOT NULL
            OR ea_var.id IS NOT NULL
            OR ea_origin.id IS NOT NULL
            OR cftl.is_ftl IS NOT NULL
        )
        -- ...unless a deny matches. Applied to the whole flag, not just the fighter_type_equipment
        -- branch, so it also overrides a gang-wide equipment_availability grant as its column
        -- comment promises. No fighter identity required: a row naming only a gang scope
        -- withholds the item from every fighter in that gang.
        AND NOT EXISTS (
            SELECT 1
            FROM fighter_type_equipment d
            WHERE d.equipment_id = e.id
              AND d.excluded
              -- Vehicle rows belong to the vehicle admin, which has no deny UI, so a deny
              -- cannot cancel a grant matched through fte.vehicle_type_id.
              AND d.vehicle_type_id IS NULL
              -- Same identity branches as the grant join above: a fighter reaching an equipment
              -- list through a legacy or affiliation type must be deniable through it too.
              AND (
                  d.fighter_type_id IS NULL
                  OR d.fighter_type_id = $3
                  OR (gd.legacy_ft_id IS NOT NULL AND d.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                  OR (gd.affiliation_ft_id IS NOT NULL AND d.fighter_type_id = gd.affiliation_ft_id)
              )
              AND (d.gang_origin_id  IS NULL OR d.gang_origin_id = gd.gang_origin_id)
              AND (d.gang_subtype_id IS NULL OR gd.gang_subtypes ? d.gang_subtype_id::text)
              AND (d.gang_type_id    IS NULL OR d.gang_type_id = $1)
              AND (d.fighter_subtype IS NULL OR gd.fighter_subtypes ? d.fighter_subtype)
        ) AS is_fighter_list
    ) ftl_flag ON true

    -- Pre-computed CTEs via simple LEFT JOINs
    LEFT JOIN best_adjusted_cost bac ON bac.equipment_id = e.id
    LEFT JOIN tp_summary tp ON tp.equipment_id = e.id
    LEFT JOIN custom_tp_override cto ON cto.equipment_id = e.id
    LEFT JOIN campaign_type_resources ctr_res ON ctr_res.id = cto.cost_type_resource_id
    LEFT JOIN campaign_resources cr_res ON cr_res.id = cto.cost_campaign_resource_id

    -- Count limit: the most specific matching rule wins, id breaking ties. A pet without
    -- rules of its own uses its fighter type's.
    LEFT JOIN LATERAL (
        SELECT cl.min_count, cl.max_count
        FROM count_limits cl
        WHERE (cl.equipment_id = e.id
               OR cl.fighter_type_id IN (SELECT eb.fighter_type_id FROM exotic_beasts eb WHERE eb.equipment_id = e.id))
          AND (cl.for_fighter_type_id IS NULL OR cl.for_fighter_type_id = $3)
          AND (cl.gang_type_id    IS NULL OR cl.gang_type_id   = $1)
          AND (cl.gang_origin_id  IS NULL OR cl.gang_origin_id = gd.gang_origin_id)
          AND (cl.gang_subtype_id IS NULL OR gd.gang_subtypes ? cl.gang_subtype_id::text)
        ORDER BY (cl.equipment_id IS NOT NULL) DESC,
                 (cl.for_fighter_type_id IS NOT NULL) DESC,
                 (cl.gang_subtype_id IS NOT NULL) DESC,
                 (cl.gang_origin_id  IS NOT NULL) DESC,
                 (cl.gang_type_id    IS NOT NULL) DESC,
                 cl.id
        LIMIT 1
    ) lim ON true

    WHERE
        -- Early filters (equipment category + specific ID)
        ($2 IS NULL OR trim(both from e.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR e.id = $7)
        -- Core equipment gating
        AND (
            COALESCE(e.core_equipment, false) = false
            OR (e.core_equipment = true AND (
                fte.fighter_type_id IS NOT NULL
                -- A matched gang-wide subtype rule carries no fighter id of its
                -- own, so it needs the same allowance is_fighter_list gives it
                OR (fte.id IS NOT NULL AND fte.fighter_type_id IS NULL AND fte.vehicle_type_id IS NULL)
                OR cftl.is_ftl IS NOT NULL
                OR $3 IS NULL
            ))
        )
        -- Fighter list / trading post filter logic
        AND (
            -- No filter
            ($4 IS NULL AND $5 IS NULL)
            OR
            -- Both filters: items in EITHER fighter's list OR trading post
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                ftl_flag.is_fighter_list = $4
                OR
                COALESCE(tp.has_access, false) = $5
            ))
            OR
            -- Fighter's list only
            ($4 IS NOT NULL AND $5 IS NULL AND ftl_flag.is_fighter_list = $4)
            OR
            -- Trading post only
            ($4 IS NULL AND $5 IS NOT NULL AND COALESCE(tp.has_access, false) = $5)
        )
        -- Unrestricted: only equipment from the gang's edition
        AND (
            NOT ($4 IS NULL AND $5 IS NULL)
            OR gd.edition_id IS NULL
            OR e.edition_id = gd.edition_id
        )

    UNION ALL

    -- =======================================================================
    -- CUSTOM EQUIPMENT
    -- =======================================================================
    SELECT
        ce.id,
        ce.equipment_name,
        COALESCE(custom_tp.availability_override, ce.availability) AS availability,
        CASE
            WHEN custom_tp.cost_type_resource_id IS NOT NULL
              OR custom_tp.cost_campaign_resource_id IS NOT NULL
              OR custom_tp.cost_reputation THEN ce.cost::numeric
            ELSE COALESCE(custom_tp.cost_override, ce.cost::numeric)
        END AS base_cost,
        CASE
            WHEN custom_tp.cost_type_resource_id IS NOT NULL
              OR custom_tp.cost_campaign_resource_id IS NOT NULL
              OR custom_tp.cost_reputation THEN ce.cost::numeric
            ELSE COALESCE(custom_tp.adjusted_cost, custom_tp.cost_override, ce.cost::numeric)
        END AS adjusted_cost,
        CASE
            WHEN $4 = true AND $5 IS NULL THEN '0'
            ELSE ce.trade_points
        END AS trade_points,
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        -- Custom equipment lives in the Trading Post; it is only on a fighter's
        -- list when assigned to that fighter's custom fighter type ($3).
        COALESCE(ftl.is_ftl, false) AS fighter_type_equipment,
        true AS equipment_tradingpost,
        true AS is_custom,
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', cwp.id,
                    'profile_name', cwp.profile_name,
                    'range_short', cwp.range_short,
                    'range_long', cwp.range_long,
                    'acc_short', cwp.acc_short,
                    'acc_long', cwp.acc_long,
                    'strength', cwp.strength,
                    'ap', cwp.ap,
                    'damage', cwp.damage,
                    'lethality', cwp.lethality,
                    'ammo', cwp.ammo,
                    'traits', cwp.traits,
                    'sort_order', cwp.sort_order
                ) ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
            ) FROM custom_weapon_profiles cwp WHERE cwp.custom_equipment_id = ce.id),
            '[]'::jsonb
        ) AS weapon_profiles,
        NULL AS vehicle_upgrade_slot,
        NULL::jsonb AS grants_equipment,
        COALESCE(ce.is_editable, false) AS is_editable,
        COALESCE(custom_tp.tp_names, '{}'::text[]) AS trading_post_names,
        CASE WHEN custom_tp.cost_reputation THEN 'Reputation'
             ELSE COALESCE(ctr_res2.resource_name, cr_res2.resource_name)
        END AS cost_resource_name,
        CASE WHEN custom_tp.cost_type_resource_id IS NOT NULL
               OR custom_tp.cost_campaign_resource_id IS NOT NULL
               OR custom_tp.cost_reputation
             THEN custom_tp.cost_resource_amount
        END AS cost_resource_amount,
        custom_tp.cost_type_resource_id,
        custom_tp.cost_campaign_resource_id,
        COALESCE(custom_tp.banned, false) AS banned,
        NULL::integer AS min_count,
        NULL::integer AS max_count
    FROM custom_candidates cc
    JOIN custom_equipment ce ON ce.id = cc.id
    CROSS JOIN gang_data gd
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8
    ) shared ON shared.custom_equipment_id = ce.id
    LEFT JOIN (
        SELECT
            ctpe.custom_equipment_id,
            MIN(ctpe.cost_override) FILTER (WHERE ctpe.cost_override IS NOT NULL) AS cost_override,
            (array_agg(ctpe.cost_type_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_type_resource_id IS NOT NULL))[1] AS cost_type_resource_id,
            (array_agg(ctpe.cost_campaign_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_campaign_resource_id IS NOT NULL))[1] AS cost_campaign_resource_id,
            (array_agg(ctpe.cost_resource_amount ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_amount IS NOT NULL))[1] AS cost_resource_amount,
            (array_agg(ctpe.cost_reputation ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_reputation))[1] AS cost_reputation,
            (array_agg(COALESCE(a.availability, ctpe.availability_override) ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE COALESCE(a.availability, ctpe.availability_override) IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost,
            COALESCE(
                array_agg(DISTINCT ctp.custom_trading_post_name) FILTER (WHERE ctp.custom_trading_post_name IS NOT NULL),
                '{}'::text[]
            ) AS tp_names,
            bool_or(ctpe.banned) AS banned
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        LEFT JOIN custom_trading_post_availability a
            ON a.custom_trading_post_equipment_id = ctpe.id
            AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
            AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
            AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
            AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
            AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
            AND (a.alignment IS NULL OR a.alignment = gd.alignment)
        WHERE ctpe.custom_equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
        GROUP BY ctpe.custom_equipment_id
    ) custom_tp ON custom_tp.custom_equipment_id = ce.id
    LEFT JOIN campaign_type_resources ctr_res2 ON ctr_res2.id = custom_tp.cost_type_resource_id
    LEFT JOIN campaign_resources cr_res2 ON cr_res2.id = custom_tp.cost_campaign_resource_id
    -- Is this custom equipment on the current custom fighter type's equipment list?
    -- ($3 is a custom_fighter_types.id when the fighter is a custom fighter.)
    LEFT JOIN LATERAL (
        SELECT true AS is_ftl
        FROM custom_fighter_type_equipment cfte
        WHERE cfte.custom_equipment_id = ce.id
          AND cfte.custom_fighter_type_id = $3
        LIMIT 1
    ) ftl ON true
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL OR custom_tp.custom_equipment_id IS NOT NULL)
        AND ($2 IS NULL OR trim(both from ce.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR ce.id = $7)
        -- Fighter list / trading post filter. Custom equipment is always a
        -- trading-post item, and a fighter-list item only when assigned to the
        -- fighter's custom type (ftl.is_ftl).
        AND (
            ($4 IS NULL AND $5 IS NULL)                              -- no filter
            OR ($4 IS NOT NULL AND COALESCE(ftl.is_ftl, false) = $4) -- fighter's list requested
            OR ($5 IS NOT NULL AND true = $5)                        -- trading post requested
        )
        AND (
            gd.edition_id IS NULL
            OR ce.edition_id = gd.edition_id
        )
$$;

-- get_fighter_available_advancements
CREATE OR REPLACE FUNCTION public.get_fighter_available_advancements(
  fighter_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_fighter_xp integer;
  v_advancements_category_id UUID;
  v_fighter_subtypes jsonb;
  v_uses_flat_cost boolean; -- Flag for fighters that use flat costs (Ganger and Exotic Beast)
  v_edition_id UUID;
  v_cumulative_xp boolean; -- Edition earns Advancements by rank instead of buying them
BEGIN
  -- Get fighter's current XP and fighter subtypes
  SELECT f.xp, f.fighter_subtypes
  INTO v_fighter_xp, v_fighter_subtypes
  FROM fighters f
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;

  -- Resolve the fighter's edition from its gang, the same way add_fighter_injury
  -- does. Advancement rows are edition-scoped, so without this an N23 fighter
  -- would be offered N26 Advancements and vice versa.
  SELECT COALESCE(gt.edition_id, cgt.edition_id)
  INTO v_edition_id
  FROM fighters f
  JOIN gangs g ON g.id = f.gang_id
  LEFT JOIN gang_types gt ON gt.id = g.gang_type_id
  LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  -- SQL cannot read the capability registry in types/edition.ts, so the slug is
  -- resolved to an id once here rather than compared per row.
  v_cumulative_xp := v_edition_id IS NOT NULL
    AND v_edition_id = (SELECT id FROM editions WHERE slug = 'n26');

  -- Determine if the fighter uses flat costs based on their subtypes
  -- Only Gangers and Exotic Beasts use flat costs, and only where XP is spent:
  -- an edition that earns Advancements by rank has no cost to make flat.
  v_uses_flat_cost := NOT v_cumulative_xp
    AND v_fighter_subtypes ?| array['Ganger', 'Exotic Beast'];

  -- Get the advancements category ID
  SELECT id INTO v_advancements_category_id
  FROM fighter_effect_categories
  WHERE category_name = 'advancements';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advancements category not found';
  END IF;

  -- Build the final result as JSON
  WITH effect_type_costs AS (
    -- Get base costs from fighter_effect_types table
    SELECT 
      fet.id AS fighter_effect_type_id,
      fet.effect_name,
      COALESCE((fet.type_specific_data->>'xp_cost')::integer, 5) AS base_xp_cost,
      COALESCE((fet.type_specific_data->>'credits_increase')::integer, 10) AS base_credits_increase
    FROM fighter_effect_types fet
    WHERE fet.fighter_effect_category_id = v_advancements_category_id
      AND fet.edition_id IS NOT DISTINCT FROM v_edition_id
  ),
  advancement_counts AS (
    -- Count how many times each fighter has advanced each characteristic
    SELECT 
      fe.fighter_effect_type_id,
      COUNT(*) as times_increased
    FROM fighter_effects fe
    JOIN fighter_effect_types fet ON fet.id = fe.fighter_effect_type_id
    WHERE fe.fighter_id = get_fighter_available_advancements.fighter_id
    AND fet.fighter_effect_category_id = v_advancements_category_id
    GROUP BY fe.fighter_effect_type_id
  ),
  available_advancements AS (
    -- Get all possible characteristic improvements and determine availability
    SELECT 
      etc.fighter_effect_type_id as id,
      etc.effect_name as characteristic_name,
      LOWER(REPLACE(etc.effect_name, ' ', '_')) as characteristic_code,
      etc.base_xp_cost,
      -- Calculate XP cost based on fighter subtype and characteristic
      CASE
        -- Advancements are earned by rank, not bought: nothing to pay
        WHEN v_cumulative_xp THEN 0
        -- For Gangers and Exotic Beasts: fixed 6 XP cost
        WHEN v_uses_flat_cost THEN 6
        -- For Juves and Prospects: base cost only (no escalating penalty)
        WHEN v_fighter_subtypes ?| array['Juve', 'Prospect'] THEN etc.base_xp_cost
        -- For other fighters: base cost + (2 * times increased)
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN etc.base_xp_cost
        ELSE etc.base_xp_cost + (2 * ac.times_increased)
      END as xp_cost,
      -- Calculate credits increase based on fighter subtype and characteristic
      CASE
        -- Flat per characteristic, straight off the edition's own catalog rows
        WHEN v_cumulative_xp THEN etc.base_credits_increase
        -- For Gangers and Exotic Beasts: credits based on advancement table
        WHEN v_uses_flat_cost THEN
          CASE
            -- Weapon Skill or Ballistic Skill
            WHEN etc.effect_name ILIKE '%weapon skill%' OR etc.effect_name ILIKE '%ballistic skill%' THEN 20
            -- Strength or Toughness
            WHEN etc.effect_name ILIKE '%strength%' OR etc.effect_name ILIKE '%toughness%' THEN 30
            -- Movement, Initiative, Leadership, or Cool
            WHEN etc.effect_name ILIKE '%movement%' OR etc.effect_name ILIKE '%initiative%' OR
                 etc.effect_name ILIKE '%leadership%' OR etc.effect_name ILIKE '%cool%' THEN 10
            -- Willpower or Intelligence
            WHEN etc.effect_name ILIKE '%willpower%' OR etc.effect_name ILIKE '%intelligence%' THEN 5
            -- Default for other characteristics
            ELSE 10
          END
        -- For all other fighters (including Juves and Prospects): use the base credits increase
        ELSE etc.base_credits_increase
      END as credits_increase,
      COALESCE(ac.times_increased, 0) as times_increased,
      true as is_available,
      -- Check if fighter has enough XP based on the calculated cost
      CASE
        -- Nothing is spent, so affordability never blocks. Whether an
        -- Advancement is actually owed is a rank question the caller answers.
        WHEN v_cumulative_xp THEN true
        WHEN v_uses_flat_cost THEN v_fighter_xp >= 6
        WHEN v_fighter_subtypes ?| array['Juve', 'Prospect'] THEN v_fighter_xp >= etc.base_xp_cost
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN v_fighter_xp >= etc.base_xp_cost
        ELSE v_fighter_xp >= (etc.base_xp_cost + (2 * ac.times_increased))
      END as has_enough_xp
    FROM effect_type_costs etc
    LEFT JOIN advancement_counts ac ON ac.fighter_effect_type_id = etc.fighter_effect_type_id
  ),
  categorized_advancements AS (
    SELECT
      characteristic_name,
      jsonb_build_object(
        'id', id,
        'characteristic_code', characteristic_code,
        'times_increased', times_increased,
        'base_xp_cost', base_xp_cost,
        'xp_cost', xp_cost,
        'credits_increase', credits_increase,
        'is_available', is_available,
        'has_enough_xp', has_enough_xp,
        'can_purchase', is_available AND has_enough_xp,
        'uses_flat_cost', v_uses_flat_cost -- Add flag to indicate flat costs are applied
      ) as advancement_info
    FROM available_advancements
  )
  SELECT jsonb_build_object(
    'fighter_id', get_fighter_available_advancements.fighter_id,
    'current_xp', v_fighter_xp,
    'fighter_subtypes', v_fighter_subtypes,
    'uses_flat_cost', v_uses_flat_cost,
    -- Ganger/Exotic Beast: Specialist table row (random Primary skill) — same flat costs as other ganger advances.
    -- v_uses_flat_cost is already false for rank-based editions, which promote Specialists by their own rules.
    'ganger_to_specialist_advancement', CASE WHEN v_uses_flat_cost THEN jsonb_build_object(
      'xp_cost', 6,
      'credits_increase', 20
    ) ELSE NULL END,
    'characteristics', COALESCE(
      (SELECT jsonb_object_agg(
        characteristic_name,
        advancement_info
      )
      FROM categorized_advancements),
      '{}'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

-- get_gang_details (obsolete, kept for the Rule Snatcher Tool)
CREATE OR REPLACE FUNCTION public.get_gang_details(p_gang_id uuid)
RETURNS TABLE(
    id uuid, 
    name text, 
    gang_type text, 
    gang_type_id uuid,
    gang_type_image_url text,
    gang_colour text,
    credits numeric, 
    reputation numeric,
    rating numeric,
    alignment alignment,
    positioning jsonb, 
    note text, 
    stash json, 
    created_at timestamp with time zone, 
    last_updated timestamp with time zone, 
    fighters json, 
    campaigns json,
    vehicles json,
    alliance_id uuid,
    alliance_name text,
    alliance_type text,
    gang_subtypes json,
    edition_slug text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
   RETURN QUERY
   WITH fighter_ids AS (
       SELECT f.id AS f_id
       FROM fighters f
       WHERE f.gang_id = p_gang_id
   ),
   -- Two indexed lookups joined by UNION, not one OR: with an OR the planner
   -- cannot estimate the vehicle count, so it walks whole vehicle_id indexes on
   -- fighter_equipment and fighter_effects, and sequentially scans
   -- fighter_effect_modifiers for the vehicles' effects.
   vehicle_ids AS (
       SELECT v.id AS v_id
       FROM vehicles v
       WHERE v.gang_id = p_gang_id
       UNION
       SELECT v.id
       FROM vehicles v
       WHERE v.fighter_id IN (SELECT f_id FROM fighter_ids)
   ),
   -- Every fighter_equipment row of the gang's fighters and vehicles. An OR of
   -- fighter_id and vehicle_id forces a sequential scan of the whole table.
   gang_equipment_ids AS (
       SELECT fe.id AS fe_id
       FROM fighter_equipment fe
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       UNION
       SELECT fe.id
       FROM fighter_equipment fe
       WHERE fe.vehicle_id IN (SELECT v_id FROM vehicle_ids)
   ),
   gang_fighters AS (
       SELECT
           f.id AS f_id,
           f.gang_id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_type_id,
           f.fighter_subtypes,
           f.fighter_specialisation_id,
           f.fighter_variant,
           f.xp,
           f.kills,
           f.position,
           f.movement,
           f.weapon_skill,
           f.ballistic_skill,
           f.strength,
           f.toughness,
           f.wounds,
           f.initiative,
           f.attacks,
           f.leadership,
           f.cool,
           f.willpower,
           f.intelligence,
           f.credits as base_credits,
           f.cost_adjustment,
           f.special_rules,
           f.note,
           f.killed,
           f.starved,
           f.retired,
           f.enslaved,
           f.recovery,
           f.free_skill,
           f.image_url
       FROM fighters f
       WHERE f.id IN (SELECT f_id FROM fighter_ids)
   ),
   fighter_effect_modifier_agg AS (
       SELECT 
           fem.fighter_effect_id,
           json_agg(
               json_build_object(
                   'id', fem.id,
                   'fighter_effect_id', fem.fighter_effect_id,
                   'stat_name', fem.stat_name,
                   'numeric_value', fem.numeric_value
               )
           ) as modifiers
       FROM fighter_effect_modifiers fem
       WHERE fem.fighter_effect_id IN (
           SELECT fe.id 
           FROM fighter_effects fe
           WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
       GROUP BY fem.fighter_effect_id
   ),
   vehicle_effect_modifier_agg AS (
       SELECT 
           fem.fighter_effect_id,
           json_agg(
               json_build_object(
                   'id', fem.id,
                   'fighter_effect_id', fem.fighter_effect_id,
                   'stat_name', fem.stat_name,
                   'numeric_value', fem.numeric_value
               )
           ) as modifiers
       FROM fighter_effect_modifiers fem
       WHERE fem.fighter_effect_id IN (
           SELECT fe.id 
           FROM fighter_effects fe
           WHERE fe.vehicle_id IN (SELECT v_id FROM vehicle_ids)
       )
       GROUP BY fem.fighter_effect_id
   ),
   fighter_effects_raw AS (
       SELECT 
           fe.id,
           fe.fighter_id,
           NULL::uuid as vehicle_id,
           fe.effect_name,
           fe.type_specific_data,
           fe.created_at,
           fe.updated_at,
           fet.effect_name as effect_type_name,
           fet.id as effect_type_id,
           fec.category_name,
           fec.id as category_id,
           COALESCE(fem.modifiers, '[]'::json) as modifiers
       FROM fighter_effects fe
       LEFT JOIN fighter_effect_types fet ON fe.fighter_effect_type_id = fet.id
       LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
       LEFT JOIN fighter_effect_modifier_agg fem ON fem.fighter_effect_id = fe.id
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
   ),
   vehicle_effects_raw AS (
       SELECT 
           fe.id,
           NULL::uuid as fighter_id,
           fe.vehicle_id,
           fe.effect_name,
           fe.type_specific_data,
           fe.created_at,
           fe.updated_at,
           fet.effect_name as effect_type_name,
           fet.id as effect_type_id,
           fec.category_name,
           fec.id as category_id,
           COALESCE(vem.modifiers, '[]'::json) as modifiers
       FROM fighter_effects fe
       LEFT JOIN fighter_effect_types fet ON fe.fighter_effect_type_id = fet.id
       LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
       LEFT JOIN vehicle_effect_modifier_agg vem ON vem.fighter_effect_id = fe.id
       WHERE fe.vehicle_id IN (SELECT v_id FROM vehicle_ids)
   ),
   fighter_effect_categories AS (
       SELECT DISTINCT 
           fer.fighter_id,
           COALESCE(fer.category_name, 'uncategorized') as category_name
       FROM fighter_effects_raw fer
   ),
   vehicle_effect_categories AS (
       SELECT DISTINCT 
           ver.vehicle_id,
           COALESCE(ver.category_name, 'uncategorized') as category_name
       FROM vehicle_effects_raw ver
   ),
   fighter_effects_by_category AS (
       SELECT 
           fer.fighter_id,
           COALESCE(fer.category_name, 'uncategorized') as category_name,
           json_agg(
               json_build_object(
                   'id', fer.id,
                   'effect_name', fer.effect_name,
                   'type_specific_data', fer.type_specific_data,
                   'created_at', fer.created_at,
                   'updated_at', fer.updated_at,
                   'fighter_effect_modifiers', fer.modifiers
               )
           ) as effects
       FROM fighter_effects_raw fer
       GROUP BY fer.fighter_id, COALESCE(fer.category_name, 'uncategorized')
   ),
   vehicle_effects_by_category AS (
       SELECT 
           ver.vehicle_id,
           COALESCE(ver.category_name, 'uncategorized') as category_name,
           json_agg(
               json_build_object(
                   'id', ver.id,
                   'effect_name', ver.effect_name,
                   'type_specific_data', ver.type_specific_data,
                   'created_at', ver.created_at,
                   'updated_at', ver.updated_at,
                   'fighter_effect_modifiers', ver.modifiers
               )
           ) as effects
       FROM vehicle_effects_raw ver
       GROUP BY ver.vehicle_id, COALESCE(ver.category_name, 'uncategorized')
   ),
   fighter_effects AS (
       SELECT 
           fec.fighter_id,
           json_object_agg(
               fec.category_name,
               COALESCE(
                   (SELECT febc.effects 
                    FROM fighter_effects_by_category febc 
                    WHERE febc.fighter_id = fec.fighter_id 
                    AND febc.category_name = fec.category_name),
                   '[]'::json
               )
           ) as effects
       FROM fighter_effect_categories fec
       GROUP BY fec.fighter_id
   ),
   vehicle_effects AS (
       SELECT 
           vec.vehicle_id,
           json_object_agg(
               vec.category_name,
               COALESCE(
                   (SELECT vebc.effects 
                    FROM vehicle_effects_by_category vebc 
                    WHERE vebc.vehicle_id = vec.vehicle_id 
                    AND vebc.category_name = vec.category_name),
                   '[]'::json
               )
           ) as effects
       FROM vehicle_effect_categories vec
       GROUP BY vec.vehicle_id
   ),
   fighter_effects_credits AS (
       SELECT
           fer.fighter_id,
           COALESCE(
               SUM(
                   CASE
                       WHEN fer.type_specific_data->>'credits_increase' IS NOT NULL THEN 
                           (fer.type_specific_data->>'credits_increase')::integer
                       ELSE 0
                   END
               ),
               0
           )::numeric AS total_effect_credits
       FROM fighter_effects_raw fer
       GROUP BY fer.fighter_id
   ),
   vehicle_effects_credits AS (
       SELECT
           ver.vehicle_id,
           COALESCE(
               SUM(
                   CASE
                       WHEN ver.type_specific_data->>'credits_increase' IS NOT NULL THEN 
                           (ver.type_specific_data->>'credits_increase')::integer
                       ELSE 0
                   END
               ),
               0
           )::numeric AS total_effect_credits
       FROM vehicle_effects_raw ver
       GROUP BY ver.vehicle_id
   ),
   fighter_skills_agg AS (
       SELECT 
           fs.fighter_id,
           SUM(fs.credits_increase)::numeric as total_skills_credits,
           SUM(fs.xp_cost) as total_skills_xp
       FROM fighter_skills fs
       WHERE fs.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fs.fighter_id
   ),
   fighter_skills_json AS (
       SELECT 
           fs.fighter_id,
           json_object_agg(
               s.name,
               json_build_object(
                   'id', fs.id,
                   'credits_increase', fs.credits_increase,
                   'xp_cost', fs.xp_cost,
                   'is_advance', fs.is_advance,
                   'acquired_at', fs.created_at
               )
           ) as skills
       FROM fighter_skills fs
       JOIN skills s ON s.id = fs.skill_id
       WHERE fs.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fs.fighter_id
   ),
   fighter_skills AS (
       SELECT 
           f.f_id AS fighter_id,
           COALESCE(fsa.total_skills_credits, 0)::numeric as total_skills_credits,
           COALESCE(fsj.skills, '{}'::json) as skills,
           COALESCE(fsa.total_skills_xp, 0) as total_skills_xp
       FROM gang_fighters f
       LEFT JOIN fighter_skills_agg fsa ON fsa.fighter_id = f.f_id
       LEFT JOIN fighter_skills_json fsj ON fsj.fighter_id = f.f_id
   ),
   fighter_equipment_costs AS (
       SELECT 
           fe.fighter_id,
           COALESCE(SUM(fe.purchase_cost), 0)::numeric as total_equipment_cost
       FROM fighter_equipment fe
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fe.fighter_id
   ),
   weapon_profiles_deduplicated AS (
       SELECT DISTINCT wp.id, wp.equipment_id, wp.profile_name, wp.range_short, wp.range_long, 
                      wp.acc_short, wp.acc_long, wp.strength, wp.ap, wp.damage, wp.ammo, 
                      wp.traits, wp.weapon_group_id, wp.sort_order,
                      fe.id AS fe_id, fe.is_master_crafted
       FROM weapon_profiles wp
       JOIN fighter_equipment fe ON fe.equipment_id = wp.equipment_id
       WHERE fe.id IN (SELECT fe_id FROM gang_equipment_ids)
       AND fe.equipment_id IS NOT NULL
   ),
   weapon_profiles_grouped AS (
       SELECT 
           wpd.fe_id,
           wpd.equipment_id,
           json_agg(
               json_build_object(
                   'id', wpd.id,
                   'profile_name', wpd.profile_name,
                   'range_short', wpd.range_short,
                   'range_long', wpd.range_long,
                   'acc_short', wpd.acc_short,
                   'acc_long', wpd.acc_long,
                   'strength', wpd.strength,
                   'ap', wpd.ap,
                   'damage', wpd.damage,
                   'ammo', wpd.ammo,
                   'traits', wpd.traits,
                   'weapon_group_id', wpd.weapon_group_id, 
                   'sort_order', wpd.sort_order,
                   'is_master_crafted', wpd.is_master_crafted
               )
               ORDER BY wpd.sort_order NULLS LAST, wpd.profile_name
           ) as profiles
       FROM weapon_profiles_deduplicated wpd
       GROUP BY wpd.fe_id, wpd.equipment_id
   ),
   custom_weapon_profiles_grouped AS (
       SELECT 
           fe.id as fe_id,
           fe.custom_equipment_id as equipment_id,
           json_agg(
               json_build_object(
                   'id', cwp.id,
                   'profile_name', cwp.profile_name,
                   'range_short', cwp.range_short,
                   'range_long', cwp.range_long,
                   'acc_short', cwp.acc_short,
                   'acc_long', cwp.acc_long,
                   'strength', cwp.strength,
                   'ap', cwp.ap,
                   'damage', cwp.damage,
                   'ammo', cwp.ammo,
                   'traits', cwp.traits,
                   'weapon_group_id', cwp.weapon_group_id,
                   'sort_order', cwp.sort_order,
                   'is_master_crafted', fe.is_master_crafted
               )
               ORDER BY cwp.sort_order NULLS LAST, cwp.profile_name
           ) as profiles
       FROM fighter_equipment fe
       JOIN custom_weapon_profiles cwp ON (cwp.custom_equipment_id = fe.custom_equipment_id OR cwp.weapon_group_id = fe.custom_equipment_id)
       WHERE fe.custom_equipment_id IS NOT NULL
       AND fe.id IN (SELECT fe_id FROM gang_equipment_ids)
       GROUP BY fe.id, fe.custom_equipment_id
   ),
   fighter_equipment_details AS (
       SELECT 
           fe.fighter_id,
           json_agg(
               json_build_object(
                   'fighter_weapon_id', fe.id,
                   'equipment_id', COALESCE(e.id, ce.id),
                   'custom_equipment_id', ce.id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', fe.purchase_cost,
                   'weapon_profiles', CASE 
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND e.id IS NOT NULL THEN 
                           COALESCE((SELECT wpg.profiles FROM weapon_profiles_grouped wpg WHERE wpg.equipment_id = e.id AND wpg.fe_id = fe.id), '[]'::json)
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND ce.id IS NOT NULL THEN 
                           COALESCE((SELECT cwpg.profiles FROM custom_weapon_profiles_grouped cwpg WHERE cwpg.equipment_id = ce.id AND cwpg.fe_id = fe.id), '[]'::json)
                       ELSE NULL 
                   END
               )
           ) as equipment
       FROM fighter_equipment fe
       LEFT JOIN equipment e ON e.id = fe.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = fe.custom_equipment_id
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       AND (fe.equipment_id IS NOT NULL OR fe.custom_equipment_id IS NOT NULL)
       GROUP BY fe.fighter_id
   ),

   vehicle_equipment_costs AS (
       SELECT 
           ve.vehicle_id,
           COALESCE(SUM(ve.purchase_cost), 0)::numeric as total_equipment_cost
       FROM fighter_equipment ve
       WHERE ve.vehicle_id IS NOT NULL
       AND ve.vehicle_id IN (SELECT v_id FROM vehicle_ids)
       GROUP BY ve.vehicle_id
   ),
   vehicle_equipment_details AS (
       SELECT 
           ve.vehicle_id,
           json_agg(
               json_build_object(
                   'vehicle_weapon_id', ve.id,
                   'equipment_id', COALESCE(e.id, ce.id),
                   'custom_equipment_id', ce.id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', ve.purchase_cost,
                   'weapon_profiles', CASE 
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND e.id IS NOT NULL THEN 
                           COALESCE((SELECT wpg.profiles FROM weapon_profiles_grouped wpg WHERE wpg.equipment_id = e.id AND wpg.fe_id = ve.id), '[]'::json)
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND ce.id IS NOT NULL THEN 
                           COALESCE((SELECT cwpg.profiles FROM custom_weapon_profiles_grouped cwpg WHERE cwpg.equipment_id = ce.id AND cwpg.fe_id = ve.id), '[]'::json)
                       ELSE NULL 
                   END

               )
           ) as equipment
       FROM fighter_equipment ve
       LEFT JOIN equipment e ON e.id = ve.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = ve.custom_equipment_id
       WHERE ve.vehicle_id IS NOT NULL
       AND ve.vehicle_id IN (SELECT v_id FROM vehicle_ids)
       AND (ve.equipment_id IS NOT NULL OR ve.custom_equipment_id IS NOT NULL)
       GROUP BY ve.vehicle_id
   ),
   gang_vehicles AS (
       SELECT 
           v.id,
           v.fighter_id,
           v.gang_id,
           v.created_at,
           v.movement,
           v.front,
           v.side,
           v.rear,
           v.hull_points,
           v.handling,
           v.save,
           v.body_slots,
           v.body_slots_occupied,
           v.drive_slots,
           v.drive_slots_occupied,
           v.engine_slots,
           v.engine_slots_occupied,
           v.special_rules,
           v.vehicle_name,
           v.cost,
           v.vehicle_type_id,
           v.vehicle_type,
           COALESCE(vep.equipment, '[]'::json) as equipment,
           COALESCE(vec.total_equipment_cost, 0)::numeric as total_equipment_cost,
           COALESCE(ve.effects, '{}'::json) as effects,
           COALESCE(vec2.total_effect_credits, 0)::numeric as total_effect_credits
       FROM vehicles v
       LEFT JOIN vehicle_equipment_costs vec ON vec.vehicle_id = v.id
       LEFT JOIN vehicle_equipment_details vep ON vep.vehicle_id = v.id
       LEFT JOIN vehicle_effects ve ON ve.vehicle_id = v.id
       LEFT JOIN vehicle_effects_credits vec2 ON vec2.vehicle_id = v.id
       WHERE v.id IN (SELECT v_id FROM vehicle_ids)
   ),
   gang_owned_vehicles AS (
       SELECT 
           gv.id,
           gv.gang_id,
           gv.created_at,
           gv.vehicle_type_id,
           gv.vehicle_type,
           gv.cost,
           gv.vehicle_name,
           vt.movement,
           vt.front,
           vt.side,
           vt.rear,
           vt.hull_points,
           vt.handling,
           vt.save,
           vt.body_slots,
           vt.drive_slots,
           vt.engine_slots,
           gv.body_slots_occupied,
           gv.drive_slots_occupied,
           gv.engine_slots_occupied,
           vt.special_rules,
           gv.equipment,
           gv.total_equipment_cost,
           gv.effects,
           gv.total_effect_credits
       FROM gang_vehicles gv
       JOIN vehicle_types vt ON vt.id = gv.vehicle_type_id
       WHERE gv.gang_id = p_gang_id AND gv.fighter_id IS NULL
   ),
   fighter_vehicle_costs AS (
       SELECT
           gv.fighter_id,
           (SUM(gv.cost) + SUM(COALESCE(gv.total_equipment_cost, 0)) + SUM(COALESCE(gv.total_effect_credits, 0)))::numeric as total_vehicle_cost
       FROM gang_vehicles gv
       WHERE gv.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY gv.fighter_id
   ),
   fighter_vehicles_json AS (
       SELECT
           gv.fighter_id,
           json_agg(
               json_build_object(
                   'id', gv.id,
                   'created_at', gv.created_at,
                   'vehicle_type_id', gv.vehicle_type_id,
                   'vehicle_type', gv.vehicle_type,
                   'cost', gv.cost,
                   'vehicle_name', gv.vehicle_name,
                   'movement', gv.movement,
                   'front', gv.front,
                   'side', gv.side,
                   'rear', gv.rear,
                   'hull_points', gv.hull_points,
                   'handling', gv.handling,
                   'save', gv.save,
                   'body_slots', gv.body_slots,
                   'body_slots_occupied', gv.body_slots_occupied,
                   'drive_slots', gv.drive_slots,
                   'drive_slots_occupied', gv.drive_slots_occupied,
                   'engine_slots', gv.engine_slots,
                   'engine_slots_occupied', gv.engine_slots_occupied,
                   'special_rules', gv.special_rules,
                   'equipment', gv.equipment,
                   'total_equipment_cost', gv.total_equipment_cost,
                   'effects', gv.effects,
                   'total_effect_credits', gv.total_effect_credits
               )
           ) as vehicles
       FROM gang_vehicles gv
       WHERE gv.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY gv.fighter_id
   ),
   complete_fighters AS (
       SELECT 
           f.f_id AS id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_type_id,
           f.fighter_subtypes,
           json_build_object(
             'fighter_specialisation', fspec.specialisation_name,
             'fighter_specialisation_id', fspec.id
           ) AS fighter_specialisation,
           f.fighter_variant,
           ft.alliance_crew_name,
           f.xp,
           f.kills,
           f.position,
           f.movement,
           f.weapon_skill,
           f.ballistic_skill,
           f.strength,
           f.toughness,
           f.wounds,
           f.initiative,
           f.attacks,
           f.leadership,
           f.cool,
           f.willpower,
           f.intelligence,
           f.special_rules,
           f.note,
           f.killed,
           f.starved,
           f.retired,
           f.enslaved,
           f.recovery,
           f.free_skill,
           f.cost_adjustment,
           f.image_url,
           (COALESCE(f.base_credits, 0) + 
            COALESCE(fec.total_equipment_cost, 0) + 
            COALESCE(fsk.total_skills_credits, 0) +
            COALESCE(fef.total_effect_credits, 0) +
            COALESCE(f.cost_adjustment, 0) +
            COALESCE(fvc.total_vehicle_cost, 0))::numeric as total_credits,
           COALESCE(fed.equipment, '[]'::json) as equipment,
           COALESCE(fe.effects, '{}'::json) as effects,
           COALESCE(fsk.skills, '{}'::json) as skills,
           COALESCE(fvj.vehicles, '[]'::json) as vehicles
       FROM gang_fighters f
       LEFT JOIN fighter_specialisations fspec ON fspec.id = f.fighter_specialisation_id
       LEFT JOIN fighter_types ft ON ft.id = f.fighter_type_id
       LEFT JOIN fighter_equipment_costs fec ON fec.fighter_id = f.f_id
       LEFT JOIN fighter_equipment_details fed ON fed.fighter_id = f.f_id
       LEFT JOIN fighter_skills fsk ON fsk.fighter_id = f.f_id
       LEFT JOIN fighter_effects fe ON fe.fighter_id = f.f_id
       LEFT JOIN fighter_effects_credits fef ON fef.fighter_id = f.f_id
       LEFT JOIN fighter_vehicle_costs fvc ON fvc.fighter_id = f.f_id
       LEFT JOIN fighter_vehicles_json fvj ON fvj.fighter_id = f.f_id
   ),
   gang_totals AS (
       SELECT COALESCE(SUM(total_credits), 0)::numeric as total_gang_rating
       FROM complete_fighters
       WHERE killed = FALSE AND retired = FALSE AND enslaved = FALSE
   ),
   gang_stash AS (
       SELECT 
           gs.gang_id,
           json_agg(
               json_build_object(
                   'id', gs.id,
                   'created_at', gs.created_at,
                   'equipment_id', gs.equipment_id,
                   'custom_equipment_id', gs.custom_equipment_id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', gs.cost,
                   'type', 'equipment'
               )
           ) as stash_items
       FROM gang_stash gs
       LEFT JOIN equipment e ON e.id = gs.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = gs.custom_equipment_id
       WHERE gs.gang_id = p_gang_id
       AND (gs.equipment_id IS NOT NULL OR gs.custom_equipment_id IS NOT NULL)
       GROUP BY gs.gang_id
   ),
   campaign_territories AS (
       SELECT 
           ct.campaign_id,
           json_agg(
               json_build_object(
                   'id', ct.id,
                   'created_at', ct.created_at,
                   'territory_id', ct.territory_id,
                   'territory_name', ct.territory_name,
                   'ruined', ct.ruined
               )
           ) as territories
       FROM campaign_territories ct
       WHERE ct.gang_id = p_gang_id
       GROUP BY ct.campaign_id
   ),
   gang_campaigns AS (
       SELECT 
           cg.gang_id,
           json_agg(
               json_build_object(
                   'campaign_id', c.id,
                   'campaign_name', c.campaign_name,
                   'role', cg.role,
                   'status', cg.status,
                   'invited_at', cg.invited_at,
                   'joined_at', cg.joined_at,
                   'invited_by', cg.invited_by,
                   'territories', COALESCE(
                       (SELECT ct.territories 
                        FROM campaign_territories ct 
                        WHERE ct.campaign_id = c.id),
                       '[]'::json
                   )
               )
           ) as campaigns
       FROM campaign_gangs cg
       JOIN campaigns c ON c.id = cg.campaign_id
       WHERE cg.gang_id = p_gang_id
       GROUP BY cg.gang_id
   ),
   gang_subtype_info AS (
       SELECT 
           COALESCE(
               json_agg(
                   json_build_object(
                       'id', gst.id,
                       'subtype', gst.subtype
                   )
                   ORDER BY gst.subtype
               ),
               '[]'::json
           ) as subtype_info
       FROM gang_subtype_types gst
       JOIN gangs g ON g.id = p_gang_id
       WHERE gst.id::text IN (
           SELECT jsonb_array_elements_text(g.gang_subtypes)
       )
   ),
   all_fighters_json AS (
       SELECT json_agg(
           json_build_object(
               'id', cf.id,
               'fighter_name', cf.fighter_name,
               'label', cf.label,
               'fighter_type', cf.fighter_type,
               'fighter_subtypes', cf.fighter_subtypes,
               'fighter_specialisation', cf.fighter_specialisation,
               'fighter_variant', cf.fighter_variant,
               'alliance_crew_name', cf.alliance_crew_name,
               'position', cf.position,
               'xp', cf.xp,
               'kills', cf.kills,
               'credits', cf.total_credits,
               'movement', cf.movement,
               'weapon_skill', cf.weapon_skill,
               'ballistic_skill', cf.ballistic_skill,
               'strength', cf.strength,
               'toughness', cf.toughness,
               'wounds', cf.wounds,
               'initiative', cf.initiative,
               'attacks', cf.attacks,
               'leadership', cf.leadership,
               'cool', cf.cool,
               'willpower', cf.willpower,
               'intelligence', cf.intelligence,
               'equipment', cf.equipment,
               'effects', cf.effects,
               'skills', cf.skills,
               'vehicles', cf.vehicles,
               'cost_adjustment', cf.cost_adjustment,
               'special_rules', CASE 
                   WHEN cf.special_rules IS NULL THEN '[]'::json
                   ELSE to_json(cf.special_rules)
               END,
               'note', cf.note,
               'killed', cf.killed,
               'starved', cf.starved,
               'retired', cf.retired,
               'enslaved', cf.enslaved,
               'recovery', cf.recovery,
               'free_skill', cf.free_skill,
               'image_url', cf.image_url
           )
       ) as fighters_json
       FROM complete_fighters cf
   ),
   gang_owned_vehicles_json AS (
       SELECT json_agg(
           json_build_object(
               'id', v.id,
               'created_at', v.created_at,
               'vehicle_type_id', v.vehicle_type_id,
               'vehicle_type', v.vehicle_type,
               'cost', v.cost,
               'vehicle_name', v.vehicle_name,
               'movement', v.movement,
               'front', v.front,
               'side', v.side,
               'rear', v.rear,
               'hull_points', v.hull_points,
               'handling', v.handling,
               'save', v.save,
               'body_slots', v.body_slots,
               'drive_slots', v.drive_slots,
               'engine_slots', v.engine_slots,
               'body_slots_occupied', v.body_slots_occupied,
               'drive_slots_occupied', v.drive_slots_occupied,
               'engine_slots_occupied', v.engine_slots_occupied,
               'special_rules', v.special_rules,
               'equipment', v.equipment,
               'total_equipment_cost', v.total_equipment_cost,
               'effects', v.effects,
               'total_effect_credits', v.total_effect_credits
           )
       ) as vehicles_json
       FROM gang_owned_vehicles v
       WHERE v.gang_id = p_gang_id
   )
   SELECT 
       g.id,
       g.name,
       g.gang_type,
       g.gang_type_id,
       gt.image_url as gang_type_image_url,
       g.gang_colour,
       g.credits,
       g.reputation,
       (SELECT total_gang_rating FROM gang_totals) as rating,
       g.alignment,
       g.positioning,
       g.note,
       COALESCE((SELECT gs.stash_items FROM gang_stash gs WHERE gs.gang_id = g.id), '[]'::json) as stash,
       g.created_at,
       g.last_updated,
       COALESCE((SELECT afj.fighters_json FROM all_fighters_json afj), '[]'::json) as fighters,
       COALESCE((SELECT gc.campaigns FROM gang_campaigns gc WHERE gc.gang_id = g.id), '[]'::json) as campaigns,
       COALESCE((SELECT govj.vehicles_json FROM gang_owned_vehicles_json govj), '[]'::json) as vehicles,
       g.alliance_id,
       a.alliance_name,
       a.alliance_type,
       (SELECT subtype_info FROM gang_subtype_info) as gang_subtypes,
       ed.slug AS edition_slug
   FROM gangs g
   LEFT JOIN gang_types gt ON gt.id = g.gang_type_id
   LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
   LEFT JOIN editions ed ON ed.id = COALESCE(gt.edition_id, cgt.edition_id)
   LEFT JOIN alliances a ON a.id = g.alliance_id
   WHERE g.id = p_gang_id;
END;
$function$;

COMMIT;
