-- The house that controls each N26 house territory card, so Add Territories
-- groups them by house. Only Toll Road and Amneo-vats change income: Amneo-vats'
-- "Goliath Controlled: an additional 10 credits" on its 15 Income Boon.
UPDATE public.territories t
SET controlled_gang_type_id = gt.id
FROM (VALUES
  ('Ammo Factoria', 'House Orlock'),
  ('Container Stacks', 'House Orlock'),
  ('Scrap Mine', 'House Orlock'),
  ('Toll Road', 'House Orlock'),
  ('Vehicle Workshop', 'House Orlock'),
  ('Wild Snake Distillery', 'House Orlock'),
  ('Bio-lab', 'House Escher'),
  ('Chem Arena', 'House Escher'),
  ('Phelynx Pen', 'House Escher'),
  ('Rogue Las Factoria', 'House Escher'),
  ('Shivver Den', 'House Escher'),
  ('Wyld Den', 'House Escher'),
  ('Amneo-vats', 'House Goliath'),
  ('Badzone Smelter', 'House Goliath'),
  ('Feasting Hall', 'House Goliath'),
  ('Fight Arena', 'House Goliath'),
  ('Flesh-makers Theatre', 'House Goliath'),
  ('Slug House', 'House Goliath')
) AS v(territory_name, gang_type)
JOIN public.editions e ON e.slug = 'n26'
JOIN public.gang_types gt ON gt.gang_type = v.gang_type AND gt.edition_id = e.id
WHERE t.territory_name = v.territory_name
  AND t.edition_id = e.id;

UPDATE public.territories t
SET controlled_credits = 25
FROM public.editions e
WHERE t.territory_name = 'Amneo-vats'
  AND t.edition_id = e.id
  AND e.slug = 'n26';
