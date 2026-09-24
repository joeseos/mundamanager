-- Allow the campaign_challenge notification type, sent to a gang's owner when
-- another gang challenges it in a campaign battle (email-eligible, see
-- utils/notifications.ts).
--
-- DEPLOY ORDER: apply BEFORE the application code that inserts
-- type = 'campaign_challenge' ships, or those inserts violate the CHECK.

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
        'campaign_join_request',
        'campaign_challenge'
    ]::text[]));
