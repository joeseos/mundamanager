-- Lets auth.admin.deleteUser remove a user. These foreign keys to auth.users
-- had no ON DELETE rule, so Postgres refused the delete while any row pointed
-- at the user.

-- The creator stays on campaigns and battle sessions after they leave, and
-- ownership lives in campaign_members, so the reference is cleared.
ALTER TABLE public.campaigns
  DROP CONSTRAINT campaigns_created_by_fkey,
  ADD CONSTRAINT campaigns_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.battle_sessions
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT battle_sessions_created_by_fkey,
  ADD CONSTRAINT battle_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- These rows belong to the user's own gangs and fighters.
ALTER TABLE public.battle_session_participants
  DROP CONSTRAINT battle_session_participants_user_id_fkey,
  ADD CONSTRAINT battle_session_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.fighter_loadouts
  DROP CONSTRAINT fighter_loadouts_user_id_fkey,
  ADD CONSTRAINT fighter_loadouts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.fighter_skill_access_override
  DROP CONSTRAINT fighter_skill_access_override_user_id_fkey,
  ADD CONSTRAINT fighter_skill_access_override_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Custom fighter types and custom skills had no foreign key at all, so a
-- deleted user's rows would stay behind with no owner. Cascade like the other
-- custom_* tables. No orphan rows exist today, so the constraints validate.
ALTER TABLE public.custom_fighter_types
  ADD CONSTRAINT custom_fighter_types_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.custom_skills
  ADD CONSTRAINT custom_skills_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
