-- Database Webhook: email_deliveries INSERT -> send-notification-email.
--
-- This is the IMMEDIATE delivery path. It fires the SES worker (fire-and-forget, via
-- pg_net under supabase_functions.http_request) the moment a delivery row is enqueued,
-- so email goes out within a second rather than waiting for the recovery cron.
--
-- APPLIED MANUALLY — do NOT rely on CI for this file:
--   * deploy_supabase_functions.yml only globs supabase/functions/*.sql, not this path.
--   * supabase_schema_snapshot.yml strips supabase_functions.http_request triggers from
--     the snapshot (they embed the header secret), so it will never round-trip here.
-- Apply it in the Supabase Dashboard (Database > Webhooks) OR via psql with the secret
-- substituted. Keep the real WEBHOOK_SECRET out of source control.
--
-- Recovery fallback: a scheduled invocation of the same function sweeps the outbox even
-- if this webhook is ever missed (see supabase/webhooks/README.md).
--
-- Usage with psql (substitutes :'webhook_secret'):
--   psql "$SUPABASE_DB_URL" \
--     -v webhook_secret="$WEBHOOK_SECRET" \
--     -f supabase/webhooks/send_notification_email.sql

DROP TRIGGER IF EXISTS send_notification_email ON public.email_deliveries;

CREATE TRIGGER send_notification_email
   AFTER INSERT ON public.email_deliveries
   FOR EACH ROW
   EXECUTE FUNCTION supabase_functions.http_request(
      'https://iojoritxhpijprgkjfre.supabase.co/functions/v1/send-notification-email',
      'POST',
      -- The secret goes in x-supabase-webhook-source: the Dashboard webhook UI locks
      -- Authorization to a Supabase-managed Bearer JWT (which the function ignores), so
      -- this custom header is the standard channel for WEBHOOK_SECRET. Substitute the
      -- value when applying, or use the psql form:
      -- format('{"Content-Type":"application/json","x-supabase-webhook-source":"%s"}', :'webhook_secret')
      '{"Content-Type":"application/json","x-supabase-webhook-source":"<WEBHOOK_SECRET>"}',
      '{}',
      '5000'
   );
