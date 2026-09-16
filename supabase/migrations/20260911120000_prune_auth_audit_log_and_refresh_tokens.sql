-- Nothing prunes auth.audit_log_entries (7.1M rows, 2036 MB) or the revoked rows
-- in auth.refresh_tokens (2.8M rows, 1167 MB): GoTrue has no statement for the
-- former and its statement for the latter is gated behind GOTRUE_DB_CLEANUP_ENABLED,
-- which is off on this project.
--
-- Deletes are batched because the first runs have ~6.5M and ~2.8M rows to clear.
-- To drain that backlog, raise the cadence and put it back once runs stop
-- deleting rows (~65 runs, tracked in cron.job_run_details):
--
--   select cron.alter_job((select jobid from cron.job where jobname = 'prune-auth-audit-log'),
--                         schedule => '* * * * *');

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-auth-audit-log') then
    perform cron.unschedule('prune-auth-audit-log');
  end if;
end $$;

select cron.schedule(
  'prune-auth-audit-log',
  '20 2 * * *',
  $job$
    delete from auth.audit_log_entries a
    using (
      select id from auth.audit_log_entries
      where created_at < now() - interval '30 days'
      limit 100000
    ) d
    where a.id = d.id;
  $job$
);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-revoked-refresh-tokens') then
    perform cron.unschedule('prune-revoked-refresh-tokens');
  end if;
end $$;

-- Revoked only: an unrevoked token is a live session.
select cron.schedule(
  'prune-revoked-refresh-tokens',
  '40 2 * * *',
  $job$
    delete from auth.refresh_tokens t
    using (
      select id from auth.refresh_tokens
      where revoked is true
        and updated_at < now() - interval '7 days'
      limit 100000
      for update skip locked
    ) d
    where t.id = d.id;
  $job$
);
