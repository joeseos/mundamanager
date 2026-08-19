BEGIN;

-- ============================================================================
-- TACTICS CARDS
-- Global catalogue of tactic cards.
-- Rules text is not stored here.
-- ============================================================================

CREATE TABLE public.tactics_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    edition_id uuid NOT NULL,
    name text NOT NULL,
    d66_min smallint,
    d66_max smallint,

    CONSTRAINT tactics_cards_edition_id_fkey
        FOREIGN KEY (edition_id)
        REFERENCES public.editions(id)
        ON DELETE RESTRICT,

    CONSTRAINT tactics_cards_edition_id_name_key
        UNIQUE (edition_id, name),

    CONSTRAINT tactics_cards_d66_pair_check
        CHECK (
            (d66_min IS NULL AND d66_max IS NULL)
            OR
            (d66_min IS NOT NULL AND d66_max IS NOT NULL)
        ),

    CONSTRAINT tactics_cards_d66_order_check
        CHECK (
            d66_min IS NULL
            OR d66_min <= d66_max
        )
);

CREATE INDEX tactics_cards_edition_id_idx
    ON public.tactics_cards(edition_id);


-- ============================================================================
-- GANG TACTICS CARDS
-- Stores which tactic cards a gang has.
-- Description is entered by the user.
-- ============================================================================

CREATE TABLE public.gang_tactics_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    gang_id uuid NOT NULL,
    tactics_cards_id uuid NOT NULL,
    description text,

    CONSTRAINT gang_tactics_cards_gang_id_fkey
        FOREIGN KEY (gang_id)
        REFERENCES public.gangs(id)
        ON DELETE CASCADE,

    CONSTRAINT gang_tactics_cards_tactics_cards_id_fkey
        FOREIGN KEY (tactics_cards_id)
        REFERENCES public.tactics_cards(id)
        ON DELETE RESTRICT,

    CONSTRAINT gang_tactics_cards_gang_id_tactics_cards_id_key
        UNIQUE (gang_id, tactics_cards_id)
);

CREATE INDEX gang_tactics_cards_gang_id_idx
    ON public.gang_tactics_cards(gang_id);

CREATE INDEX gang_tactics_cards_tactics_cards_id_idx
    ON public.gang_tactics_cards(tactics_cards_id);


-- ============================================================================
-- RLS: TACTICS CARDS
-- ============================================================================

ALTER TABLE public.tactics_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view tactic cards"
    ON public.tactics_cards
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create tactic cards"
    ON public.tactics_cards
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can update tactic cards"
    ON public.tactics_cards
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    )
    WITH CHECK (
        (SELECT private.is_admin())
    );

CREATE POLICY "Only admin can delete tactic cards"
    ON public.tactics_cards
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );


-- ============================================================================
-- RLS: GANG TACTICS CARDS
-- ============================================================================

ALTER TABLE public.gang_tactics_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang tactic cards"
    ON public.gang_tactics_cards
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create tactic cards for their gang"
    ON public.gang_tactics_cards
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );

CREATE POLICY "Users can update tactic cards in their gang"
    ON public.gang_tactics_cards
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    )
    WITH CHECK (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );

CREATE POLICY "Users can delete tactic cards from their gang"
    ON public.gang_tactics_cards
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
        OR gang_id IN (
            SELECT g.id
            FROM public.gangs g
            WHERE g.user_id = (SELECT auth.uid())
        )
        OR gang_id IN (
            SELECT cg.gang_id
            FROM public.campaign_gangs cg
            WHERE cg.status = 'ACCEPTED'
              AND (SELECT private.is_arb(cg.campaign_id))
        )
    );


-- ============================================================================
-- SEED: N26 CORE GANG TACTICS
-- ============================================================================

WITH target AS (
    SELECT id AS edition_id
    FROM public.editions
    WHERE slug = 'n26'
),
seed_rows(name, d66_min, d66_max) AS (
    VALUES
        ('Point-blank Shot',   11::smallint, 12::smallint),
        ('Hidden Stash',       13::smallint, 14::smallint),
        ('Suppressing Fire',   15::smallint, 16::smallint),
        ('Burst of Courage',   21::smallint, 22::smallint),
        ('Adrenaline Surge',   23::smallint, 24::smallint),
        ('Desperate Effort',   25::smallint, 26::smallint),
        ('Grenade Bouquet',    31::smallint, 32::smallint),
        ('Quick Finish',       33::smallint, 34::smallint),
        ('Remorseless Killer', 35::smallint, 36::smallint),
        ('Last Gasp',          41::smallint, 42::smallint),
        ('Thundering Charge',  43::smallint, 44::smallint),
        ('Chain Attack',       45::smallint, 46::smallint),
        ('Opening Volley',     51::smallint, 52::smallint),
        ('“You!”',             53::smallint, 54::smallint),
        ('Rapid Healing',      55::smallint, 56::smallint),
        ('Reckless Attack',    61::smallint, 62::smallint),
        ('Rapid Fire',         63::smallint, 64::smallint),
        ('Crossfire',          65::smallint, 66::smallint)
)
INSERT INTO public.tactics_cards (
    edition_id,
    name,
    d66_min,
    d66_max
)
SELECT
    t.edition_id,
    r.name,
    r.d66_min,
    r.d66_max
FROM seed_rows r
CROSS JOIN target t
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tactics_cards existing
    WHERE existing.edition_id = t.edition_id
      AND existing.name = r.name
);

COMMIT;
