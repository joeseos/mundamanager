-- Accept a campaign join request atomically.
--
-- An OWNER/ARBITRATOR (or admin) accepts a pending campaign_join_requests row: the
-- requester is added as a MEMBER and the request is removed. Doing this in one
-- SECURITY DEFINER transaction gives two things the app-level version could not:
--
--   * Concurrency safety. The request row is locked FOR UPDATE, so of two
--     arbitrators accepting the same request exactly one proceeds to insert the
--     member; the other re-reads the (now deleted) row and returns 'no_request'.
--     This is what prevents duplicate campaign_members rows — that table has no
--     unique constraint on (campaign_id, user_id).
--   * No restore dance. If anything fails the whole transaction rolls back, leaving
--     the request intact for a retry — there is nothing to undo by hand.
--
-- Returns one of: 'accepted' (member added), 'already_member' (someone already
-- added them; request cleaned up), 'no_request' (nothing pending), 'not_authorized'.
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
      -- auth.uid() is the acting arbitrator even inside SECURITY DEFINER. This
      -- INSERT fires notify_campaign_member_added, sending the requester their
      -- acceptance notice ("you've been invited"), inside this same transaction.
      INSERT INTO campaign_members (campaign_id, user_id, role, invited_at, invited_by)
      VALUES (p_campaign_id, p_user_id, 'MEMBER', now(), auth.uid());
   END IF;

   DELETE FROM campaign_join_requests WHERE id = v_request_id;

   -- Clear the "wants to join" notifications this request fanned out to every
   -- OWNER/ARBITRATOR, so no stale copies linger once it is handled.
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
