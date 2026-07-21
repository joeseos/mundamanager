-- =============================================================================
-- Fighter OOA / Wreck tracking: records of fighters taken Out of Action or
-- whose vehicle was wrecked by a given fighter. Snapshots key data so history
-- survives later edits or deletions of the related fighter/gang/vehicle.
-- =============================================================================

CREATE TABLE public.fighter_ooa_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    causing_fighter_id uuid REFERENCES public.fighters(id) ON DELETE SET NULL,
    causing_gang_id uuid REFERENCES public.gangs(id) ON DELETE SET NULL,
    causing_fighter_name text,
    causing_fighter_type text;
    causing_fighter_class text,
    causing_fighter_gang_id uuid,
    causing_fighter_gang_name text,
    injured_fighter_id uuid REFERENCES public.fighters(id) ON DELETE SET NULL,
    injured_gang_id uuid REFERENCES public.gangs(id) ON DELETE SET NULL,
    injured_fighter_name text,
    injured_fighter_type text,
    injured_fighter_class text,
    injured_gang_name text,
    event_type text NOT NULL CHECK (event_type IN ('out_of_action', 'vehicle_wrecked')),
    vehicle_type text,
    vehicle_name text,
    campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
    user_id uuid DEFAULT auth.uid()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX fighter_ooa_records_causing_fighter_id_idx ON public.fighter_ooa_records(causing_fighter_id);
CREATE INDEX fighter_ooa_records_injured_fighter_id_idx ON public.fighter_ooa_records(injured_fighter_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.fighter_ooa_records ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view records (mirrors the fighters SELECT policy),
-- so the history modal works even when the related fighter/gang was deleted.
CREATE POLICY "Allow authenticated users to view fighter ooa records"
  ON public.fighter_ooa_records FOR SELECT TO authenticated USING (true);

-- Only the causing gang's owner, an admin, or a campaign arbitrator can insert.
CREATE POLICY "Gang owner, admin or arb can insert fighter ooa records"
  ON public.fighter_ooa_records FOR INSERT TO authenticated
  WITH CHECK (
    private.is_admin()
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = auth.uid())
    OR causing_gang_id IN (
      SELECT cg.gang_id FROM public.campaign_gangs cg
      WHERE cg.status = 'ACCEPTED' AND private.is_arb(cg.campaign_id)
    )
  );

-- Only the causing gang's owner, an admin, or a campaign arbitrator can delete.
CREATE POLICY "Gang owner, admin or arb can delete fighter ooa records"
  ON public.fighter_ooa_records FOR DELETE TO authenticated
  USING (
    private.is_admin()
    OR causing_gang_id IN (SELECT g.id FROM public.gangs g WHERE g.user_id = auth.uid())
    OR causing_gang_id IN (
      SELECT cg.gang_id FROM public.campaign_gangs cg
      WHERE cg.status = 'ACCEPTED' AND private.is_arb(cg.campaign_id)
    )
  );

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
