-- Bootstrap: auth.users triggers that a public-schema dump cannot capture.
--
-- The trigger FUNCTIONs live in public and therefore ARE included in
-- ../schema/schema.public.sql (after a snapshot that has them). The TRIGGERs
-- themselves sit on auth.users, so a `pg_dump --schema=public` snapshot can
-- never capture them — this file recreates just the bindings after the
-- snapshot has loaded the functions.
--
-- Canonical copies:
--   ../migrations/20260525_create_handle_new_user_trigger.sql
--   ../migrations/20261111024527_onboarding_notifications.sql
--   ../functions/handle_new_user.sql
--   ../functions/stamp_first_confirmed_session.sql
-- Keep these in sync if a trigger definition ever changes.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- INSERT-time confirmed users are stamped inside handle_new_user (same
-- function that inserts public.profiles) so we do not depend on AFTER INSERT
-- trigger name order. This UPDATE trigger covers later email-confirm / first
-- sign-in. Skip the bind until the function and column exist so supabase
-- start / db reset still succeed on a dump that does not have them yet.
-- CREATE TRIGGER is EXECUTE-quoted so plpgsql does not parse NEW/OLD.
drop trigger if exists on_auth_user_first_confirmed_session on auth.users;
drop trigger if exists on_auth_user_first_confirmed_session_insert on auth.users;
drop trigger if exists on_auth_user_first_confirmed_session_update on auth.users;

do $$
begin
  if to_regprocedure('public.stamp_first_confirmed_session()') is null then
    return;
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'first_confirmed_session_at'
  ) then
    return;
  end if;

  execute $t$
    create trigger on_auth_user_first_confirmed_session_update
      after update on auth.users
      for each row
      when (
        NEW.email_confirmed_at is not null
        and NEW.last_sign_in_at is not null
        and (OLD.email_confirmed_at is null or OLD.last_sign_in_at is null)
      )
      execute function public.stamp_first_confirmed_session()
  $t$;
end $$;
