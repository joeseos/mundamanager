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
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'confirmed', 'cancelled')),
    winner_gang_id uuid REFERENCES public.gangs(id) ON DELETE SET NULL,
    note text,
    current_turn integer NOT NULL DEFAULT 1,
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
