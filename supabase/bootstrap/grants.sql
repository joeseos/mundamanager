-- Bootstrap: restore the standard Supabase public-schema grants
--
-- The schema snapshot is dumped with `--no-privileges`, so every GRANT is
-- stripped out of ../schema/schema.public.sql. On the hosted project these
-- grants already exist, but a freshly loaded local database ends up with tables
-- that the API roles cannot see, which makes PostgREST return empty/forbidden
-- for everything. This re-applies the grants Supabase normally sets up so the
-- local API behaves like production. Row Level Security still gates actual row
-- access — these are the coarse schema/role grants RLS is evaluated on top of.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- profiles: users may only write their own username, never user_role.
-- Same as supabase/migrations/20261023110000_restrict_profiles_column_grants.sql.
revoke insert, update, truncate, references, trigger on table public.profiles from public, anon, authenticated;
grant update (username, updated_at) on table public.profiles to authenticated;
grant insert (id, username) on table public.profiles to authenticated;

-- The blanket GRANT ALL ON ALL ROUTINES above would otherwise let a signed-in
-- user POST /rest/v1/rpc/enqueue_onboarding_notifications (SECURITY DEFINER,
-- emails due profiles). Same revoke as the onboarding migration / function file.
-- to_regprocedure so a dump from before that RPC existed still seeds cleanly.
-- stamp_first_confirmed_session is loaded from sql_paths before this file, so
-- it needs the same clamp even when the snapshot does not yet contain it.
do $$
begin
  if to_regprocedure('public.enqueue_onboarding_notifications()') is not null then
    execute 'revoke all on function public.enqueue_onboarding_notifications() from public';
    execute 'revoke execute on function public.enqueue_onboarding_notifications() from anon, authenticated';
    execute 'grant execute on function public.enqueue_onboarding_notifications() to service_role';
  end if;
  if to_regprocedure('public.stamp_first_confirmed_session()') is not null then
    execute 'revoke all on function public.stamp_first_confirmed_session() from public';
    execute 'revoke execute on function public.stamp_first_confirmed_session() from anon, authenticated';
    execute 'grant execute on function public.stamp_first_confirmed_session() to service_role';
  end if;
end $$;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
