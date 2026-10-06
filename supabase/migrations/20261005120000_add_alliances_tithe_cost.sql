-- N26 alliances have a Tithe Price: a gang pays it to form or break the alliance, and adds
-- it to its Gang Rating while allied. The fighters that come with the alliance cost 0
-- credits, so the price belongs to the alliance rather than being split across them.
ALTER TABLE public.alliances
  ADD COLUMN IF NOT EXISTS tithe_cost numeric;

COMMENT ON COLUMN public.alliances.tithe_cost IS
  'N26 Tithe Price: credits a gang pays from its Stash to form or break this alliance, and adds to its rating while allied. Prefills the editable tithe in the gang edit modal; updateGang moves rating by it on an alliance change. NULL is no tithe.';
