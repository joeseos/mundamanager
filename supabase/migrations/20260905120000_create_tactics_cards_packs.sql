BEGIN;

-- ============================================================================
-- TACTICS CARDS PACKS
-- A Gang Tactics deck. Each pack is its own D66 table, so bands overlap
-- between packs by design and every lookup must be scoped to one pack.
--
-- gang_type_id NULL = the edition's core deck: offered to every gang, and
-- shown without a checkbox because it is what the picker falls back to.
-- A value restricts the pack to that gang type. Alternate house lists reach
-- their house's pack through gang_types.parent_gang_type_id, so House Escher
-- needs one pack row, not one per replacement list.
-- ============================================================================

CREATE TABLE public.tactics_cards_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    edition_id uuid NOT NULL,
    gang_type_id uuid,
    name text NOT NULL,

    CONSTRAINT tactics_cards_packs_edition_id_fkey
        FOREIGN KEY (edition_id)
        REFERENCES public.editions(id)
        ON DELETE RESTRICT,

    CONSTRAINT tactics_cards_packs_gang_type_id_fkey
        FOREIGN KEY (gang_type_id)
        REFERENCES public.gang_types(gang_type_id)
        ON DELETE CASCADE,

    -- Locks a pack to its gang type's edition. MATCH SIMPLE, so a core pack
    -- (null gang type) is left unchecked, which is what we want.
    CONSTRAINT tactics_cards_packs_gang_type_edition_fkey
        FOREIGN KEY (gang_type_id, edition_id)
        REFERENCES public.gang_types (gang_type_id, edition_id)
        ON UPDATE CASCADE,

    CONSTRAINT tactics_cards_packs_edition_id_name_key
        UNIQUE (edition_id, name),

    -- Target for the tactics_cards composite FK below.
    CONSTRAINT tactics_cards_packs_id_edition_id_key
        UNIQUE (id, edition_id)
);

COMMENT ON COLUMN public.tactics_cards_packs.gang_type_id IS
    'Gang type this deck belongs to. NULL is the edition''s core deck, offered '
    'to every gang and used when no pack is picked. A value also covers that '
    'type''s alternate lists via gang_types.parent_gang_type_id.';

-- At most one core deck per edition, so "the default" is never ambiguous.
CREATE UNIQUE INDEX tactics_cards_packs_edition_core_uidx
    ON public.tactics_cards_packs (edition_id)
    WHERE gang_type_id IS NULL;

-- gang_type_id is an ON DELETE CASCADE path.
CREATE INDEX tactics_cards_packs_gang_type_id_idx
    ON public.tactics_cards_packs (gang_type_id);


-- ============================================================================
-- RLS: TACTICS CARDS PACKS
-- Same shape as tactics_cards: readable by any authenticated user, written by
-- admins only.
-- ============================================================================

ALTER TABLE public.tactics_cards_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view tactic card packs"
    ON public.tactics_cards_packs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create tactic card packs"
    ON public.tactics_cards_packs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin())
    );

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

CREATE POLICY "Only admin can delete tactic card packs"
    ON public.tactics_cards_packs
    FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin())
    );


-- ============================================================================
-- TACTICS CARDS -> PACK
-- Added nullable, seeded with the one core pack the existing rows belong to,
-- backfilled, then made NOT NULL. Every card has a pack afterwards, so "core"
-- is exactly "the pack has no gang type" -- one rule, no second null case.
-- ============================================================================

ALTER TABLE public.tactics_cards
    ADD COLUMN tactics_cards_pack_id uuid;

INSERT INTO public.tactics_cards_packs (edition_id, gang_type_id, name)
SELECT e.id, NULL, 'Core Gang Tactics'
FROM public.editions e
WHERE e.slug = 'n26'
  AND NOT EXISTS (
      SELECT 1
      FROM public.tactics_cards_packs existing
      WHERE existing.edition_id = e.id
        AND existing.gang_type_id IS NULL
  );

UPDATE public.tactics_cards c
SET tactics_cards_pack_id = p.id
FROM public.tactics_cards_packs p
WHERE p.edition_id = c.edition_id
  AND p.gang_type_id IS NULL
  AND c.tactics_cards_pack_id IS NULL;

ALTER TABLE public.tactics_cards
    ALTER COLUMN tactics_cards_pack_id SET NOT NULL;

ALTER TABLE public.tactics_cards
    ADD CONSTRAINT tactics_cards_tactics_cards_pack_id_fkey
        FOREIGN KEY (tactics_cards_pack_id)
        REFERENCES public.tactics_cards_packs(id)
        ON DELETE RESTRICT;

-- Keeps a card and its pack in the same edition.
ALTER TABLE public.tactics_cards
    ADD CONSTRAINT tactics_cards_pack_edition_fkey
        FOREIGN KEY (tactics_cards_pack_id, edition_id)
        REFERENCES public.tactics_cards_packs (id, edition_id)
        ON UPDATE CASCADE;

CREATE INDEX tactics_cards_tactics_cards_pack_id_idx
    ON public.tactics_cards (tactics_cards_pack_id);

-- (edition_id, name) would stop two packs in one edition both carrying a card
-- named "Rapid Fire". A pack implies its edition, so the pack is the right
-- scope for the name.
ALTER TABLE public.tactics_cards
    DROP CONSTRAINT tactics_cards_edition_id_name_key;

ALTER TABLE public.tactics_cards
    ADD CONSTRAINT tactics_cards_tactics_cards_pack_id_name_key
        UNIQUE (tactics_cards_pack_id, name);

COMMIT;
