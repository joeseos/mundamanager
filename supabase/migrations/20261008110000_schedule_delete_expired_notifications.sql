-- Hourly delete of expired notifications.
--
-- This job was created directly in the database and was never in a migration, so
-- it was invisible from the repo and missing from databases built from migrations.
-- This recreates it with the same name and schedule; the command only adds the
-- public. schema prefix.
--
-- It also supersedes the note in 20260717120000_split_invite_type.sql that expired
-- notifications are only filtered out at read time: rows past expires_at are deleted
-- within the hour.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-expired-notifications') then
    perform cron.unschedule('delete-expired-notifications');
  end if;
end $$;

select cron.schedule(
  'delete-expired-notifications',
  '0 * * * *',
  $job$
    delete from public.notifications where expires_at < now();
  $job$
);
