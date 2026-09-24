-- The UPDATE policy was added to 20260721120000_create_fighter_ooa_records.sql
-- after it had been applied, so editing an OOA / wreck record matched 0 rows.
-- Same check as the table's INSERT and DELETE policies.

BEGIN;

DROP POLICY IF EXISTS "Gang owner, admin or arb can update fighter ooa records" ON public.fighter_ooa_records;

-- Only the causing gang's owner, an admin, or a campaign arbitrator can update.
CREATE POLICY "Gang owner, admin or arb can update fighter ooa records"
  ON public.fighter_ooa_records FOR UPDATE TO authenticated
  USING (
    private.is_admin()
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = auth.uid())
    OR causing_gang_id IN (
      SELECT cg.gang_id FROM public.campaign_gangs cg
      WHERE cg.status = 'ACCEPTED' AND private.is_arb(cg.campaign_id)
    )
  )
  WITH CHECK (
    private.is_admin()
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = auth.uid())
    OR causing_gang_id IN (
      SELECT cg.gang_id FROM public.campaign_gangs cg
      WHERE cg.status = 'ACCEPTED' AND private.is_arb(cg.campaign_id)
    )
  );

COMMIT;
