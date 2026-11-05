-- Refuses to delete a profile (and so an auth user) that is the OWNER of a
-- campaign, so no campaign is left without an Owner. The user hands the
-- campaign to an Arbitrator or deletes it first.
--
-- The trigger itself (prevent_campaign_owner_delete, BEFORE DELETE ON
-- public.profiles) is created by migration 20261104080000_user_delete_foreign_keys.sql.

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
