--
-- PostgreSQL database dump
--

\restrict NohcxaBgWdNQd83lPTqDozLDpozkdJ7tbqiXM7myQaoiggrmpQFO2drooejqKro

-- Dumped from database version 15.6
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: alignment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alignment AS ENUM (
    'Outlaw',
    'Law Abiding',
    'Unaligned'
);


--
-- Name: add_fighter_injury(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_fighter_injury(in_fighter_id uuid, in_injury_type_id uuid, in_user_id uuid, in_target_equipment_id uuid DEFAULT NULL::uuid) RETURNS TABLE(result json)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'private'
    AS $$
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
            WHERE cg.gang_id = v_gang_id AND private.is_arb(cg.campaign_id)
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
    
    -- Validate that the effect type belongs to the injuries or rig-glitches category
    IF effect_type_record.fighter_effect_category_id NOT IN (
        SELECT id FROM fighter_effect_categories WHERE category_name IN ('injuries', 'rig-glitches')
    ) THEN
        RAISE EXCEPTION 'The provided fighter effect type is not an injury or rig glitch';
    END IF;
    
    -- Check if this is "Partially Deafened"
    is_partially_deafened := effect_type_record.effect_name = 'Partially Deafened';
    
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
        effect_type_record.type_specific_data,
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
$$;


--
-- Name: add_vehicle_effect(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_vehicle_effect(in_vehicle_id uuid, in_fighter_effect_type_id uuid, in_user_id uuid, in_fighter_effect_category_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'private'
    AS $$
DECLARE
    new_effect_id UUID;
    effect_type_record RECORD;
    modifier_record RECORD;
    v_is_admin BOOLEAN;
    v_user_has_access BOOLEAN;
    v_gang_id UUID;
    v_gang_owner_id UUID;
    v_category_id UUID;
BEGIN
    -- Validate inputs
    IF in_vehicle_id IS NULL THEN
        RAISE EXCEPTION 'vehicle_id must be provided';
    END IF;
    IF in_fighter_effect_type_id IS NULL THEN
        RAISE EXCEPTION 'fighter_effect_type_id must be provided';
    END IF;
    IF in_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id must be provided';
    END IF;

    -- Set user context for is_admin check
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);

    -- Admin check
    SELECT private.is_admin() INTO v_is_admin;

    -- Authorize via vehicle.gang_id and get gang owner's user_id
    SELECT v.gang_id, g.user_id INTO v_gang_id, v_gang_owner_id
    FROM vehicles v
    JOIN gangs g ON v.gang_id = g.id
    WHERE v.id = in_vehicle_id;

    IF v_gang_id IS NULL THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;

    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1 FROM gangs WHERE id = v_gang_id AND user_id = in_user_id
        ) OR EXISTS (
            SELECT 1
            FROM campaign_gangs cg
            WHERE cg.gang_id = v_gang_id AND private.is_arb(cg.campaign_id)
        ) INTO v_user_has_access;

        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to add effects to this vehicle';
        END IF;
    END IF;

    -- Get effect type
    SELECT * INTO effect_type_record
    FROM fighter_effect_types
    WHERE id = in_fighter_effect_type_id;

    IF effect_type_record.id IS NULL THEN
        RAISE EXCEPTION 'The provided fighter effect type ID does not exist';
    END IF;

    -- Determine category
    IF in_fighter_effect_category_id IS NULL THEN
        v_category_id := effect_type_record.fighter_effect_category_id;
    ELSE
        v_category_id := in_fighter_effect_category_id;
        IF effect_type_record.fighter_effect_category_id != v_category_id THEN
            RAISE EXCEPTION 'The provided fighter effect type does not belong to the specified category';
        END IF;
    END IF;

    -- Insert effect linked only to vehicle_id (fighter_id = NULL) with gang owner's user_id
    INSERT INTO fighter_effects (
        fighter_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        user_id,
        vehicle_id
    )
    VALUES (
        NULL,
        in_fighter_effect_type_id,
        effect_type_record.effect_name,
        effect_type_record.type_specific_data,
        v_gang_owner_id,
        in_vehicle_id
    )
    RETURNING id INTO new_effect_id;

    -- Insert default modifiers
    FOR modifier_record IN
        SELECT * FROM fighter_effect_type_modifiers
        WHERE fighter_effect_type_id = in_fighter_effect_type_id
    LOOP
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
    END LOOP;

    -- Return created effect
    RETURN (
      SELECT json_build_object(
        'id', fe.id,
        'created_at', fe.created_at,
        'fighter_id', fe.fighter_id,   -- will be null
        'vehicle_id', fe.vehicle_id,
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
        'fighter_effect_modifiers', (
            SELECT json_agg(
                json_build_object(
                    'id', fem.id,
                    'stat_name', fem.stat_name,
                    'numeric_value', fem.numeric_value
                )
            )
            FROM fighter_effect_modifiers fem
            WHERE fem.fighter_effect_id = fe.id
        )
      )
      FROM fighter_effects fe
      WHERE fe.id = new_effect_id
    );
END;
$$;


--
-- Name: gang_logs(uuid, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gang_logs(p_gang_id uuid, p_action_type text, p_description text, p_fighter_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO gang_logs (
        gang_id,
        user_id,
        action_type,
        description,
        fighter_id,
        vehicle_id
    ) VALUES (
        p_gang_id,
        auth.uid(),
        p_action_type,
        p_description,
        p_fighter_id,
        p_vehicle_id
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;


--
-- Name: get_add_fighter_details(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_add_fighter_details(p_gang_type_id uuid, p_gang_affiliation_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, fighter_type text, fighter_class text, fighter_class_id uuid, gang_type text, cost numeric, gang_type_id uuid, special_rules text[], movement numeric, weapon_skill numeric, ballistic_skill numeric, strength numeric, toughness numeric, wounds numeric, initiative numeric, leadership numeric, cool numeric, willpower numeric, intelligence numeric, attacks numeric, limitation numeric, default_equipment jsonb, equipment_selection jsonb, total_cost numeric, sub_type jsonb, available_legacies jsonb, free_skill boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ft.id,
        ft.fighter_type,
        fc.class_name,
        ft.fighter_class_id,  -- Added fighter_class_id field
        ft.gang_type,
        COALESCE(ftgc.adjusted_cost, ft.cost) as cost,
        ft.gang_type_id,
        ft.special_rules::text[],
        ft.movement,
        ft.weapon_skill,
        ft.ballistic_skill,
        ft.strength,
        ft.toughness,
        ft.wounds,
        ft.initiative,
        ft.leadership,
        ft.cool,
        ft.willpower,
        ft.intelligence,
        ft.attacks,
        ft.limitation,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', e.id,
                        'equipment_name', e.equipment_name,
                        'equipment_type', e.equipment_type,
                        'equipment_category', e.equipment_category,
                        'cost', 0,  -- Always show 0 for default equipment
                        'availability', e.availability,
                        'faction', e.faction,
                        'is_editable', COALESCE(e.is_editable, false)
                    )
                )
                FROM fighter_defaults fd
                JOIN equipment e ON e.id = fd.equipment_id
                WHERE fd.fighter_type_id = ft.id
            ),
            '[]'::jsonb
        ) AS default_equipment,
        (
            SELECT 
                CASE 
                    WHEN fes.equipment_selection IS NOT NULL THEN
                        jsonb_build_object(
                            'single', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'multiple', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'optional', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer,
                                                                            'is_editable', COALESCE(re.is_editable, false)
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer,
                                                                        'is_editable', COALESCE(re.is_editable, false)
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            )
                        )
                    ELSE NULL
                END
            FROM fighter_equipment_selections fes
            WHERE fes.fighter_type_id = ft.id
            LIMIT 1
        ) AS equipment_selection,
        COALESCE(ftgc.adjusted_cost, ft.cost) AS total_cost,
        COALESCE(
            (
                SELECT jsonb_build_object(
                    'id', fst.id,
                    'sub_type_name', fst.sub_type_name
                )
                FROM fighter_sub_types fst
                WHERE fst.id = ft.fighter_sub_type_id
            ),
            '{}'::jsonb
        ) AS sub_type,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', fgl.id,
                        'name', fgl.name
                    )
                )
                FROM fighter_type_gang_legacies ftgl
                JOIN fighter_gang_legacy fgl ON fgl.id = ftgl.fighter_gang_legacy_id
                WHERE ftgl.fighter_type_id = ft.id
            ),
            '[]'::jsonb
        ) AS available_legacies,
        ft.free_skill
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    LEFT JOIN fighter_type_gang_cost ftgc ON ftgc.fighter_type_id = ft.id 
        AND ftgc.gang_type_id = p_gang_type_id
        AND (ftgc.gang_affiliation_id IS NULL OR ftgc.gang_affiliation_id = p_gang_affiliation_id)
    WHERE ft.gang_type_id = p_gang_type_id
        OR (ftgc.fighter_type_id IS NOT NULL 
            AND ftgc.gang_affiliation_id IS NOT NULL 
            AND ftgc.gang_affiliation_id = p_gang_affiliation_id);
END;
$$;


--
-- Name: get_available_skills(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_available_skills(fighter_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_result jsonb;
    v_fighter_class text;
    v_gang_origin_id uuid;
    v_gang_id uuid;
    v_fighter_type_id uuid;
    v_custom_fighter_type_id uuid;
BEGIN
    -- Get fighter class, gang origin ID, gang ID, fighter type IDs, and verify fighter exists
    SELECT f.fighter_class, g.gang_origin_id, f.gang_id, f.fighter_type_id, f.custom_fighter_type_id
    INTO v_fighter_class, v_gang_origin_id, v_gang_id, v_fighter_type_id, v_custom_fighter_type_id
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

    -- Build the result as JSON using CTEs to combine standard + custom skills
    WITH standard_skills AS (
        SELECT
            s.id AS skill_id,
            s.name AS skill_name,
            false AS is_custom,
            s.skill_type_id,
            st.name AS skill_type_name,
            st.legendary_name,
            COALESCE(sao.access_level, ftsa.access_level) AS effective_access_level,
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
        AND COALESCE(sao.access_level, ftsa.access_level, 'none') != 'denied'
    ),
    visible_custom_skills AS (
        SELECT
            cs.id AS skill_id,
            cs.skill_name AS skill_name,
            true AS is_custom,
            cs.skill_type_id,
            st.name AS skill_type_name,
            st.legendary_name,
            COALESCE(sao.access_level, ftsa.access_level) AS effective_access_level,
            NOT EXISTS (
                SELECT 1 FROM fighter_skills fs
                WHERE fs.fighter_id = get_available_skills.fighter_id
                AND fs.custom_skill_id = cs.id
            ) AS available,
            0 AS skill_cost
        FROM custom_skills cs
        JOIN skill_types st ON st.id = cs.skill_type_id
        -- Visibility: owned by current user OR shared to fighter's gang's campaign
        LEFT JOIN (
            SELECT DISTINCT csh.custom_skill_id
            FROM custom_shared csh
            JOIN campaign_gangs cg ON cg.campaign_id = csh.campaign_id
            WHERE cg.gang_id = v_gang_id
        ) shared ON shared.custom_skill_id = cs.id
        -- Same access level joins as standard skills
        LEFT JOIN fighter_type_skill_access ftsa ON ftsa.skill_type_id = cs.skill_type_id
            AND (
                (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
                OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
            )
        LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
            AND sao.skill_type_id = cs.skill_type_id
        WHERE (cs.user_id = auth.uid() OR shared.custom_skill_id IS NOT NULL)
        AND COALESCE(sao.access_level, ftsa.access_level, 'none') != 'denied'
    ),
    all_skills AS (
        SELECT * FROM standard_skills
        UNION ALL
        SELECT * FROM visible_custom_skills
    )
    SELECT jsonb_build_object(
        'fighter_id', get_available_skills.fighter_id,
        'fighter_class', v_fighter_class,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'skill_id', a.skill_id,
                    'skill_name', a.skill_name,
                    'is_custom', a.is_custom,
                    'fighter_class', v_fighter_class,
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
                        -- Regular skill costs
                        WHEN v_fighter_class IN ('Leader', 'Champion', 'Juve', 'Specialist', 'Crew', 'Prospect', 'Brute', 'Exotic Beast Specialist')
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


--
-- Name: get_equipment_data(uuid, text, uuid, boolean, boolean, uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_equipment_data(gang_type_id uuid DEFAULT NULL::uuid, equipment_category text DEFAULT NULL::text, fighter_type_id uuid DEFAULT NULL::uuid, fighter_type_equipment boolean DEFAULT NULL::boolean, equipment_tradingpost boolean DEFAULT NULL::boolean, fighter_id uuid DEFAULT NULL::uuid, only_equipment_id uuid DEFAULT NULL::uuid, gang_id uuid DEFAULT NULL::uuid, fighters_tradingpost_only boolean DEFAULT NULL::boolean) RETURNS TABLE(id uuid, equipment_name text, availability text, base_cost numeric, discounted_cost numeric, adjusted_cost numeric, equipment_category text, equipment_type text, created_at timestamp with time zone, fighter_type_equipment boolean, equipment_tradingpost boolean, is_custom boolean, weapon_profiles jsonb, vehicle_upgrade_slot text, grants_equipment jsonb, is_editable boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $_$
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Natural NULL handling for availability - gang origin takes precedence when available
        COALESCE(
            (SELECT availability FROM equipment_availability WHERE gang_origin_id = gang_data.gang_origin_id AND equipment_id = e.id LIMIT 1),
            ea_var.availability,
            ea.availability,
            e.availability
        ) as availability,
        e.cost::numeric as base_cost,
        -- Gang origin OVERRIDES gang type completely - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy discounts (no gang_type!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND (ed2.gang_origin_id = gang_data.gang_origin_id
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
            ELSE
                -- Use gang_type + fighter/legacy discounts (no origin!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND ((ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
        END as discounted_cost,
        -- Gang origin OVERRIDES gang type completely for adjusted cost - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy adjusted costs (no gang_type!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND (ed3.gang_origin_id = gang_data.gang_origin_id
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND (ed4.gang_origin_id = gang_data.gang_origin_id
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
            ELSE
                -- Use gang_type + fighter/legacy adjusted costs (no origin!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND ((ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND ((ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        (
            -- Gang trading post access (always available)
            EXISTS (
                SELECT 1
                FROM gang_types gt, trading_post_equipment tpe
                WHERE gt.gang_type_id = $1
                AND tpe.trading_post_type_id = gt.trading_post_type_id
                AND tpe.equipment_id = e.id
            )
            OR
            -- Fighter trading post access (when fighter_type_id available)
            EXISTS (
                SELECT 1
                FROM fighter_equipment_tradingpost fet,
                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                WHERE (fet.fighter_type_id = $3
                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                AND equip_id = e.id::text
            )
        ) as equipment_tradingpost,
        false as is_custom,
        -- Aggregate weapon profiles into a JSON array
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', wp.ammo,
                        'traits', wp.traits,
                        'sort_order', wp.sort_order
                    )
                    ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
                )
                FROM weapon_profiles wp
                WHERE wp.weapon_id = e.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Determine vehicle upgrade slot from effect modifiers
        CASE 
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'body_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Body'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'drive_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Drive'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'engine_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Engine'
                        ELSE NULL
                    END
            )
            ELSE NULL
        END as vehicle_upgrade_slot,
        -- Enrich grants_equipment options with equipment names
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
        END as grants_equipment,
        COALESCE(e.is_editable, false) as is_editable
    FROM equipment e
    -- Simplified LATERAL join - always executes, no conditionals
    LEFT JOIN LATERAL (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id AS affiliation_ft_id
        FROM gangs g
        LEFT JOIN fighters f ON (f.id = $6 AND f.gang_id = g.id)  -- Fighter must belong to this gang
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
        WHERE g.id = $8  -- Always try to join gang data
    ) gang_data ON TRUE
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gang_data.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gang_data.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.legacy_ft_id OR fte.vehicle_type_id = gang_data.legacy_ft_id) AND $4 = true)
             OR (gang_data.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.affiliation_ft_id OR fte.vehicle_type_id = gang_data.affiliation_ft_id)))
        AND (
            -- If the row has gang_origin_id, it must match the gang's origin
            (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gang_data.gang_origin_id)
            AND
            -- If the row has gang_type_id, it must match the gang's type
            (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
        )
    WHERE 
        (
            COALESCE(e.core_equipment, false) = false
            OR
            (
                e.core_equipment = true
                AND (fte.fighter_type_id IS NOT NULL OR $3 IS NULL)
            )
        )
        AND
        ($2 IS NULL 
         OR trim(both from e.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR e.id = only_equipment_id)
        AND
        (
            -- When both $4 and $5 are provided, use OR logic (items in EITHER fighter's list OR trading post)
            -- Include both fighter-specific and gang-level trading post items
            ($4 IS NULL AND $5 IS NULL)
            OR
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END = $4
                OR
                -- When both filters provided, respect fighters_tradingpost_only flag
                -- If true: only fighter-specific trading post items
                -- If false/null: gang-level AND fighter-specific trading post items
                CASE
                    WHEN $9 = true THEN
                        -- Fighter trading post only: exclude gang-level, use only fighter_equipment_tradingpost
                        EXISTS (
                            SELECT 1
                            FROM fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            WHERE (fet.fighter_type_id = $3
                                   OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                            AND equip_id = e.id::text
                        )
                    ELSE
                        -- Gang OR fighter trading post (existing behaviour)
                        (
                            EXISTS (
                                SELECT 1
                                FROM gang_types gt, trading_post_equipment tpe
                                WHERE gt.gang_type_id = $1
                                AND tpe.trading_post_type_id = gt.trading_post_type_id
                                AND tpe.equipment_id = e.id
                            )
                            OR
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        )
                END = $5
            ))
            OR
            -- When only $4 is provided (fighter's list only)
            ($4 IS NOT NULL AND $5 IS NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4)
            OR
            -- When only $5 is provided (trading post only)
            ($4 IS NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN $9 = true THEN
                        -- Fighter trading post only: exclude gang-level, use only fighter_equipment_tradingpost
                        EXISTS (
                            SELECT 1
                            FROM fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            WHERE (fet.fighter_type_id = $3
                                   OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                            AND equip_id = e.id::text
                        )
                    ELSE
                        -- Gang OR fighter trading post (existing behaviour)
                        (
                            EXISTS (
                                SELECT 1
                                FROM gang_types gt, trading_post_equipment tpe
                                WHERE gt.gang_type_id = $1
                                AND tpe.trading_post_type_id = gt.trading_post_type_id
                                AND tpe.equipment_id = e.id
                            )
                            OR
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        )
                END
            ) = $5)
        )

    UNION ALL

    -- Custom equipment
    SELECT 
        ce.id,
        ce.equipment_name,
        ce.availability as availability,
        ce.cost::numeric as base_cost,
        ce.cost::numeric as discounted_cost, -- No discounts for custom equipment
        ce.cost::numeric as adjusted_cost,   -- No adjustments for custom equipment
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,      -- Custom equipment is available for fighters
        true as equipment_tradingpost,       -- Custom equipment is available in trading post
        true as is_custom,
        -- Custom equipment weapon profiles (if any)
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', cwp.ammo,
                        'traits', cwp.traits,
                        'sort_order', cwp.sort_order
                    )
                    ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
                )
                FROM custom_weapon_profiles cwp
                WHERE cwp.custom_equipment_id = ce.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Custom equipment doesn't have vehicle upgrade slots
        NULL as vehicle_upgrade_slot,
        NULL::jsonb as grants_equipment,
        COALESCE(ce.is_editable, false) as is_editable
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8  -- gang_id parameter
    ) shared ON shared.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL) -- User's own or shared to gang's campaign
        AND ($2 IS NULL
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
        -- Custom equipment is always available in fighter's list, trading post, and unrestricted mode
        -- Only exclude when ONLY trading post is requested with fighters_tradingpost_only (no fighter's list)
        -- Exclude when: $4 IS NULL (no fighter's list) AND $5 IS NOT NULL AND $5 = true (trading post) AND $9 IS NOT NULL AND $9 = true (fighters_tradingpost_only)
        -- Include in all other cases: unrestricted ($4 IS NULL AND $5 IS NULL), fighter's list ($4 = true), or both filters
        AND NOT ($4 IS NULL AND $5 IS NOT NULL AND $5 = true AND $9 IS NOT NULL AND $9 = true)
$_$;


--
-- Name: get_equipment_detailed_data(uuid, text, uuid, boolean, boolean, uuid, uuid, uuid, boolean, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_equipment_detailed_data(gang_type_id uuid DEFAULT NULL::uuid, equipment_category text DEFAULT NULL::text, fighter_type_id uuid DEFAULT NULL::uuid, fighter_type_equipment boolean DEFAULT NULL::boolean, equipment_tradingpost boolean DEFAULT NULL::boolean, fighter_id uuid DEFAULT NULL::uuid, only_equipment_id uuid DEFAULT NULL::uuid, gang_id uuid DEFAULT NULL::uuid, fighters_tradingpost_only boolean DEFAULT NULL::boolean, campaign_trading_post_type_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(id uuid, equipment_name text, availability text, base_cost numeric, discounted_cost numeric, adjusted_cost numeric, equipment_category text, equipment_type text, created_at timestamp with time zone, fighter_type_equipment boolean, equipment_tradingpost boolean, is_custom boolean, weapon_profiles jsonb, vehicle_upgrade_slot text, grants_equipment jsonb, is_editable boolean, trading_post_names text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $_$
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Natural NULL handling for availability - gang origin takes precedence when available
        COALESCE(
            (SELECT availability FROM equipment_availability WHERE gang_origin_id = gang_data.gang_origin_id AND equipment_id = e.id LIMIT 1),
            ea_var.availability,
            ea.availability,
            e.availability
        ) as availability,
        e.cost::numeric as base_cost,
        -- Gang origin OVERRIDES gang type completely - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy discounts (no gang_type!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND (ed2.gang_origin_id = gang_data.gang_origin_id
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
            ELSE
                -- Use gang_type + fighter/legacy discounts (no origin!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND ((ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
        END as discounted_cost,
        -- Gang origin OVERRIDES gang type completely for adjusted cost - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy adjusted costs (no gang_type!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND (ed3.gang_origin_id = gang_data.gang_origin_id
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND (ed4.gang_origin_id = gang_data.gang_origin_id
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
            ELSE
                -- Use gang_type + fighter/legacy adjusted costs (no origin!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND ((ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND ((ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        (
            -- Gang trading post access (always available)
            EXISTS (
                SELECT 1
                FROM gang_types gt, trading_post_equipment tpe
                WHERE gt.gang_type_id = $1
                AND tpe.trading_post_type_id = gt.trading_post_type_id
                AND tpe.equipment_id = e.id
            )
            OR
            -- Fighter trading post access (when fighter_type_id available)
            EXISTS (
                SELECT 1
                FROM fighter_equipment_tradingpost fet,
                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                WHERE (fet.fighter_type_id = $3
                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                AND equip_id = e.id::text
            )
        ) as equipment_tradingpost,
        false as is_custom,
        -- Aggregate weapon profiles into a JSON array
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', wp.ammo,
                        'traits', wp.traits,
                        'sort_order', wp.sort_order
                    )
                    ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
                )
                FROM weapon_profiles wp
                WHERE wp.weapon_id = e.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Determine vehicle upgrade slot from effect modifiers
        CASE 
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'body_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Body'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'drive_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Drive'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'engine_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Engine'
                        ELSE NULL
                    END
            )
            ELSE NULL
        END as vehicle_upgrade_slot,
        -- Enrich grants_equipment options with equipment names
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
        END as grants_equipment,
        COALESCE(e.is_editable, false) as is_editable,
        -- Trading posts to show as source: (1) gang's TP via gang_types, (2) campaign's authorised TPs when in a campaign, (3) TPs that list this equipment when the fighter has access via fighter_equipment_tradingpost
        (SELECT COALESCE(array_agg(DISTINCT tpt.trading_post_name), '{}'::text[])
         FROM trading_post_equipment tpe
         JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id
         WHERE tpe.equipment_id = e.id
           AND (
             EXISTS (SELECT 1 FROM gang_types gt WHERE gt.gang_type_id = $1 AND gt.trading_post_type_id = tpe.trading_post_type_id)
             OR ($10 IS NOT NULL AND array_length($10, 1) > 0 AND tpe.trading_post_type_id = ANY($10))
             OR ($3 IS NOT NULL AND EXISTS (
               SELECT 1 FROM fighter_equipment_tradingpost fet, jsonb_array_elements_text(fet.equipment_tradingpost) AS eq
               WHERE (fet.fighter_type_id = $3 OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                 AND eq = e.id::text
             ))
           )
        ) AS trading_post_names
    FROM equipment e
    -- Simplified LATERAL join - always executes, no conditionals
    LEFT JOIN LATERAL (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id AS affiliation_ft_id
        FROM gangs g
        LEFT JOIN fighters f ON (f.id = $6 AND f.gang_id = g.id)  -- Fighter must belong to this gang
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
        WHERE g.id = $8  -- Always try to join gang data
    ) gang_data ON TRUE
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gang_data.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gang_data.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.legacy_ft_id OR fte.vehicle_type_id = gang_data.legacy_ft_id) AND $4 = true)
             OR (gang_data.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.affiliation_ft_id OR fte.vehicle_type_id = gang_data.affiliation_ft_id)))
        AND (
            -- If the row has gang_origin_id, it must match the gang's origin
            (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gang_data.gang_origin_id)
            AND
            -- If the row has gang_type_id, it must match the gang's type
            (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
        )
    WHERE 
        (
            COALESCE(e.core_equipment, false) = false
            OR
            (
                e.core_equipment = true
                AND (fte.fighter_type_id IS NOT NULL OR $3 IS NULL)
            )
        )
        AND
        ($2 IS NULL 
         OR trim(both from e.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR e.id = only_equipment_id)
        AND
        (
            -- When both $4 and $5 are provided, use OR logic (items in EITHER fighter's list OR trading post)
            -- Include both fighter-specific and gang-level trading post items
            ($4 IS NULL AND $5 IS NULL)
            OR
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END = $4
                OR
                -- When both filters provided, respect fighters_tradingpost_only flag
                -- If $10 (campaign_trading_post_type_ids) is set: restrict TP to equipment in tpe for those IDs; else use existing logic
                (
                    ( $10 IS NULL AND (
                        CASE
                            WHEN $9 = true THEN
                                EXISTS (
                                    SELECT 1
                                    FROM fighter_equipment_tradingpost fet,
                                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                    WHERE (fet.fighter_type_id = $3
                                           OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                    AND equip_id = e.id::text
                                )
                            ELSE
                                (
                                    EXISTS (
                                        SELECT 1
                                        FROM gang_types gt, trading_post_equipment tpe
                                        WHERE gt.gang_type_id = $1
                                        AND tpe.trading_post_type_id = gt.trading_post_type_id
                                        AND tpe.equipment_id = e.id
                                    )
                                    OR
                                    EXISTS (
                                        SELECT 1
                                        FROM fighter_equipment_tradingpost fet,
                                             jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                        WHERE (fet.fighter_type_id = $3
                                               OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                        AND equip_id = e.id::text
                                    )
                                )
                        END
                    ) )
                    OR
                    ( $10 IS NOT NULL AND array_length($10, 1) > 0 AND
                        -- Item must be in campaign's authorized trading posts
                        EXISTS (SELECT 1 FROM trading_post_equipment tpe
                                WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
                        AND
                        -- AND fighter must have access (via gang TP or fighter-specific TP)
                        (
                            EXISTS (
                                SELECT 1
                                FROM gang_types gt, trading_post_equipment tpe2
                                WHERE gt.gang_type_id = $1
                                AND tpe2.trading_post_type_id = gt.trading_post_type_id
                                AND tpe2.equipment_id = e.id
                            )
                            OR
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        )
                    )
                ) = $5
            ))
            OR
            -- When only $4 is provided (fighter's list only)
            ($4 IS NOT NULL AND $5 IS NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4)
            OR
            -- When only $5 is provided (trading post only)
            -- If $10 (campaign_trading_post_type_ids) is set: restrict TP to equipment in tpe for those IDs; else use existing logic
            ($4 IS NULL AND $5 IS NOT NULL AND (
                ( $10 IS NULL AND (
                    CASE
                        WHEN $9 = true THEN
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        ELSE
                            (
                                EXISTS (
                                    SELECT 1
                                    FROM gang_types gt, trading_post_equipment tpe
                                    WHERE gt.gang_type_id = $1
                                    AND tpe.trading_post_type_id = gt.trading_post_type_id
                                    AND tpe.equipment_id = e.id
                                )
                                OR
                                EXISTS (
                                    SELECT 1
                                    FROM fighter_equipment_tradingpost fet,
                                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                    WHERE (fet.fighter_type_id = $3
                                           OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                    AND equip_id = e.id::text
                                )
                            )
                    END
                ) )
                OR
                ( $10 IS NOT NULL AND array_length($10, 1) > 0 AND
                    -- Item must be in campaign's authorized trading posts
                    EXISTS (SELECT 1 FROM trading_post_equipment tpe
                            WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
                    AND
                    -- AND fighter must have access (via gang TP or fighter-specific TP)
                    (
                        EXISTS (
                            SELECT 1
                            FROM gang_types gt, trading_post_equipment tpe2
                            WHERE gt.gang_type_id = $1
                            AND tpe2.trading_post_type_id = gt.trading_post_type_id
                            AND tpe2.equipment_id = e.id
                        )
                        OR
                        EXISTS (
                            SELECT 1
                            FROM fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            WHERE (fet.fighter_type_id = $3
                                   OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                            AND equip_id = e.id::text
                        )
                    )
                )
            ) = $5)
        )

    UNION ALL

    -- Custom equipment
    SELECT 
        ce.id,
        ce.equipment_name,
        ce.availability as availability,
        ce.cost::numeric as base_cost,
        ce.cost::numeric as discounted_cost, -- No discounts for custom equipment
        ce.cost::numeric as adjusted_cost,   -- No adjustments for custom equipment
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,      -- Custom equipment is available for fighters
        true as equipment_tradingpost,       -- Custom equipment is available in trading post
        true as is_custom,
        -- Custom equipment weapon profiles (if any)
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', cwp.ammo,
                        'traits', cwp.traits,
                        'sort_order', cwp.sort_order
                    )
                    ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
                )
                FROM custom_weapon_profiles cwp
                WHERE cwp.custom_equipment_id = ce.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Custom equipment doesn't have vehicle upgrade slots
        NULL as vehicle_upgrade_slot,
        NULL::jsonb as grants_equipment,
        COALESCE(ce.is_editable, false) as is_editable,
        '{}'::text[] AS trading_post_names
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8  -- gang_id parameter
    ) shared ON shared.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL) -- User's own or shared to gang's campaign
        AND ($2 IS NULL
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
        -- Custom equipment is always available in fighter's list, trading post, and unrestricted mode
        -- Only exclude when ONLY trading post is requested with fighters_tradingpost_only (no fighter's list)
        -- Exclude when: $4 IS NULL (no fighter's list) AND $5 IS NOT NULL AND $5 = true (trading post) AND $9 IS NOT NULL AND $9 = true (fighters_tradingpost_only)
        -- Include in all other cases: unrestricted ($4 IS NULL AND $5 IS NULL), fighter's list ($4 = true), or both filters
        AND NOT ($4 IS NULL AND $5 IS NOT NULL AND $5 = true AND $9 IS NOT NULL AND $9 = true)
$_$;


--
-- Name: get_equipment_with_discounts(uuid, text, uuid, boolean, boolean, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_equipment_with_discounts(gang_type_id uuid DEFAULT NULL::uuid, equipment_category text DEFAULT NULL::text, fighter_type_id uuid DEFAULT NULL::uuid, fighter_type_equipment boolean DEFAULT NULL::boolean, equipment_tradingpost boolean DEFAULT NULL::boolean, fighter_id uuid DEFAULT NULL::uuid, only_equipment_id uuid DEFAULT NULL::uuid, gang_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, equipment_name text, availability text, base_cost numeric, discounted_cost numeric, adjusted_cost numeric, equipment_category text, equipment_type text, created_at timestamp with time zone, fighter_type_equipment boolean, equipment_tradingpost boolean, is_custom boolean, weapon_profiles jsonb, vehicle_upgrade_slot text, grants_equipment jsonb, is_editable boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $_$
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Natural NULL handling for availability - gang origin takes precedence when available
        COALESCE(
            (SELECT availability FROM equipment_availability WHERE gang_origin_id = gang_data.gang_origin_id AND equipment_id = e.id LIMIT 1),
            ea_var.availability,
            ea.availability,
            e.availability
        ) as availability,
        e.cost::numeric as base_cost,
        -- Gang origin OVERRIDES gang type completely - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy discounts (no gang_type!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND (ed2.gang_origin_id = gang_data.gang_origin_id
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
            ELSE
                -- Use gang_type + fighter/legacy discounts (no origin!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND ((ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
        END as discounted_cost,
        -- Gang origin OVERRIDES gang type completely for adjusted cost - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy adjusted costs (no gang_type!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND (ed3.gang_origin_id = gang_data.gang_origin_id
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND (ed4.gang_origin_id = gang_data.gang_origin_id
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
            ELSE
                -- Use gang_type + fighter/legacy adjusted costs (no origin!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND ((ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND ((ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        (
            -- Gang trading post access (always available)
            EXISTS (
                SELECT 1
                FROM gang_types gt, trading_post_equipment tpe
                WHERE gt.gang_type_id = $1
                AND tpe.trading_post_type_id = gt.trading_post_type_id
                AND tpe.equipment_id = e.id
            )
            OR
            -- Fighter trading post access (when fighter_type_id available)
            EXISTS (
                SELECT 1
                FROM fighter_equipment_tradingpost fet,
                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                WHERE (fet.fighter_type_id = $3
                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                AND equip_id = e.id::text
            )
        ) as equipment_tradingpost,
        false as is_custom,
        -- Aggregate weapon profiles into a JSON array
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', wp.ammo,
                        'traits', wp.traits,
                        'sort_order', wp.sort_order
                    )
                    ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
                )
                FROM weapon_profiles wp
                WHERE wp.weapon_id = e.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Determine vehicle upgrade slot from effect modifiers
        CASE 
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'body_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Body'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'drive_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Drive'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'engine_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Engine'
                        ELSE NULL
                    END
            )
            ELSE NULL
        END as vehicle_upgrade_slot,
        -- Enrich grants_equipment options with equipment names
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
        END as grants_equipment,
        COALESCE(e.is_editable, false) as is_editable
    FROM equipment e
    -- Simplified LATERAL join - always executes, no conditionals
    LEFT JOIN LATERAL (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id AS affiliation_ft_id
        FROM gangs g
        LEFT JOIN fighters f ON (f.id = $6 AND f.gang_id = g.id)  -- Fighter must belong to this gang
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
        WHERE g.id = $8  -- Always try to join gang data
    ) gang_data ON TRUE
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gang_data.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gang_data.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.legacy_ft_id OR fte.vehicle_type_id = gang_data.legacy_ft_id) AND $4 = true)
             OR (gang_data.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.affiliation_ft_id OR fte.vehicle_type_id = gang_data.affiliation_ft_id)))
        AND (
            -- If the row has gang_origin_id, it must match the gang's origin
            (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gang_data.gang_origin_id)
            AND
            -- If the row has gang_type_id, it must match the gang's type
            (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
        )
    WHERE 
        (
            COALESCE(e.core_equipment, false) = false
            OR
            (
                e.core_equipment = true
                AND (fte.fighter_type_id IS NOT NULL OR $3 IS NULL)
            )
        )
        AND
        ($2 IS NULL 
         OR trim(both from e.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR e.id = only_equipment_id)
        AND
        (
            $4 IS NULL
            OR (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4
        )
        AND
        (
            $5 IS NULL
            OR (
                -- Simplified trading post logic - natural NULL handling
                EXISTS (
                    SELECT 1
                    FROM gang_types gt, trading_post_equipment tpe
                    WHERE gt.gang_type_id = $1
                    AND tpe.trading_post_type_id = gt.trading_post_type_id
                    AND tpe.equipment_id = e.id
                )
                OR
                EXISTS (
                    SELECT 1
                    FROM fighter_equipment_tradingpost fet,
                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                    WHERE (fet.fighter_type_id = $3
                           OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                    AND equip_id = e.id::text
                )
            ) = $5
        )

    UNION ALL

    -- Custom equipment
    SELECT 
        ce.id,
        ce.equipment_name,
        ce.availability as availability,
        ce.cost::numeric as base_cost,
        ce.cost::numeric as discounted_cost, -- No discounts for custom equipment
        ce.cost::numeric as adjusted_cost,   -- No adjustments for custom equipment
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,      -- Custom equipment is available for fighters
        true as equipment_tradingpost,       -- Custom equipment is available in trading post
        true as is_custom,
        -- Custom equipment weapon profiles (if any)
        COALESCE(
            (
                SELECT jsonb_agg(
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
                        'ammo', cwp.ammo,
                        'traits', cwp.traits,
                        'sort_order', cwp.sort_order
                    )
                    ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
                )
                FROM custom_weapon_profiles cwp
                WHERE cwp.custom_equipment_id = ce.id
            ),
            '[]'::jsonb
        ) as weapon_profiles,
        -- Custom equipment doesn't have vehicle upgrade slots
        NULL as vehicle_upgrade_slot,
        NULL::jsonb as grants_equipment,
        COALESCE(ce.is_editable, false) as is_editable
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8  -- gang_id parameter
    ) shared ON shared.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL) -- User's own or shared to gang's campaign
        AND ($2 IS NULL
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
$_$;


--
-- Name: get_fighter_available_advancements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fighter_available_advancements(fighter_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_fighter_xp integer;
  v_advancements_category_id UUID;
  v_fighter_class text;
  v_uses_flat_cost boolean; -- Flag for fighters that use flat costs (Ganger and Exotic Beast)
BEGIN
  -- Get fighter's current XP and fighter class
  SELECT f.xp, f.fighter_class
  INTO v_fighter_xp, v_fighter_class
  FROM fighters f
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;
  
  -- Determine if the fighter uses flat costs based on fighter_class
  -- Only Gangers and Exotic Beasts use flat costs
  v_uses_flat_cost :=
    v_fighter_class IN ('Ganger', 'Exotic Beast');
  
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
      -- Calculate XP cost based on fighter class and characteristic
      CASE
        -- For Gangers and Exotic Beasts: fixed 6 XP cost
        WHEN v_uses_flat_cost THEN 6
        -- For Juves and Prospects: base cost only (no escalating penalty)
        WHEN v_fighter_class IN ('Juve', 'Prospect') THEN etc.base_xp_cost
        -- For other fighters: base cost + (2 * times increased)
        WHEN COALESCE(ac.times_increased, 0) = 0 THEN etc.base_xp_cost
        ELSE etc.base_xp_cost + (2 * ac.times_increased)
      END as xp_cost,
      -- Calculate credits increase based on fighter class and characteristic
      CASE
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
        WHEN v_uses_flat_cost THEN v_fighter_xp >= 6
        WHEN v_fighter_class IN ('Juve', 'Prospect') THEN v_fighter_xp >= etc.base_xp_cost
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
    'fighter_class', v_fighter_class,
    'uses_flat_cost', v_uses_flat_cost,
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
$$;


--
-- Name: get_fighter_types_with_cost(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fighter_types_with_cost(p_gang_type_id uuid DEFAULT NULL::uuid, p_gang_affiliation_id uuid DEFAULT NULL::uuid, p_is_gang_addition boolean DEFAULT NULL::boolean) RETURNS TABLE(id uuid, fighter_type text, fighter_class text, gang_type text, cost numeric, gang_type_id uuid, special_rules text[], movement numeric, weapon_skill numeric, ballistic_skill numeric, strength numeric, toughness numeric, wounds numeric, initiative numeric, leadership numeric, cool numeric, willpower numeric, intelligence numeric, attacks numeric, limitation numeric, alignment public.alignment, is_gang_addition boolean, alliance_id uuid, alliance_crew_name text, default_equipment jsonb, equipment_selection jsonb, total_cost numeric, sub_type jsonb, free_skill boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.fighter_type,
        fc.class_name,
        ft.gang_type,
        -- Use adjusted_cost if available, otherwise use original cost
        COALESCE(ftgc.adjusted_cost, ft.cost) as cost,
        ft.gang_type_id,
        ft.special_rules::text[],
        ft.movement,
        ft.weapon_skill,
        ft.ballistic_skill,
        ft.strength,
        ft.toughness,
        ft.wounds,
        ft.initiative,
        ft.leadership,
        ft.cool,
        ft.willpower,
        ft.intelligence,
        ft.attacks,
        ft.limitation,
        ft.alignment,
        ft.is_gang_addition,
        ft.alliance_id,
        ft.alliance_crew_name,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', e.id,
                    'equipment_name', e.equipment_name,
                    'equipment_type', e.equipment_type,
                    'equipment_category', e.equipment_category,
                    'cost', 0,
                    'availability', e.availability,
                    'faction', e.faction
                )
            ), '[]'::jsonb)
            FROM fighter_defaults fd
            JOIN equipment e ON e.id = fd.equipment_id
            WHERE fd.fighter_type_id = ft.id
        ) AS default_equipment,
        (
            SELECT 
                CASE 
                    WHEN fes.equipment_selection IS NOT NULL THEN
                        jsonb_build_object(
                            'single', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'multiple', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'optional', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'optional_single', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional_single'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional_single'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional_single'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional_single'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional_single'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional_single'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional_single'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional_single'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional_single'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional_single'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            )
                        )
                    ELSE NULL
                END
            FROM fighter_equipment_selections fes
            WHERE fes.fighter_type_id = ft.id
            LIMIT 1
        ) AS equipment_selection,
        -- Use adjusted_cost for total_cost if available, otherwise use original cost
        COALESCE(ftgc.adjusted_cost, ft.cost) AS total_cost,
        -- Add sub_type information
        CASE 
            WHEN fsub.id IS NOT NULL THEN
                jsonb_build_object(
                    'id', fsub.id,
                    'sub_type_name', fsub.sub_type_name
                )
            ELSE NULL
        END AS sub_type,
        ft.free_skill
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    LEFT JOIN fighter_type_gang_cost ftgc ON ftgc.fighter_type_id = ft.id 
        AND ftgc.gang_type_id = p_gang_type_id
        AND (ftgc.gang_affiliation_id IS NULL OR ftgc.gang_affiliation_id = p_gang_affiliation_id)
    LEFT JOIN fighter_sub_types fsub ON fsub.id = ft.fighter_sub_type_id
    WHERE
        -- Removed the gang_type_id restriction for gang additions
        (p_is_gang_addition IS NULL OR ft.is_gang_addition = p_is_gang_addition);
END;
$$;


--
-- Name: get_gang_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gang_details(p_gang_id uuid) RETURNS TABLE(id uuid, name text, gang_type text, gang_type_id uuid, gang_type_image_url text, gang_colour text, credits numeric, reputation numeric, meat numeric, scavenging_rolls numeric, exploration_points numeric, power numeric, sustenance numeric, salvage numeric, rating numeric, alignment public.alignment, positioning jsonb, note text, stash json, created_at timestamp with time zone, last_updated timestamp with time zone, fighters json, campaigns json, vehicles json, alliance_id uuid, alliance_name text, alliance_type text, gang_variants json)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
   RETURN QUERY
   WITH fighter_ids AS (
       SELECT f.id AS f_id
       FROM fighters f
       WHERE f.gang_id = p_gang_id
   ),
   vehicle_ids AS (
       SELECT v.id AS v_id
       FROM vehicles v
       WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
   ),
   gang_fighters AS (
       SELECT
           f.id AS f_id,
           f.gang_id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_type_id,
           f.fighter_class,
           f.fighter_sub_type_id,
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
       SELECT DISTINCT wp.id, wp.weapon_id, wp.profile_name, wp.range_short, wp.range_long, 
                      wp.acc_short, wp.acc_long, wp.strength, wp.ap, wp.damage, wp.ammo, 
                      wp.traits, wp.weapon_group_id, wp.sort_order,
                      fe.id AS fe_id, fe.is_master_crafted
       FROM weapon_profiles wp
       JOIN fighter_equipment fe ON fe.equipment_id = wp.weapon_id
       WHERE (fe.fighter_id IN (SELECT f_id FROM fighter_ids)
          OR fe.vehicle_id IN (
             SELECT v.id FROM vehicles v 
             WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
          ))
       AND fe.equipment_id IS NOT NULL
   ),
   weapon_profiles_grouped AS (
       SELECT 
           wpd.fe_id,
           wpd.weapon_id as equipment_id,
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
       GROUP BY wpd.fe_id, wpd.weapon_id
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
       AND (fe.fighter_id IN (SELECT f_id FROM fighter_ids)
          OR fe.vehicle_id IN (
             SELECT v.id FROM vehicles v 
             WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
          ))
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
       AND ve.vehicle_id IN (
           SELECT v.id 
           FROM vehicles v 
           WHERE v.gang_id = p_gang_id 
              OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
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
       AND ve.vehicle_id IN (
           SELECT v.id 
           FROM vehicles v 
           WHERE v.gang_id = p_gang_id 
              OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
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
       WHERE (v.fighter_id IN (SELECT f_id FROM fighter_ids) OR v.gang_id = p_gang_id)
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
           f.fighter_class,
           json_build_object(
             'fighter_sub_type', fst.sub_type_name,
             'fighter_sub_type_id', fst.id
           ) AS fighter_sub_type,
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
       LEFT JOIN fighter_sub_types fst ON fst.id = f.fighter_sub_type_id
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
                   'has_meat', c.has_meat,
                   'has_exploration_points', c.has_exploration_points,
                   'has_scavenging_rolls', c.has_scavenging_rolls,
                   'has_power', c.has_power,
                   'has_sustenance', c.has_sustenance,
                   'has_salvage', c.has_salvage,
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
   gang_variant_info AS (
       SELECT 
           COALESCE(
               json_agg(
                   json_build_object(
                       'id', gvt.id,
                       'variant', gvt.variant
                   )
                   ORDER BY gvt.variant
               ),
               '[]'::json
           ) as variant_info
       FROM gang_variant_types gvt
       JOIN gangs g ON g.id = p_gang_id
       WHERE gvt.id::text IN (
           SELECT jsonb_array_elements_text(g.gang_variants)
       )
   ),
   all_fighters_json AS (
       SELECT json_agg(
           json_build_object(
               'id', cf.id,
               'fighter_name', cf.fighter_name,
               'label', cf.label,
               'fighter_type', cf.fighter_type,
               'fighter_class', cf.fighter_class,
               'fighter_sub_type', cf.fighter_sub_type,
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
       g.meat,
       g.scavenging_rolls,
       g.exploration_points,
       g.power,
       g.sustenance,
       g.salvage,
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
       (SELECT variant_info FROM gang_variant_info) as gang_variants
   FROM gangs g
   LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
   LEFT JOIN alliances a ON a.id = g.alliance_id
   WHERE g.id = p_gang_id;
END;
$$;


--
-- Name: get_gang_permissions(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gang_permissions(p_user_id uuid, p_gang_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
  v_is_owner BOOLEAN := FALSE;
  v_campaign_role TEXT := NULL;
  v_is_campaign_owner BOOLEAN := FALSE;
  v_is_campaign_arbitrator BOOLEAN := FALSE;
  v_can_edit BOOLEAN := FALSE;
  v_can_delete BOOLEAN := FALSE;
BEGIN
  -- Check if user is admin (profiles.user_role = 'admin')
  SELECT (user_role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;

  -- Default to false if user not found
  v_is_admin := COALESCE(v_is_admin, FALSE);

  -- Check if user owns the gang (gangs.user_id = p_user_id)
  SELECT (user_id = p_user_id) INTO v_is_owner
  FROM gangs
  WHERE id = p_gang_id;

  -- Default to false if gang not found
  v_is_owner := COALESCE(v_is_owner, FALSE);

  -- Get highest campaign role for this user across all campaigns containing this gang
  -- Role hierarchy: OWNER > ARBITRATOR > MEMBER
  -- Only consider ACCEPTED gang assignments (security fix for PR 1)
  SELECT
    CASE
      WHEN bool_or(cm.role = 'OWNER') THEN 'OWNER'
      WHEN bool_or(cm.role = 'ARBITRATOR') THEN 'ARBITRATOR'
      WHEN bool_or(cm.role = 'MEMBER') THEN 'MEMBER'
      ELSE NULL
    END INTO v_campaign_role
  FROM campaign_gangs cg
  INNER JOIN campaign_members cm ON cm.campaign_id = cg.campaign_id AND cm.user_id = p_user_id
  WHERE cg.gang_id = p_gang_id
    AND cg.status = 'ACCEPTED';

  -- Determine campaign permission flags
  v_is_campaign_owner := (v_campaign_role = 'OWNER');
  v_is_campaign_arbitrator := (v_campaign_role = 'ARBITRATOR');

  -- Calculate composite permissions
  v_can_edit := v_is_owner OR v_is_admin OR v_is_campaign_owner OR v_is_campaign_arbitrator;
  v_can_delete := v_is_owner OR v_is_admin OR v_is_campaign_owner OR v_is_campaign_arbitrator;

  -- Return JSON matching UserPermissions interface
  RETURN json_build_object(
    'isOwner', v_is_owner,
    'isAdmin', v_is_admin,
    'canEdit', v_can_edit,
    'canDelete', v_can_delete,
    'canView', TRUE,
    'userId', p_user_id
  );
END;
$$;


--
-- Name: FUNCTION get_gang_permissions(p_user_id uuid, p_gang_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gang_permissions(p_user_id uuid, p_gang_id uuid) IS 'Returns gang permissions for a user. Consolidates 3 queries (profiles, gangs, campaign_members) into 1 RPC call. Used for both gang and fighter permissions.';


--
-- Name: notify_campaign_member_added(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_campaign_member_added() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
   campaign_name_var TEXT;
BEGIN
   -- Get the campaign name
   SELECT campaign_name INTO campaign_name_var
   FROM campaigns 
   WHERE id = NEW.campaign_id;
   
   -- Insert notification for the newly added member
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed
   ) VALUES (
       NEW.user_id,
       NEW.invited_by,
       'invite',
       'You have been invited to the campaign "' || COALESCE(campaign_name_var, 'Unknown Campaign') || '". Click this notification to go to the campaign.',
       'https://www.mundamanager.com/campaigns/' || NEW.campaign_id,
       false
   );
   
   RETURN NEW;
END;
$$;


--
-- Name: notify_friend_request_sent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_friend_request_sent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
   requester_username_var TEXT;
BEGIN
   -- Get the requester's username
   SELECT username INTO requester_username_var
   FROM profiles 
   WHERE id = NEW.requester_id;
   
   -- Insert notification for the addressee (person receiving the friend request)
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed,
       expires_at
   ) VALUES (
       NEW.addressee_id,
       NEW.requester_id,
       'friend_request',
       COALESCE(requester_username_var, 'Someone') || ' sent you a friend request.',
       NULL,
       false,
       NOW() + INTERVAL '30 days'
   );
   
   RETURN NEW;
END;
$$;


--
-- Name: notify_gang_invite(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_gang_invite() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
   gang_name_var TEXT;
   campaign_name_var TEXT;
   inviter_name_var TEXT;
BEGIN
   -- Only notify for PENDING status (not for ACCEPTED - user added their own gang)
   IF NEW.status != 'PENDING' THEN
      RETURN NEW;
   END IF;

   -- Get the gang name
   SELECT name INTO gang_name_var
   FROM gangs
   WHERE id = NEW.gang_id;

   -- Get the campaign name
   SELECT campaign_name INTO campaign_name_var
   FROM campaigns
   WHERE id = NEW.campaign_id;

   -- Get the inviter's username
   SELECT username INTO inviter_name_var
   FROM profiles
   WHERE id = NEW.invited_by;

   -- Insert notification for the gang owner
   -- Link includes gangId as query param so UI can parse it for accept/decline
   INSERT INTO notifications (
       receiver_id,
       sender_id,
       type,
       text,
       link,
       dismissed
   ) VALUES (
       NEW.user_id,  -- The gang owner receives the notification
       NEW.invited_by,  -- The person who added the gang
       'gang_invite',
       COALESCE(inviter_name_var, 'Someone') || ' wants to add your gang "' || COALESCE(gang_name_var, 'Unknown Gang') || '" to the campaign "' || COALESCE(campaign_name_var, 'Unknown Campaign') || '".',
       'https://www.mundamanager.com/campaigns/' || NEW.campaign_id || '?gangId=' || NEW.gang_id,
       false
   );

   RETURN NEW;
END;
$$;


--
-- Name: safe_to_numeric(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_to_numeric(v text) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF v IS NULL OR v = '' THEN
        RETURN 0;
    END IF;
    RETURN v::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN 0;
END;
$$;


--
-- Name: update_gang_financials(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_gang_financials(p_gang_id uuid, p_credits_delta integer DEFAULT 0, p_rating_delta integer DEFAULT 0, p_stash_value_delta integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_current_credits INTEGER;
    v_current_rating INTEGER;
    v_current_wealth INTEGER;
    v_new_credits INTEGER;
    v_new_rating INTEGER;
    v_new_wealth INTEGER;
    v_wealth_delta INTEGER;
BEGIN
    -- Lock the row for the duration of this transaction
    SELECT credits, rating, wealth
    INTO v_current_credits, v_current_rating, v_current_wealth
    FROM gangs
    WHERE id = p_gang_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Gang not found'
        );
    END IF;

    -- Coalesce NULLs to 0
    v_current_credits := COALESCE(v_current_credits, 0);
    v_current_rating := COALESCE(v_current_rating, 0);
    v_current_wealth := COALESCE(v_current_wealth, 0);

    -- Overdraft check: fail fast if insufficient credits
    IF p_credits_delta < 0 AND v_current_credits + p_credits_delta < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient credits',
            'old_values', jsonb_build_object(
                'credits', v_current_credits,
                'rating', v_current_rating,
                'wealth', v_current_wealth
            )
        );
    END IF;

    -- Calculate new values with floor at 0
    v_wealth_delta := p_rating_delta + p_credits_delta + p_stash_value_delta;
    v_new_credits := GREATEST(0, v_current_credits + p_credits_delta);
    v_new_rating := GREATEST(0, v_current_rating + p_rating_delta);
    v_new_wealth := GREATEST(0, v_current_wealth + v_wealth_delta);

    -- Update the row (already locked, guaranteed to succeed)
    UPDATE gangs
    SET credits = v_new_credits,
        rating = v_new_rating,
        wealth = v_new_wealth
    WHERE id = p_gang_id;

    RETURN jsonb_build_object(
        'success', true,
        'old_values', jsonb_build_object(
            'credits', v_current_credits,
            'rating', v_current_rating,
            'wealth', v_current_wealth
        ),
        'new_values', jsonb_build_object(
            'credits', v_new_credits,
            'rating', v_new_rating,
            'wealth', v_new_wealth
        )
    );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alliances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alliances (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    alliance_type text,
    alliance_name text,
    alignment text,
    strong_alliance uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alliance_crew_name text
);


--
-- Name: campaign_allegiances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_allegiances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    allegiance_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: TABLE campaign_allegiances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_allegiances IS 'Custom allegiances created by arbitrators/owners for specific campaigns';


--
-- Name: campaign_battles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_battles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attacker_id uuid,
    defender_id uuid,
    scenario_id uuid,
    winner_id uuid,
    note text,
    campaign_id uuid,
    participants jsonb,
    updated_at timestamp with time zone,
    scenario text,
    territory_id uuid,
    custom_territory_id uuid,
    cycle integer
);


--
-- Name: COLUMN campaign_battles.attacker_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_battles.attacker_id IS 'gang_id';


--
-- Name: COLUMN campaign_battles.defender_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_battles.defender_id IS 'gang_id';


--
-- Name: COLUMN campaign_battles.winner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_battles.winner_id IS 'gang_id';


--
-- Name: campaign_gang_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_gang_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_gang_id uuid NOT NULL,
    campaign_type_resource_id uuid,
    campaign_resource_id uuid,
    quantity numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT resource_type_check CHECK ((((campaign_type_resource_id IS NOT NULL) AND (campaign_resource_id IS NULL)) OR ((campaign_type_resource_id IS NULL) AND (campaign_resource_id IS NOT NULL))))
);


--
-- Name: TABLE campaign_gang_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_gang_resources IS 'Resource quantities accumulated by gangs in campaigns';


--
-- Name: campaign_gangs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_gangs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    user_id uuid NOT NULL,
    role text,
    status text,
    invited_at timestamp with time zone,
    joined_at timestamp with time zone,
    invited_by uuid,
    gang_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    campaign_member_id uuid,
    campaign_type_allegiance_id uuid,
    campaign_allegiance_id uuid
);


--
-- Name: COLUMN campaign_gangs.campaign_type_allegiance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_gangs.campaign_type_allegiance_id IS 'Gang''s allegiance from predefined campaign type allegiances for this campaign';


--
-- Name: COLUMN campaign_gangs.campaign_allegiance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_gangs.campaign_allegiance_id IS 'Gang''s allegiance from custom campaign allegiances for this campaign';


--
-- Name: campaign_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    campaign_id uuid,
    invited_by uuid,
    role text,
    status text,
    invited_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT campaign_members_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'MEMBER'::text, 'OWNER'::text, 'ARBITRATOR'::text])))
);


--
-- Name: TABLE campaign_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_members IS 'members of a campaign';


--
-- Name: campaign_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    resource_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: TABLE campaign_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_resources IS 'Custom resources created by arbitrators/owners for specific campaigns';


--
-- Name: campaign_territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_territories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    territory_id uuid,
    campaign_id uuid,
    owner jsonb,
    territory_name text,
    gang_id uuid,
    ruined boolean DEFAULT false,
    updated_at timestamp with time zone,
    default_gang_territory boolean DEFAULT false,
    custom_territory_id uuid
);


--
-- Name: campaign_triumphs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_triumphs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triumph text,
    criteria text,
    campaign_type_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: campaign_type_allegiances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_type_allegiances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_type_id uuid NOT NULL,
    allegiance_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: TABLE campaign_type_allegiances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_type_allegiances IS 'Predefined allegiances available for each campaign type (e.g., Imperial House, Lady Credo''s Rebellion for Succession campaigns)';


--
-- Name: campaign_type_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_type_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_type_id uuid NOT NULL,
    resource_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: TABLE campaign_type_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_type_resources IS 'Predefined resources available for each campaign type (e.g., Exploration Points for Underhells, Meat and Scavenging Rolls for Uprising)';


--
-- Name: campaign_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_type_name text,
    description text,
    has_meat boolean DEFAULT false NOT NULL,
    has_exploration_points boolean DEFAULT false NOT NULL,
    has_scavenging_rolls boolean DEFAULT false NOT NULL,
    image_url text,
    has_power boolean DEFAULT false,
    has_sustenance boolean DEFAULT false,
    has_salvage boolean DEFAULT false,
    trading_posts jsonb
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_name text,
    campaign_type_id uuid,
    status text,
    updated_at timestamp with time zone,
    has_meat boolean DEFAULT false NOT NULL,
    has_exploration_points boolean DEFAULT false NOT NULL,
    has_scavenging_rolls boolean DEFAULT false NOT NULL,
    note text,
    description text,
    image_url text,
    has_power boolean DEFAULT false,
    has_sustenance boolean DEFAULT false,
    has_salvage boolean DEFAULT false,
    trading_posts jsonb
);


--
-- Name: COLUMN campaigns.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.status IS 'Campaign status: Active or Closed. Defaults to Active for new campaigns.';


--
-- Name: custom_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    equipment_name text,
    trading_post_category text,
    availability text,
    cost numeric,
    faction text,
    variant text,
    equipment_category text,
    equipment_category_id uuid,
    equipment_type text,
    user_id uuid NOT NULL,
    is_editable boolean DEFAULT false
);


--
-- Name: custom_fighter_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_fighter_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_type text,
    gang_type text,
    cost numeric,
    movement numeric,
    weapon_skill numeric,
    ballistic_skill numeric,
    strength numeric,
    toughness numeric,
    wounds numeric,
    initiative numeric,
    attacks numeric,
    leadership numeric,
    cool numeric,
    willpower numeric,
    intelligence numeric,
    gang_type_id uuid,
    special_rules jsonb,
    free_skill boolean,
    fighter_class text,
    fighter_class_id uuid,
    user_id uuid
);


--
-- Name: custom_shared; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_shared (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    custom_equipment_id uuid,
    custom_fighter_type_id uuid,
    campaign_id uuid,
    custom_territory_id uuid,
    user_id uuid,
    custom_skill_id uuid
);


--
-- Name: custom_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    skill_name text,
    user_id uuid,
    skill_type_id uuid
);


--
-- Name: custom_territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_territories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    territory_name text,
    user_id uuid NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: custom_weapon_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_weapon_profiles (
    custom_equipment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    profile_name text,
    range_short text NOT NULL,
    range_long text NOT NULL,
    acc_short text NOT NULL,
    acc_long text NOT NULL,
    strength text NOT NULL,
    ap text NOT NULL,
    damage text NOT NULL,
    ammo text NOT NULL,
    traits text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weapon_group_id uuid,
    sort_order numeric,
    user_id uuid
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    equipment_name text,
    trading_post_category text,
    availability text,
    cost numeric,
    faction text,
    variants text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipment_category text NOT NULL,
    equipment_type text,
    core_equipment boolean,
    equipment_category_id uuid NOT NULL,
    updated_at timestamp with time zone,
    is_editable boolean DEFAULT false,
    grants_equipment jsonb
);


--
-- Name: COLUMN equipment.equipment_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.equipment.equipment_category IS 'Category of equipment';


--
-- Name: COLUMN equipment.core_equipment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.equipment.core_equipment IS 'If the equipment is a weapon or wargear that is not available in the TP or deletable';


--
-- Name: equipment_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    discount numeric,
    availability text,
    gang_type_id uuid,
    equipment_id uuid,
    gang_origin_id uuid,
    gang_variant_id uuid
);


--
-- Name: equipment_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category_name text
);


--
-- Name: equipment_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    discount numeric DEFAULT '0'::numeric NOT NULL,
    gang_type_id uuid,
    fighter_type_id uuid,
    adjusted_cost numeric,
    gang_origin_id uuid
);


--
-- Name: exotic_beasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exotic_beasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_type_id uuid,
    equipment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    class_name text,
    standard_class boolean DEFAULT false
);


--
-- Name: fighter_defaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_defaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_type_id uuid,
    equipment_id uuid,
    skill_id uuid,
    updated_at timestamp with time zone,
    custom_fighter_type_id uuid,
    custom_equipment_id uuid
);


--
-- Name: fighter_effect_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_effect_injuries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_injuries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_effect_id uuid,
    fighter_skill_id uuid
);


--
-- Name: fighter_effect_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stat_name text,
    fighter_effect_id uuid,
    numeric_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    operation text,
    user_id uuid
);


--
-- Name: fighter_effect_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_effect_id uuid,
    fighter_skill_id uuid
);


--
-- Name: fighter_effect_type_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_type_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_effect_type_id uuid,
    stat_name text,
    default_numeric_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    operation text
);


--
-- Name: fighter_effect_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effect_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effect_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_effect_category_id uuid,
    type_specific_data jsonb
);


--
-- Name: fighter_effects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_effects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effect_name text,
    fighter_id uuid,
    fighter_effect_type_id uuid,
    type_specific_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    vehicle_id uuid,
    user_id uuid DEFAULT auth.uid(),
    fighter_equipment_id uuid,
    target_equipment_id uuid,
    fighter_skill_id uuid
);


--
-- Name: fighter_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_equipment (
    equipment_id uuid,
    fighter_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_cost numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    original_cost numeric,
    vehicle_id uuid,
    user_id uuid DEFAULT auth.uid(),
    is_master_crafted boolean DEFAULT false NOT NULL,
    fighter_effect_equipment_id uuid,
    custom_equipment_id uuid,
    gang_stash boolean DEFAULT false,
    gang_id uuid,
    loadout_id integer,
    is_editable boolean DEFAULT false,
    granted_by_equipment_id uuid
);


--
-- Name: fighter_equipment_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_equipment_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_type_id uuid,
    equipment_selection jsonb,
    updated_at timestamp with time zone
);


--
-- Name: TABLE fighter_equipment_selections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fighter_equipment_selections IS 'Table that have all the related equipment that fighters with selections can choose, for example hanger-ons etc.';


--
-- Name: fighter_equipment_tradingpost; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_equipment_tradingpost (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_type_id uuid,
    equipment_tradingpost jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_exotic_beasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_exotic_beasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_owner_id uuid,
    fighter_pet_id uuid,
    fighter_equipment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_gang_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_gang_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    name text,
    fighter_type_id uuid
);


--
-- Name: fighter_injuries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_injuries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_id uuid,
    code_1 text,
    characteristic_1 numeric,
    code_2 text,
    characteristic_2 numeric,
    injury_id uuid,
    injury_name text,
    fighter_skill_id uuid
);


--
-- Name: fighter_loadout_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_loadout_equipment (
    loadout_id uuid NOT NULL,
    fighter_equipment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: fighter_loadouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_loadouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_id uuid NOT NULL,
    loadout_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_skill_access_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_skill_access_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_id uuid NOT NULL,
    skill_type_id uuid NOT NULL,
    access_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    user_id uuid,
    CONSTRAINT fighter_skill_access_override_access_level_check CHECK ((access_level = ANY (ARRAY['primary'::text, 'secondary'::text, 'allowed'::text, 'denied'::text])))
);


--
-- Name: fighter_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_id uuid,
    updated_at timestamp with time zone,
    skill_id uuid,
    is_advance boolean DEFAULT false NOT NULL,
    credits_increase bigint,
    xp_cost numeric,
    fighter_injury_id uuid,
    user_id uuid,
    fighter_effect_skill_id uuid,
    custom_skill_id uuid
);


--
-- Name: fighter_sub_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_sub_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sub_type_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: fighter_type_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_type_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    equipment_id uuid,
    fighter_type_id uuid,
    vehicle_type_id uuid,
    updated_at timestamp with time zone,
    custom_fighter_type_id uuid,
    gang_type_id uuid,
    gang_origin_id uuid
);


--
-- Name: fighter_type_gang_cost; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_type_gang_cost (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_type_id uuid,
    gang_type_id uuid,
    adjusted_cost numeric,
    gang_affiliation_id uuid
);


--
-- Name: fighter_type_gang_legacies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_type_gang_legacies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fighter_type_id uuid,
    fighter_gang_legacy_id uuid,
    "OLDgang_affiliation_id" uuid
);


--
-- Name: fighter_type_skill_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_type_skill_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_type_id uuid,
    skill_type_id uuid,
    access_level text NOT NULL,
    custom_fighter_type_id uuid,
    CONSTRAINT fighter_type_skill_access_access_level_check CHECK ((access_level = ANY (ARRAY['primary'::text, 'secondary'::text, 'allowed'::text])))
);


--
-- Name: fighter_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighter_types (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_type text,
    gang_type text,
    cost numeric,
    movement numeric,
    weapon_skill numeric,
    ballistic_skill numeric,
    strength numeric,
    toughness numeric,
    wounds numeric,
    initiative numeric,
    leadership numeric,
    cool numeric,
    willpower numeric,
    intelligence numeric,
    attacks numeric,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gang_type_id uuid,
    special_rules jsonb[],
    free_skill boolean,
    fighter_class text,
    fighter_class_id uuid,
    is_gang_addition boolean DEFAULT false,
    limitation numeric,
    alignment public.alignment,
    fighter_sub_type_id uuid,
    updated_at timestamp with time zone,
    fighter_sub_type text,
    alliance_id uuid,
    alliance_crew_name text,
    is_spyrer boolean DEFAULT false
);


--
-- Name: fighters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fighters (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fighter_name text,
    fighter_type text,
    credits numeric,
    movement numeric,
    weapon_skill numeric,
    ballistic_skill numeric,
    strength numeric,
    toughness numeric,
    wounds numeric,
    initiative numeric,
    leadership numeric,
    cool numeric,
    willpower numeric,
    intelligence numeric,
    attacks numeric,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fighter_type_id uuid,
    gang_id uuid,
    kills numeric DEFAULT '0'::numeric,
    xp numeric DEFAULT '0'::numeric,
    special_rules jsonb[],
    "position" integer DEFAULT 0 NOT NULL,
    total_xp numeric DEFAULT '0'::numeric,
    free_skill boolean,
    updated_at timestamp with time zone,
    starved boolean DEFAULT false NOT NULL,
    killed boolean DEFAULT false NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    enslaved boolean DEFAULT false NOT NULL,
    fighter_class text,
    note text,
    cost_adjustment numeric DEFAULT '0'::numeric,
    fighter_class_id uuid,
    label text,
    recovery boolean DEFAULT false,
    user_id uuid DEFAULT auth.uid(),
    fighter_sub_type_id uuid,
    fighter_sub_type text,
    fighter_pet_id uuid,
    image_url text,
    note_backstory text,
    captured boolean DEFAULT false,
    fighter_gang_legacy_id uuid,
    custom_fighter_type_id uuid,
    current_loadout integer,
    kill_count numeric,
    active_loadout_id uuid,
    selected_archetype_id uuid,
    CONSTRAINT fighters_label_check CHECK ((length(label) <= 5))
);


--
-- Name: TABLE fighters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fighters IS 'users records';


--
-- Name: COLUMN fighters.kill_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fighters.kill_count IS 'kill_count is used to keep track of spyrers kill count';


--
-- Name: friends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT friends_check CHECK ((requester_id <> addressee_id)),
    CONSTRAINT friends_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'blocked'::character varying])::text[])))
);


--
-- Name: gang_affiliation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_affiliation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    name text,
    fighter_type_id uuid
);


--
-- Name: gang_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gang_id uuid NOT NULL,
    user_id uuid,
    action_type text NOT NULL,
    description text NOT NULL,
    fighter_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    vehicle_id uuid
);


--
-- Name: gang_origin_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_origin_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    category_name text
);


--
-- Name: gang_origins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_origins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    origin_name text,
    gang_origin_category_id uuid
);


--
-- Name: gang_stash; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_stash (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    gang_id uuid,
    equipment_id uuid,
    cost numeric,
    is_master_crafted boolean DEFAULT false NOT NULL,
    custom_equipment_id uuid
);


--
-- Name: gang_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_types (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    gang_type text,
    image_url text,
    gang_type_id uuid DEFAULT gen_random_uuid() NOT NULL,
    alignment public.alignment,
    is_hidden boolean DEFAULT false,
    trading_post_type_id uuid,
    affiliation boolean DEFAULT false,
    gang_origin_category_id uuid,
    default_image_urls jsonb
);


--
-- Name: COLUMN gang_types.default_image_urls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gang_types.default_image_urls IS 'List of default image URLs';


--
-- Name: gang_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.gang_types ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.gang_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: gang_variant_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gang_variant_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: gangs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gangs (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    name text,
    gang_type text,
    credits numeric,
    last_updated timestamp with time zone,
    reputation numeric,
    meat numeric DEFAULT '0'::numeric,
    exploration_points numeric DEFAULT '0'::numeric,
    rating numeric,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gang_type_id uuid,
    alignment public.alignment,
    positioning jsonb,
    note text,
    alliance_id uuid,
    gang_variants jsonb,
    gang_colour text,
    scavenging_rolls numeric DEFAULT '0'::numeric,
    image_url text,
    note_backstory text,
    gang_affiliation_id uuid,
    gang_origin_id uuid,
    wealth numeric,
    power numeric,
    sustenance numeric,
    salvage numeric,
    hidden boolean DEFAULT false,
    default_gang_image numeric
);


--
-- Name: COLUMN gangs.default_gang_image; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gangs.default_gang_image IS 'Default Gang Image the user selected';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    text character varying NOT NULL,
    type character varying NOT NULL,
    sender_id uuid,
    receiver_id uuid NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    link text,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'invite'::text, 'friend_request'::text, 'gang_invite'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_role text DEFAULT 'user'::text,
    patreon_user_id text,
    patron_status text,
    patreon_tier_title text,
    patreon_tier_id text,
    patreon_discord_role_ids text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT username_format CHECK ((username ~ '^[a-zA-Z0-9_-]+$'::text)),
    CONSTRAINT username_length CHECK (((char_length(username) >= 3) AND (char_length(username) <= 20)))
);


--
-- Name: scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scenario_name text,
    campaign_type_id uuid,
    scenario_tags text,
    scenario_number numeric
);


--
-- Name: skill_access_archetypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_access_archetypes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    skill_access jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: skill_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    name text NOT NULL,
    legendary_name boolean DEFAULT false NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    xp_cost bigint,
    credit_cost bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    name text,
    skill_type_id uuid,
    gang_origin_id uuid
);


--
-- Name: territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.territories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_type_id uuid,
    territory_name text NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: trading_post_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trading_post_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trading_post_type_id uuid,
    equipment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: trading_post_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trading_post_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trading_post_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: vehicle_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vehicle_type text,
    movement numeric,
    front numeric,
    side numeric,
    rear numeric,
    hull_points numeric,
    handling numeric,
    save numeric,
    body_slots numeric,
    drive_slots numeric,
    engine_slots numeric,
    special_rules jsonb,
    body_slots_occupied numeric,
    drive_slots_occupied numeric,
    engine_slots_occupied numeric,
    gang_type_id uuid,
    cost numeric,
    hardpoints jsonb
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vehicle_name text,
    movement numeric,
    front numeric,
    side numeric,
    rear numeric,
    hull_points numeric,
    handling numeric,
    save numeric,
    body_slots numeric,
    drive_slots numeric,
    engine_slots numeric,
    special_rules jsonb,
    fighter_id uuid,
    body_slots_occupied numeric,
    drive_slots_occupied numeric,
    engine_slots_occupied numeric,
    vehicle_type_id uuid,
    cost numeric,
    vehicle_type text,
    gang_id uuid,
    updated_at timestamp with time zone DEFAULT now(),
    hardpoints numeric
);


--
-- Name: weapon_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weapon_profiles (
    weapon_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_name text,
    range_short text NOT NULL,
    range_long text NOT NULL,
    acc_short text NOT NULL,
    acc_long text NOT NULL,
    strength text NOT NULL,
    ap text NOT NULL,
    damage text NOT NULL,
    ammo text NOT NULL,
    traits text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weapon_group_id uuid,
    sort_order numeric
);


--
-- Name: alliances alliances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliances
    ADD CONSTRAINT alliances_pkey PRIMARY KEY (id);


--
-- Name: campaign_allegiances campaign_allegiances_campaign_id_allegiance_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_allegiances
    ADD CONSTRAINT campaign_allegiances_campaign_id_allegiance_name_key UNIQUE (campaign_id, allegiance_name);


--
-- Name: campaign_allegiances campaign_allegiances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_allegiances
    ADD CONSTRAINT campaign_allegiances_pkey PRIMARY KEY (id);


--
-- Name: campaign_battles campaign_battles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_battles
    ADD CONSTRAINT campaign_battles_pkey PRIMARY KEY (id);


--
-- Name: campaign_gang_resources campaign_gang_resources_campaign_gang_id_campaign_resource__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_campaign_gang_id_campaign_resource__key UNIQUE (campaign_gang_id, campaign_resource_id);


--
-- Name: campaign_gang_resources campaign_gang_resources_campaign_gang_id_campaign_type_reso_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_campaign_gang_id_campaign_type_reso_key UNIQUE (campaign_gang_id, campaign_type_resource_id);


--
-- Name: campaign_gang_resources campaign_gang_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_pkey PRIMARY KEY (id);


--
-- Name: campaign_gangs campaign_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_members_pkey PRIMARY KEY (id);


--
-- Name: campaign_members campaign_members_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_members
    ADD CONSTRAINT campaign_members_pkey1 PRIMARY KEY (id);


--
-- Name: campaign_resources campaign_resources_campaign_id_resource_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_resources
    ADD CONSTRAINT campaign_resources_campaign_id_resource_name_key UNIQUE (campaign_id, resource_name);


--
-- Name: campaign_resources campaign_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_resources
    ADD CONSTRAINT campaign_resources_pkey PRIMARY KEY (id);


--
-- Name: territories campaign_territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.territories
    ADD CONSTRAINT campaign_territories_pkey PRIMARY KEY (id);


--
-- Name: campaign_territories campaign_territories_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_territories
    ADD CONSTRAINT campaign_territories_pkey1 PRIMARY KEY (id);


--
-- Name: campaign_triumphs campaign_triumphs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_triumphs
    ADD CONSTRAINT campaign_triumphs_pkey PRIMARY KEY (id);


--
-- Name: campaign_type_allegiances campaign_type_allegiances_campaign_type_id_allegiance_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_allegiances
    ADD CONSTRAINT campaign_type_allegiances_campaign_type_id_allegiance_name_key UNIQUE (campaign_type_id, allegiance_name);


--
-- Name: campaign_type_allegiances campaign_type_allegiances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_allegiances
    ADD CONSTRAINT campaign_type_allegiances_pkey PRIMARY KEY (id);


--
-- Name: campaign_type_resources campaign_type_resources_campaign_type_id_resource_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_resources
    ADD CONSTRAINT campaign_type_resources_campaign_type_id_resource_name_key UNIQUE (campaign_type_id, resource_name);


--
-- Name: campaign_type_resources campaign_type_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_resources
    ADD CONSTRAINT campaign_type_resources_pkey PRIMARY KEY (id);


--
-- Name: campaign_types campaign_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_types
    ADD CONSTRAINT campaign_types_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: custom_equipment custom_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_equipment
    ADD CONSTRAINT custom_equipment_pkey PRIMARY KEY (id);


--
-- Name: custom_fighter_types custom_fighters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fighter_types
    ADD CONSTRAINT custom_fighters_pkey PRIMARY KEY (id);


--
-- Name: custom_shared custom_shared_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_pkey PRIMARY KEY (id);


--
-- Name: custom_skills custom_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_skills
    ADD CONSTRAINT custom_skills_pkey PRIMARY KEY (id);


--
-- Name: custom_territories custom_territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_territories
    ADD CONSTRAINT custom_territories_pkey PRIMARY KEY (id);


--
-- Name: custom_weapon_profiles custom_weapon_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_weapon_profiles
    ADD CONSTRAINT custom_weapon_profiles_pkey PRIMARY KEY (id);


--
-- Name: equipment_categories equipment_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_pkey PRIMARY KEY (id);


--
-- Name: equipment_discounts equipment_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_discounts
    ADD CONSTRAINT equipment_discounts_pkey PRIMARY KEY (id);


--
-- Name: equipment_availability equipment_rarity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_availability
    ADD CONSTRAINT equipment_rarity_pkey PRIMARY KEY (id);


--
-- Name: exotic_beasts exotic_beasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotic_beasts
    ADD CONSTRAINT exotic_beasts_pkey PRIMARY KEY (id);


--
-- Name: fighter_classes fighter_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_classes
    ADD CONSTRAINT fighter_classes_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_categories fighter_effect_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_categories
    ADD CONSTRAINT fighter_effect_categories_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_injuries fighter_effect_injuries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_injuries
    ADD CONSTRAINT fighter_effect_injuries_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_skills fighter_effect_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_skills
    ADD CONSTRAINT fighter_effect_skills_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_modifiers fighter_effect_stat_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_modifiers
    ADD CONSTRAINT fighter_effect_stat_modifiers_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_type_modifiers fighter_effect_type_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_type_modifiers
    ADD CONSTRAINT fighter_effect_type_modifiers_pkey PRIMARY KEY (id);


--
-- Name: fighter_effect_types fighter_effect_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_types
    ADD CONSTRAINT fighter_effect_types_pkey PRIMARY KEY (id);


--
-- Name: fighter_effects fighter_effects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_pkey PRIMARY KEY (id);


--
-- Name: fighter_equipment_selections fighter_equipment_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment_selections
    ADD CONSTRAINT fighter_equipment_selections_pkey PRIMARY KEY (id);


--
-- Name: fighter_equipment_tradingpost fighter_equipment_tradingpost_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment_tradingpost
    ADD CONSTRAINT fighter_equipment_tradingpost_pkey PRIMARY KEY (id);


--
-- Name: fighter_exotic_beasts fighter_exotic_beasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_exotic_beasts
    ADD CONSTRAINT fighter_exotic_beasts_pkey PRIMARY KEY (id);


--
-- Name: fighter_gang_legacy fighter_gang_legacy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_gang_legacy
    ADD CONSTRAINT fighter_gang_legacy_pkey PRIMARY KEY (id);


--
-- Name: fighter_injuries fighter_injuries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_injuries
    ADD CONSTRAINT fighter_injuries_pkey PRIMARY KEY (id);


--
-- Name: fighter_loadout_equipment fighter_loadout_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadout_equipment
    ADD CONSTRAINT fighter_loadout_equipment_pkey PRIMARY KEY (loadout_id, fighter_equipment_id);


--
-- Name: fighter_loadouts fighter_loadouts_fighter_id_loadout_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadouts
    ADD CONSTRAINT fighter_loadouts_fighter_id_loadout_name_key UNIQUE (fighter_id, loadout_name);


--
-- Name: fighter_loadouts fighter_loadouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadouts
    ADD CONSTRAINT fighter_loadouts_pkey PRIMARY KEY (id);


--
-- Name: fighter_skill_access_override fighter_skill_access_override_fighter_id_skill_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_fighter_id_skill_type_id_key UNIQUE (fighter_id, skill_type_id);


--
-- Name: fighter_skill_access_override fighter_skill_access_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_pkey PRIMARY KEY (id);


--
-- Name: fighter_skills fighter_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_pkey PRIMARY KEY (id);


--
-- Name: fighter_defaults fighter_starting_weapons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_starting_weapons_pkey PRIMARY KEY (id);


--
-- Name: fighter_sub_types fighter_sub_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_sub_types
    ADD CONSTRAINT fighter_sub_types_pkey PRIMARY KEY (id);


--
-- Name: fighter_type_equipment fighter_type_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_pkey PRIMARY KEY (id);


--
-- Name: fighter_type_gang_cost fighter_type_gang_cost_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_cost
    ADD CONSTRAINT fighter_type_gang_cost_pkey PRIMARY KEY (id);


--
-- Name: fighter_type_gang_legacies fighter_type_gang_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_legacies
    ADD CONSTRAINT fighter_type_gang_lineage_pkey PRIMARY KEY (id);


--
-- Name: fighter_type_skill_access fighter_type_skill_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_skill_access
    ADD CONSTRAINT fighter_type_skill_access_pkey PRIMARY KEY (id);


--
-- Name: fighter_types fighter_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_types
    ADD CONSTRAINT fighter_types_pkey PRIMARY KEY (id);


--
-- Name: fighter_equipment fighter_weapons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_weapons_pkey PRIMARY KEY (id);


--
-- Name: fighters fighters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_pkey PRIMARY KEY (id);


--
-- Name: friends friends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_pkey PRIMARY KEY (id);


--
-- Name: friends friends_requester_id_addressee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id);


--
-- Name: gang_logs gang_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_logs
    ADD CONSTRAINT gang_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: gang_affiliation gang_affiliation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_affiliation
    ADD CONSTRAINT gang_affiliation_pkey PRIMARY KEY (id);


--
-- Name: gang_origin_categories gang_origin_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_origin_categories
    ADD CONSTRAINT gang_origin_categories_pkey PRIMARY KEY (id);


--
-- Name: gang_origins gang_origins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_origins
    ADD CONSTRAINT gang_origins_pkey PRIMARY KEY (id);


--
-- Name: gang_stash gang_stash_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_stash
    ADD CONSTRAINT gang_stash_pkey PRIMARY KEY (id);


--
-- Name: gang_types gang_types_gang_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_types
    ADD CONSTRAINT gang_types_gang_type_id_key UNIQUE (gang_type_id);


--
-- Name: gang_types gang_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_types
    ADD CONSTRAINT gang_types_pkey PRIMARY KEY (id, gang_type_id);


--
-- Name: gang_variant_types gang_variant_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_variant_types
    ADD CONSTRAINT gang_variant_types_pkey PRIMARY KEY (id);


--
-- Name: gangs gangs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gangs
    ADD CONSTRAINT gangs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_patreon_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_patreon_user_id_key UNIQUE (patreon_user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: skill_access_archetypes skill_access_archetypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_access_archetypes
    ADD CONSTRAINT skill_access_archetypes_pkey PRIMARY KEY (id);


--
-- Name: skill_types skill_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_types
    ADD CONSTRAINT skill_types_name_key UNIQUE (name);


--
-- Name: skill_types skill_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_types
    ADD CONSTRAINT skill_types_pkey PRIMARY KEY (id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: trading_post_equipment trading_post_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_post_equipment
    ADD CONSTRAINT trading_post_equipment_pkey PRIMARY KEY (id);


--
-- Name: trading_post_types trading_post_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_post_types
    ADD CONSTRAINT trading_post_types_pkey PRIMARY KEY (id);


--
-- Name: fighter_equipment_selections unique_fighter_type_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment_selections
    ADD CONSTRAINT unique_fighter_type_id UNIQUE (fighter_type_id);


--
-- Name: vehicle_types vehicle_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_types
    ADD CONSTRAINT vehicle_types_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: weapon_profiles weapon_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weapon_profiles
    ADD CONSTRAINT weapon_profiles_pkey PRIMARY KEY (id);


--
-- Name: equipment weapons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT weapons_pkey PRIMARY KEY (id);


--
-- Name: campaign_battles_campaign_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_battles_campaign_id_idx ON public.campaign_battles USING btree (campaign_id);


--
-- Name: campaigns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_status_idx ON public.campaigns USING btree (status);


--
-- Name: custom_equipment_equipment_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_equipment_equipment_name_idx ON public.custom_equipment USING btree (equipment_name);


--
-- Name: custom_equipment_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_equipment_user_id_idx ON public.custom_equipment USING btree (user_id);


--
-- Name: custom_weapon_profiles_weapon_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_weapon_profiles_weapon_group_id_idx ON public.custom_weapon_profiles USING btree (weapon_group_id);


--
-- Name: equipment_availability_gang_origin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_availability_gang_origin_id_idx ON public.equipment_availability USING btree (gang_origin_id);


--
-- Name: equipment_discounts_gang_origin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_discounts_gang_origin_id_idx ON public.equipment_discounts USING btree (gang_origin_id);


--
-- Name: exotic_beasts_fighter_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exotic_beasts_fighter_type_id_idx ON public.exotic_beasts USING btree (fighter_type_id);


--
-- Name: fighter_defaults_fighter_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_defaults_fighter_type_id_idx ON public.fighter_defaults USING btree (fighter_type_id);


--
-- Name: fighter_effect_skills_fighter_effect_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effect_skills_fighter_effect_id_idx ON public.fighter_effect_skills USING btree (fighter_effect_id);


--
-- Name: fighter_effect_type_modifiers_fighter_effect_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effect_type_modifiers_fighter_effect_type_id_idx ON public.fighter_effect_type_modifiers USING btree (fighter_effect_type_id);


--
-- Name: fighter_effect_type_modifiers_stat_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effect_type_modifiers_stat_name_idx ON public.fighter_effect_type_modifiers USING btree (stat_name);


--
-- Name: fighter_effect_types_effect_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effect_types_effect_name_idx ON public.fighter_effect_types USING btree (effect_name);


--
-- Name: fighter_effect_types_fighter_effect_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effect_types_fighter_effect_category_id_idx ON public.fighter_effect_types USING btree (fighter_effect_category_id);


--
-- Name: fighter_effects_fighter_equipment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_effects_fighter_equipment_id_idx ON public.fighter_effects USING btree (fighter_equipment_id);


--
-- Name: fighter_equipment_vehicle_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_equipment_vehicle_id_idx ON public.fighter_equipment USING btree (vehicle_id);


--
-- Name: fighter_exotic_beasts_fighter_pet_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_exotic_beasts_fighter_pet_id_idx ON public.fighter_exotic_beasts USING btree (fighter_pet_id);


--
-- Name: fighter_skill_access_override_fighter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_skill_access_override_fighter_id_idx ON public.fighter_skill_access_override USING btree (fighter_id);


--
-- Name: fighter_type_equipment_equipment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_type_equipment_equipment_id_idx ON public.fighter_type_equipment USING btree (equipment_id);


--
-- Name: fighter_types_fighter_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_types_fighter_type_idx ON public.fighter_types USING btree (fighter_type);


--
-- Name: fighter_types_gang_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighter_types_gang_type_idx ON public.fighter_types USING btree (gang_type);


--
-- Name: fighters_fighter_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fighters_fighter_name_idx ON public.fighters USING btree (fighter_name);


--
-- Name: gang_origins_gang_origin_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gang_origins_gang_origin_category_id_idx ON public.gang_origins USING btree (gang_origin_category_id);


--
-- Name: gang_types_gang_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gang_types_gang_type_idx ON public.gang_types USING btree (gang_type);


--
-- Name: gangs_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gangs_name_idx ON public.gangs USING btree (name);


--
-- Name: idx_campaign_allegiances_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_allegiances_campaign_id ON public.campaign_allegiances USING btree (campaign_id);


--
-- Name: idx_campaign_gang_resources_campaign_gang_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gang_resources_campaign_gang_id ON public.campaign_gang_resources USING btree (campaign_gang_id);


--
-- Name: idx_campaign_gang_resources_campaign_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gang_resources_campaign_resource_id ON public.campaign_gang_resources USING btree (campaign_resource_id);


--
-- Name: idx_campaign_gang_resources_campaign_type_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gang_resources_campaign_type_resource_id ON public.campaign_gang_resources USING btree (campaign_type_resource_id);


--
-- Name: idx_campaign_gangs_campaign_allegiance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gangs_campaign_allegiance_id ON public.campaign_gangs USING btree (campaign_allegiance_id);


--
-- Name: idx_campaign_gangs_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gangs_campaign_id ON public.campaign_gangs USING btree (campaign_id);


--
-- Name: idx_campaign_gangs_campaign_type_allegiance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gangs_campaign_type_allegiance_id ON public.campaign_gangs USING btree (campaign_type_allegiance_id);


--
-- Name: idx_campaign_gangs_gang_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_gangs_gang_id ON public.campaign_gangs USING btree (gang_id);


--
-- Name: idx_campaign_members_campaign_user_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_members_campaign_user_role ON public.campaign_members USING btree (campaign_id, user_id, role);


--
-- Name: idx_campaign_resources_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_resources_campaign_id ON public.campaign_resources USING btree (campaign_id);


--
-- Name: idx_campaign_territories_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_territories_campaign_id ON public.campaign_territories USING btree (campaign_id);


--
-- Name: idx_campaign_type_allegiances_campaign_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_type_allegiances_campaign_type_id ON public.campaign_type_allegiances USING btree (campaign_type_id);


--
-- Name: idx_campaign_type_resources_campaign_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_type_resources_campaign_type_id ON public.campaign_type_resources USING btree (campaign_type_id);


--
-- Name: idx_equipment_discounts_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_discounts_composite ON public.equipment_discounts USING btree (equipment_id, gang_type_id);


--
-- Name: idx_equipment_discounts_equipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_discounts_equipment_id ON public.equipment_discounts USING btree (equipment_id);


--
-- Name: idx_fighter_effect_modifiers_fighter_effect_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_effect_modifiers_fighter_effect_id ON public.fighter_effect_modifiers USING btree (fighter_effect_id);


--
-- Name: idx_fighter_effects_fighter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_effects_fighter_id ON public.fighter_effects USING btree (fighter_id);


--
-- Name: idx_fighter_effects_target_equipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_effects_target_equipment_id ON public.fighter_effects USING btree (target_equipment_id);


--
-- Name: idx_fighter_effects_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_effects_user_id ON public.fighter_effects USING btree (user_id);


--
-- Name: idx_fighter_effects_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_effects_vehicle_id ON public.fighter_effects USING btree (vehicle_id);


--
-- Name: idx_fighter_equipment_fighter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_equipment_fighter_id ON public.fighter_equipment USING btree (fighter_id);


--
-- Name: idx_fighter_equipment_gang_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_equipment_gang_id ON public.fighter_equipment USING btree (gang_id);


--
-- Name: idx_fighter_equipment_gang_stash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_equipment_gang_stash ON public.fighter_equipment USING btree (gang_id, gang_stash) WHERE (gang_stash = true);


--
-- Name: idx_fighter_equipment_granted_by_equipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_equipment_granted_by_equipment_id ON public.fighter_equipment USING btree (granted_by_equipment_id);


--
-- Name: idx_fighter_loadouts_fighter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_loadouts_fighter ON public.fighter_loadouts USING btree (fighter_id);


--
-- Name: idx_fighter_loadouts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_loadouts_user_id ON public.fighter_loadouts USING btree (user_id);


--
-- Name: idx_fighter_skills_fighter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_skills_fighter_id ON public.fighter_skills USING btree (fighter_id);


--
-- Name: idx_fighter_skills_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_skills_user_id ON public.fighter_skills USING btree (user_id);


--
-- Name: idx_fighter_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighter_type_id ON public.fighter_type_skill_access USING btree (fighter_type_id);


--
-- Name: idx_fighters_gang_id_full; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighters_gang_id_full ON public.fighters USING btree (gang_id);


--
-- Name: idx_fighters_gang_status_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighters_gang_status_composite ON public.fighters USING btree (gang_id, killed, retired, enslaved) WHERE ((killed = false) AND (retired = false) AND (enslaved = false));


--
-- Name: idx_fighters_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fighters_user_id ON public.fighters USING btree (user_id);


--
-- Name: idx_gang_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_action_type ON public.gang_logs USING btree (action_type);


--
-- Name: idx_gang_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_created_at ON public.gang_logs USING btree (created_at DESC);


--
-- Name: idx_gang_logs_fighter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_fighter_id ON public.gang_logs USING btree (fighter_id);


--
-- Name: idx_gang_logs_gang_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_gang_created ON public.gang_logs USING btree (gang_id, created_at DESC);


--
-- Name: idx_gang_logs_gang_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_gang_id ON public.gang_logs USING btree (gang_id);


--
-- Name: idx_gang_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gang_logs_user_id ON public.gang_logs USING btree (user_id);


--
-- Name: idx_gangs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gangs_user_id ON public.gangs USING btree (user_id);


--
-- Name: idx_loadout_equipment_fighter_equipment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loadout_equipment_fighter_equipment ON public.fighter_loadout_equipment USING btree (fighter_equipment_id);


--
-- Name: idx_profiles_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_created_at ON public.profiles USING btree (created_at);


--
-- Name: idx_skill_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_type_id ON public.fighter_type_skill_access USING btree (skill_type_id);


--
-- Name: idx_vehicles_fighter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_fighter_id ON public.vehicles USING btree (fighter_id) WHERE (fighter_id IS NOT NULL);


--
-- Name: idx_vehicles_gang_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_gang_id ON public.vehicles USING btree (gang_id);


--
-- Name: notifications_receiver_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_receiver_id_idx ON public.notifications USING btree (receiver_id);


--
-- Name: skills_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_name_idx ON public.skills USING btree (name);


--
-- Name: skills_skill_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_skill_type_id_idx ON public.skills USING btree (skill_type_id);


--
-- Name: territories_campaign_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX territories_campaign_type_id_idx ON public.territories USING btree (campaign_type_id);


--
-- Name: vehicles_fighter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_fighter_id_idx ON public.vehicles USING btree (fighter_id);


--
-- Name: vehicles_vehicle_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_vehicle_name_idx ON public.vehicles USING btree (vehicle_name);


--
-- Name: campaign_gangs on_gang_invite; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_gang_invite AFTER INSERT ON public.campaign_gangs FOR EACH ROW EXECUTE FUNCTION public.notify_gang_invite();


--
-- Name: campaign_members trigger_campaign_member_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_campaign_member_notification AFTER INSERT ON public.campaign_members FOR EACH ROW EXECUTE FUNCTION public.notify_campaign_member_added();


--
-- Name: friends trigger_friend_request_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_friend_request_notification AFTER INSERT ON public.friends FOR EACH ROW WHEN (((new.status)::text = 'pending'::text)) EXECUTE FUNCTION public.notify_friend_request_sent();


--
-- Name: campaign_allegiances campaign_allegiances_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_allegiances
    ADD CONSTRAINT campaign_allegiances_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_battles campaign_battles_custom_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_battles
    ADD CONSTRAINT campaign_battles_custom_territory_id_fkey FOREIGN KEY (custom_territory_id) REFERENCES public.custom_territories(id) ON DELETE SET NULL;


--
-- Name: campaign_battles campaign_battles_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_battles
    ADD CONSTRAINT campaign_battles_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES public.territories(id) ON DELETE SET NULL;


--
-- Name: campaign_gang_resources campaign_gang_resources_campaign_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_campaign_gang_id_fkey FOREIGN KEY (campaign_gang_id) REFERENCES public.campaign_gangs(id) ON DELETE CASCADE;


--
-- Name: campaign_gang_resources campaign_gang_resources_campaign_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_campaign_resource_id_fkey FOREIGN KEY (campaign_resource_id) REFERENCES public.campaign_resources(id) ON DELETE CASCADE;


--
-- Name: campaign_gang_resources campaign_gang_resources_campaign_type_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gang_resources
    ADD CONSTRAINT campaign_gang_resources_campaign_type_resource_id_fkey FOREIGN KEY (campaign_type_resource_id) REFERENCES public.campaign_type_resources(id) ON DELETE CASCADE;


--
-- Name: campaign_gangs campaign_gangs_campaign_allegiance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_campaign_allegiance_id_fkey FOREIGN KEY (campaign_allegiance_id) REFERENCES public.campaign_allegiances(id) ON DELETE SET NULL;


--
-- Name: campaign_gangs campaign_gangs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_gangs campaign_gangs_campaign_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_campaign_member_id_fkey FOREIGN KEY (campaign_member_id) REFERENCES public.campaign_members(id);


--
-- Name: campaign_gangs campaign_gangs_campaign_type_allegiance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_campaign_type_allegiance_id_fkey FOREIGN KEY (campaign_type_allegiance_id) REFERENCES public.campaign_type_allegiances(id) ON DELETE SET NULL;


--
-- Name: campaign_gangs campaign_gangs_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_gang_id_fkey FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE CASCADE;


--
-- Name: campaign_resources campaign_resources_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_resources
    ADD CONSTRAINT campaign_resources_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_territories campaign_territories_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_territories
    ADD CONSTRAINT campaign_territories_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_territories campaign_territories_custom_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_territories
    ADD CONSTRAINT campaign_territories_custom_territory_id_fkey FOREIGN KEY (custom_territory_id) REFERENCES public.custom_territories(id) ON DELETE CASCADE;


--
-- Name: campaign_territories campaign_territories_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_territories
    ADD CONSTRAINT campaign_territories_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES public.territories(id) ON DELETE CASCADE;


--
-- Name: campaign_triumphs campaign_triumphs_campaign_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_triumphs
    ADD CONSTRAINT campaign_triumphs_campaign_type_id_fkey FOREIGN KEY (campaign_type_id) REFERENCES public.campaign_types(id) ON DELETE CASCADE;


--
-- Name: campaign_type_allegiances campaign_type_allegiances_campaign_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_allegiances
    ADD CONSTRAINT campaign_type_allegiances_campaign_type_id_fkey FOREIGN KEY (campaign_type_id) REFERENCES public.campaign_types(id) ON DELETE CASCADE;


--
-- Name: campaign_type_resources campaign_type_resources_campaign_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_type_resources
    ADD CONSTRAINT campaign_type_resources_campaign_type_id_fkey FOREIGN KEY (campaign_type_id) REFERENCES public.campaign_types(id) ON DELETE CASCADE;


--
-- Name: custom_equipment custom_equipment_equipment_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_equipment
    ADD CONSTRAINT custom_equipment_equipment_category_id_fkey FOREIGN KEY (equipment_category_id) REFERENCES public.equipment_categories(id) ON DELETE CASCADE;


--
-- Name: custom_equipment custom_equipment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_equipment
    ADD CONSTRAINT custom_equipment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_custom_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_custom_equipment_id_fkey FOREIGN KEY (custom_equipment_id) REFERENCES public.custom_equipment(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_custom_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_custom_fighter_type_id_fkey FOREIGN KEY (custom_fighter_type_id) REFERENCES public.custom_fighter_types(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_custom_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_custom_skill_id_fkey FOREIGN KEY (custom_skill_id) REFERENCES public.custom_skills(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_custom_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_custom_territory_id_fkey FOREIGN KEY (custom_territory_id) REFERENCES public.custom_territories(id) ON DELETE CASCADE;


--
-- Name: custom_shared custom_shared_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_shared
    ADD CONSTRAINT custom_shared_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: custom_skills custom_skills_skill_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_skills
    ADD CONSTRAINT custom_skills_skill_type_id_fkey FOREIGN KEY (skill_type_id) REFERENCES public.skill_types(id) ON DELETE CASCADE;


--
-- Name: custom_weapon_profiles custom_weapon_profiles_custom_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_weapon_profiles
    ADD CONSTRAINT custom_weapon_profiles_custom_equipment_id_fkey FOREIGN KEY (custom_equipment_id) REFERENCES public.custom_equipment(id) ON DELETE CASCADE;


--
-- Name: equipment_availability equipment_availability_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_availability
    ADD CONSTRAINT equipment_availability_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: equipment_availability equipment_availability_gang_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_availability
    ADD CONSTRAINT equipment_availability_gang_origin_id_fkey FOREIGN KEY (gang_origin_id) REFERENCES public.gang_origins(id) ON DELETE CASCADE;


--
-- Name: equipment_availability equipment_availability_gang_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_availability
    ADD CONSTRAINT equipment_availability_gang_variant_id_fkey FOREIGN KEY (gang_variant_id) REFERENCES public.gang_variant_types(id) ON DELETE CASCADE;


--
-- Name: equipment_discounts equipment_discounts_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_discounts
    ADD CONSTRAINT equipment_discounts_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: equipment_discounts equipment_discounts_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_discounts
    ADD CONSTRAINT equipment_discounts_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: equipment_discounts equipment_discounts_gang_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_discounts
    ADD CONSTRAINT equipment_discounts_gang_origin_id_fkey FOREIGN KEY (gang_origin_id) REFERENCES public.gang_origins(id) ON DELETE CASCADE;


--
-- Name: exotic_beasts exotic_beasts_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotic_beasts
    ADD CONSTRAINT exotic_beasts_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: exotic_beasts exotic_beasts_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exotic_beasts
    ADD CONSTRAINT exotic_beasts_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_defaults fighter_defaults_custom_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_defaults_custom_equipment_id_fkey FOREIGN KEY (custom_equipment_id) REFERENCES public.custom_equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_defaults fighter_defaults_custom_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_defaults_custom_fighter_type_id_fkey FOREIGN KEY (custom_fighter_type_id) REFERENCES public.custom_fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_defaults fighter_defaults_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_defaults_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_defaults fighter_defaults_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_defaults_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_defaults fighter_defaults_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_defaults
    ADD CONSTRAINT fighter_defaults_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id);


--
-- Name: fighter_effect_injuries fighter_effect_injuries_fighter_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_injuries
    ADD CONSTRAINT fighter_effect_injuries_fighter_effect_id_fkey FOREIGN KEY (fighter_effect_id) REFERENCES public.fighter_effects(id) ON DELETE CASCADE;


--
-- Name: fighter_effect_skills fighter_effect_skills_fighter_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_skills
    ADD CONSTRAINT fighter_effect_skills_fighter_effect_id_fkey FOREIGN KEY (fighter_effect_id) REFERENCES public.fighter_effects(id) ON DELETE CASCADE;


--
-- Name: fighter_effect_modifiers fighter_effect_stat_modifiers_fighter_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_modifiers
    ADD CONSTRAINT fighter_effect_stat_modifiers_fighter_effect_id_fkey FOREIGN KEY (fighter_effect_id) REFERENCES public.fighter_effects(id) ON DELETE CASCADE;


--
-- Name: fighter_effect_type_modifiers fighter_effect_type_modifiers_fighter_effect_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_type_modifiers
    ADD CONSTRAINT fighter_effect_type_modifiers_fighter_effect_type_id_fkey FOREIGN KEY (fighter_effect_type_id) REFERENCES public.fighter_effect_types(id) ON DELETE CASCADE;


--
-- Name: fighter_effect_types fighter_effect_types_fighter_effect_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effect_types
    ADD CONSTRAINT fighter_effect_types_fighter_effect_category_id_fkey FOREIGN KEY (fighter_effect_category_id) REFERENCES public.fighter_effect_categories(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_fighter_effect_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_fighter_effect_type_id_fkey FOREIGN KEY (fighter_effect_type_id) REFERENCES public.fighter_effect_types(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_fighter_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_fighter_equipment_id_fkey FOREIGN KEY (fighter_equipment_id) REFERENCES public.fighter_equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_fighter_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_fighter_skill_id_fkey FOREIGN KEY (fighter_skill_id) REFERENCES public.fighter_skills(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_target_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_target_equipment_id_fkey FOREIGN KEY (target_equipment_id) REFERENCES public.fighter_equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_effects fighter_effects_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_effects
    ADD CONSTRAINT fighter_effects_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment fighter_equipment_custom_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_equipment_custom_equipment_id_fkey FOREIGN KEY (custom_equipment_id) REFERENCES public.custom_equipment(id) ON DELETE SET NULL;


--
-- Name: fighter_equipment fighter_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment fighter_equipment_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_equipment_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment fighter_equipment_granted_by_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_equipment_granted_by_equipment_id_fkey FOREIGN KEY (granted_by_equipment_id) REFERENCES public.fighter_equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment_selections fighter_equipment_selections_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment_selections
    ADD CONSTRAINT fighter_equipment_selections_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment_tradingpost fighter_equipment_tradingpost_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment_tradingpost
    ADD CONSTRAINT fighter_equipment_tradingpost_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_equipment fighter_equipment_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_equipment
    ADD CONSTRAINT fighter_equipment_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: fighter_exotic_beasts fighter_exotic_beasts_fighter_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_exotic_beasts
    ADD CONSTRAINT fighter_exotic_beasts_fighter_owner_id_fkey FOREIGN KEY (fighter_owner_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_gang_legacy fighter_gang_legacy_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_gang_legacy
    ADD CONSTRAINT fighter_gang_legacy_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_injuries fighter_injuries_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_injuries
    ADD CONSTRAINT fighter_injuries_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_loadout_equipment fighter_loadout_equipment_fighter_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadout_equipment
    ADD CONSTRAINT fighter_loadout_equipment_fighter_equipment_id_fkey FOREIGN KEY (fighter_equipment_id) REFERENCES public.fighter_equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_loadout_equipment fighter_loadout_equipment_loadout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadout_equipment
    ADD CONSTRAINT fighter_loadout_equipment_loadout_id_fkey FOREIGN KEY (loadout_id) REFERENCES public.fighter_loadouts(id) ON DELETE CASCADE;


--
-- Name: fighter_loadouts fighter_loadouts_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadouts
    ADD CONSTRAINT fighter_loadouts_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_loadouts fighter_loadouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_loadouts
    ADD CONSTRAINT fighter_loadouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: fighter_skill_access_override fighter_skill_access_override_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_skill_access_override fighter_skill_access_override_skill_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_skill_type_id_fkey FOREIGN KEY (skill_type_id) REFERENCES public.skill_types(id) ON DELETE CASCADE;


--
-- Name: fighter_skill_access_override fighter_skill_access_override_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skill_access_override
    ADD CONSTRAINT fighter_skill_access_override_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: fighter_skills fighter_skills_custom_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_custom_skill_id_fkey FOREIGN KEY (custom_skill_id) REFERENCES public.custom_skills(id) ON DELETE CASCADE;


--
-- Name: fighter_skills fighter_skills_fighter_effect_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_fighter_effect_skill_id_fkey FOREIGN KEY (fighter_effect_skill_id) REFERENCES public.fighter_effect_skills(id) ON DELETE CASCADE;


--
-- Name: fighter_skills fighter_skills_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE CASCADE;


--
-- Name: fighter_skills fighter_skills_fighter_injury_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_fighter_injury_id_fkey FOREIGN KEY (fighter_injury_id) REFERENCES public.fighter_injuries(id) ON DELETE CASCADE;


--
-- Name: fighter_skills fighter_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_skills
    ADD CONSTRAINT fighter_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id);


--
-- Name: fighter_type_equipment fighter_type_equipment_custom_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_custom_fighter_type_id_fkey FOREIGN KEY (custom_fighter_type_id) REFERENCES public.custom_fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_equipment fighter_type_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: fighter_type_equipment fighter_type_equipment_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_equipment fighter_type_equipment_gang_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_gang_origin_id_fkey FOREIGN KEY (gang_origin_id) REFERENCES public.gang_origins(id) ON DELETE CASCADE;


--
-- Name: fighter_type_equipment fighter_type_equipment_gang_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_gang_type_id_fkey FOREIGN KEY (gang_type_id) REFERENCES public.gang_types(gang_type_id) ON DELETE CASCADE;


--
-- Name: fighter_type_equipment fighter_type_equipment_vehicle_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_equipment
    ADD CONSTRAINT fighter_type_equipment_vehicle_type_id_fkey FOREIGN KEY (vehicle_type_id) REFERENCES public.vehicle_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_gang_cost fighter_type_gang_cost_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_cost
    ADD CONSTRAINT fighter_type_gang_cost_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_gang_cost fighter_type_gang_cost_gang_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_cost
    ADD CONSTRAINT fighter_type_gang_cost_gang_type_id_fkey FOREIGN KEY (gang_type_id) REFERENCES public.gang_types(gang_type_id) ON DELETE CASCADE;


--
-- Name: fighter_type_gang_legacies fighter_type_gang_lineage_fighter_gang_legacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_legacies
    ADD CONSTRAINT fighter_type_gang_lineage_fighter_gang_legacy_id_fkey FOREIGN KEY (fighter_gang_legacy_id) REFERENCES public.fighter_gang_legacy(id) ON DELETE CASCADE;


--
-- Name: fighter_type_gang_legacies fighter_type_gang_lineage_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_gang_legacies
    ADD CONSTRAINT fighter_type_gang_lineage_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_skill_access fighter_type_skill_access_custom_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_skill_access
    ADD CONSTRAINT fighter_type_skill_access_custom_fighter_type_id_fkey FOREIGN KEY (custom_fighter_type_id) REFERENCES public.custom_fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_skill_access fighter_type_skill_access_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_skill_access
    ADD CONSTRAINT fighter_type_skill_access_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighter_type_skill_access fighter_type_skill_access_skill_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_type_skill_access
    ADD CONSTRAINT fighter_type_skill_access_skill_type_id_fkey FOREIGN KEY (skill_type_id) REFERENCES public.skill_types(id) ON DELETE CASCADE;


--
-- Name: fighter_types fighter_types_fighter_sub_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_types
    ADD CONSTRAINT fighter_types_fighter_sub_type_id_fkey FOREIGN KEY (fighter_sub_type_id) REFERENCES public.fighter_sub_types(id);


--
-- Name: fighters fighters_active_loadout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_active_loadout_id_fkey FOREIGN KEY (active_loadout_id) REFERENCES public.fighter_loadouts(id) ON DELETE SET NULL;


--
-- Name: fighters fighters_custom_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_custom_fighter_type_id_fkey FOREIGN KEY (custom_fighter_type_id) REFERENCES public.custom_fighter_types(id) ON DELETE SET NULL;


--
-- Name: fighters fighters_fighter_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_fighter_class_id_fkey FOREIGN KEY (fighter_class_id) REFERENCES public.fighter_classes(id) ON DELETE SET NULL;


--
-- Name: fighters fighters_fighter_gang_legacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_fighter_gang_legacy_id_fkey FOREIGN KEY (fighter_gang_legacy_id) REFERENCES public.fighter_gang_legacy(id) ON DELETE SET NULL;


--
-- Name: fighters fighters_fighter_sub_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_fighter_sub_type_id_fkey FOREIGN KEY (fighter_sub_type_id) REFERENCES public.fighter_sub_types(id) ON DELETE SET NULL;


--
-- Name: fighters fighters_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: fighters fighters_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_gang_id_fkey FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE CASCADE;


--
-- Name: fighters fighters_selected_archetype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_selected_archetype_id_fkey FOREIGN KEY (selected_archetype_id) REFERENCES public.skill_access_archetypes(id) ON DELETE SET NULL;


--
-- Name: fighter_exotic_beasts fk_fighter_equipment_cascade; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighter_exotic_beasts
    ADD CONSTRAINT fk_fighter_equipment_cascade FOREIGN KEY (fighter_equipment_id) REFERENCES public.fighter_equipment(id) ON DELETE CASCADE;


--
-- Name: fighters fk_fighter_pet_ownership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fk_fighter_pet_ownership FOREIGN KEY (fighter_pet_id) REFERENCES public.fighter_exotic_beasts(id) ON DELETE CASCADE;


--
-- Name: friends friends_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friends friends_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gang_affiliation gang_affiliation_fighter_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_affiliation
    ADD CONSTRAINT gang_affiliation_fighter_type_id_fkey FOREIGN KEY (fighter_type_id) REFERENCES public.fighter_types(id) ON DELETE CASCADE;


--
-- Name: gang_logs gang_logs_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_logs
    ADD CONSTRAINT gang_logs_gang_id_fkey FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE CASCADE;


--
-- Name: gang_origins gang_origins_gang_origin_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_origins
    ADD CONSTRAINT gang_origins_gang_origin_category_id_fkey FOREIGN KEY (gang_origin_category_id) REFERENCES public.gang_origin_categories(id) ON DELETE CASCADE;


--
-- Name: gang_stash gang_stash_custom_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_stash
    ADD CONSTRAINT gang_stash_custom_equipment_id_fkey FOREIGN KEY (custom_equipment_id) REFERENCES public.custom_equipment(id) ON DELETE SET NULL;


--
-- Name: gang_stash gang_stash_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_stash
    ADD CONSTRAINT gang_stash_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: gang_stash gang_stash_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_stash
    ADD CONSTRAINT gang_stash_gang_id_fkey FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE CASCADE;


--
-- Name: gang_types gang_types_gang_origin_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gang_types
    ADD CONSTRAINT gang_types_gang_origin_category_id_fkey FOREIGN KEY (gang_origin_category_id) REFERENCES public.gang_origin_categories(id) ON DELETE SET NULL;


--
-- Name: gangs gangs_gang_affiliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gangs
    ADD CONSTRAINT gangs_gang_affiliation_id_fkey FOREIGN KEY (gang_affiliation_id) REFERENCES public.gang_affiliation(id) ON DELETE SET NULL;


--
-- Name: gangs gangs_gang_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gangs
    ADD CONSTRAINT gangs_gang_origin_id_fkey FOREIGN KEY (gang_origin_id) REFERENCES public.gang_origins(id) ON DELETE SET NULL;


--
-- Name: gangs gangs_gang_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gangs
    ADD CONSTRAINT gangs_gang_type_id_fkey FOREIGN KEY (gang_type_id) REFERENCES public.gang_types(gang_type_id) ON DELETE CASCADE;


--
-- Name: gangs gangs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gangs
    ADD CONSTRAINT gangs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skills skills_gang_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_gang_origin_id_fkey FOREIGN KEY (gang_origin_id) REFERENCES public.gang_origins(id) ON DELETE SET NULL;


--
-- Name: trading_post_equipment trading_post_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_post_equipment
    ADD CONSTRAINT trading_post_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: trading_post_equipment trading_post_equipment_trading_post_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_post_equipment
    ADD CONSTRAINT trading_post_equipment_trading_post_type_id_fkey FOREIGN KEY (trading_post_type_id) REFERENCES public.trading_post_types(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_fighter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_fighter_id_fkey FOREIGN KEY (fighter_id) REFERENCES public.fighters(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_gang_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_gang_id_fkey FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE CASCADE;


--
-- Name: weapon_profiles weapon_profiles_weapon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weapon_profiles
    ADD CONSTRAINT weapon_profiles_weapon_id_fkey FOREIGN KEY (weapon_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: campaign_gangs Admins, arbitrators, or gang     owners can update campaign_gan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins, arbitrators, or gang
   owners can update campaign_gan" ON public.campaign_gangs FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_gangs.campaign_id) AS is_arb) OR (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_gangs.campaign_id) AS is_arb) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: custom_equipment Allow authenticated users to create custom equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom equipment" ON public.custom_equipment FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_fighter_types Allow authenticated users to create custom fighter types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom fighter types" ON public.custom_fighter_types FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_shared Allow authenticated users to create custom shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom shares" ON public.custom_shared FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_skills Allow authenticated users to create custom skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom skills" ON public.custom_skills FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_territories Allow authenticated users to create custom territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom territories" ON public.custom_territories FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_weapon_profiles Allow authenticated users to create custom weapon profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to create custom weapon profiles" ON public.custom_weapon_profiles FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: campaign_battles Allow authenticated users to view campaign battles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign battles" ON public.campaign_battles FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_gangs Allow authenticated users to view campaign gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign gangs" ON public.campaign_gangs FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_members Allow authenticated users to view campaign members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign members" ON public.campaign_members FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_territories Allow authenticated users to view campaign territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign territories" ON public.campaign_territories FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_triumphs Allow authenticated users to view campaign_triumphs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign_triumphs" ON public.campaign_triumphs FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_types Allow authenticated users to view campaign_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaign_types" ON public.campaign_types FOR SELECT TO authenticated USING (true);


--
-- Name: campaigns Allow authenticated users to view campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);


--
-- Name: custom_equipment Allow authenticated users to view custom equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom equipment" ON public.custom_equipment FOR SELECT TO authenticated USING (true);


--
-- Name: custom_fighter_types Allow authenticated users to view custom fighter types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom fighter types" ON public.custom_fighter_types FOR SELECT TO authenticated USING (true);


--
-- Name: custom_shared Allow authenticated users to view custom shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom shares" ON public.custom_shared FOR SELECT TO authenticated USING (true);


--
-- Name: custom_skills Allow authenticated users to view custom skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom skills" ON public.custom_skills FOR SELECT TO authenticated USING (true);


--
-- Name: custom_territories Allow authenticated users to view custom territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom territories" ON public.custom_territories FOR SELECT TO authenticated USING (true);


--
-- Name: custom_weapon_profiles Allow authenticated users to view custom weapon profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view custom weapon profiles" ON public.custom_weapon_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: equipment_discounts Allow authenticated users to view equipment_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view equipment_discounts" ON public.equipment_discounts FOR SELECT TO authenticated USING (true);


--
-- Name: equipment_availability Allow authenticated users to view equipment_rarity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view equipment_rarity" ON public.equipment_availability FOR SELECT TO authenticated USING (true);


--
-- Name: exotic_beasts Allow authenticated users to view exotic_beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view exotic_beasts" ON public.exotic_beasts FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effect_modifiers Allow authenticated users to view fighter effect modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter effect modifiers" ON public.fighter_effect_modifiers FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effects Allow authenticated users to view fighter effects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter effects" ON public.fighter_effects FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_exotic_beasts Allow authenticated users to view fighter exotic beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter exotic beasts" ON public.fighter_exotic_beasts FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_skill_access_override Allow authenticated users to view fighter skill access override; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter skill access override" ON public.fighter_skill_access_override FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_skills Allow authenticated users to view fighter skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter skills" ON public.fighter_skills FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effect_categories Allow authenticated users to view fighter_effect_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_effect_categories" ON public.fighter_effect_categories FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effect_skills Allow authenticated users to view fighter_effect_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_effect_skills" ON public.fighter_effect_skills FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effect_type_modifiers Allow authenticated users to view fighter_effect_type_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_effect_type_modifiers" ON public.fighter_effect_type_modifiers FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_effect_types Allow authenticated users to view fighter_effect_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_effect_types" ON public.fighter_effect_types FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_equipment Allow authenticated users to view fighter_equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_equipment" ON public.fighter_equipment FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_equipment_tradingpost Allow authenticated users to view fighter_equipment_tradingpost; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_equipment_tradingpost" ON public.fighter_equipment_tradingpost FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_gang_legacy Allow authenticated users to view fighter_gang_legacy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_gang_legacy" ON public.fighter_gang_legacy FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_injuries Allow authenticated users to view fighter_injuries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_injuries" ON public.fighter_injuries FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_loadouts Allow authenticated users to view fighter_loadouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_loadouts" ON public.fighter_loadouts FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_sub_types Allow authenticated users to view fighter_sub_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_sub_types" ON public.fighter_sub_types FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_type_equipment Allow authenticated users to view fighter_type_equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_type_equipment" ON public.fighter_type_equipment FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_type_gang_cost Allow authenticated users to view fighter_type_gang_cost; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_type_gang_cost" ON public.fighter_type_gang_cost FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_type_gang_legacies Allow authenticated users to view fighter_type_gang_lineage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_type_gang_lineage" ON public.fighter_type_gang_legacies FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_type_skill_access Allow authenticated users to view fighter_type_skill_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_type_skill_access" ON public.fighter_type_skill_access FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_types Allow authenticated users to view fighter_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighter_types" ON public.fighter_types FOR SELECT TO authenticated USING (true);


--
-- Name: fighters Allow authenticated users to view fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view fighters" ON public.fighters FOR SELECT TO authenticated USING (true);


--
-- Name: gang_affiliation Allow authenticated users to view gang_affiliation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_affiliation" ON public.gang_affiliation FOR SELECT TO authenticated USING (true);


--
-- Name: gang_origin_categories Allow authenticated users to view gang_origin_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_origin_categories" ON public.gang_origin_categories FOR SELECT TO authenticated USING (true);


--
-- Name: gang_origins Allow authenticated users to view gang_origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_origins" ON public.gang_origins FOR SELECT TO authenticated USING (true);


--
-- Name: gang_stash Allow authenticated users to view gang_stash; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_stash" ON public.gang_stash FOR SELECT TO authenticated USING (true);


--
-- Name: gang_types Allow authenticated users to view gang_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_types" ON public.gang_types FOR SELECT TO authenticated USING (true);


--
-- Name: gang_variant_types Allow authenticated users to view gang_variant_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gang_variant_types" ON public.gang_variant_types FOR SELECT TO authenticated USING (true);


--
-- Name: gangs Allow authenticated users to view gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view gangs" ON public.gangs FOR SELECT TO authenticated USING (true);


--
-- Name: scenarios Allow authenticated users to view scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view scenarios" ON public.scenarios FOR SELECT TO authenticated USING (true);


--
-- Name: skill_access_archetypes Allow authenticated users to view skill_access_archetypes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view skill_access_archetypes" ON public.skill_access_archetypes FOR SELECT TO authenticated USING (true);


--
-- Name: skill_types Allow authenticated users to view skill_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view skill_types" ON public.skill_types FOR SELECT TO authenticated USING (true);


--
-- Name: skills Allow authenticated users to view skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view skills" ON public.skills FOR SELECT TO authenticated USING (true);


--
-- Name: territories Allow authenticated users to view territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view territories" ON public.territories FOR SELECT TO authenticated USING (true);


--
-- Name: trading_post_equipment Allow authenticated users to view trading_post_equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view trading_post_equipment" ON public.trading_post_equipment FOR SELECT TO authenticated USING (true);


--
-- Name: trading_post_types Allow authenticated users to view trading_post_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view trading_post_types" ON public.trading_post_types FOR SELECT TO authenticated USING (true);


--
-- Name: vehicle_types Allow authenticated users to view vehicle_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view vehicle_types" ON public.vehicle_types FOR SELECT TO authenticated USING (true);


--
-- Name: weapon_profiles Allow authenticated users to view weapon_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view weapon_profiles" ON public.weapon_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_territories Allow campaign members to update territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow campaign members to update territories" ON public.campaign_territories FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE (cm.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE (cm.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_allegiances Anyone can view campaign allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view campaign allegiances" ON public.campaign_allegiances FOR SELECT USING (true);


--
-- Name: campaign_gang_resources Anyone can view campaign gang resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view campaign gang resources" ON public.campaign_gang_resources FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_resources Anyone can view campaign resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view campaign resources" ON public.campaign_resources FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_type_allegiances Anyone can view campaign type allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view campaign type allegiances" ON public.campaign_type_allegiances FOR SELECT USING (true);


--
-- Name: campaign_type_resources Anyone can view campaign type resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view campaign type resources" ON public.campaign_type_resources FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_loadout_equipment Authenticated users can manage loadout equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage loadout equipment" ON public.fighter_loadout_equipment TO authenticated USING (true) WITH CHECK (true);


--
-- Name: campaign_battles Battle participants or campaign admins can delete battles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Battle participants or campaign admins can delete battles" ON public.campaign_battles FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_battles.campaign_id) AS is_arb) OR (EXISTS ( SELECT 1
   FROM (jsonb_array_elements(((campaign_battles.participants #>> '{}'::text[]))::jsonb) p(value)
     JOIN public.gangs g ON ((g.id = ((p.value ->> 'gang_id'::text))::uuid)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_battles Battle participants or campaign admins can update battles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Battle participants or campaign admins can update battles" ON public.campaign_battles FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_battles.campaign_id) AS is_arb) OR (EXISTS ( SELECT 1
   FROM (jsonb_array_elements(((campaign_battles.participants #>> '{}'::text[]))::jsonb) p(value)
     JOIN public.gangs g ON ((g.id = ((p.value ->> 'gang_id'::text))::uuid)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_battles.campaign_id) AS is_arb) OR (EXISTS ( SELECT 1
   FROM (jsonb_array_elements(((campaign_battles.participants #>> '{}'::text[]))::jsonb) p(value)
     JOIN public.gangs g ON ((g.id = ((p.value ->> 'gang_id'::text))::uuid)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_members Campaign OWNER/ARBITRATOR or system admin can delete members, m; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign OWNER/ARBITRATOR or system admin can delete members, m" ON public.campaign_members FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ARBITRATOR'::text, 'OWNER'::text])))))));


--
-- Name: campaign_gangs Campaign members can delete gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign members can delete gangs" ON public.campaign_gangs FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_gangs.campaign_id) AS is_arb) OR ((campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'MEMBER'::text)))) AND (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: campaign_battles Campaign members can insert battle logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign members can insert battle logs" ON public.campaign_battles FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_battles.campaign_id) AS is_arb) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'MEMBER'::text))))));


--
-- Name: campaign_gangs Campaign members can insert gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign members can insert gangs" ON public.campaign_gangs FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_arb(campaign_gangs.campaign_id) AS is_arb) OR ((campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'MEMBER'::text)))) AND (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: campaign_allegiances Campaign owners and arbitrators can delete campaign allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can delete campaign allegiances" ON public.campaign_allegiances FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_resources Campaign owners and arbitrators can delete campaign resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can delete campaign resources" ON public.campaign_resources FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_allegiances Campaign owners and arbitrators can insert campaign allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can insert campaign allegiances" ON public.campaign_allegiances FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_resources Campaign owners and arbitrators can insert campaign resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can insert campaign resources" ON public.campaign_resources FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_allegiances Campaign owners and arbitrators can update campaign allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can update campaign allegiances" ON public.campaign_allegiances FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_resources Campaign owners and arbitrators can update campaign resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners and arbitrators can update campaign resources" ON public.campaign_resources FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_gang_resources Gang owners and campaign managers can delete campaign gang reso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gang owners and campaign managers can delete campaign gang reso" ON public.campaign_gang_resources FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_gang_resources Gang owners and campaign managers can insert campaign gang reso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gang owners and campaign managers can insert campaign gang reso" ON public.campaign_gang_resources FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_gang_resources Gang owners and campaign managers can update campaign gang reso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gang owners and campaign managers can update campaign gang reso" ON public.campaign_gang_resources FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.gangs g ON ((cg.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (campaign_gang_id IN ( SELECT cg.id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: fighters Gang owners, admins, or arbitrators can create fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gang owners, admins, or arbitrators can create fighters" ON public.fighters FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: campaign_triumphs Only admin can create campaign_triumphs entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create campaign_triumphs entries" ON public.campaign_triumphs FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_types Only admin can create campaign_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create campaign_types entries" ON public.campaign_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_discounts Only admin can create equipment_discounts entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create equipment_discounts entries" ON public.equipment_discounts FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_availability Only admin can create equipment_rarity entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create equipment_rarity entries" ON public.equipment_availability FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: exotic_beasts Only admin can create exotic_beasts entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create exotic_beasts entries" ON public.exotic_beasts FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_skills Only admin can create fighter_effect_skills entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create fighter_effect_skills entries" ON public.fighter_effect_skills FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_type_modifiers Only admin can create fighter_effect_type_modifiers entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create fighter_effect_type_modifiers entries" ON public.fighter_effect_type_modifiers FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_types Only admin can create fighter_effect_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create fighter_effect_types entries" ON public.fighter_effect_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_sub_types Only admin can create fighter_sub_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create fighter_sub_types entries" ON public.fighter_sub_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_cost Only admin can create fighter_type_gang_cost entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create fighter_type_gang_cost entries" ON public.fighter_type_gang_cost FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_types Only admin can create gang_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create gang_types entries" ON public.gang_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: scenarios Only admin can create scenarios entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create scenarios entries" ON public.scenarios FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_types Only admin can create skill_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create skill_types entries" ON public.skill_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skills Only admin can create skills entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create skills entries" ON public.skills FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: territories Only admin can create territories entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create territories entries" ON public.territories FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_equipment Only admin can create trading_post_equipment entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create trading_post_equipment entries" ON public.trading_post_equipment FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_types Only admin can create trading_post_types entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can create trading_post_types entries" ON public.trading_post_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_triumphs Only admin can delete campaign_triumphs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete campaign_triumphs" ON public.campaign_triumphs FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_types Only admin can delete campaign_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete campaign_types" ON public.campaign_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_discounts Only admin can delete equipment_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete equipment_discounts" ON public.equipment_discounts FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_availability Only admin can delete equipment_rarity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete equipment_rarity" ON public.equipment_availability FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: exotic_beasts Only admin can delete exotic_beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete exotic_beasts" ON public.exotic_beasts FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_categories Only admin can delete fighter_effect_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_effect_categories" ON public.fighter_effect_categories FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_skills Only admin can delete fighter_effect_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_effect_skills" ON public.fighter_effect_skills FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_type_modifiers Only admin can delete fighter_effect_type_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_effect_type_modifiers" ON public.fighter_effect_type_modifiers FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_types Only admin can delete fighter_effect_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_effect_types" ON public.fighter_effect_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_sub_types Only admin can delete fighter_sub_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_sub_types" ON public.fighter_sub_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_cost Only admin can delete fighter_type_gang_cost; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete fighter_type_gang_cost" ON public.fighter_type_gang_cost FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origin_categories Only admin can delete gang_origin_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete gang_origin_categories" ON public.gang_origin_categories FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origins Only admin can delete gang_origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete gang_origins" ON public.gang_origins FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_types Only admin can delete gang_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete gang_types" ON public.gang_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: scenarios Only admin can delete scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete scenarios" ON public.scenarios FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_types Only admin can delete skill_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete skill_types" ON public.skill_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: skills Only admin can delete skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete skills" ON public.skills FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: territories Only admin can delete territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete territories" ON public.territories FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_equipment Only admin can delete trading_post_equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete trading_post_equipment" ON public.trading_post_equipment FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_types Only admin can delete trading_post_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can delete trading_post_types" ON public.trading_post_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_categories Only admin can insert fighter_effect_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can insert fighter_effect_categories" ON public.fighter_effect_categories FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origin_categories Only admin can insert gang_origin_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can insert gang_origin_categories" ON public.gang_origin_categories FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origins Only admin can insert gang_origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can insert gang_origins" ON public.gang_origins FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_triumphs Only admin can update campaign_triumphs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update campaign_triumphs" ON public.campaign_triumphs FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_types Only admin can update campaign_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update campaign_types" ON public.campaign_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_discounts Only admin can update equipment_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update equipment_discounts" ON public.equipment_discounts FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_availability Only admin can update equipment_rarity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update equipment_rarity" ON public.equipment_availability FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: exotic_beasts Only admin can update exotic_beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update exotic_beasts" ON public.exotic_beasts FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_categories Only admin can update fighter_effect_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_effect_categories" ON public.fighter_effect_categories FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_skills Only admin can update fighter_effect_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_effect_skills" ON public.fighter_effect_skills FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_type_modifiers Only admin can update fighter_effect_type_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_effect_type_modifiers" ON public.fighter_effect_type_modifiers FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_effect_types Only admin can update fighter_effect_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_effect_types" ON public.fighter_effect_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_sub_types Only admin can update fighter_sub_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_sub_types" ON public.fighter_sub_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_cost Only admin can update fighter_type_gang_cost; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update fighter_type_gang_cost" ON public.fighter_type_gang_cost FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origin_categories Only admin can update gang_origin_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update gang_origin_categories" ON public.gang_origin_categories FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_origins Only admin can update gang_origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update gang_origins" ON public.gang_origins FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_types Only admin can update gang_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update gang_types" ON public.gang_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: scenarios Only admin can update scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update scenarios" ON public.scenarios FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_types Only admin can update skill_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update skill_types" ON public.skill_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skills Only admin can update skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update skills" ON public.skills FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: territories Only admin can update territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update territories" ON public.territories FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_equipment Only admin can update trading_post_equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update trading_post_equipment" ON public.trading_post_equipment FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: trading_post_types Only admin can update trading_post_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can update trading_post_types" ON public.trading_post_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_allegiances Only admins can delete campaign type allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete campaign type allegiances" ON public.campaign_type_allegiances FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_resources Only admins can delete campaign type resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete campaign type resources" ON public.campaign_type_resources FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_allegiances Only admins can insert campaign type allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert campaign type allegiances" ON public.campaign_type_allegiances FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_resources Only admins can insert campaign type resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert campaign type resources" ON public.campaign_type_resources FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_allegiances Only admins can update campaign type allegiances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update campaign type allegiances" ON public.campaign_type_allegiances FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaign_type_resources Only admins can update campaign type resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update campaign type resources" ON public.campaign_type_resources FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaigns Only authenticated users can create campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only authenticated users can create campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: campaigns Only campaign ADMIN/OWNER or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign ADMIN/OWNER or admin can delete" ON public.campaigns FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ADMIN'::text, 'OWNER'::text])))))));


--
-- Name: campaign_territories Only campaign ADMIN/OWNER or system admin can delete campaign t; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign ADMIN/OWNER or system admin can delete campaign t" ON public.campaign_territories FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ADMIN'::text, 'OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_territories Only campaign ADMIN/OWNER or system admin can insert campaign t; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign ADMIN/OWNER or system admin can insert campaign t" ON public.campaign_territories FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ADMIN'::text, 'OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: campaign_members Only campaign ARBITRATOR/OWNER or system admin can invite membe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign ARBITRATOR/OWNER or system admin can invite membe" ON public.campaign_members FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (role = 'OWNER'::text)) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ARBITRATOR'::text, 'OWNER'::text])))))));


--
-- Name: campaign_members Only campaign ARBITRATOR/OWNER or system admin can update membe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign ARBITRATOR/OWNER or system admin can update membe" ON public.campaign_members FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ARBITRATOR'::text, 'OWNER'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (campaign_id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['ARBITRATOR'::text, 'OWNER'::text])))))));


--
-- Name: campaigns Only campaign OWNER/ARBITRATOR or system admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only campaign OWNER/ARBITRATOR or system admin can update" ON public.campaigns FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text]))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (id IN ( SELECT cm.campaign_id
   FROM public.campaign_members cm
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text])))))));


--
-- Name: custom_equipment Only custom equipment owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom equipment owner or admin can delete" ON public.custom_equipment FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_equipment Only custom equipment owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom equipment owner or admin can update" ON public.custom_equipment FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_fighter_types Only custom fighter type owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom fighter type owner or admin can delete" ON public.custom_fighter_types FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_fighter_types Only custom fighter type owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom fighter type owner or admin can update" ON public.custom_fighter_types FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_shared Only custom share owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom share owner or admin can delete" ON public.custom_shared FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_shared Only custom share owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom share owner or admin can update" ON public.custom_shared FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_skills Only custom skill owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom skill owner or admin can delete" ON public.custom_skills FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_skills Only custom skill owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom skill owner or admin can update" ON public.custom_skills FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_territories Only custom territory owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom territory owner or admin can delete" ON public.custom_territories FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_territories Only custom territory owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom territory owner or admin can update" ON public.custom_territories FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_weapon_profiles Only custom weapon profile owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom weapon profile owner or admin can delete" ON public.custom_weapon_profiles FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: custom_weapon_profiles Only custom weapon profile owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only custom weapon profile owner or admin can update" ON public.custom_weapon_profiles FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: fighter_effects Only fighter effect owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter effect owner or admin can delete" ON public.fighter_effects FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));


--
-- Name: fighter_effects Only fighter effect owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter effect owner or admin can update" ON public.fighter_effects FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ((fighter_id IS NOT NULL) AND (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))) OR ((vehicle_id IS NOT NULL) AND (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))));


--
-- Name: fighter_exotic_beasts Only fighter owner or admin can delete exotic beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner or admin can delete exotic beasts" ON public.fighter_exotic_beasts FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_owner_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighter_injuries Only fighter owner or admin can delete injuries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner or admin can delete injuries" ON public.fighter_injuries FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighter_exotic_beasts Only fighter owner or admin can update exotic beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner or admin can update exotic beasts" ON public.fighter_exotic_beasts FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_owner_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_owner_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighter_injuries Only fighter owner or admin can update injuries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner or admin can update injuries" ON public.fighter_injuries FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighters Only fighter owner, admin, or arbitrator can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner, admin, or arbitrator can delete" ON public.fighters FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighters Only fighter owner, admin, or arbitrator can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter owner, admin, or arbitrator can update" ON public.fighters FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighter_skills Only fighter skill owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter skill owner or admin can delete" ON public.fighter_skills FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighter_skills Only fighter skill owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only fighter skill owner or admin can update" ON public.fighter_skills FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: gangs Only gang owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only gang owner or admin can delete" ON public.gangs FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: gang_stash Only gang owner or admin can delete stash items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only gang owner or admin can delete stash items" ON public.gang_stash FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gang_stash Only gang owner or admin can update stash items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only gang owner or admin can update stash items" ON public.gang_stash FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gangs Only gang owner, admin, or arbitrator can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only gang owner, admin, or arbitrator can update" ON public.gangs FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: gang_logs Only gang owners or admins can delete logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only gang owners or admins can delete logs" ON public.gang_logs FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighter_skill_access_override Only override owner or admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only override owner or admin can delete" ON public.fighter_skill_access_override FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighter_skill_access_override Only override owner or admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only override owner or admin can update" ON public.fighter_skill_access_override FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: profiles Public profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: fighter_equipment Users can create equipment for their gang; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create equipment for their gang" ON public.fighter_equipment FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: friends Users can create friendship requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create friendship requests" ON public.friends FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = requester_id));


--
-- Name: fighter_loadouts Users can create loadouts for their gang fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create loadouts for their gang fighters" ON public.fighter_loadouts FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: notifications Users can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: fighter_skill_access_override Users can create skill access overrides for their own fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create skill access overrides for their own fighters" ON public.fighter_skill_access_override FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))));


--
-- Name: fighter_skills Users can create skills for their own fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create skills for their own fighters" ON public.fighter_skills FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))));


--
-- Name: fighter_equipment Users can delete equipment from their gang; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete equipment from their gang" ON public.fighter_equipment FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighter_loadouts Users can delete loadouts for their gang fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete loadouts for their gang fighters" ON public.fighter_loadouts FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: friends Users can delete their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friendships" ON public.friends FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id)));


--
-- Name: notifications Users can delete their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = receiver_id));


--
-- Name: gang_logs Users can insert logs for their gangs or campaign gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert logs for their gangs or campaign gangs" ON public.gang_logs FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM (public.campaign_gangs cg
     JOIN public.campaign_members cm ON ((cm.campaign_id = cg.campaign_id)))
  WHERE ((cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = ANY (ARRAY['OWNER'::text, 'ARBITRATOR'::text, 'MEMBER'::text])))))));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: fighter_injuries Users can only create fighter_injuries for their own fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only create fighter_injuries for their own fighters" ON public.fighter_injuries FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gang_stash Users can only create stash items for gangs they own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only create stash items for gangs they own" ON public.gang_stash FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: fighter_effects Users can only create their own fighter effects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only create their own fighter effects" ON public.fighter_effects FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((fighter_id IS NOT NULL) AND ((fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.gangs g ON ((f.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) OR ((vehicle_id IS NOT NULL) AND ((vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.gangs g ON ((v.gang_id = g.id)))
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (vehicle_id IN ( SELECT v.id
   FROM (public.vehicles v
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))))));


--
-- Name: fighter_exotic_beasts Users can only create their own fighter exotic beasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only create their own fighter exotic beasts" ON public.fighter_exotic_beasts FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (fighter_owner_id IN ( SELECT f.id
   FROM public.fighters f
  WHERE (f.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: gangs Users can only create their own gangs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only create their own gangs" ON public.gangs FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: fighter_equipment Users can update equipment in their gang; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update equipment in their gang" ON public.fighter_equipment FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: fighter_loadouts Users can update loadouts for their gang fighters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update loadouts for their gang fighters" ON public.fighter_loadouts FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (fighter_id IN ( SELECT f.id
   FROM (public.fighters f
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: friends Users can update their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own friendships" ON public.friends FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id)));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = receiver_id));


--
-- Name: gang_logs Users can view logs for their gangs or campaigns they moderate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view logs for their gangs or campaigns they moderate" ON public.gang_logs FOR SELECT TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: friends Users can view their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friendships" ON public.friends FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id)));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = receiver_id));


--
-- Name: alliances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;

--
-- Name: alliances alliances_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alliances_admin_delete_policy ON public.alliances FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: alliances alliances_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alliances_admin_insert_policy ON public.alliances FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: alliances alliances_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alliances_admin_update_policy ON public.alliances FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: alliances alliances_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alliances_read_policy ON public.alliances FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_equipment_selections authenticated_view_fighter_equipment_selections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_view_fighter_equipment_selections ON public.fighter_equipment_selections FOR SELECT TO authenticated USING (true);


--
-- Name: vehicles authenticated_view_vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_view_vehicles ON public.vehicles FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_allegiances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_allegiances ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_battles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_battles ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_gang_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_gang_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_gangs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_gangs ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_territories ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_triumphs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_triumphs ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_type_allegiances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_type_allegiances ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_type_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_type_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_types ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_fighter_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_fighter_types ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_shared; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_shared ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_territories ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_weapon_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_weapon_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment equipment_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_admin_delete_policy ON public.equipment FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment equipment_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_admin_insert_policy ON public.equipment FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment equipment_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_admin_update_policy ON public.equipment FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_categories equipment_categories_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_admin_delete_policy ON public.equipment_categories FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_categories equipment_categories_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_admin_insert_policy ON public.equipment_categories FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_categories equipment_categories_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_admin_update_policy ON public.equipment_categories FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: equipment_categories equipment_categories_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_categories_read_policy ON public.equipment_categories FOR SELECT TO authenticated USING (true);


--
-- Name: equipment_discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment equipment_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_read_policy ON public.equipment FOR SELECT TO authenticated USING (true);


--
-- Name: exotic_beasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exotic_beasts ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_classes fighter_classes_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_classes_delete_policy ON public.fighter_classes FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_classes fighter_classes_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_classes_insert_policy ON public.fighter_classes FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_classes fighter_classes_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_classes_select_policy ON public.fighter_classes FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_classes fighter_classes_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_classes_update_policy ON public.fighter_classes FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_defaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_defaults fighter_defaults_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_defaults_delete_policy ON public.fighter_defaults FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_defaults fighter_defaults_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_defaults_insert_policy ON public.fighter_defaults FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_defaults fighter_defaults_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_defaults_select_policy ON public.fighter_defaults FOR SELECT TO authenticated USING (true);


--
-- Name: fighter_defaults fighter_defaults_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_defaults_update_policy ON public.fighter_defaults FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_effect_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effect_injuries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_injuries ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effect_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effect_modifiers fighter_effect_modifiers_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_effect_modifiers_delete_policy ON public.fighter_effect_modifiers FOR DELETE USING ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND private.is_arb(cg.campaign_id))))));


--
-- Name: fighter_effect_modifiers fighter_effect_modifiers_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_effect_modifiers_insert_policy ON public.fighter_effect_modifiers FOR INSERT WITH CHECK ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND private.is_arb(cg.campaign_id))))));


--
-- Name: fighter_effect_modifiers fighter_effect_modifiers_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_effect_modifiers_update_policy ON public.fighter_effect_modifiers FOR UPDATE USING ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND private.is_arb(cg.campaign_id)))))) WITH CHECK ((private.is_admin() OR (fighter_effect_id IN ( SELECT fe.id
   FROM public.fighter_effects fe
  WHERE (fe.user_id = ( SELECT auth.uid() AS uid)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.fighters f ON ((f.id = fe.fighter_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = f.gang_id)))
  WHERE ((fe.fighter_id IS NOT NULL) AND private.is_arb(cg.campaign_id)))) OR (fighter_effect_id IN ( SELECT fe.id
   FROM ((public.fighter_effects fe
     JOIN public.vehicles v ON ((v.id = fe.vehicle_id)))
     JOIN public.campaign_gangs cg ON ((cg.gang_id = v.gang_id)))
  WHERE ((fe.vehicle_id IS NOT NULL) AND private.is_arb(cg.campaign_id))))));


--
-- Name: fighter_effect_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effect_type_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_type_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effect_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effect_types ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_effects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_effects ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_equipment_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_equipment_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_equipment_selections fighter_equipment_selections_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_selections_admin_delete_policy ON public.fighter_equipment_selections FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_equipment_selections fighter_equipment_selections_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_selections_admin_insert_policy ON public.fighter_equipment_selections FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_equipment_selections fighter_equipment_selections_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_selections_admin_update_policy ON public.fighter_equipment_selections FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_equipment_tradingpost; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_equipment_tradingpost ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_equipment_tradingpost fighter_equipment_tradingpost_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_tradingpost_admin_delete_policy ON public.fighter_equipment_tradingpost FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_equipment_tradingpost fighter_equipment_tradingpost_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_tradingpost_admin_insert_policy ON public.fighter_equipment_tradingpost FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_equipment_tradingpost fighter_equipment_tradingpost_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_equipment_tradingpost_admin_update_policy ON public.fighter_equipment_tradingpost FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_exotic_beasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_exotic_beasts ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_gang_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_gang_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_gang_legacy fighter_gang_legacy_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_gang_legacy_admin_delete_policy ON public.fighter_gang_legacy FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_gang_legacy fighter_gang_legacy_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_gang_legacy_admin_insert_policy ON public.fighter_gang_legacy FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_gang_legacy fighter_gang_legacy_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_gang_legacy_admin_update_policy ON public.fighter_gang_legacy FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_injuries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_injuries ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_loadout_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_loadout_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_loadouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_loadouts ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_skill_access_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_skill_access_override ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_sub_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_sub_types ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_type_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_type_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_type_equipment fighter_type_equipment_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_equipment_admin_delete_policy ON public.fighter_type_equipment FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_equipment fighter_type_equipment_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_equipment_admin_insert_policy ON public.fighter_type_equipment FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_equipment fighter_type_equipment_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_equipment_admin_update_policy ON public.fighter_type_equipment FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_cost; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_type_gang_cost ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_type_gang_legacies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_type_gang_legacies ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_type_gang_legacies fighter_type_gang_legacies_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_gang_legacies_admin_delete_policy ON public.fighter_type_gang_legacies FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_legacies fighter_type_gang_legacies_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_gang_legacies_admin_insert_policy ON public.fighter_type_gang_legacies FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_gang_legacies fighter_type_gang_legacies_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_gang_legacies_admin_update_policy ON public.fighter_type_gang_legacies FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_type_skill_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_type_skill_access ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_type_skill_access fighter_type_skill_access_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_skill_access_delete_policy ON public.fighter_type_skill_access FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_type_skill_access fighter_type_skill_access_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_skill_access_insert_policy ON public.fighter_type_skill_access FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_type_skill_access fighter_type_skill_access_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_type_skill_access_update_policy ON public.fighter_type_skill_access FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR ((custom_fighter_type_id IS NOT NULL) AND (custom_fighter_type_id IN ( SELECT cft.id
   FROM public.custom_fighter_types cft
  WHERE (cft.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: fighter_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighter_types ENABLE ROW LEVEL SECURITY;

--
-- Name: fighter_types fighter_types_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_types_admin_delete_policy ON public.fighter_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_types fighter_types_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_types_admin_insert_policy ON public.fighter_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighter_types fighter_types_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fighter_types_admin_update_policy ON public.fighter_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: fighters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fighters ENABLE ROW LEVEL SECURITY;

--
-- Name: friends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_affiliation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_affiliation ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_affiliation gang_affiliation_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_affiliation_admin_delete_policy ON public.gang_affiliation FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_affiliation gang_affiliation_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_affiliation_admin_insert_policy ON public.gang_affiliation FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_affiliation gang_affiliation_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_affiliation_admin_update_policy ON public.gang_affiliation FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_origin_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_origin_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_origins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_origins ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_stash; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_stash ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_types ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_variant_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gang_variant_types ENABLE ROW LEVEL SECURITY;

--
-- Name: gang_variant_types gang_variant_types_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_variant_types_admin_delete_policy ON public.gang_variant_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_variant_types gang_variant_types_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_variant_types_admin_insert_policy ON public.gang_variant_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gang_variant_types gang_variant_types_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gang_variant_types_admin_update_policy ON public.gang_variant_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: gangs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gangs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_access_archetypes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_access_archetypes ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_access_archetypes skill_access_archetypes_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_access_archetypes_admin_delete_policy ON public.skill_access_archetypes FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_access_archetypes skill_access_archetypes_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_access_archetypes_admin_insert_policy ON public.skill_access_archetypes FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_access_archetypes skill_access_archetypes_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_access_archetypes_admin_update_policy ON public.skill_access_archetypes FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: skill_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_types ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

--
-- Name: trading_post_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trading_post_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: trading_post_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trading_post_types ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_types vehicle_types_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_types_admin_delete_policy ON public.vehicle_types FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: vehicle_types vehicle_types_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_types_admin_insert_policy ON public.vehicle_types FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: vehicle_types vehicle_types_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_types_admin_update_policy ON public.vehicle_types FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_user_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_user_delete_policy ON public.vehicles FOR DELETE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: vehicles vehicles_user_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_user_insert_policy ON public.vehicles FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: vehicles vehicles_user_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_user_update_policy ON public.vehicles FOR UPDATE TO authenticated USING ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb))))) WITH CHECK ((( SELECT private.is_admin() AS is_admin) OR (gang_id IN ( SELECT g.id
   FROM public.gangs g
  WHERE (g.user_id = ( SELECT auth.uid() AS uid)))) OR (gang_id IN ( SELECT cg.gang_id
   FROM public.campaign_gangs cg
  WHERE ( SELECT private.is_arb(cg.campaign_id) AS is_arb)))));


--
-- Name: weapon_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weapon_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: weapon_profiles weapon_profiles_admin_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY weapon_profiles_admin_delete_policy ON public.weapon_profiles FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: weapon_profiles weapon_profiles_admin_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY weapon_profiles_admin_insert_policy ON public.weapon_profiles FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: weapon_profiles weapon_profiles_admin_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY weapon_profiles_admin_update_policy ON public.weapon_profiles FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- PostgreSQL database dump complete
--

\unrestrict NohcxaBgWdNQd83lPTqDozLDpozkdJ7tbqiXM7myQaoiggrmpQFO2drooejqKro

