-- Remove the legacy `invite` notification type.
--
-- 20260717120000_split_invite_type.sql split `invite` into campaign_invite / battle_invite
-- but kept `invite` in the CHECK so historical rows stayed valid. Nothing has emitted it
-- since, and the hourly pg_cron job delete-expired-notifications has now purged every
-- such row (count was 0 on 2026-10-08).
--
-- ADD CONSTRAINT validates existing rows, so if any `invite` row still exists this
-- migration fails rather than leaving the table in an inconsistent state. Check first:
--   SELECT count(*) FROM public.notifications WHERE type = 'invite';  -- must be 0
--
-- The list below is the one from 20260925120000_add_campaign_challenge_notification_type.sql
-- minus 'invite'.

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
        'info',
        'warning',
        'error',
        'campaign_invite',
        'friend_request',
        'battle_invite',
        'gang_invite',
        'campaign_join_request',
        'campaign_challenge'
    ]::text[]));
