BEGIN;

-- ============================================================================
-- SCENARIO TABLES
-- N26 has no scenarios to pick from. A challenge generates one by rolling a D6
-- on each of four tables: the challenger rolls Deployment and Objective, each
-- player rolls a Side Job, and the challenged player rolls Crew. The six n26
-- rows in public.scenarios are the Deployment table under another name; they
-- stay until the battle log and battle session pickers read these tables.
--
-- Shaped like tactics_cards_packs -> tactics_cards. Each row is one printed
-- table, so D6 bands overlap between tables by design and every lookup must be
-- scoped to one table.
--
-- gang_type_id NULL = the edition's core table for that table_type, offered to
-- every gang. A value restricts the table to that gang type: "a Goliath gang
-- may generate their Side Jobs from the table below instead of the one
-- presented in the Core Rulebook". Alternate house lists reach their house's
-- tables through gang_types.parent_gang_type_id, so House Goliath needs one
-- table row, not one per replacement list.
--
-- One entries table serves all four table types: they share one shape, and
-- house tables, the battle columns and later campaign customisation (the
-- Arbitrator's toolkit) then have one place to point at.
-- ============================================================================

CREATE TABLE public.scenario_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    edition_id uuid NOT NULL,
    gang_type_id uuid,
    table_type text NOT NULL,
    name text NOT NULL,

    CONSTRAINT scenario_tables_edition_id_fkey
        FOREIGN KEY (edition_id)
        REFERENCES public.editions(id)
        ON DELETE RESTRICT,

    CONSTRAINT scenario_tables_gang_type_id_fkey
        FOREIGN KEY (gang_type_id)
        REFERENCES public.gang_types(id)
        ON DELETE CASCADE,

    -- Locks a table to its gang type's edition. MATCH SIMPLE, so a core table
    -- (null gang type) is left unchecked, which is what we want.
    CONSTRAINT scenario_tables_gang_type_edition_fkey
        FOREIGN KEY (gang_type_id, edition_id)
        REFERENCES public.gang_types (id, edition_id)
        ON UPDATE CASCADE,

    CONSTRAINT scenario_tables_table_type_check
        CHECK (table_type IN ('deployment', 'objective', 'side_job', 'crew_selection')),

    CONSTRAINT scenario_tables_edition_id_name_key
        UNIQUE (edition_id, name),

    -- Target for the scenario_table_entries composite FK below.
    CONSTRAINT scenario_tables_id_edition_id_key
        UNIQUE (id, edition_id)
);

COMMENT ON COLUMN public.scenario_tables.gang_type_id IS
    'Gang type this table belongs to. NULL is the edition''s core table for its '
    'table_type, offered to every gang. A value also covers that type''s '
    'alternate lists via gang_types.parent_gang_type_id.';

COMMENT ON COLUMN public.scenario_tables.table_type IS
    'Which of the four scenario generation tables this is: deployment, '
    'objective, side_job or crew_selection.';

-- At most one core table per type per edition, so "the default" is never ambiguous.
CREATE UNIQUE INDEX scenario_tables_edition_core_uidx
    ON public.scenario_tables (edition_id, table_type)
    WHERE gang_type_id IS NULL;

-- gang_type_id is an ON DELETE CASCADE path.
CREATE INDEX scenario_tables_gang_type_id_idx
    ON public.scenario_tables (gang_type_id);


-- ============================================================================
-- SCENARIO TABLE ENTRIES
-- One line of a scenario table: a Deployment, Objective, Side Job or Crew
-- selection. Rules text is not stored here.
-- ============================================================================

CREATE TABLE public.scenario_table_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    edition_id uuid NOT NULL,
    scenario_table_id uuid NOT NULL,
    name text NOT NULL,
    d6_min smallint NOT NULL,
    d6_max smallint NOT NULL,

    CONSTRAINT scenario_table_entries_edition_id_fkey
        FOREIGN KEY (edition_id)
        REFERENCES public.editions(id)
        ON DELETE RESTRICT,

    CONSTRAINT scenario_table_entries_scenario_table_id_fkey
        FOREIGN KEY (scenario_table_id)
        REFERENCES public.scenario_tables(id)
        ON DELETE RESTRICT,

    -- Keeps an entry and its table in the same edition.
    CONSTRAINT scenario_table_entries_table_edition_fkey
        FOREIGN KEY (scenario_table_id, edition_id)
        REFERENCES public.scenario_tables (id, edition_id)
        ON UPDATE CASCADE,

    CONSTRAINT scenario_table_entries_d6_order_check
        CHECK (d6_min <= d6_max),

    -- Leads with scenario_table_id, so it also serves as that FK's index.
    CONSTRAINT scenario_table_entries_scenario_table_id_name_key
        UNIQUE (scenario_table_id, name)
);


-- ============================================================================
-- CREW SELECTION RULES
-- How a crew_selection entry builds each gang's starting crew, so the battle
-- session crew picker can be filled in from the rolled entry. One row per
-- side: role NULL covers both gangs; Surprise Attack has an attacker row and a
-- defender row instead.
--
-- Counts are dice notation ('10', 'D3', 'D3+1') because the tables mix fixed
-- and rolled numbers. The method is not stored, it follows from the counts:
-- chosen only is Custom (X), random only is Random (X), both is Hybrid (X+Y).
-- ============================================================================

CREATE TABLE public.crew_selection_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    scenario_table_entry_id uuid NOT NULL,
    role text,
    chosen_count text DEFAULT '0' NOT NULL,
    random_count text DEFAULT '0' NOT NULL,
    reinforcement_count smallint,
    reinforcements_per_round text,
    reinforcements_from_round smallint,

    CONSTRAINT crew_selection_rules_scenario_table_entry_id_fkey
        FOREIGN KEY (scenario_table_entry_id)
        REFERENCES public.scenario_table_entries(id)
        ON DELETE CASCADE,

    CONSTRAINT crew_selection_rules_role_check
        CHECK (role IN ('attacker', 'defender')),

    -- The battle session parses these, so a malformed value is rejected here
    -- rather than surfacing mid-battle.
    CONSTRAINT crew_selection_rules_dice_format_check
        CHECK (
            chosen_count ~ '^([0-9]+|[0-9]*D[0-9]+(\+[0-9]+)?)$'
            AND random_count ~ '^([0-9]+|[0-9]*D[0-9]+(\+[0-9]+)?)$'
            AND (reinforcements_per_round IS NULL
                 OR reinforcements_per_round ~ '^([0-9]+|[0-9]*D[0-9]+(\+[0-9]+)?)$')
        ),

    -- The Reinforcements (X) rule is all or nothing.
    CONSTRAINT crew_selection_rules_reinforcements_check
        CHECK (
            (reinforcement_count IS NULL) = (reinforcements_per_round IS NULL)
            AND (reinforcement_count IS NULL) = (reinforcements_from_round IS NULL)
        ),

    -- Leads with scenario_table_entry_id, so it also serves as that FK's index.
    CONSTRAINT crew_selection_rules_scenario_table_entry_id_role_key
        UNIQUE NULLS NOT DISTINCT (scenario_table_entry_id, role)
);

COMMENT ON COLUMN public.crew_selection_rules.role IS
    'Scenario role this row applies to (attacker or defender, as in '
    'battle_session_participants.role). NULL applies to both gangs.';

COMMENT ON COLUMN public.crew_selection_rules.chosen_count IS
    'Fighters the player picks: the X of Custom (X), or of Hybrid (X+Y).';

COMMENT ON COLUMN public.crew_selection_rules.random_count IS
    'Fighters drawn at random after the picks: the X of Random (X), or the Y of Hybrid (X+Y).';

COMMENT ON COLUMN public.crew_selection_rules.reinforcement_count IS
    'The X of the Reinforcements (X) rule. NULL when the rule is not in play.';

COMMENT ON COLUMN public.crew_selection_rules.reinforcements_per_round IS
    'Reinforcements arriving each round, in dice notation (''D3'').';

COMMENT ON COLUMN public.crew_selection_rules.reinforcements_from_round IS
    'First round reinforcements arrive in.';


-- ============================================================================
-- RLS: SCENARIO TABLES, ENTRIES AND CREW SELECTION RULES
-- Same shape as tactics_cards_packs: readable by any authenticated user,
-- written by admins only.
-- ============================================================================

ALTER TABLE public.scenario_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view scenario tables"
    ON public.scenario_tables
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create scenario tables"
    ON public.scenario_tables
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can update scenario tables"
    ON public.scenario_tables
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    )
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can delete scenario tables"
    ON public.scenario_tables
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );

ALTER TABLE public.scenario_table_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view scenario table entries"
    ON public.scenario_table_entries
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create scenario table entries"
    ON public.scenario_table_entries
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can update scenario table entries"
    ON public.scenario_table_entries
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    )
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can delete scenario table entries"
    ON public.scenario_table_entries
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );

ALTER TABLE public.crew_selection_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view crew selection rules"
    ON public.crew_selection_rules
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create crew selection rules"
    ON public.crew_selection_rules
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can update crew selection rules"
    ON public.crew_selection_rules
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    )
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can delete crew selection rules"
    ON public.crew_selection_rules
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );


-- ============================================================================
-- BATTLES -> SCENARIO TABLE ENTRIES
-- The generated scenario, recorded on the battle log and on the battle
-- session, which copies it into the log when it completes (as it does
-- scenario). Deployment, Objective and Crew are one per battle; a Side Job is
-- one per gang, so it sits with that gang's participant data.
--
-- Nothing here checks that deployment_id names a deployment, that the entry
-- is in the battle's edition, or that a gang may use a house table. The
-- server action that writes the battle checks all three together.
--
-- ON DELETE RESTRICT: an entry a battle has recorded cannot be deleted, so
-- battle history never silently loses its scenario. The one gap is a side job
-- on a campaign battle: participants is JSON, so no FK sees it.
--
-- scenario stays. On n23 it is still the scenario; on n26 it is free text for
-- a battle played outside the tables. Existing n26 logs are backfilled from it
-- when the app code that reads these columns ships.
--
-- Statements are guarded like 20260824120000: the migrations directory is not
-- a reliable record of what production has.
-- ============================================================================

ALTER TABLE public.campaign_battles
    ADD COLUMN IF NOT EXISTS deployment_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS objective_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS crew_selection_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.campaign_battles.deployment_id IS
    'N26 Deployment rolled for this battle: a scenario_table_entries row of a deployment table.';

COMMENT ON COLUMN public.campaign_battles.objective_id IS
    'N26 Objective rolled for this battle: a scenario_table_entries row of an objective table.';

COMMENT ON COLUMN public.campaign_battles.crew_selection_id IS
    'N26 Crew selection rolled for this battle: a scenario_table_entries row of a crew_selection table.';

COMMENT ON COLUMN public.campaign_battles.participants IS
    'One object per gang: gang_id and role (attacker, defender or none: a '
    'scenario role), with optional is_winner and claimed_territory, and on n26 '
    'optional side_job_id (a scenario_table_entries row of a side_job table) and '
    'side_job_completed.';

ALTER TABLE public.battle_sessions
    ADD COLUMN IF NOT EXISTS deployment_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS objective_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS crew_selection_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.battle_sessions.deployment_id IS
    'N26 Deployment for this session. Copied to campaign_battles.deployment_id on completion.';

COMMENT ON COLUMN public.battle_sessions.objective_id IS
    'N26 Objective for this session. Copied to campaign_battles.objective_id on completion.';

COMMENT ON COLUMN public.battle_sessions.crew_selection_id IS
    'N26 Crew selection for this session. Its crew_selection_rules fill in the crew picker.';

ALTER TABLE public.battle_session_participants
    ADD COLUMN IF NOT EXISTS side_job_id uuid
        REFERENCES public.scenario_table_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS side_job_completed boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.battle_session_participants.side_job_id IS
    'N26 Side Job this gang rolled: a scenario_table_entries row of the core '
    'side_job table or of its house''s. Copied into campaign_battles.participants '
    'on completion.';

-- Every new column is an ON DELETE RESTRICT path from scenario_table_entries.
-- Partial: n23 battles leave them NULL, and the RESTRICT lookup is an equality
-- match that the partial index still serves.
CREATE INDEX IF NOT EXISTS campaign_battles_deployment_id_idx
    ON public.campaign_battles (deployment_id) WHERE deployment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_battles_objective_id_idx
    ON public.campaign_battles (objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_battles_crew_selection_id_idx
    ON public.campaign_battles (crew_selection_id) WHERE crew_selection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS battle_sessions_deployment_id_idx
    ON public.battle_sessions (deployment_id) WHERE deployment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS battle_sessions_objective_id_idx
    ON public.battle_sessions (objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS battle_sessions_crew_selection_id_idx
    ON public.battle_sessions (crew_selection_id) WHERE crew_selection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS battle_session_participants_side_job_id_idx
    ON public.battle_session_participants (side_job_id) WHERE side_job_id IS NOT NULL;

COMMIT;
