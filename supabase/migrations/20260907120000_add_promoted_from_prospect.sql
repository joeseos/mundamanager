ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS promoted_from_prospect BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.fighters.promoted_from_prospect IS
  'True when the N26 Prospect→Ganger+Specialist promotion has been applied. Read by openAdvancementsFor to deduct one Advancement (the roll the promotion traded in). Written by applyN26ProspectPromotion, cleared by its undo path, preserved on copy.';

UPDATE public.fighters f
SET promoted_from_prospect = TRUE
FROM public.fighter_types ft
WHERE f.fighter_type_id = ft.id
  AND ft.fighter_subtypes @> '["Prospect"]'::jsonb
  AND f.fighter_specialisation_id IN (
    'f16c7f9c-3fcc-4384-81c8-14a9e863dc28',
    '71a99cf2-5a95-4328-b053-ece6cf70818f',
    '6ba5f84f-1bba-4b33-9837-20750e272b7f',
    '575d0857-1d6d-41f3-ae41-a2d529d648e2',
    '1d32f47b-3788-4fc9-a80a-a20ed63e1601',
    'f9a96b0e-ec6e-4888-b122-84d9d5b8f62a',
    '83f5f0f8-43bc-4c2c-b1d0-e8a2e092e98c',
    '5ca912ac-a74f-4320-a6b2-affb159b95ce'
  );
