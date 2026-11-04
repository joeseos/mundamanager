-- Lets auth.admin.deleteUser remove a user. These foreign keys to auth.users
-- had no ON DELETE rule, so Postgres refused the delete while any row pointed
-- at the user.
--
-- Safe to run again: every step drops what it replaces first.

-- The creator stays on campaigns and battle sessions after they leave, and
-- ownership lives in campaign_members, so the reference is cleared.
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_created_by_fkey,
  ADD CONSTRAINT campaigns_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.battle_sessions
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS battle_sessions_created_by_fkey,
  ADD CONSTRAINT battle_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- A participant row is the gang owner's (set from gangs.user_id), and goes
-- with their gang.
ALTER TABLE public.battle_session_participants
  DROP CONSTRAINT IF EXISTS battle_session_participants_user_id_fkey,
  ADD CONSTRAINT battle_session_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_id here is whoever saved the row, which can be an Arbitrator editing
-- another player's fighter, so the row stays with the fighter.
ALTER TABLE public.fighter_loadouts
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS fighter_loadouts_user_id_fkey,
  ADD CONSTRAINT fighter_loadouts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fighter_skill_access_override
  DROP CONSTRAINT IF EXISTS fighter_skill_access_override_user_id_fkey,
  ADD CONSTRAINT fighter_skill_access_override_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Out of Action records hold whoever recorded them (DEFAULT auth.uid()), often
-- not the owner of either gang, and are campaign history for both sides. They
-- had CASCADE, so a deleted account took other players' records with it.
ALTER TABLE public.fighter_ooa_records
  DROP CONSTRAINT IF EXISTS fighter_ooa_records_user_id_fkey,
  ADD CONSTRAINT fighter_ooa_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Custom fighter types and custom skills had no foreign key at all, so a
-- deleted user's rows would stay behind with no owner. Cascade like the other
-- custom_* tables. No orphan rows exist today, so the constraints validate.
ALTER TABLE public.custom_fighter_types
  DROP CONSTRAINT IF EXISTS custom_fighter_types_user_id_fkey,
  ADD CONSTRAINT custom_fighter_types_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.custom_skills
  DROP CONSTRAINT IF EXISTS custom_skills_user_id_fkey,
  ADD CONSTRAINT custom_skills_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- A campaign Owner can't be deleted until they hand the campaign to an
-- Arbitrator or delete it, so no campaign is left without an Owner. The app
-- checks first for a friendly message; this makes it hold for every delete
-- path (a race, a duplicate membership row, the Supabase dashboard).
-- Same as supabase/functions/prevent_campaign_owner_delete.sql.
CREATE OR REPLACE FUNCTION public.prevent_campaign_owner_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaign_members WHERE user_id = OLD.id AND role = 'OWNER') THEN
    RAISE EXCEPTION 'User % is the Owner of a campaign', OLD.id
      USING HINT = 'Hand the campaign over to an Arbitrator or delete it first.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_campaign_owner_delete ON public.profiles;
CREATE TRIGGER prevent_campaign_owner_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_owner_delete();

-- Deleting a custom fighter type sets fighters.custom_fighter_type_id to NULL,
-- which without an index scans all fighters (about 0.5 s each). An account
-- with 132 custom fighter types would take over a minute; this keeps each
-- lookup instant. Partial, since almost every fighter has no custom type.
CREATE INDEX IF NOT EXISTS fighters_custom_fighter_type_id_idx
  ON public.fighters (custom_fighter_type_id)
  WHERE custom_fighter_type_id IS NOT NULL;
