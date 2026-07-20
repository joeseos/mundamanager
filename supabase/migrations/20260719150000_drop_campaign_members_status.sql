-- Drop the unused campaign_members.status column.
--
-- No code path has ever written it (all rows are NULL): campaign creation and
-- addMemberToCampaign insert without it, and no RLS policy or SQL function
-- references it. A handful of TypeScript queries selected it and carried the
-- NULL along, but nothing reads the value; those selects are removed in the
-- same merge.
--
-- Removing it makes the membership invariant explicit: a campaign_members row
-- IS a member — there is no pending state hiding in this table. Pending
-- membership lives in campaign_join_requests (see
-- 20260719140000_add_campaign_join_requests.sql), and pending gang consent in
-- campaign_gangs.status, which is unaffected.

ALTER TABLE public.campaign_members
    DROP COLUMN IF EXISTS status;
