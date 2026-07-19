-- Split the overloaded `invite` notification type into campaign_invite / battle_invite.
--
-- The single `invite` type was produced by two unrelated events (campaign-member
-- invitations and battle-session invitations), so they shared one email toggle and one
-- generic subject. They are now distinct types:
--   * campaign_invite — email-eligible (see utils/notifications.ts).
--   * battle_invite    — in-app only (already allowed by the CHECK; unchanged here).
--
-- DEPLOY ORDER: this migration must be applied BEFORE the SQL-function producers that
-- emit the new values auto-deploy (deploy_supabase_functions.yml). Otherwise an INSERT of
-- type = 'campaign_invite' would violate notifications_type_check. Migrations run ahead of
-- function deploys in the pipeline; keep this file in the same merge as those producers.
--
-- The legacy `invite` value is intentionally kept in the CHECK: existing notifications
-- rows are NOT purged (retention is a soft read-time filter on the 30-day expires_at
-- default, not a delete job), so historical `invite` rows must remain valid. Remove it in
-- a later cleanup once all such rows have aged out.

-- 1. Allow campaign_invite (keep invite + battle_invite valid).
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
        'gang_invite'
    ]::text[]));

-- 2. Defensive, idempotent preference migration. If the email feature was already live and
--    any user stored a per-category preference under the old 'invite' key, move it to
--    'campaign_invite' (battle_invite is in-app only and stores no preference). A no-op when
--    no such rows exist (the feature ships on this same branch, so normally there are none).
INSERT INTO public.user_notification_preferences (user_id, notification_type, enabled, created_at, updated_at)
SELECT user_id, 'campaign_invite', enabled, created_at, now()
FROM public.user_notification_preferences
WHERE notification_type = 'invite'
ON CONFLICT (user_id, notification_type) DO NOTHING;

DELETE FROM public.user_notification_preferences
WHERE notification_type = 'invite';
