-- Battle sessions are now called live battles. Renames only change catalog
-- names: no rows are rewritten, and the realtime publication, grants, RLS
-- policies and foreign keys follow the tables.

ALTER TABLE public.battle_sessions RENAME TO live_battles;
ALTER TABLE public.battle_session_participants RENAME TO live_battle_participants;
ALTER TABLE public.battle_session_fighters RENAME TO live_battle_fighters;

ALTER TABLE public.live_battle_participants RENAME COLUMN battle_session_id TO live_battle_id;
ALTER TABLE public.live_battle_fighters RENAME COLUMN battle_session_id TO live_battle_id;
ALTER TABLE public.live_battle_fighters RENAME COLUMN session_record TO live_battle_record;

-- Constraints (renaming a primary key or unique constraint renames its index)
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_pkey TO live_battles_pkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_campaign_battle_id_fkey TO live_battles_campaign_battle_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_campaign_id_fkey TO live_battles_campaign_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_created_by_fkey TO live_battles_created_by_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_crew_selection_id_fkey TO live_battles_crew_selection_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_deployment_id_fkey TO live_battles_deployment_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_edition_id_fkey TO live_battles_edition_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_objective_id_fkey TO live_battles_objective_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_winner_gang_id_fkey TO live_battles_winner_gang_id_fkey;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_one_crew_selection_check TO live_battles_one_crew_selection_check;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_one_deployment_check TO live_battles_one_deployment_check;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_one_objective_check TO live_battles_one_objective_check;
ALTER TABLE public.live_battles RENAME CONSTRAINT battle_sessions_status_check TO live_battles_status_check;

ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_pkey TO live_battle_participants_pkey;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_battle_session_id_gang_id_key TO live_battle_participants_live_battle_id_gang_id_key;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_battle_session_id_fkey TO live_battle_participants_live_battle_id_fkey;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_gang_id_fkey TO live_battle_participants_gang_id_fkey;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_side_job_id_fkey TO live_battle_participants_side_job_id_fkey;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_user_id_fkey TO live_battle_participants_user_id_fkey;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_one_side_job_check TO live_battle_participants_one_side_job_check;
ALTER TABLE public.live_battle_participants RENAME CONSTRAINT battle_session_participants_role_check TO live_battle_participants_role_check;

ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_pkey TO live_battle_fighters_pkey;
ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_battle_session_id_fighter_id_key TO live_battle_fighters_live_battle_id_fighter_id_key;
ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_battle_session_id_fkey TO live_battle_fighters_live_battle_id_fkey;
ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_fighter_id_fkey TO live_battle_fighters_fighter_id_fkey;
ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_loadout_id_fkey TO live_battle_fighters_loadout_id_fkey;
ALTER TABLE public.live_battle_fighters RENAME CONSTRAINT battle_session_fighters_participant_id_fkey TO live_battle_fighters_participant_id_fkey;

-- Indexes
ALTER INDEX public.battle_sessions_campaign_battle_id_idx RENAME TO live_battles_campaign_battle_id_idx;
ALTER INDEX public.battle_sessions_campaign_id_idx RENAME TO live_battles_campaign_id_idx;
ALTER INDEX public.battle_sessions_created_by_idx RENAME TO live_battles_created_by_idx;
ALTER INDEX public.battle_sessions_crew_selection_id_idx RENAME TO live_battles_crew_selection_id_idx;
ALTER INDEX public.battle_sessions_deployment_id_idx RENAME TO live_battles_deployment_id_idx;
ALTER INDEX public.battle_sessions_edition_id_idx RENAME TO live_battles_edition_id_idx;
ALTER INDEX public.battle_sessions_objective_id_idx RENAME TO live_battles_objective_id_idx;
ALTER INDEX public.battle_sessions_round_idx RENAME TO live_battles_round_idx;
ALTER INDEX public.battle_sessions_status_idx RENAME TO live_battles_status_idx;
ALTER INDEX public.battle_sessions_updated_at_idx RENAME TO live_battles_updated_at_idx;
ALTER INDEX public.battle_sessions_winner_gang_id_idx RENAME TO live_battles_winner_gang_id_idx;

ALTER INDEX public.battle_session_participants_gang_idx RENAME TO live_battle_participants_gang_idx;
ALTER INDEX public.battle_session_participants_session_idx RENAME TO live_battle_participants_live_battle_idx;
ALTER INDEX public.battle_session_participants_side_job_id_idx RENAME TO live_battle_participants_side_job_id_idx;
ALTER INDEX public.battle_session_participants_user_idx RENAME TO live_battle_participants_user_idx;

ALTER INDEX public.battle_session_fighters_created_at_idx RENAME TO live_battle_fighters_created_at_idx;
ALTER INDEX public.battle_session_fighters_fighter_idx RENAME TO live_battle_fighters_fighter_idx;
ALTER INDEX public.battle_session_fighters_loadout_id_idx RENAME TO live_battle_fighters_loadout_id_idx;
ALTER INDEX public.battle_session_fighters_participant_idx RENAME TO live_battle_fighters_participant_idx;
ALTER INDEX public.battle_session_fighters_session_idx RENAME TO live_battle_fighters_live_battle_idx;

-- Policies (their expressions reference the tables by oid, so only the names change)
ALTER POLICY "Admins, arbs, creator or participants can delete battle session" ON public.live_battles
  RENAME TO "Admins, arbs, creator or participants can delete live battle";
ALTER POLICY "Admins, arbs, creator or participants can update battle session" ON public.live_battles
  RENAME TO "Admins, arbs, creator or participants can update live battle";
ALTER POLICY "Allow authenticated users to view battle sessions" ON public.live_battles
  RENAME TO "Allow authenticated users to view live battles";
ALTER POLICY "Authenticated users can create battle sessions" ON public.live_battles
  RENAME TO "Authenticated users can create live battles";

ALTER POLICY "Admins, arbs, session creator or self can delete participants" ON public.live_battle_participants
  RENAME TO "Admins, arbs, creator or self can delete participants";
ALTER POLICY "Admins, arbs, session creator or self can insert participants" ON public.live_battle_participants
  RENAME TO "Admins, arbs, creator or self can insert participants";
ALTER POLICY "Admins, arbs, session creator or self can update participants" ON public.live_battle_participants
  RENAME TO "Admins, arbs, creator or self can update participants";
ALTER POLICY "Allow authenticated users to view battle session participants" ON public.live_battle_participants
  RENAME TO "Allow authenticated users to view live battle participants";

ALTER POLICY "Allow authenticated users to view battle session fighters" ON public.live_battle_fighters
  RENAME TO "Allow authenticated users to view live battle fighters";

-- Comments that name the old tables
COMMENT ON COLUMN public.live_battle_fighters.live_battle_record IS 'Tracks xp gained and injuries added in this live battle';
COMMENT ON COLUMN public.live_battles.edition_id IS 'Ruleset the live battle is played under. Derived server-side at creation from the campaign type, or from the creating gang for skirmish live battles. Nullable: a null edition resolves to NO_CAPABILITIES in the app rather than silently serving another edition''s rules.';
COMMENT ON COLUMN public.live_battles.deployment_id IS 'N26 Deployment for this live battle. Copied to campaign_battles.deployment_id on completion.';
COMMENT ON COLUMN public.live_battles.objective_id IS 'N26 Objective for this live battle. Copied to campaign_battles.objective_id on completion.';
COMMENT ON COLUMN public.live_battles.crew_selection_id IS 'N26 Crew selection for this live battle. Its scenario_crew_selection_rules fill in the crew picker.';
COMMENT ON COLUMN public.scenario_crew_selection_rules.role IS 'Scenario role this row applies to (attacker or defender, as in live_battle_participants.role). NULL applies to both gangs.';

-- Notifications sent before the rename link to the old route and say "battle session"
UPDATE public.notifications
SET link = replace(link, '/battle-session/', '/live-battle/'),
    text = regexp_replace(text, 'a battle session\.$', 'a live battle.')
WHERE link LIKE '%/battle-session/%';

-- Old names as views, so tabs still on the previous deploy keep working. Drop
-- them in a later migration once that deploy is gone. security_invoker keeps
-- the tables' RLS policies in force for the caller.
CREATE VIEW public.battle_sessions WITH (security_invoker = true) AS
SELECT * FROM public.live_battles;

CREATE VIEW public.battle_session_participants WITH (security_invoker = true) AS
SELECT id, live_battle_id AS battle_session_id, user_id, gang_id, role, gang_rating_snapshot,
  credits_earned, reputation_change, created_at, ready, is_winner, claimed_territory,
  resource_changes, side_job_id, side_job_completed, side_job_name
FROM public.live_battle_participants;

CREATE VIEW public.battle_session_fighters WITH (security_invoker = true) AS
SELECT id, live_battle_id AS battle_session_id, participant_id, fighter_id, live_battle_record AS session_record, created_at, loadout_id
FROM public.live_battle_fighters;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_sessions, public.battle_session_participants, public.battle_session_fighters
  TO authenticated, service_role;
