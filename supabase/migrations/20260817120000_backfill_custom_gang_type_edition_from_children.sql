-- Repair custom gang types whose edition_id was dropped by duplicateCustomGangType (fixed
-- alongside this). Same defect as 20260816130000, one layer over, and recoverable the same way:
-- the sibling custom_fighter_types clone kept its edition, so rule 2 of that migration -- reused
-- unchanged below -- reads the parent's edition back off its children.

UPDATE public.custom_gang_types g
SET edition_id = (
  SELECT id FROM public.editions
  WHERE slug = CASE
    WHEN EXISTS (
           SELECT 1 FROM public.custom_fighter_types f
           WHERE f.custom_gang_type_id = g.id AND f.edition_id IS NOT NULL
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.custom_fighter_types f
           JOIN public.editions e ON e.id = f.edition_id
           WHERE f.custom_gang_type_id = g.id AND e.slug <> 'n26'
         )
    THEN 'n26'
    ELSE 'n23'
  END
)
WHERE g.edition_id IS NULL;
