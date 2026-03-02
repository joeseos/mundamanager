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
        CHECK (status IN ('active', 'review', 'confirmed', 'cancelled')),
    winner_gang_id uuid REFERENCES public.gangs(id) ON DELETE SET NULL,
    note text,
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
    confirmed boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(battle_session_id, gang_id)
);

-- 3. battle_session_fighters — One row per fighter in the battle
CREATE TABLE public.battle_session_fighters (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    battle_session_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES public.battle_session_participants(id) ON DELETE CASCADE,
    fighter_id uuid NOT NULL REFERENCES public.fighters(id) ON DELETE CASCADE,
    xp_earned integer DEFAULT 0 NOT NULL,
    pending_injuries jsonb DEFAULT '[]'::jsonb NOT NULL,
    out_of_action boolean DEFAULT false NOT NULL,
    note text,
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

-- =============================================================================
-- Realtime Publication
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE battle_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_session_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_session_fighters;

-- =============================================================================
-- Atomic Apply RPC: apply_battle_session_results
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_battle_session_results(in_session_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private'
AS $$
DECLARE
    v_session record;
    v_participant record;
    v_fighter record;
    v_injury jsonb;
    v_all_confirmed boolean;
    v_campaign_battle_id uuid;
    v_user_id uuid;
BEGIN
    -- Get the calling user
    v_user_id := auth.uid();

    -- 1. Lock and fetch the session
    SELECT * INTO v_session
    FROM battle_sessions
    WHERE id = in_session_id AND status = 'review'
    FOR UPDATE;

    IF v_session IS NULL THEN
        RAISE EXCEPTION 'Session not found or not in review status';
    END IF;

    -- Verify caller is the session creator
    IF v_session.created_by != v_user_id THEN
        RAISE EXCEPTION 'Only the session creator can apply results';
    END IF;

    -- 2. Verify all participants confirmed
    SELECT bool_and(confirmed) INTO v_all_confirmed
    FROM battle_session_participants
    WHERE battle_session_id = in_session_id;

    IF NOT v_all_confirmed THEN
        RAISE EXCEPTION 'Not all participants have confirmed';
    END IF;

    -- 3. If campaign battle, create campaign_battles entry
    IF v_session.campaign_id IS NOT NULL THEN
        INSERT INTO campaign_battles (
            campaign_id, scenario, winner_id, note,
            participants, created_at,
            attacker_id, defender_id
        )
        VALUES (
            v_session.campaign_id,
            v_session.scenario,
            v_session.winner_gang_id,
            v_session.note,
            (SELECT json_agg(json_build_object(
                'gang_id', bsp.gang_id::text,
                'role', bsp.role
            ))::text
            FROM battle_session_participants bsp
            WHERE bsp.battle_session_id = in_session_id),
            v_session.created_at,
            (SELECT gang_id FROM battle_session_participants
             WHERE battle_session_id = in_session_id AND role = 'attacker' LIMIT 1),
            (SELECT gang_id FROM battle_session_participants
             WHERE battle_session_id = in_session_id AND role = 'defender' LIMIT 1)
        )
        RETURNING id INTO v_campaign_battle_id;
    END IF;

    -- 4. Apply gang-level results for each participant
    FOR v_participant IN
        SELECT * FROM battle_session_participants
        WHERE battle_session_id = in_session_id
    LOOP
        -- Update gang credits, reputation, and wealth
        IF v_participant.credits_earned != 0 OR v_participant.reputation_change != 0 THEN
            UPDATE gangs SET
                credits = GREATEST(0, credits + v_participant.credits_earned),
                reputation = GREATEST(0, reputation + v_participant.reputation_change),
                wealth = GREATEST(0, wealth + v_participant.credits_earned)
            WHERE id = v_participant.gang_id;
        END IF;

        -- 5. Apply fighter-level results
        FOR v_fighter IN
            SELECT * FROM battle_session_fighters
            WHERE participant_id = v_participant.id
        LOOP
            -- Apply XP
            IF v_fighter.xp_earned > 0 THEN
                UPDATE fighters SET
                    xp = xp + v_fighter.xp_earned,
                    total_xp = total_xp + v_fighter.xp_earned
                WHERE id = v_fighter.fighter_id;
            END IF;

            -- Apply pending injuries via existing add_fighter_injury RPC
            IF v_fighter.pending_injuries IS NOT NULL
               AND jsonb_array_length(v_fighter.pending_injuries) > 0 THEN
                FOR v_injury IN SELECT * FROM jsonb_array_elements(v_fighter.pending_injuries)
                LOOP
                    PERFORM add_fighter_injury(
                        v_fighter.fighter_id,
                        (v_injury->>'fighter_effect_type_id')::uuid,
                        v_participant.user_id,
                        NULL
                    );

                    -- Handle recovery flag
                    IF (v_injury->>'send_to_recovery')::boolean THEN
                        UPDATE fighters SET recovery = true WHERE id = v_fighter.fighter_id;
                    END IF;

                    -- Handle captured flag
                    IF (v_injury->>'set_captured')::boolean THEN
                        UPDATE fighters SET captured = true WHERE id = v_fighter.fighter_id;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;

    -- 6. Mark session as confirmed
    UPDATE battle_sessions SET
        status = 'confirmed',
        campaign_battle_id = v_campaign_battle_id,
        updated_at = now()
    WHERE id = in_session_id;

    RETURN json_build_object(
        'success', true,
        'campaign_battle_id', v_campaign_battle_id
    );
END;
$$;

REVOKE ALL ON FUNCTION apply_battle_session_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_battle_session_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_battle_session_results(uuid) TO service_role;
