-- 20260805193900 dropped xp_cost and credit_cost with IF EXISTS, but the columns
-- had already been renamed to OLDxp_cost and OLDcredit_cost, so it did nothing.
-- No code, function or view reads them.
ALTER TABLE public.skills
  DROP COLUMN IF EXISTS "OLDxp_cost",
  DROP COLUMN IF EXISTS "OLDcredit_cost";
