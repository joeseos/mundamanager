-- Declare which kind of Hatred (X) target each Enmity injury needs.
--
-- N26 splits N23's single Bitter Enmity into three injuries that each grant
-- Hatred (X) against a different kind of target:
--
--   12  Eternal Enmity   X = the gang TYPE that took them Out of Action
--   13  Bitter Enmity    X = the GANG that took them Out of Action
--   14  Personal Enmity  X = the MODEL that took them Out of Action
--
-- Rather than hardcoding three effect names in the client and the RPC, the
-- effect TYPE row declares what it needs and both sides read it. Adding a
-- fourth Enmity later is then a data change, not a code change.
--
-- This replaces the hardcoded `effect_name <> 'Bitter Enmity'` string check in
-- supabase/functions/add_fighter_injury.sql, which had to be kept in sync with
-- BITTER_ENMITY_EFFECT_NAME in utils/bitterEnmityDisplay.ts by hand.
--
-- N23's Bitter Enmity is included so the one existing targeted injury runs
-- through the same data-driven path as the new ones — there is no legacy branch.
--
-- Values must match HatredTargetKind in utils/hatredTarget.ts.
--
-- Note this sets the key on the effect TYPE (the template). The per-instance
-- pick lands on fighter_effects.type_specific_data as hatred_target_kind/_id/
-- _name/_colour, written by the RPC. Historical Bitter Enmity instances keep
-- their older bitter_enmity_target_gang_* keys; there is deliberately no
-- backfill, and readHatredTarget() reads both shapes.
--
-- Re-runnable: `||` overwrites the key with the same value, so applying twice
-- is a no-op.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'injuries') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n23') AS n23_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS n26_id
),
assignments(effect_name, edition_slug, hatred_target) AS (
  VALUES
    ('Bitter Enmity',   'n23', 'gang'),
    ('Bitter Enmity',   'n26', 'gang'),
    ('Eternal Enmity',  'n26', 'gang_type'),
    ('Personal Enmity', 'n26', 'fighter')
)
UPDATE public.fighter_effect_types fet
SET type_specific_data =
      COALESCE(fet.type_specific_data, '{}'::jsonb)
      || jsonb_build_object('hatred_target', a.hatred_target)
FROM assignments a
CROSS JOIN target t
WHERE fet.effect_name = a.effect_name
  AND fet.fighter_effect_category_id = t.category_id
  AND fet.edition_id = CASE a.edition_slug WHEN 'n23' THEN t.n23_id ELSE t.n26_id END;

COMMIT;
