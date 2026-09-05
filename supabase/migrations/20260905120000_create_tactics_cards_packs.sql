-- Group Gang Tactics cards into packs (decks).
--
-- tactics_cards was a flat, edition-scoped catalogue: one D66 table per edition.
-- Necromunda ships tactics as separate decks — the Core deck plus gang-specific
-- ones — each with its own D66 table, so two decks in one edition necessarily
-- reuse the same 11-66 range space. There was nowhere to put a second deck, and
-- adding one would have broken the dice roller, which resolves a roll by range
-- across the whole edition and expects a single match.
--
-- After this, edition lives on the pack and tactics_cards derives it through
-- pack_id. A pack may be restricted to one gang list via gang_type_id; NULL
-- means every gang in the edition (the Core deck).
--
-- The Supabase CLI wraps each migration in a transaction, so there is no
-- explicit BEGIN/COMMIT here. The file is written idempotently so `supabase db
-- push` applies only the un-applied parts against a database that may already
-- have been patched by hand.


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

    -- Composite against (gang_type_id, edition_id) rather than gang_type_id
    -- alone, matching fighter_types_gang_type_edition_fkey: a pack can then
    -- never be tied to a gang list from another edition. MATCH SIMPLE skips the
    -- check when any column is NULL, so a null gang_type_id is unconstrained,
    -- which is exactly the "offered to every gang" case.
    CONSTRAINT tactics_cards_packs_gang_type_edition_fkey
        FOREIGN KEY (gang_type_id, edition_id)
        REFERENCES public.gang_types (gang_type_id, edition_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT tactics_cards_packs_edition_id_name_key
        UNIQUE (edition_id, name)
);

COMMENT ON TABLE public.tactics_cards_packs IS
    'A named deck of Gang Tactics cards within one edition (the Core deck, a '
    'house deck, a supplement). Each pack has its own D66 table. Picker-only: '
    'nothing on gangs points at a pack, so a gang may hold cards from several.';

COMMENT ON COLUMN public.tactics_cards_packs.gang_type_id IS
    'Gang list this pack is restricted to. NULL = offered to every gang in the '
    'edition. A gang list whose parent_gang_type_id points at this gang type is '
    'also offered the pack, so a House Escher deck reaches House Escher: Wyld '
    'Hunt. The reverse is not true: a pack tied to a child list stays there.';

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

-- RLS filters rows but grants no table privileges. Reads only for authenticated:
-- the write policies are admin-gated and the catalogue is seeded by migration.
GRANT SELECT ON public.tactics_cards_packs TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. SEED the Core pack, and 4. move tactics_cards from edition_id to pack_id.
--
-- Both read tactics_cards.edition_id, which section 6 drops. On a re-run that
-- column is already gone, so they live in one guarded block and go through
-- EXECUTE — plpgsql parses static SQL when the block runs, which would fail on
-- the missing column even in a branch that never executes.
--
-- The 'n26' arm of the seed covers a fresh database whose tactics_cards is
-- still empty; the subquery arm gives every edition that already has cards a
-- Core pack, so the backfill can strand nothing.
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
        -- Already migrated. Still seed a Core pack for n26 so a database
        -- restored from a snapshot taken after the drop is not left without one.
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

-- Fail loudly rather than half-migrate: SET NOT NULL below would otherwise
-- report a constraint violation with no hint as to which rows or why.
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
-- 5. Constraints that move from the edition to the pack
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

-- A D66 roll is resolved by range within one pack and expects a single match.
-- This makes two cards in a pack sharing a range start unauthorable. It catches
-- identical starts, not partial overlaps; a full guarantee needs btree_gist and
-- an EXCLUDE constraint, and no extension is installed here, so the query side
-- also orders and limits.
CREATE UNIQUE INDEX IF NOT EXISTS tactics_cards_pack_id_d66_min_key
    ON public.tactics_cards (pack_id, d66_min)
    WHERE d66_min IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 6. Edition now lives on the pack. Dropping the column drops
--    tactics_cards_edition_id_fkey with it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tactics_cards
    DROP COLUMN IF EXISTS edition_id;
