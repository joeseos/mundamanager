-- =============================================================================
-- Battle Mode: Create battle session tables
-- =============================================================================

-- 1. battle_sessions — One row per battle session
CREATE TABLE public.battle_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
    scenario text,
    status text NOT NULL DEFAULT 'pre_battle'
        CHECK (status IN ('pre_battle', 'active', 'completed')),
    winner_gang_id uuid REFERENCES public.gangs(id) ON DELETE SET NULL,
    round integer NOT NULL DEFAULT 1,
    campaign_battle_id uuid REFERENCES public.campaign_battles(id) ON DELETE SET NULL
);

-- 2. battle_session_participants — One row per gang in the battle
CREATE TABLE public.battle_session_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    battle_session_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    gang_id uuid NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'none'
        CHECK (role IN ('attacker', 'defender', 'none')),
    gang_rating_snapshot integer,
    credits_earned integer DEFAULT 0 NOT NULL,
    reputation_change integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(battle_session_id, gang_id)
);

-- 3. battle_session_fighters — One row per fighter in the battle
CREATE TABLE public.battle_session_fighters (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    battle_session_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES public.battle_session_participants(id) ON DELETE CASCADE,
    fighter_id uuid NOT NULL REFERENCES public.fighters(id) ON DELETE CASCADE,
    loadout_id uuid REFERENCES public.fighter_loadouts(id) ON DELETE SET NULL,
    session_record jsonb DEFAULT '{"xp_earned": 0, "injuries": [], "conditions": []}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(battle_session_id, fighter_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX battle_sessions_status_idx ON public.battle_sessions(status);
CREATE INDEX battle_sessions_created_by_idx ON public.battle_sessions(created_by);
CREATE INDEX battle_sessions_campaign_id_idx ON public.battle_sessions(campaign_id);
CREATE INDEX battle_session_participants_session_idx ON public.battle_session_participants(battle_session_id);
CREATE INDEX battle_session_participants_user_idx ON public.battle_session_participants(user_id);
CREATE INDEX battle_session_fighters_session_idx ON public.battle_session_fighters(battle_session_id);
CREATE INDEX battle_session_fighters_participant_idx ON public.battle_session_fighters(participant_id);
CREATE INDEX battle_session_fighters_fighter_idx ON public.battle_session_fighters(fighter_id);
CREATE INDEX battle_sessions_campaign_battle_id_idx ON public.battle_sessions(campaign_battle_id);
CREATE INDEX battle_sessions_winner_gang_id_idx ON public.battle_sessions(winner_gang_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_session_fighters ENABLE ROW LEVEL SECURITY;

-- battle_sessions policies
CREATE POLICY "Allow authenticated users to view battle sessions"
  ON public.battle_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Campaign members can create battle sessions"
  ON public.battle_sessions FOR INSERT TO authenticated
  WITH CHECK (
    private.is_admin() OR private.is_arb(campaign_id)
    OR campaign_id IN (SELECT cm.campaign_id FROM campaign_members cm WHERE cm.user_id = auth.uid())
  );

CREATE POLICY "Admins, arbs, creator or participants can update battle session"
  ON public.battle_sessions FOR UPDATE TO authenticated
  USING (
    private.is_admin() OR private.is_arb(campaign_id)
    OR created_by = auth.uid()
    OR id IN (SELECT bsp.battle_session_id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  )
  WITH CHECK (
    private.is_admin() OR private.is_arb(campaign_id)
    OR created_by = auth.uid()
    OR id IN (SELECT bsp.battle_session_id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  );

CREATE POLICY "Admins, arbs or creator can delete battle sessions"
  ON public.battle_sessions FOR DELETE TO authenticated
  USING (private.is_admin() OR private.is_arb(campaign_id) OR created_by = auth.uid());

-- battle_session_participants policies
CREATE POLICY "Allow authenticated users to view battle session participants"
  ON public.battle_session_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins, arbs, session creator or self can insert participants"
  ON public.battle_session_participants FOR INSERT TO authenticated
  WITH CHECK (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE bs.created_by = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins, arbs, session creator or self can update participants"
  ON public.battle_session_participants FOR UPDATE TO authenticated
  USING (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE bs.created_by = auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE bs.created_by = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins, arbs, session creator or self can delete participants"
  ON public.battle_session_participants FOR DELETE TO authenticated
  USING (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE bs.created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- battle_session_fighters policies
CREATE POLICY "Allow authenticated users to view battle session fighters"
  ON public.battle_session_fighters FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins, arbs or own participant can insert fighters"
  ON public.battle_session_fighters FOR INSERT TO authenticated
  WITH CHECK (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR participant_id IN (SELECT bsp.id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  );

CREATE POLICY "Admins, arbs or own participant can update fighters"
  ON public.battle_session_fighters FOR UPDATE TO authenticated
  USING (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR participant_id IN (SELECT bsp.id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  )
  WITH CHECK (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR participant_id IN (SELECT bsp.id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  );

CREATE POLICY "Admins, arbs or own participant can delete fighters"
  ON public.battle_session_fighters FOR DELETE TO authenticated
  USING (
    private.is_admin()
    OR battle_session_id IN (SELECT bs.id FROM battle_sessions bs WHERE private.is_arb(bs.campaign_id))
    OR participant_id IN (SELECT bsp.id FROM battle_session_participants bsp WHERE bsp.user_id = auth.uid())
  );

-- =============================================================================
-- Realtime
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE battle_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_session_fighters;

-- Required so filtered realtime subscriptions receive UPDATE/DELETE events
ALTER TABLE battle_sessions REPLICA IDENTITY FULL;
ALTER TABLE battle_session_fighters REPLICA IDENTITY FULL;
