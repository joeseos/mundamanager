-- Campaign join requests: users can ask to join a campaign that has opted in
-- (campaigns.allow_join_requests), and any OWNER/ARBITRATOR accepts or declines.
--
-- Requests live in their own table rather than as PENDING campaign_members rows.
-- Every existing policy and query treats a campaign_members row's existence as
-- membership (its status column is unused), so a PENDING member row would grant
-- authority before acceptance — the same defect class fixed in
-- 20260719120000_gate_arb_gang_access_on_accepted.sql. A campaign_join_requests
-- row is referenced by no authorization logic and grants nothing.
--
-- DEPLOY ORDER: this migration must be applied BEFORE
-- supabase/functions/notify_campaign_join_request.sql auto-deploys (it inserts
-- notifications of the new type and creates a trigger on this table). Migrations
-- run ahead of function deploys in the pipeline; keep both files in the same merge.

-- 1. Per-campaign opt-in flag, editable by OWNER/ARBITRATOR via the existing
--    campaigns UPDATE policy.
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS allow_join_requests boolean NOT NULL DEFAULT false;

-- 2. Requests table. Insert/delete only — a request is immutable; acceptance
--    inserts a campaign_members row and deletes the request.
CREATE TABLE public.campaign_join_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT campaign_join_requests_campaign_user_key UNIQUE (campaign_id, user_id)
);

CREATE INDEX idx_campaign_join_requests_user_id ON public.campaign_join_requests(user_id);

ALTER TABLE public.campaign_join_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.campaign_join_requests TO authenticated;

-- Self-insert only, only into campaigns that opted in, and never while already a
-- member. campaigns and campaign_members both have USING (true) SELECT policies
-- for authenticated, so plain subqueries suffice here.
CREATE POLICY "Users can request to join campaigns that allow it"
    ON public.campaign_join_requests FOR INSERT TO authenticated
    WITH CHECK (
        (user_id = ( SELECT auth.uid() AS uid ))
        AND (EXISTS ( SELECT 1
            FROM public.campaigns c
            WHERE c.id = campaign_join_requests.campaign_id
              AND c.allow_join_requests = true ))
        AND (NOT EXISTS ( SELECT 1
            FROM public.campaign_members cm
            WHERE cm.campaign_id = campaign_join_requests.campaign_id
              AND cm.user_id = ( SELECT auth.uid() AS uid ) ))
    );

CREATE POLICY "Requester, arbitrators or admin can view join requests"
    ON public.campaign_join_requests FOR SELECT TO authenticated
    USING (
        ( SELECT private.is_admin() AS is_admin )
        OR (user_id = ( SELECT auth.uid() AS uid ))
        OR ( SELECT private.is_arb(campaign_join_requests.campaign_id) AS is_arb )
    );

-- Requester withdraws; OWNER/ARBITRATOR accepts (after inserting the member row)
-- or declines.
CREATE POLICY "Requester, arbitrators or admin can delete join requests"
    ON public.campaign_join_requests FOR DELETE TO authenticated
    USING (
        ( SELECT private.is_admin() AS is_admin )
        OR (user_id = ( SELECT auth.uid() AS uid ))
        OR ( SELECT private.is_arb(campaign_join_requests.campaign_id) AS is_arb )
    );

-- 3. Allow the new notification type emitted by notify_campaign_join_request().
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
        'info',
        'warning',
        'error',
        'invite',
        'campaign_invite',
        'friend_request',
        'battle_invite',
        'gang_invite',
        'campaign_join_request'
    ]::text[]));
