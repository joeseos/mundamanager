-- Delete a gang invite's notification once its PENDING campaign_gangs row is gone
-- (declined, removed by an arbitrator, member removed, gang or campaign deleted).
-- Otherwise the gang owner keeps Accept/Decline buttons that can only fail, and
-- actionable notifications have no delete button.
-- Matches the notification exactly as notify_gang_invite() created it.
CREATE OR REPLACE FUNCTION public.cleanup_gang_invite_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- the notification belongs to the gang owner, not whoever removed the row
SET search_path = public
AS $$
BEGIN
  DELETE FROM notifications
  WHERE type = 'gang_invite'
    AND receiver_id = OLD.user_id
    AND link = 'https://www.mundamanager.com/campaigns/' || OLD.campaign_id || '?gangId=' || OLD.gang_id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_gang_invite_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_gang_invite_notification() FROM anon, authenticated;

DROP TRIGGER IF EXISTS cleanup_gang_invite_notification ON public.campaign_gangs;
CREATE TRIGGER cleanup_gang_invite_notification
  AFTER DELETE ON public.campaign_gangs
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING')
  EXECUTE FUNCTION public.cleanup_gang_invite_notification();

-- One-off: clear gang invite notifications left behind before this trigger existed
-- (no PENDING row backs them, so answering them can only fail).
DELETE FROM public.notifications n
WHERE n.type = 'gang_invite'
  AND NOT EXISTS (
    SELECT 1
    FROM public.campaign_gangs cg
    WHERE cg.status = 'PENDING'
      AND cg.user_id = n.receiver_id
      AND n.link = 'https://www.mundamanager.com/campaigns/' || cg.campaign_id || '?gangId=' || cg.gang_id
  );
