-- A challenge round is opened by the arbitrator: one slot per accepted gang,
-- which that gang's owner later fills in by picking an opponent. Those slots
-- need a state that precedes challenge_issued, since they have no opponent yet.

ALTER TABLE public.campaign_battles DROP CONSTRAINT IF EXISTS campaign_battles_status_check;

ALTER TABLE public.campaign_battles
  ADD CONSTRAINT campaign_battles_status_check
  CHECK (status IN ('challenge_pending','challenge_issued','challenge_accepted',
                    'challenge_declined','played'));
