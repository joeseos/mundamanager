-- Email notifications: preference storage + delivery outbox.
--
-- Adds two tables that let action-triggered in-app notifications also be delivered
-- by email (Amazon SES) without a second notification system:
--
--   * user_notification_preferences — per-user, per-category email opt-in/out. A
--     missing row means "use the default" (defaults live in the TS config, not here).
--     The reserved category 'all' is a master email kill-switch.
--   * notification_deliveries — a transactional outbox that doubles as the durable
--     queue AND the delivery record (idempotency key, provider message id, attempts,
--     retry/backoff state). Written by an AFTER INSERT trigger on notifications; read
--     and updated only by the service-role edge-function worker.
--
-- The notifications table itself is unchanged: it stays the source of truth for
-- notification CONTENT, and users keep their existing UPDATE RLS on it. Delivery
-- state is deliberately kept in a separate service-role-only table so users cannot
-- tamper with it.

-- 1. Preferences (one row per user per category only when they override the default).
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type text NOT NULL,
    enabled           boolean NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, notification_type)
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can view their own notification preferences"
    ON public.user_notification_preferences
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can create their own notification preferences"
    ON public.user_notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can update their own notification preferences"
    ON public.user_notification_preferences
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can delete their own notification preferences"
    ON public.user_notification_preferences
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- 2. Delivery outbox = durable queue + delivery record. Service-role only (RLS
--    enabled with NO policies, so authenticated/anon see nothing; the worker uses
--    the service_role key which bypasses RLS).
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id     uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel             text NOT NULL DEFAULT 'email',
    status              text NOT NULL DEFAULT 'pending',
    provider            text,
    provider_message_id text,
    attempts            integer NOT NULL DEFAULT 0,
    last_error          text,
    next_attempt_at     timestamptz NOT NULL DEFAULT now(),
    locked_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_deliveries_status_check
        CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'abandoned')),
    CONSTRAINT notification_deliveries_channel_check
        CHECK (channel = 'email'),
    -- Idempotency: at most one email delivery record per notification. The enqueue
    -- trigger relies on this with ON CONFLICT DO NOTHING so retried/duplicate inserts
    -- never create a second email job.
    CONSTRAINT notification_deliveries_notification_channel_key
        UNIQUE (notification_id, channel)
);

-- Partial index for the worker's "due work" claim query.
CREATE INDEX IF NOT EXISTS notification_deliveries_due_idx
    ON public.notification_deliveries (next_attempt_at)
    WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
