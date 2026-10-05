-- N26 alliances charge a Tithe Price to form them, and the fighters that come with the
-- alliance cost 0 credits. The price belongs to the alliance, so it is not split across
-- those fighters.
ALTER TABLE public.alliances
  ADD COLUMN IF NOT EXISTS tithe_cost numeric;

COMMENT ON COLUMN public.alliances.tithe_cost IS
  'Credits a gang pays from its Stash to form this alliance (N26 Tithe Price). Prefills the editable tithe in the gang edit modal, which deducts it as a credits change. NULL is no tithe.';
