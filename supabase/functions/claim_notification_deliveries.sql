-- Atomically claim a batch of due email deliveries for the worker.
--
-- The email worker (send-notification-email edge function) calls this via RPC on every
-- invocation (Database Webhook or the recovery cron). FOR UPDATE SKIP LOCKED means
-- simultaneous worker runs never claim the same row, and flipping status to 'processing'
-- (with attempts++ and locked_at) makes the claim visible to the reaper branch.
--
-- Due = pending, OR a retryable failure whose backoff has elapsed, OR a row stuck in
-- 'processing' for >10 minutes (a worker that died after claiming — re-claim it).
--
-- service_role only: the worker uses the service-role key; nothing else may claim work.

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(batch_size integer DEFAULT 25)
RETURNS SETOF public.notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
   RETURN QUERY
   WITH due AS (
      SELECT id
      FROM notification_deliveries
      WHERE channel = 'email'
        AND ( status = 'pending'
           OR (status = 'failed' AND attempts < 5 AND next_attempt_at <= now())
           OR (status = 'processing' AND locked_at < now() - interval '10 minutes') )
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
   )
   UPDATE notification_deliveries d
      SET status = 'processing',
          attempts = d.attempts + 1,
          locked_at = now(),
          updated_at = now()
     FROM due
    WHERE d.id = due.id
   RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer) TO service_role;
