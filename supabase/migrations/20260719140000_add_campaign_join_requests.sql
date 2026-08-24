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

-- 4. Atomic accept RPC. Defined here (in addition to the version-controlled copy in
--    supabase/functions/accept_campaign_join_request.sql) so it exists as soon as
--    migrations run, before the app that calls it by name deploys — same dual-definition
--    convention as check_permission. Both are CREATE OR REPLACE, so applying both is a
--    no-op. See the function file for the full rationale.
CREATE OR REPLACE FUNCTION public.accept_campaign_join_request(
    p_campaign_id uuid,
    p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
   v_request_id uuid;
   v_is_member boolean;
BEGIN
   -- Only campaign OWNER/ARBITRATOR or a site admin may accept.
   IF NOT (private.is_admin() OR private.is_arb(p_campaign_id)) THEN
      RETURN 'not_authorized';
   END IF;

   -- Lock the pending request to serialize concurrent accepts.
   SELECT id INTO v_request_id
   FROM campaign_join_requests
   WHERE campaign_id = p_campaign_id AND user_id = p_user_id
   FOR UPDATE;

   IF v_request_id IS NULL THEN
      RETURN 'no_request';
   END IF;

   SELECT EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = p_campaign_id AND user_id = p_user_id
   ) INTO v_is_member;

   IF NOT v_is_member THEN
      INSERT INTO campaign_members (campaign_id, user_id, role, invited_at, invited_by)
      VALUES (p_campaign_id, p_user_id, 'MEMBER', now(), auth.uid());
   END IF;

   DELETE FROM campaign_join_requests WHERE id = v_request_id;

   DELETE FROM notifications
   WHERE type = 'campaign_join_request'
     AND sender_id = p_user_id
     AND link = 'https://www.mundamanager.com/campaigns/' || p_campaign_id;

   IF v_is_member THEN
      RETURN 'already_member';
   END IF;
   RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_campaign_join_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_campaign_join_request(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_campaign_join_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_campaign_join_request(uuid, uuid) TO service_role;

-- 5. Drop the now-unused campaign_members.status column. No code path ever wrote it
--    (all rows are NULL) and no RLS policy or SQL function references it; the TypeScript
--    queries that selected it are removed in this same merge. Dropping it makes the
--    membership invariant explicit: a campaign_members row IS a member, with no pending
--    state hiding in the table. Pending membership lives in campaign_join_requests
--    (above); pending gang consent stays in campaign_gangs.status, which is unaffected.
ALTER TABLE public.campaign_members
    DROP COLUMN IF EXISTS status;
