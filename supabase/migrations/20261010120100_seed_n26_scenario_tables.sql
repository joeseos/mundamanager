-- Fill the n26 scenario tables: the four core tables from the Necromunda
-- Skirmish: Core Rulebook, and the Goliath and Escher Side Job tables from
-- their House books. Other houses' tables are added as their books arrive.
--
-- Names follow the books, with straight apostrophes as elsewhere in the
-- catalogue ("Stitch 'em Up", "Flank 'em").
--
-- Crew rules read Hybrid (X+Y) as X fighters picked, then Y drawn at random.
--
-- Rows are looked up by edition slug and gang type name rather than by id, and
-- every insert skips rows that already exist, so the file is safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

INSERT INTO public.scenario_tables (edition_id, gang_type_id, table_type, name)
SELECT e.id, gt.id, v.table_type, v.name
FROM (VALUES
    ('deployment',     NULL,            'Deployment Table'),
    ('objective',      NULL,            'Objective Table'),
    ('side_job',       NULL,            'Side Job Table'),
    ('crew_selection', NULL,            'Crew Table'),
    ('side_job',       'House Goliath', 'Goliath Side Jobs'),
    ('side_job',       'House Escher',  'Escher Side Jobs')
) AS v(table_type, gang_type, name)
JOIN public.editions e ON e.slug = 'n26'
LEFT JOIN public.gang_types gt
    ON gt.gang_type = v.gang_type
   AND gt.edition_id = e.id
   AND gt.parent_gang_type_id IS NULL
-- A house table whose gang type is missing is skipped, not made a core table.
WHERE v.gang_type IS NULL OR gt.id IS NOT NULL
ON CONFLICT (edition_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Entries
-- ---------------------------------------------------------------------------

INSERT INTO public.scenario_table_entries (edition_id, scenario_table_id, name, d6_min, d6_max)
SELECT t.edition_id, t.id, v.name, v.d6, v.d6
FROM (VALUES
    ('Deployment Table',  1, 'Sniping Range'),
    ('Deployment Table',  2, 'Face Off'),
    ('Deployment Table',  3, 'Stand Off'),
    ('Deployment Table',  4, 'Ambush'),
    ('Deployment Table',  5, 'Free For All'),
    ('Deployment Table',  6, 'Chance Encounter'),

    ('Objective Table',   1, 'King of the Hive'),
    ('Objective Table',   2, 'Turf War'),
    ('Objective Table',   3, 'Tunnel Clash'),
    ('Objective Table',   4, 'Object Lesson'),
    ('Objective Table',   5, 'Flank ''em'),
    ('Objective Table',   6, 'Burn Them Out'),

    ('Side Job Table',    1, 'Stitch ''em Up'),
    ('Side Job Table',    2, 'The Package'),
    ('Side Job Table',    3, 'Settle a Score'),
    ('Side Job Table',    4, 'Crippling Strike'),
    ('Side Job Table',    5, 'Spread Unrest'),
    ('Side Job Table',    6, 'Protect the Future'),

    ('Crew Table',        1, 'Escalating Engagement'),
    ('Crew Table',        2, 'Hold Nothing Back!'),
    ('Crew Table',        3, 'Patrol'),
    ('Crew Table',        4, 'Surprise Attack'),
    ('Crew Table',        5, 'Strike Force'),
    ('Crew Table',        6, 'Scouting Force'),

    ('Goliath Side Jobs', 1, 'Pit Fight'),
    ('Goliath Side Jobs', 2, 'Personal Vendetta'),
    ('Goliath Side Jobs', 3, 'Wreck the Place!'),
    ('Goliath Side Jobs', 4, 'Maximum Force'),
    ('Goliath Side Jobs', 5, 'Hold the Forge!'),
    ('Goliath Side Jobs', 6, 'Prove Your Worth!'),

    ('Escher Side Jobs',  1, 'Chemical Reign'),
    ('Escher Side Jobs',  2, 'Maiden, Mother, Matriarch'),
    ('Escher Side Jobs',  3, 'Hunt Together'),
    ('Escher Side Jobs',  4, 'Cut Off the Head'),
    ('Escher Side Jobs',  5, 'Experimental Chem'),
    ('Escher Side Jobs',  6, 'Murder Run')
) AS v(table_name, d6, name)
JOIN public.editions e ON e.slug = 'n26'
JOIN public.scenario_tables t
    ON t.edition_id = e.id
   AND t.name = v.table_name
ON CONFLICT (scenario_table_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Scenario crew selection rules
-- ---------------------------------------------------------------------------

INSERT INTO public.scenario_crew_selection_rules (
    scenario_table_entry_id, role, chosen_count, random_count,
    reinforcement_count, reinforcements_per_round, reinforcements_from_round
)
SELECT en.id, v.role, v.chosen_count, v.random_count,
       v.reinforcement_count, v.reinforcements_per_round, v.reinforcements_from_round
FROM (VALUES
    -- Hybrid (3+D3), Reinforcements (5), D3 a round from the first
    ('Escalating Engagement', NULL,       '3',  'D3', 5,    'D3', 1),
    -- Custom (10)
    ('Hold Nothing Back!',    NULL,       '10', '0',  NULL, NULL, NULL),
    -- Hybrid (3+4)
    ('Patrol',                NULL,       '3',  '4',  NULL, NULL, NULL),
    -- Attacker Hybrid (4+4)
    ('Surprise Attack',       'attacker', '4',  '4',  NULL, NULL, NULL),
    -- Defender Custom (3), Reinforcements (7), D3 a round from the first
    ('Surprise Attack',       'defender', '3',  '0',  7,    'D3', 1),
    -- Custom (5)
    ('Strike Force',          NULL,       '5',  '0',  NULL, NULL, NULL),
    -- Hybrid (D3+5)
    ('Scouting Force',        NULL,       'D3', '5',  NULL, NULL, NULL)
) AS v(entry_name, role, chosen_count, random_count,
       reinforcement_count, reinforcements_per_round, reinforcements_from_round)
JOIN public.editions e ON e.slug = 'n26'
JOIN public.scenario_tables t
    ON t.edition_id = e.id
   AND t.table_type = 'crew_selection'
   AND t.gang_type_id IS NULL
JOIN public.scenario_table_entries en
    ON en.scenario_table_id = t.id
   AND en.name = v.entry_name
ON CONFLICT (scenario_table_entry_id, role) DO NOTHING;

COMMIT;
