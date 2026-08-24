-- Battle logs gain a lifecycle so a battle can start as a challenge and be
-- converted in place into its battle report, instead of only ever being
-- recorded after the fact.
--
-- A challenge is a state of a battle log rather than its own entity, so one
-- list holds both pending challenges and played battles. Phase (Occupation /
-- Takeover) is deliberately not modelled; the challenger just nominates the
-- territory they stake.
--
-- Additive and inert until application code writes a non-'played' status.
-- Statements are individually guarded: the migrations directory is not a
-- reliable record of what production has (20260522120000 was never applied,
-- attacker_id/defender_id are still live).

ALTER TABLE public.campaign_battles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'played';

-- The default makes the existing rows correct without a backfill pass.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_battles_status_check'
      AND conrelid = 'public.campaign_battles'::regclass
  ) THEN
    ALTER TABLE public.campaign_battles
      ADD CONSTRAINT campaign_battles_status_check
      CHECK (status IN ('challenge_issued','challenge_accepted','challenge_declined','played'));
  END IF;
END $$;

COMMENT ON COLUMN public.campaign_battles.status IS
  'Lifecycle of the battle log. Challenges start at challenge_issued and become played once '
  'the report is filed. Battles logged directly are born played.';

-- Kept out of participants: role there is attacker/defender, a scenario role,
-- and the challenger may end up the defender. These also back the
-- accept/decline permission check, which wants an indexed uuid rather than a
-- scan of stringified JSON.
ALTER TABLE public.campaign_battles
  ADD COLUMN IF NOT EXISTS challenger_gang_id uuid
    REFERENCES public.gangs(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_battles
  ADD COLUMN IF NOT EXISTS challenged_gang_id uuid
    REFERENCES public.gangs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaign_battles_challenger_gang_id_idx
  ON public.campaign_battles (challenger_gang_id);

CREATE INDEX IF NOT EXISTS campaign_battles_challenged_gang_id_idx
  ON public.campaign_battles (challenged_gang_id);

CREATE INDEX IF NOT EXISTS campaign_battles_campaign_id_status_idx
  ON public.campaign_battles (campaign_id, status);

-- Seeds the cycle on newly issued challenges. campaign_battles.cycle stays the
-- authoritative per-battle value.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS current_cycle integer;

-- No RLS changes needed: SELECT is already USING (true), INSERT already admits
-- any campaign member, and UPDATE already admits any gang owner in
-- participants. "Only the challenged gang may answer" is enforced in the
-- server action.
