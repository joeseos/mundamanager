-- Campaign trading, RAW-first (N17–N23 Trading Captive Models, N26 ransom,
-- guild ransoms). Equipment uses the same rows. Slice 1 is plumbing —
-- flag, tables, SELECT for members, INSERT/UPDATE/DELETE for admins.
-- Player mutations arrive later as a single accept action (and create /
-- decline / cancel).
--
-- Two tables: a trade (direct deal, open listing, or bid) and the items each
-- gang gives. A bid is a trade whose parent_trade_id points at the listing.
-- locked plus partial unique indexes are the live lock. Item FKs SET NULL so
-- an accepted trade keeps its row (name in description) if the captive later
-- dies or the item is sold. While locked, the ids are still required, so a
-- pending listing cannot lose its subject.

BEGIN;

-- 1. Per-campaign opt-in flag, editable by OWNER/ARBITRATOR via the existing
--    campaigns UPDATE policy (same path as allow_join_requests).
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS allow_trading boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.allow_trading IS
  'When true, owners of gangs in this campaign can propose and accept trades. A trade completes only when the counterparty (or listing author) accepts.';

-- 2. Trades. parent_trade_id is null for a direct deal or an open listing;
--    set on a bid. counterparty_gang_id is null on an open listing (any gang
--    in the campaign can bid); set on a direct deal and on every bid.
CREATE TABLE public.campaign_trades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    resolved_at timestamp with time zone,
    campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    proposer_gang_id uuid NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
    counterparty_gang_id uuid REFERENCES public.gangs(id) ON DELETE CASCADE,
    parent_trade_id uuid,
    title varchar(100) NOT NULL,
    note text,
    status text NOT NULL DEFAULT 'pending',
    CONSTRAINT campaign_trades_status_check
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    CONSTRAINT campaign_trades_title_length
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
    CONSTRAINT campaign_trades_not_self
        CHECK (parent_trade_id IS DISTINCT FROM id),
    CONSTRAINT campaign_trades_not_own_counterparty
        CHECK (counterparty_gang_id IS NULL OR proposer_gang_id <> counterparty_gang_id),
    CONSTRAINT campaign_trades_bid_has_counterparty
        CHECK (parent_trade_id IS NULL OR counterparty_gang_id IS NOT NULL),
    CONSTRAINT campaign_trades_id_campaign_id_key
        UNIQUE (id, campaign_id),
    CONSTRAINT campaign_trades_parent_campaign_fkey
        FOREIGN KEY (parent_trade_id, campaign_id)
        REFERENCES public.campaign_trades (id, campaign_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.campaign_trades IS
  'A campaign trade: a direct proposal, an open listing, or a bid on a listing (parent_trade_id). Completes only when accepted.';
COMMENT ON COLUMN public.campaign_trades.counterparty_gang_id IS
  'The gang that must accept. Null on an open listing; any gang in the campaign can bid.';
COMMENT ON COLUMN public.campaign_trades.parent_trade_id IS
  'Set on a bid, pointing at the listing. Null on a direct trade or an open listing.';

CREATE INDEX campaign_trades_campaign_created_idx
    ON public.campaign_trades (campaign_id, created_at DESC);

CREATE INDEX campaign_trades_parent_id_idx
    ON public.campaign_trades (parent_trade_id);

CREATE INDEX campaign_trades_proposer_gang_id_idx
    ON public.campaign_trades (proposer_gang_id);

CREATE INDEX campaign_trades_counterparty_gang_id_idx
    ON public.campaign_trades (counterparty_gang_id);

CREATE UNIQUE INDEX campaign_trades_one_pending_bid
    ON public.campaign_trades (parent_trade_id, proposer_gang_id)
    WHERE parent_trade_id IS NOT NULL AND status = 'pending';

-- 3. Items. One row per thing a gang gives. locked is true while the parent
--    trade is pending; set false on accept/decline/cancel. Credits and
--    reputation are not uniquely locked — accept re-checks balances.
--    description holds the display name for captive, equipment, resource and
--    custom rows so history survives SET NULL on the live FKs.
CREATE TABLE public.campaign_trade_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    trade_id uuid NOT NULL REFERENCES public.campaign_trades(id) ON DELETE CASCADE,
    giving_gang_id uuid NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
    kind text NOT NULL,
    fighter_id uuid REFERENCES public.fighters(id) ON DELETE SET NULL,
    fighter_equipment_id uuid REFERENCES public.fighter_equipment(id) ON DELETE SET NULL,
    amount numeric,
    campaign_type_resource_id uuid REFERENCES public.campaign_type_resources(id) ON DELETE SET NULL,
    campaign_resource_id uuid REFERENCES public.campaign_resources(id) ON DELETE SET NULL,
    description text,
    locked boolean NOT NULL DEFAULT true,
    CONSTRAINT campaign_trade_items_kind_check
        CHECK (kind IN (
            'captive',
            'equipment',
            'credits',
            'reputation',
            'campaign_resource',
            'custom'
        )),
    CONSTRAINT campaign_trade_items_columns_check
        CHECK (
            (kind = 'captive'
                AND fighter_equipment_id IS NULL
                AND amount IS NULL
                AND campaign_type_resource_id IS NULL
                AND campaign_resource_id IS NULL
                AND char_length(btrim(COALESCE(description, ''))) >= 1
                AND (NOT locked OR fighter_id IS NOT NULL))
            OR (kind = 'equipment'
                AND fighter_id IS NULL
                AND amount IS NULL
                AND campaign_type_resource_id IS NULL
                AND campaign_resource_id IS NULL
                AND char_length(btrim(COALESCE(description, ''))) >= 1
                AND (NOT locked OR fighter_equipment_id IS NOT NULL))
            OR (kind IN ('credits', 'reputation')
                AND amount IS NOT NULL
                AND amount >= 0
                AND fighter_id IS NULL
                AND fighter_equipment_id IS NULL
                AND campaign_type_resource_id IS NULL
                AND campaign_resource_id IS NULL
                AND description IS NULL)
            OR (kind = 'campaign_resource'
                AND amount IS NOT NULL
                AND amount >= 0
                AND fighter_id IS NULL
                AND fighter_equipment_id IS NULL
                AND char_length(btrim(COALESCE(description, ''))) >= 1
                AND (NOT locked OR num_nonnulls(campaign_type_resource_id, campaign_resource_id) = 1)
                AND num_nonnulls(campaign_type_resource_id, campaign_resource_id) <= 1)
            OR (kind = 'custom'
                AND char_length(btrim(COALESCE(description, ''))) >= 1
                AND fighter_id IS NULL
                AND fighter_equipment_id IS NULL
                AND amount IS NULL
                AND campaign_type_resource_id IS NULL
                AND campaign_resource_id IS NULL)
        )
);

COMMENT ON TABLE public.campaign_trade_items IS
  'What a gang gives in a trade. Captive and equipment rows with locked=true cannot appear on two pending trades. description is the name snapshot (and the custom text). custom is recorded only; players settle it at the table.';
COMMENT ON COLUMN public.campaign_trade_items.giving_gang_id IS
  'The gang handing this over. For a captive that is the captor (captured_by_gang_id); fighters.gang_id does not change.';
COMMENT ON COLUMN public.campaign_trade_items.locked IS
  'True while the trade is pending. False after accept, decline or cancel. Stash and captive actions refuse when a matching locked row exists.';
COMMENT ON COLUMN public.campaign_trade_items.kind IS
  'captive / equipment / credits / reputation / campaign_resource / custom. A later kind is a small migration.';
COMMENT ON COLUMN public.campaign_trade_items.description IS
  'Display name snapshot for captive, equipment and campaign_resource, and the free-text body for custom. Survives SET NULL on the live FKs.';
COMMENT ON COLUMN public.campaign_trade_items.amount IS
  'Credits, reputation or campaign resource quantity. Same numeric type as gangs.credits and campaign_gang_resources.quantity.';

CREATE INDEX campaign_trade_items_trade_id_idx
    ON public.campaign_trade_items (trade_id);

CREATE INDEX campaign_trade_items_giving_gang_id_idx
    ON public.campaign_trade_items (giving_gang_id);

CREATE UNIQUE INDEX campaign_trade_items_equipment_locked
    ON public.campaign_trade_items (fighter_equipment_id)
    WHERE locked AND fighter_equipment_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_trade_items_captive_locked
    ON public.campaign_trade_items (fighter_id)
    WHERE locked AND fighter_id IS NOT NULL;

-- 4. RLS. Members/arbs/admin can SELECT. Writes for now are admin-only
--    (same pattern as other new tables); player create/accept comes later
--    as SECURITY DEFINER RPCs.
ALTER TABLE public.campaign_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_trade_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_trade_items TO authenticated;

-- Campaign pages are server-rendered through app_server (auth.uid() NULL).
-- Data API SELECT is limited to members, arbitrators and admins.
CREATE POLICY "Members, arbs or admin can view trades"
    ON public.campaign_trades FOR SELECT TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (EXISTS (
            SELECT 1
            FROM public.campaign_members cm
            WHERE cm.campaign_id = campaign_trades.campaign_id
              AND cm.user_id = (SELECT auth.uid() AS uid)
        ))
        OR (SELECT private.is_arb(campaign_id) AS is_arb)
    );

CREATE POLICY "App server can view campaign trades"
    ON public.campaign_trades FOR SELECT TO app_server
    USING (true);

CREATE POLICY "Admins can insert campaign trades"
    ON public.campaign_trades FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Admins can update campaign trades"
    ON public.campaign_trades FOR UPDATE TO authenticated
    USING ((SELECT private.is_admin() AS is_admin))
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Admins can delete campaign trades"
    ON public.campaign_trades FOR DELETE TO authenticated
    USING ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Members, arbs or admin can view trade items"
    ON public.campaign_trade_items FOR SELECT TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (EXISTS (
            SELECT 1
            FROM public.campaign_trades t
            JOIN public.campaign_members cm ON cm.campaign_id = t.campaign_id
            WHERE t.id = campaign_trade_items.trade_id
              AND cm.user_id = (SELECT auth.uid() AS uid)
        ))
        OR (SELECT private.is_arb((
            SELECT t.campaign_id
            FROM public.campaign_trades t
            WHERE t.id = campaign_trade_items.trade_id
        )) AS is_arb)
    );

CREATE POLICY "App server can view campaign trade items"
    ON public.campaign_trade_items FOR SELECT TO app_server
    USING (true);

CREATE POLICY "Admins can insert campaign trade items"
    ON public.campaign_trade_items FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Admins can update campaign trade items"
    ON public.campaign_trade_items FOR UPDATE TO authenticated
    USING ((SELECT private.is_admin() AS is_admin))
    WITH CHECK ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Admins can delete campaign trade items"
    ON public.campaign_trade_items FOR DELETE TO authenticated
    USING ((SELECT private.is_admin() AS is_admin));

COMMIT;
