BEGIN;

-- ============================================================================
-- GANG TACTICS CARDS: SNAPSHOT THE CARD'S DISPLAY FIELDS
--
-- Reading a gang's tactics meant joining the catalogue for name and D66,
-- pulling an edition-scoped reference table into the gang data path. These
-- three columns are a snapshot taken when the card is added: a later rename in
-- tactics_cards does NOT propagate, by design. tactics_cards_id remains the FK
-- for identity and for the one-copy-per-gang constraint.
-- ============================================================================

ALTER TABLE public.gang_tactics_cards
    ADD COLUMN name text,
    ADD COLUMN d66_min smallint,
    ADD COLUMN d66_max smallint;

UPDATE public.gang_tactics_cards gtc
SET name = tc.name,
    d66_min = tc.d66_min,
    d66_max = tc.d66_max
FROM public.tactics_cards tc
WHERE tc.id = gtc.tactics_cards_id;

ALTER TABLE public.gang_tactics_cards
    ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.gang_tactics_cards
    ADD CONSTRAINT gang_tactics_cards_d66_pair_check
        CHECK (
            (d66_min IS NULL AND d66_max IS NULL)
            OR
            (d66_min IS NOT NULL AND d66_max IS NOT NULL)
        ),
    ADD CONSTRAINT gang_tactics_cards_d66_order_check
        CHECK (
            d66_min IS NULL
            OR d66_min <= d66_max
        );

COMMIT;
