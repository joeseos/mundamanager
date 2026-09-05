-- Group Gang Tactics cards into packs (decks).
--
-- tactics_cards was flat and edition-scoped: one D66 table per edition. Tactics
-- actually ship as separate decks, each with its own D66 table, so two decks in
-- one edition reuse the same 11-66 range space. There was nowhere to put a
-- second deck, and adding one would have broken the roll lookup, which matched
-- by range across the whole edition and expected a single row.
--
-- Edition now lives on the pack; tactics_cards derives it through pack_id. A
-- pack restricted by gang_type_id is offered to that gang list only; NULL means
-- every gang in the edition.
--
-- No explicit BEGIN/COMMIT: the Supabase CLI wraps each migration in one.


-- ---------------------------------------------------------------------------
-- 1. TACTICS CARDS PACKS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tactics_cards_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    name text NOT NULL,
    edition_id uuid NOT NULL,
    gang_type_id uuid,

    CONSTRAINT tactics_cards_packs_edition_id_fkey
        FOREIGN KEY (edition_id)
        REFERENCES public.editions(id)
        ON DELETE RESTRICT,

    -- Composite, matching fighter_types_gang_type_edition_fkey, so a pack can
    -- never be tied to a gang list from another edition. MATCH SIMPLE skips the
    -- check when a column is NULL, leaving "offered to every gang" free.
    CONSTRAINT tactics_cards_packs_gang_type_edition_fkey
        FOREIGN KEY (gang_type_id, edition_id)
        REFERENCES public.gang_types (gang_type_id, edition_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT tactics_cards_packs_edition_id_name_key
        UNIQUE (edition_id, name)
);

COMMENT ON TABLE public.tactics_cards_packs IS
    'A named deck of Gang Tactics cards within one edition, with its own D66 '
    'table. Nothing on gangs points at a pack, so a gang may hold cards from '
    'several.';

COMMENT ON COLUMN public.tactics_cards_packs.gang_type_id IS
    'Gang list this pack is restricted to. NULL = every gang in the edition. A '
    'gang list whose parent_gang_type_id points here is also offered the pack, '
    'so a House Escher deck reaches House Escher: Wyld Hunt. Not the reverse.';

CREATE INDEX IF NOT EXISTS tactics_cards_packs_edition_id_idx
    ON public.tactics_cards_packs (edition_id);

CREATE INDEX IF NOT EXISTS tactics_cards_packs_gang_type_id_idx
    ON public.tactics_cards_packs (gang_type_id);


-- ---------------------------------------------------------------------------
-- 2. RLS: TACTICS CARDS PACKS (mirrors tactics_cards)
-- ---------------------------------------------------------------------------

ALTER TABLE public.tactics_cards_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view tactic card packs"
    ON public.tactics_cards_packs;
CREATE POLICY "Allow authenticated users to view tactic card packs"
    ON public.tactics_cards_packs
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Only admin can create tactic card packs"
    ON public.tactics_cards_packs;
CREATE POLICY "Only admin can create tactic card packs"
    ON public.tactics_cards_packs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

DROP POLICY IF EXISTS "Only admin can update tactic card packs"
    ON public.tactics_cards_packs;
CREATE POLICY "Only admin can update tactic card packs"
    ON public.tactics_cards_packs
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    )
    WITH CHECK (
        (SELECT private.is_admin())
    );

DROP POLICY IF EXISTS "Only admin can delete tactic card packs"
    ON public.tactics_cards_packs;
CREATE POLICY "Only admin can delete tactic card packs"
    ON public.tactics_cards_packs
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );

-- RLS filters rows but grants no table privileges.
GRANT SELECT ON public.tactics_cards_packs TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Seed the Core pack and move tactics_cards onto pack_id.
--
-- Both read tactics_cards.edition_id, which section 5 drops, so on a re-run the
-- column is gone. Hence the guard, and EXECUTE: plpgsql parses static SQL when
-- the block runs, even in a branch that never executes.
--
-- The 'n26' arm seeds a fresh database whose tactics_cards is still empty; the
-- subquery arm gives every edition that already has cards a pack to land on.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tactics_cards
    ADD COLUMN IF NOT EXISTS pack_id uuid;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tactics_cards'
          AND column_name = 'edition_id'
    ) THEN
        EXECUTE $seed$
            INSERT INTO public.tactics_cards_packs (name, edition_id, gang_type_id)
            SELECT 'Core', e.id, NULL
            FROM public.editions e
            WHERE e.slug = 'n26'
               OR e.id IN (SELECT DISTINCT c.edition_id FROM public.tactics_cards c)
            ON CONFLICT ON CONSTRAINT tactics_cards_packs_edition_id_name_key
            DO NOTHING
        $seed$;

        EXECUTE $backfill$
            UPDATE public.tactics_cards c
            SET pack_id = p.id
            FROM public.tactics_cards_packs p
            WHERE p.edition_id = c.edition_id
              AND p.name = 'Core'
              AND c.pack_id IS NULL
        $backfill$;
    ELSE
        -- Already migrated, but a database restored from a later snapshot may
        -- still have no Core pack.
        EXECUTE $seed_only$
            INSERT INTO public.tactics_cards_packs (name, edition_id, gang_type_id)
            SELECT 'Core', e.id, NULL
            FROM public.editions e
            WHERE e.slug = 'n26'
            ON CONFLICT ON CONSTRAINT tactics_cards_packs_edition_id_name_key
            DO NOTHING
        $seed_only$;
    END IF;
END $$;

-- SET NOT NULL below would report a violation with no hint as to why.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.tactics_cards WHERE pack_id IS NULL) THEN
        RAISE EXCEPTION
            'tactics_cards rows left without a pack_id; their edition has no Core pack';
    END IF;
END $$;

ALTER TABLE public.tactics_cards
    ALTER COLUMN pack_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tactics_cards_pack_id_fkey'
          AND conrelid = 'public.tactics_cards'::regclass
    ) THEN
        ALTER TABLE public.tactics_cards
            ADD CONSTRAINT tactics_cards_pack_id_fkey
            FOREIGN KEY (pack_id)
            REFERENCES public.tactics_cards_packs(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS tactics_cards_pack_id_idx
    ON public.tactics_cards (pack_id);


-- ---------------------------------------------------------------------------
-- 4. Constraints that move from the edition to the pack
-- ---------------------------------------------------------------------------

-- The same card name may legitimately appear in two decks of one edition.
ALTER TABLE public.tactics_cards
    DROP CONSTRAINT IF EXISTS tactics_cards_edition_id_name_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tactics_cards_pack_id_name_key'
          AND conrelid = 'public.tactics_cards'::regclass
    ) THEN
        ALTER TABLE public.tactics_cards
            ADD CONSTRAINT tactics_cards_pack_id_name_key UNIQUE (pack_id, name);
    END IF;
END $$;

-- A roll is resolved by range within one pack and expects a single match, so
-- two cards in a pack must not share a range start. Catches identical starts,
-- not partial overlaps — the query side also orders and limits.
CREATE UNIQUE INDEX IF NOT EXISTS tactics_cards_pack_id_d66_min_key
    ON public.tactics_cards (pack_id, d66_min)
    WHERE d66_min IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 5. Edition now lives on the pack. This drops the FK with it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tactics_cards
    DROP COLUMN IF EXISTS edition_id;
