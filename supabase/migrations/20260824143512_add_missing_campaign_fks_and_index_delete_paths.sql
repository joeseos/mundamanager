-- Add missing foreign keys across the campaign_* tables, and index the
-- referencing columns on the gang delete path.
--
-- Several campaign child tables had no FK to their parent, so deleting a
-- campaign or a gang left orphaned rows behind indefinitely. Measured on
-- production before the fix (2026-08-24):
--
--   campaign_members.campaign_id      no FK    3,936 orphans (~17/day accruing)
--   campaign_territories.gang_id      no FK      674 orphans
--   campaign_battles.campaign_id      no FK      829 orphans
--   campaign_battles.attacker_id      no FK      783 orphans
--   campaign_battles.defender_id      no FK      747 orphans
--   campaign_battles.winner_id        no FK      744 orphans
--
-- campaign_members had no foreign keys at all. campaign_gangs.campaign_member_id
-- had one but with no delete action, so removing a member was blocked rather
-- than cascading.
--
-- Delete semantics follow the existing convention in this schema:
--   * a row that only exists as part of a campaign     -> ON DELETE CASCADE
--   * a nullable pointer to an actor or owner          -> ON DELETE SET NULL
--
-- The gang references are deliberately not CASCADE. A territory belongs to the
-- campaign, not to the gang holding it, so a deleted gang should release the
-- territory rather than remove it. Battle history must likewise survive a
-- participant being deleted.
--
-- APPLIED STATE: sections 1-5 were applied to production manually on 2026-08-24
-- while diagnosing the issue. Section 6 (indexes) was not. The whole file is
-- written idempotently, so `supabase db push` applies only the indexes against
-- production while reproducing the full state on a fresh or branch database.
--
-- The Supabase CLI wraps each migration in a transaction, so there is no
-- explicit BEGIN/COMMIT here. That is also why section 6 uses plain
-- CREATE INDEX rather than CONCURRENTLY, which cannot run inside one.

-- ---------------------------------------------------------------------------
-- 1. Backfill: clear orphaned references so constraint validation can pass.
--    Matches zero rows on production; load-bearing on a fresh database.
-- ---------------------------------------------------------------------------

DELETE FROM public.campaign_members m
WHERE NOT EXISTS (
  SELECT 1 FROM public.campaigns c WHERE c.id = m.campaign_id
);

DELETE FROM public.campaign_battles b
WHERE NOT EXISTS (
  SELECT 1 FROM public.campaigns c WHERE c.id = b.campaign_id
);

UPDATE public.campaign_territories t
SET gang_id = NULL
WHERE t.gang_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = t.gang_id);

UPDATE public.campaign_battles b
SET attacker_id = NULL
WHERE b.attacker_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = b.attacker_id);

UPDATE public.campaign_battles b
SET defender_id = NULL
WHERE b.defender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = b.defender_id);

UPDATE public.campaign_battles b
SET winner_id = NULL
WHERE b.winner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gangs g WHERE g.id = b.winner_id);

-- ---------------------------------------------------------------------------
-- 2. campaign_members - had no foreign keys at all
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_campaign_id_fkey,
  ADD  CONSTRAINT campaign_members_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_user_id_fkey,
  ADD  CONSTRAINT campaign_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_invited_by_fkey,
  ADD  CONSTRAINT campaign_members_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. campaign_gangs - campaign_member_id existed but had no delete action,
--    so removing a member was blocked rather than cascading
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_gangs
  DROP CONSTRAINT IF EXISTS campaign_gangs_campaign_member_id_fkey,
  ADD  CONSTRAINT campaign_gangs_campaign_member_id_fkey
    FOREIGN KEY (campaign_member_id) REFERENCES public.campaign_members(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_gangs
  DROP CONSTRAINT IF EXISTS campaign_gangs_user_id_fkey,
  ADD  CONSTRAINT campaign_gangs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_gangs
  DROP CONSTRAINT IF EXISTS campaign_gangs_invited_by_fkey,
  ADD  CONSTRAINT campaign_gangs_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. campaign_territories - a deleted gang releases the territory,
--    it does not delete it
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_territories
  DROP CONSTRAINT IF EXISTS campaign_territories_gang_id_fkey,
  ADD  CONSTRAINT campaign_territories_gang_id_fkey
    FOREIGN KEY (gang_id) REFERENCES public.gangs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. campaign_battles - the battle belongs to the campaign,
--    the participants do not
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_battles
  DROP CONSTRAINT IF EXISTS campaign_battles_campaign_id_fkey,
  ADD  CONSTRAINT campaign_battles_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_battles
  DROP CONSTRAINT IF EXISTS campaign_battles_attacker_id_fkey,
  ADD  CONSTRAINT campaign_battles_attacker_id_fkey
    FOREIGN KEY (attacker_id) REFERENCES public.gangs(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_battles
  DROP CONSTRAINT IF EXISTS campaign_battles_defender_id_fkey,
  ADD  CONSTRAINT campaign_battles_defender_id_fkey
    FOREIGN KEY (defender_id) REFERENCES public.gangs(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_battles
  DROP CONSTRAINT IF EXISTS campaign_battles_winner_id_fkey,
  ADD  CONSTRAINT campaign_battles_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES public.gangs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. Index the referencing side of the new gang foreign keys.
--
--    Continuation of 20260814135936_index_unindexed_fks_on_delete_cascade_path.
--    Postgres does not index the referencing side of a foreign key, so without
--    these every DELETE FROM gangs runs four sequential scans:
--
--      campaign_territories.gang_id    56,333 rows
--      campaign_battles.attacker_id    19,944 rows
--      campaign_battles.defender_id    19,944 rows
--      campaign_battles.winner_id      19,944 rows
--
--    Deleting a gang is a normal user action. At these row counts each index
--    build is milliseconds and takes a SHARE lock that blocks writes to the
--    table for that window only.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS campaign_territories_gang_id_idx
  ON public.campaign_territories (gang_id);

CREATE INDEX IF NOT EXISTS campaign_battles_attacker_id_idx
  ON public.campaign_battles (attacker_id);

CREATE INDEX IF NOT EXISTS campaign_battles_defender_id_idx
  ON public.campaign_battles (defender_id);

CREATE INDEX IF NOT EXISTS campaign_battles_winner_id_idx
  ON public.campaign_battles (winner_id);
