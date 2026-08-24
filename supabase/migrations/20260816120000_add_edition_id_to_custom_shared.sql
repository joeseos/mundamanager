-- Sharing a custom asset to a campaign is edition-sensitive, but nothing recorded or
-- enforced that: custom_shared had no edition column, the share modal listed every campaign
-- the user arbitrates, and no share action compared editions. Pin the edition on the row.
--
-- Derived from the campaign's type, never defaulted: types/edition.ts reads a missing slug
-- as n23 for display filtering only, so nothing here may invent one. Audited before writing:
-- 665 rows, 0 with a null campaign_id, 0 whose item and campaign editions conflict, and all
-- 5416 campaigns resolve to an edition -- so the backfill is total and NOT NULL is reachable
-- without a fallback.
--
-- The trigger lives here rather than in supabase/functions/ (the usual home for trigger
-- bodies) because it is what keeps NOT NULL satisfiable: applying the two separately leaves
-- a window where every insert fails.

BEGIN;

ALTER TABLE public.custom_shared
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.editions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS custom_shared_edition_id_idx
  ON public.custom_shared (edition_id);

UPDATE public.custom_shared cs
SET edition_id = ct.edition_id
FROM public.campaigns c
JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
WHERE c.id = cs.campaign_id
  AND cs.edition_id IS NULL
  AND ct.edition_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.custom_shared_set_edition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_campaign_edition uuid;
  v_item_edition uuid;
BEGIN
  IF NEW.campaign_id IS NULL THEN
    RAISE EXCEPTION 'custom_shared.campaign_id is required to resolve the share edition';
  END IF;

  SELECT ct.edition_id INTO v_campaign_edition
  FROM public.campaigns c
  JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
  WHERE c.id = NEW.campaign_id;

  SELECT COALESCE(
    (SELECT edition_id FROM public.custom_equipment     WHERE id = NEW.custom_equipment_id),
    (SELECT edition_id FROM public.custom_fighter_types WHERE id = NEW.custom_fighter_type_id),
    (SELECT edition_id FROM public.custom_gang_types    WHERE id = NEW.custom_gang_type_id),
    (SELECT edition_id FROM public.custom_trading_posts WHERE id = NEW.custom_trading_post_id),
    (SELECT t.edition_id
       FROM public.custom_skills s
       JOIN public.custom_skill_types t ON t.id = s.custom_skill_type_id
      WHERE s.id = NEW.custom_skill_id)
  ) INTO v_item_edition;

  -- A null on either side makes no claim, so it must not block: legacy rows and items whose
  -- edition was dropped by copy_custom_collection have none and stay writable.
  IF v_campaign_edition IS NOT NULL
     AND v_item_edition IS NOT NULL
     AND v_campaign_edition <> v_item_edition THEN
    RAISE EXCEPTION 'Cannot share a custom asset to a campaign from a different edition';
  END IF;

  -- Never default an unresolved edition to n23: outside display filtering an unknown
  -- edition makes no claim, so refuse rather than record one the campaign does not have.
  IF v_campaign_edition IS NULL THEN
    RAISE EXCEPTION 'Campaign % has no edition; cannot resolve the share edition', NEW.campaign_id;
  END IF;

  NEW.edition_id := v_campaign_edition;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_shared_set_edition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_shared_set_edition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_shared_set_edition() TO service_role;

DROP TRIGGER IF EXISTS custom_shared_set_edition ON public.custom_shared;
CREATE TRIGGER custom_shared_set_edition
  BEFORE INSERT OR UPDATE ON public.custom_shared
  FOR EACH ROW
  EXECUTE FUNCTION public.custom_shared_set_edition();

ALTER TABLE public.custom_shared
  ALTER COLUMN edition_id SET NOT NULL;

COMMENT ON COLUMN public.custom_shared.edition_id IS
  'Ruleset this share applies under, derived from the campaign by the '
  'custom_shared_set_edition trigger. The shared item''s own edition must not conflict.';

COMMIT;
