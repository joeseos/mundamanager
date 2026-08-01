-- Migration: Add fighter_classes JSONB column to support multiple classes per fighter
-- Phase 1: Adds new column alongside existing fighter_class/fighter_class_id for rollback safety

-- 1. Add fighter_classes JSONB column to three tables
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Populate fighter_types from the canonical fighter_classes table
UPDATE public.fighter_types ft
SET fighter_classes = jsonb_build_array(fc.class_name)
FROM public.fighter_classes fc
WHERE fc.id = ft.fighter_class_id
  AND ft.fighter_classes = '[]'::jsonb;

-- Populate fighters from their existing fighter_class text column
UPDATE public.fighters
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

-- Populate custom_fighter_types from their existing fighter_class text column
UPDATE public.custom_fighter_types
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

-- 3. Seed new fighter classes (Beast, Pet) for the new edition
INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Beast', 'beast', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'beast');

INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Pet', 'pet', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'pet');

-- 4. Update SQL functions to use the new fighter_classes JSONB column


-- === get_available_skills ===
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
    v_fighter_classes jsonb;
    v_gang_origin_id uuid;
    v_gang_id uuid;
    v_fighter_type_id uuid;
    v_custom_fighter_type_id uuid;
    v_origin_skill_type_id uuid;
BEGIN
    -- Get fighter classes, gang origin ID, gang ID, fighter type IDs, and verify fighter exists
    SELECT f.fighter_classes, g.gang_origin_id, f.gang_id, f.fighter_type_id, f.custom_fighter_type_id
    INTO v_fighter_classes, v_gang_origin_id, v_gang_id, v_fighter_type_id, v_custom_fighter_type_id
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

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
        'fighter_class', v_fighter_classes->>0,
        'fighter_classes', v_fighter_classes,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'skill_id', a.skill_id,
                    'skill_name', a.skill_name,
                    'is_custom', a.is_custom,
                    'fighter_class', v_fighter_classes->>0,
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
                        WHEN v_fighter_classes ?| array['Leader', 'Champion', 'Juve', 'Specialist', 'Crew', 'Prospect', 'Brute', 'Exotic Beast Specialist']
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

REVOKE ALL ON FUNCTION public.get_available_skills(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_available_skills(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_skills(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_skills(UUID) TO service_role;


-- === get_fighter_available_advancements ===
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
  v_fighter_classes jsonb;
  v_uses_flat_cost boolean; -- Flag for fighters that use flat costs (Ganger and Exotic Beast)
BEGIN
  -- Get fighter's current XP and fighter classes
  SELECT f.xp, f.fighter_classes
  INTO v_fighter_xp, v_fighter_classes
  FROM fighters f
  WHERE f.id = get_fighter_available_advancements.fighter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_available_advancements.fighter_id;
  END IF;
  
  -- Determine if the fighter uses flat costs based on fighter_class
  -- Only Gangers and Exotic Beasts use flat costs
  v_uses_flat_cost :=
    v_fighter_classes ?| array['Ganger', 'Exotic Beast'];
  
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
        WHEN v_fighter_classes ?| array['Juve', 'Prospect'] THEN etc.base_xp_cost
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
    'fighter_class', v_fighter_classes->>0,
    'fighter_classes', v_fighter_classes,
    'uses_flat_cost', v_uses_flat_cost,
    -- Ganger/Exotic Beast: Specialist table row (random Primary skill) — same flat costs as other ganger advances
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

REVOKE ALL ON FUNCTION public.get_fighter_available_advancements(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fighter_available_advancements(UUID) TO service_role;

-- === get_fighter_types_with_cost ===
-- Drop previous versions
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid, boolean);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost();

-- Create new function with optional parameters
CREATE OR REPLACE FUNCTION get_fighter_types_with_cost(
    p_gang_type_id uuid DEFAULT NULL,
    p_gang_affiliation_id uuid DEFAULT NULL,
    p_is_gang_addition boolean DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    fighter_type text,
    fighter_class text,
    fighter_class_id uuid,
    fighter_classes jsonb,
    gang_type text,
    cost numeric,
    gang_type_id uuid,
    special_rules text[],
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
    limitation numeric,
    alignment alignment,
    is_gang_addition boolean,
    alliance_id uuid,
    alliance_crew_name text,
    default_equipment jsonb,
    equipment_selection jsonb,
    total_cost numeric,
    sub_type jsonb,
    available_legacies jsonb,
    free_skill boolean,
    delegation_cost numeric,
    is_dramatis_personae boolean
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.fighter_type,
        fc.class_name,
        ft.fighter_class_id,
        ft.fighter_classes,
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
                    'is_editable', COALESCE(e.is_editable, false)
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
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacement_mode', item_data->>'replacement_mode',
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
                                                            'is_editable', COALESCE(e.is_editable, false),
                                                            'replacement_mode', item_data->>'replacement_mode',
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
                                                        'is_editable', COALESCE(e.is_editable, false),
                                                        'replacement_mode', item_data->>'replacement_mode',
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
        ft.free_skill,
        ft.delegation_cost,
        ft.is_dramatis_personae
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    LEFT JOIN fighter_type_gang_cost ftgc ON ftgc.fighter_type_id = ft.id 
        AND ftgc.gang_type_id = p_gang_type_id
        AND (ftgc.gang_affiliation_id IS NULL OR ftgc.gang_affiliation_id = p_gang_affiliation_id)
    LEFT JOIN fighter_sub_types fsub ON fsub.id = ft.fighter_sub_type_id
    WHERE
        CASE
            -- Gang additions: cross-gang pool, filtered only by the flag
            WHEN p_is_gang_addition = true THEN ft.is_gang_addition = true
            -- Roster: fighters belonging to this gang type (plus affiliation-cost
            -- overrides). Matches the previous get_add_fighter_details behaviour,
            -- including this gang type's own gang-addition-flagged fighters.
            WHEN p_is_gang_addition = false THEN (
                ft.gang_type_id = p_gang_type_id
                OR (ftgc.fighter_type_id IS NOT NULL
                    AND ftgc.gang_affiliation_id IS NOT NULL
                    AND ftgc.gang_affiliation_id = p_gang_affiliation_id)
            )
            -- Include-all (both params NULL): every fighter type
            ELSE true
        END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fighter_types_with_cost(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_fighter_types_with_cost(UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_fighter_types_with_cost(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fighter_types_with_cost(UUID, UUID, BOOLEAN) TO service_role;

-- === get_gang_details ===
-- This Code is obsolete. Do not use it or update it.
-- We now use the library app/lib/shared/gang-data.ts to get the gang details.
-- This code is kept here for compatibility with the Rule Snatcher Tool.

DROP FUNCTION IF EXISTS public.get_gang_details(uuid);

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
    gang_variants json
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
           f.fighter_classes,
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
           f.fighter_classes,
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
               'fighter_classes', cf.fighter_classes,
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
$function$;

REVOKE ALL ON FUNCTION public.get_gang_details(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_gang_details(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_gang_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gang_details(UUID) TO service_role;

-- === copy_custom_collection ===
-- Deep-clone a collection and all of its custom items into the calling user's account.
-- SECURITY INVOKER: open-SELECT RLS reads the source owner's rows; owner-INSERT RLS
-- accepts the clones (user_id = auth.uid()). Runs atomically in one transaction.
-- Implemented with plpgsql array variables + jsonb id-maps (no temp tables) so the
-- body compiles under check_function_bodies and avoids cached-plan pitfalls.
-- Maps are jsonb objects keyed by old uuid (text) -> new uuid (text).
DROP FUNCTION IF EXISTS public.copy_custom_collection(uuid);
CREATE OR REPLACE FUNCTION public.copy_custom_collection(p_collection_id uuid, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_new_collection uuid := gen_random_uuid();
  v_items jsonb;
  v_new_items jsonb;
  v_name text;
  v_description text;
  v_before bigint;
  v_after bigint;
  -- closure id-sets
  v_eq uuid[] := '{}';   -- custom_equipment
  v_st uuid[] := '{}';   -- custom_skill_types
  v_sk uuid[] := '{}';   -- custom_skills
  v_gt uuid[] := '{}';   -- custom_gang_types
  v_ft uuid[] := '{}';   -- custom_fighter_types
  v_tp uuid[] := '{}';   -- custom_trading_posts
  -- old(text) -> new(text) id maps
  v_map_eq jsonb;
  v_map_st jsonb;
  v_map_sk jsonb;
  v_map_gt jsonb;
  v_map_ft jsonb;
  v_map_tp jsonb;
  v_map_tpe jsonb;       -- custom_trading_post_equipment
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.items, p.name, p.description
    INTO v_items, v_name, v_description
  FROM public.custom_collections p
  WHERE p.id = p_collection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;

  -- Seed closure id-sets from the collection's items jsonb.
  v_eq := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'equipment' AND x.id IS NOT NULL), '{}');
  v_ft := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'fighter_type' AND x.id IS NOT NULL), '{}');
  v_gt := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'gang_type' AND x.id IS NOT NULL), '{}');
  v_sk := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'skill' AND x.id IS NOT NULL), '{}');
  v_tp := COALESCE((SELECT array_agg(x.id) FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
                    WHERE x.type = 'trading_post' AND x.id IS NOT NULL), '{}');

  -- Transitive closure: pull in every custom item referenced by collected items so
  -- the copy is self-contained. Loop until no new ids are discovered.
  LOOP
    v_before := cardinality(v_eq) + cardinality(v_st) + cardinality(v_sk)
              + cardinality(v_gt) + cardinality(v_ft) + cardinality(v_tp);

    -- fighter types belonging to in-scope gang types
    v_ft := ARRAY(SELECT DISTINCT f FROM (
              SELECT unnest(v_ft) AS f
              UNION SELECT cft.id FROM public.custom_fighter_types cft WHERE cft.custom_gang_type_id = ANY(v_gt)
            ) s WHERE f IS NOT NULL);

    -- gang types referenced by in-scope fighter types and trading posts
    v_gt := ARRAY(SELECT DISTINCT g FROM (
              SELECT unnest(v_gt) AS g
              UNION SELECT cft.custom_gang_type_id FROM public.custom_fighter_types cft
                    WHERE cft.id = ANY(v_ft) AND cft.custom_gang_type_id IS NOT NULL
              UNION SELECT a.custom_gang_type_id FROM public.custom_trading_post_availability a
                    JOIN public.custom_trading_post_equipment te ON te.id = a.custom_trading_post_equipment_id
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND a.custom_gang_type_id IS NOT NULL
              UNION SELECT pr.custom_gang_type_id FROM public.custom_trading_post_pricing pr
                    JOIN public.custom_trading_post_equipment te ON te.id = pr.custom_trading_post_equipment_id
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND pr.custom_gang_type_id IS NOT NULL
            ) s WHERE g IS NOT NULL);

    -- skill types referenced by in-scope fighter skill access and skills
    v_st := ARRAY(SELECT DISTINCT t FROM (
              SELECT unnest(v_st) AS t
              UNION SELECT sa.custom_skill_type_id FROM public.fighter_type_skill_access sa
                    WHERE sa.custom_fighter_type_id = ANY(v_ft) AND sa.custom_skill_type_id IS NOT NULL
              UNION SELECT cs.custom_skill_type_id FROM public.custom_skills cs
                    WHERE cs.id = ANY(v_sk) AND cs.custom_skill_type_id IS NOT NULL
            ) s WHERE t IS NOT NULL);

    -- all skills belonging to in-scope skill types (clone the whole set)
    v_sk := ARRAY(SELECT DISTINCT k FROM (
              SELECT unnest(v_sk) AS k
              UNION SELECT cs.id FROM public.custom_skills cs WHERE cs.custom_skill_type_id = ANY(v_st)
            ) s WHERE k IS NOT NULL);

    -- equipment referenced by fighter defaults / fighter equipment / trading posts
    v_eq := ARRAY(SELECT DISTINCT e FROM (
              SELECT unnest(v_eq) AS e
              UNION SELECT fd.custom_equipment_id FROM public.fighter_defaults fd
                    WHERE fd.custom_fighter_type_id = ANY(v_ft) AND fd.custom_equipment_id IS NOT NULL
              UNION SELECT fe.custom_equipment_id FROM public.custom_fighter_type_equipment fe
                    WHERE fe.custom_fighter_type_id = ANY(v_ft) AND fe.custom_equipment_id IS NOT NULL
              UNION SELECT te.custom_equipment_id FROM public.custom_trading_post_equipment te
                    WHERE te.custom_trading_post_id = ANY(v_tp) AND te.custom_equipment_id IS NOT NULL
            ) s WHERE e IS NOT NULL);

    v_after := cardinality(v_eq) + cardinality(v_st) + cardinality(v_sk)
             + cardinality(v_gt) + cardinality(v_ft) + cardinality(v_tp);

    EXIT WHEN v_after = v_before;
  END LOOP;

  -- Build old->new id maps (pre-generate new ids).
  v_map_st  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_st) u), '{}'::jsonb);
  v_map_sk  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_sk) u), '{}'::jsonb);
  v_map_eq  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_eq) u), '{}'::jsonb);
  v_map_gt  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_gt) u), '{}'::jsonb);
  v_map_ft  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_ft) u), '{}'::jsonb);
  v_map_tp  := COALESCE((SELECT jsonb_object_agg(u::text, gen_random_uuid()::text) FROM unnest(v_tp) u), '{}'::jsonb);
  v_map_tpe := COALESCE((SELECT jsonb_object_agg(te.id::text, gen_random_uuid()::text)
                         FROM public.custom_trading_post_equipment te
                         WHERE te.custom_trading_post_id = ANY(v_tp)), '{}'::jsonb);

  -- Clone in topological order. Custom FKs remapped via maps; standard/global FKs kept.

  INSERT INTO public.custom_skill_types (id, created_at, user_id, name)
  SELECT (v_map_st ->> st.id::text)::uuid, now(), v_user, st.name
  FROM public.custom_skill_types st WHERE st.id = ANY(v_st);

  INSERT INTO public.custom_skills (id, created_at, user_id, skill_name, skill_type_id, custom_skill_type_id, description)
  SELECT (v_map_sk ->> cs.id::text)::uuid, now(), v_user, cs.skill_name, cs.skill_type_id,
         (v_map_st ->> cs.custom_skill_type_id::text)::uuid, cs.description
  FROM public.custom_skills cs WHERE cs.id = ANY(v_sk);

  INSERT INTO public.custom_equipment (id, created_at, user_id, equipment_name, availability, cost, variant,
                                       equipment_category, equipment_category_id, equipment_type, is_editable,
                                       is_consumable, description)
  SELECT (v_map_eq ->> ce.id::text)::uuid, now(), v_user, ce.equipment_name, ce.availability, ce.cost, ce.variant,
         ce.equipment_category, ce.equipment_category_id, ce.equipment_type, true,
         ce.is_consumable, ce.description
  FROM public.custom_equipment ce WHERE ce.id = ANY(v_eq);

  INSERT INTO public.custom_weapon_profiles (id, custom_equipment_id, created_at, profile_name, range_short,
                                             range_long, acc_short, acc_long, strength, ap, damage, ammo,
                                             traits, weapon_group_id, sort_order, user_id)
  SELECT gen_random_uuid(), (v_map_eq ->> wp.custom_equipment_id::text)::uuid, now(), wp.profile_name, wp.range_short,
         wp.range_long, wp.acc_short, wp.acc_long, wp.strength, wp.ap, wp.damage, wp.ammo,
         wp.traits, (v_map_eq ->> wp.weapon_group_id::text)::uuid, wp.sort_order, v_user
  FROM public.custom_weapon_profiles wp WHERE wp.custom_equipment_id = ANY(v_eq);

  INSERT INTO public.custom_gang_types (id, created_at, user_id, gang_type, alignment, trading_post_type_id,
                                        default_image_urls, description)
  SELECT (v_map_gt ->> gt.id::text)::uuid, now(), v_user, gt.gang_type, gt.alignment, gt.trading_post_type_id,
         gt.default_image_urls, gt.description
  FROM public.custom_gang_types gt WHERE gt.id = ANY(v_gt);

  INSERT INTO public.custom_fighter_types (id, created_at, user_id, fighter_type, gang_type, cost, movement,
                                           weapon_skill, ballistic_skill, strength, toughness, wounds, initiative,
                                           attacks, leadership, cool, willpower, intelligence, gang_type_id,
                                           special_rules, free_skill, fighter_class, fighter_class_id,
                                           fighter_classes, custom_gang_type_id, description)
  SELECT (v_map_ft ->> cft.id::text)::uuid, now(), v_user, cft.fighter_type, cft.gang_type, cft.cost, cft.movement,
         cft.weapon_skill, cft.ballistic_skill, cft.strength, cft.toughness, cft.wounds, cft.initiative,
         cft.attacks, cft.leadership, cft.cool, cft.willpower, cft.intelligence, cft.gang_type_id,
         cft.special_rules, cft.free_skill, cft.fighter_class, cft.fighter_class_id,
         cft.fighter_classes, (v_map_gt ->> cft.custom_gang_type_id::text)::uuid, cft.description
  FROM public.custom_fighter_types cft WHERE cft.id = ANY(v_ft);

  INSERT INTO public.fighter_type_skill_access (id, fighter_type_id, skill_type_id, access_level,
                                                custom_fighter_type_id, custom_skill_type_id)
  SELECT gen_random_uuid(), sa.fighter_type_id, sa.skill_type_id, sa.access_level,
         (v_map_ft ->> sa.custom_fighter_type_id::text)::uuid, (v_map_st ->> sa.custom_skill_type_id::text)::uuid
  FROM public.fighter_type_skill_access sa WHERE sa.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.fighter_defaults (id, created_at, fighter_type_id, equipment_id, skill_id,
                                       custom_fighter_type_id, custom_equipment_id)
  SELECT gen_random_uuid(), now(), fd.fighter_type_id, fd.equipment_id, fd.skill_id,
         (v_map_ft ->> fd.custom_fighter_type_id::text)::uuid, (v_map_eq ->> fd.custom_equipment_id::text)::uuid
  FROM public.fighter_defaults fd WHERE fd.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.custom_fighter_type_equipment (id, created_at, user_id, equipment_id, custom_equipment_id,
                                                    custom_fighter_type_id)
  SELECT gen_random_uuid(), now(), v_user, fe.equipment_id, (v_map_eq ->> fe.custom_equipment_id::text)::uuid,
         (v_map_ft ->> fe.custom_fighter_type_id::text)::uuid
  FROM public.custom_fighter_type_equipment fe WHERE fe.custom_fighter_type_id = ANY(v_ft);

  INSERT INTO public.custom_trading_posts (id, created_at, user_id, custom_trading_post_name, description)
  SELECT (v_map_tp ->> tp.id::text)::uuid, now(), v_user, tp.custom_trading_post_name, tp.description
  FROM public.custom_trading_posts tp WHERE tp.id = ANY(v_tp);

  INSERT INTO public.custom_trading_post_equipment (id, created_at, user_id, custom_trading_post_id, equipment_id,
                                                    custom_equipment_id, cost_override, availability_override,
                                                    sort_order, cost_type_resource_id, cost_campaign_resource_id,
                                                    cost_reputation, cost_resource_amount, banned)
  SELECT (v_map_tpe ->> te.id::text)::uuid, now(), v_user, (v_map_tp ->> te.custom_trading_post_id::text)::uuid,
         te.equipment_id, (v_map_eq ->> te.custom_equipment_id::text)::uuid, te.cost_override, te.availability_override,
         te.sort_order, te.cost_type_resource_id, te.cost_campaign_resource_id,
         te.cost_reputation, te.cost_resource_amount, te.banned
  FROM public.custom_trading_post_equipment te WHERE te.custom_trading_post_id = ANY(v_tp);

  INSERT INTO public.custom_trading_post_availability (id, created_at, user_id, custom_trading_post_equipment_id,
                                                       gang_type_id, custom_gang_type_id, gang_origin_id,
                                                       gang_variant_id, campaign_type_allegiance_id, alignment,
                                                       availability)
  SELECT gen_random_uuid(), now(), v_user, (v_map_tpe ->> a.custom_trading_post_equipment_id::text)::uuid,
         a.gang_type_id, (v_map_gt ->> a.custom_gang_type_id::text)::uuid, a.gang_origin_id,
         a.gang_variant_id, a.campaign_type_allegiance_id, a.alignment, a.availability
  FROM public.custom_trading_post_availability a
  WHERE (v_map_tpe ? a.custom_trading_post_equipment_id::text);

  INSERT INTO public.custom_trading_post_pricing (id, created_at, user_id, custom_trading_post_equipment_id,
                                                  gang_type_id, custom_gang_type_id, gang_origin_id,
                                                  fighter_type_id, adjusted_cost)
  SELECT gen_random_uuid(), now(), v_user, (v_map_tpe ->> pr.custom_trading_post_equipment_id::text)::uuid,
         pr.gang_type_id, (v_map_gt ->> pr.custom_gang_type_id::text)::uuid, pr.gang_origin_id,
         pr.fighter_type_id, pr.adjusted_cost
  FROM public.custom_trading_post_pricing pr
  WHERE (v_map_tpe ? pr.custom_trading_post_equipment_id::text);

  -- Build the new collection's items, remapping each entry's id; drop unresolved entries.
  v_new_items := COALESCE((
    SELECT jsonb_agg(jsonb_build_object('type', x.type, 'id', mapped.nid))
    FROM jsonb_to_recordset(v_items) AS x(type text, id uuid)
    CROSS JOIN LATERAL (
      SELECT CASE x.type
        WHEN 'equipment'    THEN v_map_eq ->> x.id::text
        WHEN 'fighter_type' THEN v_map_ft ->> x.id::text
        WHEN 'gang_type'    THEN v_map_gt ->> x.id::text
        WHEN 'skill'        THEN v_map_sk ->> x.id::text
        WHEN 'trading_post' THEN v_map_tp ->> x.id::text
      END AS nid
    ) mapped
    WHERE mapped.nid IS NOT NULL
  ), '[]'::jsonb);

  INSERT INTO public.custom_collections (id, created_at, user_id, name, description, items)
  VALUES (v_new_collection, now(), v_user, COALESCE(p_name, v_name), v_description, v_new_items);
  RETURN v_new_collection;
END;
$$;
