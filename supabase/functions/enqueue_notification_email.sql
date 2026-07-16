-- Enqueue an email delivery for email-capable notifications.
--
-- DEPLOY ORDER: apply migration 20260716120000_notification_email.sql (which creates
-- notification_deliveries) BEFORE this trigger goes live. Once active, this trigger runs
-- on every notifications INSERT; if the delivery table did not exist, those inserts would
-- fail. (Same convention as the other notify_* triggers: table in migrations, trigger
-- here.)
--
-- This AFTER INSERT trigger on public.notifications is the single convergence point
-- for email: every producer (the notify_* triggers AND the inline server-action
-- inserts) already writes a notifications row, so hooking that INSERT covers them all
-- without touching any producer. It only performs a local INSERT into the delivery
-- outbox and never calls out to SES/HTTP, so an email/SES outage can never fail the
-- originating application action.
--
-- It gates on a COARSE capability list — the notification types that can ever be
-- emailed. This is intentionally NOT the preference check: it only avoids creating
-- skipped delivery rows (and waking the worker via the webhook) for the majority of
-- notifications, which are in-app only (info / warning / error / battle_invite). The
-- worker remains the single authority on per-user preferences + defaults, resolved at
-- send time, so a preference change AFTER enqueue is still honored.
--
-- Keep this list in step with the supportsEmail:true entries in
-- utils/notifications/email-config.ts. The UNIQUE (notification_id, channel) constraint
-- + ON CONFLICT DO NOTHING keeps it idempotent.

CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   IF NEW.type IN ('invite', 'gang_invite', 'friend_request') THEN
      INSERT INTO notification_deliveries (notification_id, user_id, channel)
      VALUES (NEW.id, NEW.receiver_id, 'email')
      ON CONFLICT (notification_id, channel) DO NOTHING;
   END IF;

   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enqueue_notification_email ON public.notifications;
CREATE TRIGGER trigger_enqueue_notification_email
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_notification_email();

REVOKE ALL ON FUNCTION public.enqueue_notification_email() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_email() TO service_role;
