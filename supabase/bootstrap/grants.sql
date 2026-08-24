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

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
