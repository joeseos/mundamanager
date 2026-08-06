-- A battle session is played under exactly one ruleset, and both the injury
-- catalog and the XP tables differ per edition. Nothing in the session data
-- carries an edition today, so pin it on the session itself.
--
-- Deriving it through campaign -> campaign_types -> editions covers most rows,
-- but 118 of 1522 sessions have campaign_id IS NULL (skirmish), which that
-- chain cannot answer. Storing it also keeps historic sessions correct if a
-- campaign is later re-pointed at a different campaign type.

ALTER TABLE public.battle_sessions
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.editions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS battle_sessions_edition_id_idx
  ON public.battle_sessions (edition_id);

COMMENT ON COLUMN public.battle_sessions.edition_id IS
  'Ruleset the session is played under. Derived server-side at creation from the '
  'campaign type, or from the creating gang for skirmish sessions. Nullable: a '
  'null edition resolves to NO_CAPABILITIES in the app rather than silently '
  'serving another edition''s rules.';

-- Campaign sessions: take the edition from the campaign's type.
UPDATE public.battle_sessions bs
SET edition_id = ct.edition_id
FROM public.campaigns c
JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
WHERE c.id = bs.campaign_id
  AND bs.edition_id IS NULL
  AND ct.edition_id IS NOT NULL;

-- Everything left over (skirmish sessions, and campaigns whose type has no
-- edition) predates N26, so it is n23 by definition.
UPDATE public.battle_sessions
SET edition_id = (
  SELECT id
  FROM public.editions
  WHERE slug = 'n23'
)
WHERE edition_id IS NULL;
