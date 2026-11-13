-- Campaign trading: gangs in the same campaign advertise goods, captives or
-- arrangements; another gang submits an offer; the advert author accepts to
-- complete the trade. Slice 1 is plumbing only — flag, tables, SELECT RLS.
-- Mutations (create / offer / accept) arrive as SECURITY DEFINER RPCs in a
-- later slice; this migration grants SELECT, not writes.
--
-- pending_offer_count lives on the advert so the campaign list can show it
-- without reading offer rows. The server reader (app_server) inherits
-- authenticated with auth.uid() NULL, so a tight offers SELECT would otherwise
-- hide every offer from getCampaignTrades. Slice 2 RPCs maintain the counter.
--
-- Item/captive locks live on campaign_trade_reservations, not on per-table
-- unique indexes, so the same good cannot sit on an open advert and a pending
-- offer at once. Slice 2 RPCs insert/delete those rows (FOR UPDATE on the
-- reservation) when listing, offering, completing, refusing, withdrawing or
-- cancelling.
--
-- accepted_offer_id is added after campaign_trade_offers exists (circular FK).

BEGIN;

-- 1. Per-campaign opt-in flag, editable by OWNER/ARBITRATOR via the existing
--    campaigns UPDATE policy (same path as allow_join_requests).
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS allow_trading boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.allow_trading IS
  'When true, owners of gangs in this campaign can advertise and trade. A trade completes only when the advert author accepts an offer.';

-- Composite FK target so advert/offer denormalised gang, campaign and user
-- ids must match the campaign_gangs row they claim to be.
ALTER TABLE public.campaign_gangs
    ADD CONSTRAINT campaign_gangs_id_gang_id_campaign_id_user_id_key
    UNIQUE (id, gang_id, campaign_id, user_id);

-- 2. Adverts. accepted_offer_id is added after the offers table exists.
--    Subject and payment CHECKs apply only while open so completed/cancelled
--    history can SET NULL item, captive and resource FKs when those rows go.
CREATE TABLE public.campaign_trade_adverts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    completed_at timestamp with time zone,
    campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    author_campaign_gang_id uuid NOT NULL REFERENCES public.campaign_gangs(id) ON DELETE CASCADE,
    author_gang_id uuid NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
    author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind text NOT NULL,
    title varchar(100) NOT NULL,
    description text,
    fighter_equipment_id uuid REFERENCES public.fighter_equipment(id) ON DELETE SET NULL,
    captive_fighter_id uuid REFERENCES public.fighters(id) ON DELETE SET NULL,
    payment_kind text NOT NULL,
    payment_campaign_type_resource_id uuid REFERENCES public.campaign_type_resources(id) ON DELETE SET NULL,
    payment_campaign_resource_id uuid REFERENCES public.campaign_resources(id) ON DELETE SET NULL,
    payment_amount integer NOT NULL,
    status text NOT NULL DEFAULT 'open',
    accepted_offer_id uuid,
    pending_offer_count integer NOT NULL DEFAULT 0,
    CONSTRAINT campaign_trade_adverts_kind_check
        CHECK (kind IN ('selling', 'buying')),
    CONSTRAINT campaign_trade_adverts_status_check
        CHECK (status IN ('open', 'completed', 'cancelled')),
    CONSTRAINT campaign_trade_adverts_payment_kind_check
        CHECK (payment_kind IN ('credits', 'reputation', 'campaign_resource')),
    CONSTRAINT campaign_trade_adverts_title_length
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
    CONSTRAINT campaign_trade_adverts_payment_amount_check
        CHECK (payment_amount >= 0),
    CONSTRAINT campaign_trade_adverts_pending_offer_count_check
        CHECK (pending_offer_count >= 0),
    CONSTRAINT campaign_trade_adverts_subject_check
        CHECK (
            status <> 'open'
            OR (kind = 'buying'
                AND fighter_equipment_id IS NULL
                AND captive_fighter_id IS NULL
                AND char_length(btrim(COALESCE(description, ''))) >= 1)
            OR (kind = 'selling'
                AND num_nonnulls(fighter_equipment_id, captive_fighter_id) <= 1
                AND (
                    fighter_equipment_id IS NOT NULL
                    OR captive_fighter_id IS NOT NULL
                    OR char_length(btrim(COALESCE(description, ''))) >= 1
                )
                AND (
                    fighter_equipment_id IS NULL
                    AND captive_fighter_id IS NULL
                    OR char_length(btrim(COALESCE(description, ''))) = 0
                ))
        ),
    CONSTRAINT campaign_trade_adverts_payment_resource_check
        CHECK (
            status <> 'open'
            OR (payment_kind IN ('credits', 'reputation')
                AND payment_campaign_type_resource_id IS NULL
                AND payment_campaign_resource_id IS NULL)
            OR (payment_kind = 'campaign_resource'
                AND num_nonnulls(payment_campaign_type_resource_id, payment_campaign_resource_id) = 1)
        ),
    CONSTRAINT campaign_trade_adverts_id_campaign_id_key
        UNIQUE (id, campaign_id),
    CONSTRAINT campaign_trade_adverts_author_membership_fkey
        FOREIGN KEY (author_campaign_gang_id, author_gang_id, campaign_id, author_user_id)
        REFERENCES public.campaign_gangs (id, gang_id, campaign_id, user_id)
);

COMMENT ON TABLE public.campaign_trade_adverts IS
  'Campaign marketplace adverts. Open rows listing an item or captive are locked via campaign_trade_reservations. A trade completes only when the author accepts an offer. Historical item/captive/resource FKs SET NULL so completed rows do not pin live stash.';
COMMENT ON COLUMN public.campaign_trade_adverts.pending_offer_count IS
  'Count of pending offers. Maintained by trade RPCs so the public list does not need to SELECT offer rows.';
COMMENT ON COLUMN public.campaign_trade_adverts.fighter_equipment_id IS
  'Stash item listed on a selling advert. Null for buying adverts, free-text selling adverts, and completed/cancelled rows after the item is deleted.';
COMMENT ON COLUMN public.campaign_trade_adverts.captive_fighter_id IS
  'Captive listed on a selling advert. Null for buying adverts, free-text selling adverts, and completed/cancelled rows after the captive is deleted.';

CREATE INDEX campaign_trade_adverts_campaign_created_idx
    ON public.campaign_trade_adverts (campaign_id, created_at DESC);

-- 3. Offers. One pending offer per gang per advert. Listed goods are locked
--    on campaign_trade_reservations, not here.
CREATE TABLE public.campaign_trade_offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    resolved_at timestamp with time zone,
    campaign_id uuid NOT NULL,
    advert_id uuid NOT NULL REFERENCES public.campaign_trade_adverts(id) ON DELETE CASCADE,
    offerer_campaign_gang_id uuid NOT NULL REFERENCES public.campaign_gangs(id) ON DELETE CASCADE,
    offerer_gang_id uuid NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
    offerer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fighter_equipment_id uuid REFERENCES public.fighter_equipment(id) ON DELETE SET NULL,
    captive_fighter_id uuid REFERENCES public.fighters(id) ON DELETE SET NULL,
    supply_kind text,
    supply_campaign_type_resource_id uuid REFERENCES public.campaign_type_resources(id) ON DELETE SET NULL,
    supply_campaign_resource_id uuid REFERENCES public.campaign_resources(id) ON DELETE SET NULL,
    supply_amount integer,
    payment_kind text NOT NULL,
    payment_campaign_type_resource_id uuid REFERENCES public.campaign_type_resources(id) ON DELETE SET NULL,
    payment_campaign_resource_id uuid REFERENCES public.campaign_resources(id) ON DELETE SET NULL,
    payment_amount integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    CONSTRAINT campaign_trade_offers_status_check
        CHECK (status IN ('pending', 'accepted', 'refused', 'withdrawn', 'closed')),
    CONSTRAINT campaign_trade_offers_payment_kind_check
        CHECK (payment_kind IN ('credits', 'reputation', 'campaign_resource')),
    CONSTRAINT campaign_trade_offers_payment_amount_check
        CHECK (payment_amount >= 0),
    CONSTRAINT campaign_trade_offers_payment_resource_check
        CHECK (
            status <> 'pending'
            OR (payment_kind IN ('credits', 'reputation')
                AND payment_campaign_type_resource_id IS NULL
                AND payment_campaign_resource_id IS NULL)
            OR (payment_kind = 'campaign_resource'
                AND num_nonnulls(payment_campaign_type_resource_id, payment_campaign_resource_id) = 1)
        ),
    CONSTRAINT campaign_trade_offers_supply_check
        CHECK (
            status <> 'pending'
            OR (supply_kind IS NULL
                AND supply_campaign_type_resource_id IS NULL
                AND supply_campaign_resource_id IS NULL
                AND supply_amount IS NULL)
            OR (supply_kind IN ('credits', 'reputation')
                AND supply_campaign_type_resource_id IS NULL
                AND supply_campaign_resource_id IS NULL
                AND supply_amount IS NOT NULL
                AND supply_amount >= 0)
            OR (supply_kind = 'campaign_resource'
                AND num_nonnulls(supply_campaign_type_resource_id, supply_campaign_resource_id) = 1
                AND supply_amount IS NOT NULL
                AND supply_amount >= 0)
        ),
    CONSTRAINT campaign_trade_offers_goods_check
        CHECK (num_nonnulls(fighter_equipment_id, captive_fighter_id, supply_kind) <= 1),
    CONSTRAINT campaign_trade_offers_advert_campaign_fkey
        FOREIGN KEY (advert_id, campaign_id)
        REFERENCES public.campaign_trade_adverts (id, campaign_id),
    CONSTRAINT campaign_trade_offers_offerer_membership_fkey
        FOREIGN KEY (offerer_campaign_gang_id, offerer_gang_id, campaign_id, offerer_user_id)
        REFERENCES public.campaign_gangs (id, gang_id, campaign_id, user_id),
    CONSTRAINT campaign_trade_offers_advert_id_id_key
        UNIQUE (advert_id, id)
);

COMMENT ON TABLE public.campaign_trade_offers IS
  'Offers on a campaign trade advert. Pending rows that list an item or captive are locked via campaign_trade_reservations. Accepting one offer completes the advert.';
COMMENT ON COLUMN public.campaign_trade_offers.campaign_id IS
  'Copied from the advert so the offerer membership composite FK can require the same campaign.';

CREATE INDEX campaign_trade_offers_advert_id_idx
    ON public.campaign_trade_offers (advert_id);

CREATE UNIQUE INDEX campaign_trade_offers_one_pending
    ON public.campaign_trade_offers (advert_id, offerer_campaign_gang_id)
    WHERE status = 'pending';

-- Composite so accepted_offer_id must belong to this advert, not another.
-- MATCH SIMPLE: a null accepted_offer_id skips the check (open/cancelled rows).
-- No ON DELETE SET NULL: that would also null adverts.id (PK). Deleting an
-- accepted offer while the advert still points at it is rejected.
ALTER TABLE public.campaign_trade_adverts
    ADD CONSTRAINT campaign_trade_adverts_accepted_offer_fkey
    FOREIGN KEY (id, accepted_offer_id)
    REFERENCES public.campaign_trade_offers (advert_id, id);

-- 4. Live item/captive lock. One row per reserved good, sourced from either an
--    open advert or a pending offer. Historical advert/offer FKs are not locks.
CREATE TABLE public.campaign_trade_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    fighter_equipment_id uuid REFERENCES public.fighter_equipment(id) ON DELETE RESTRICT,
    captive_fighter_id uuid REFERENCES public.fighters(id) ON DELETE RESTRICT,
    advert_id uuid REFERENCES public.campaign_trade_adverts(id) ON DELETE CASCADE,
    offer_id uuid REFERENCES public.campaign_trade_offers(id) ON DELETE CASCADE,
    CONSTRAINT campaign_trade_reservations_subject_check
        CHECK (num_nonnulls(fighter_equipment_id, captive_fighter_id) = 1),
    CONSTRAINT campaign_trade_reservations_source_check
        CHECK (num_nonnulls(advert_id, offer_id) = 1)
);

COMMENT ON TABLE public.campaign_trade_reservations IS
  'Live lock for a stash item or captive listed on an open advert or pending offer. Slice 2 RPCs insert on list/offer and delete on complete/cancel/refuse/withdraw. Credit and resource reservations stay as sums of pending offer rows.';

CREATE UNIQUE INDEX campaign_trade_reservations_item
    ON public.campaign_trade_reservations (fighter_equipment_id)
    WHERE fighter_equipment_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_trade_reservations_captive
    ON public.campaign_trade_reservations (captive_fighter_id)
    WHERE captive_fighter_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_trade_reservations_advert
    ON public.campaign_trade_reservations (advert_id)
    WHERE advert_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_trade_reservations_offer
    ON public.campaign_trade_reservations (offer_id)
    WHERE offer_id IS NOT NULL;

-- 5. RLS: SELECT only. Writes come from SECURITY DEFINER RPCs in a later slice.
ALTER TABLE public.campaign_trade_adverts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_trade_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_trade_reservations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.campaign_trade_adverts TO authenticated;
GRANT SELECT ON public.campaign_trade_offers TO authenticated;
GRANT SELECT ON public.campaign_trade_reservations TO authenticated;

-- Campaign pages are server-rendered through app_server (auth.uid() NULL), so
-- that role needs an open SELECT. Direct Data API access is limited to members,
-- arbitrators and admins — unlike campaigns, whose SELECT is USING (true).
CREATE POLICY "Campaign members, arbitrators or admin can view trade adverts"
    ON public.campaign_trade_adverts FOR SELECT TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (EXISTS (
            SELECT 1
            FROM public.campaign_members cm
            WHERE cm.campaign_id = campaign_trade_adverts.campaign_id
              AND cm.user_id = (SELECT auth.uid() AS uid)
        ))
        OR (SELECT private.is_arb(campaign_id) AS is_arb)
    );

CREATE POLICY "App server can view campaign trade adverts"
    ON public.campaign_trade_adverts FOR SELECT TO app_server
    USING (true);

-- Offer rows are the reservation detail. Only the two sides, an arbitrator of
-- that campaign, or an admin can read them. pending_offer_count on the advert
-- is what the public list shows. No app_server bypass — getCampaignTrades
-- must not SELECT this table.
CREATE POLICY "Author, offerer, arbitrators or admin can view trade offers"
    ON public.campaign_trade_offers FOR SELECT TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (offerer_user_id = (SELECT auth.uid() AS uid))
        OR (EXISTS (
            SELECT 1
            FROM public.campaign_trade_adverts a
            WHERE a.id = campaign_trade_offers.advert_id
              AND a.author_user_id = (SELECT auth.uid() AS uid)
        ))
        OR (SELECT private.is_arb(campaign_id) AS is_arb)
    );

-- Advert-sourced reservations are as public as the advert (listed item is on
-- the advert row). Offer-sourced reservations follow offer RLS so a pending
-- offer's item id is not visible to the rest of the campaign.
CREATE POLICY "Members, arbs or admin view advert reservations"
    ON public.campaign_trade_reservations FOR SELECT TO authenticated
    USING (
        advert_id IS NOT NULL
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (EXISTS (
                SELECT 1
                FROM public.campaign_trade_adverts a
                JOIN public.campaign_members cm ON cm.campaign_id = a.campaign_id
                WHERE a.id = campaign_trade_reservations.advert_id
                  AND cm.user_id = (SELECT auth.uid() AS uid)
            ))
            OR (SELECT private.is_arb((
                SELECT a.campaign_id
                FROM public.campaign_trade_adverts a
                WHERE a.id = campaign_trade_reservations.advert_id
            )) AS is_arb)
        )
    );

CREATE POLICY "App server can view advert trade reservations"
    ON public.campaign_trade_reservations FOR SELECT TO app_server
    USING (advert_id IS NOT NULL);

CREATE POLICY "Author, offerer, arbs or admin view offer reservations"
    ON public.campaign_trade_reservations FOR SELECT TO authenticated
    USING (
        offer_id IS NOT NULL
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (EXISTS (
                SELECT 1
                FROM public.campaign_trade_offers o
                WHERE o.id = campaign_trade_reservations.offer_id
                  AND o.offerer_user_id = (SELECT auth.uid() AS uid)
            ))
            OR (EXISTS (
                SELECT 1
                FROM public.campaign_trade_offers o
                JOIN public.campaign_trade_adverts a ON a.id = o.advert_id
                WHERE o.id = campaign_trade_reservations.offer_id
                  AND a.author_user_id = (SELECT auth.uid() AS uid)
            ))
            OR (SELECT private.is_arb((
                SELECT o.campaign_id
                FROM public.campaign_trade_offers o
                WHERE o.id = campaign_trade_reservations.offer_id
            )) AS is_arb)
        )
    );

COMMIT;
