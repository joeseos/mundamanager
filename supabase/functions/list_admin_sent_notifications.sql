-- Replaced by notification_sends. CI deploys this file when it changes, so the
-- old history function is dropped here as well as in the migration.

DROP FUNCTION IF EXISTS public.list_admin_sent_notifications();
