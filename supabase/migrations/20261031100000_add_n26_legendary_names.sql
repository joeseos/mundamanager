-- N26 Legendary Names: the four Legendary Name Skill Sets and their names, copied
-- from N23, plus Allowed access for every N26 House Orlock fighter type. Orlock
-- variants are House Orlock gangs with a gang subtype, so these rows cover them.
-- Incredible Drives gets no access rows: in N23 only the Iron Rider had it.

WITH n23 AS (SELECT id FROM editions WHERE slug = 'n23'),
     n26 AS (SELECT id FROM editions WHERE slug = 'n26'),
     new_sets AS (
  INSERT INTO skill_types (name, legendary_name, edition_id)
  SELECT st.name, true, (SELECT id FROM n26)
  FROM skill_types st
  WHERE st.legendary_name
    AND st.edition_id = (SELECT id FROM n23)
    AND NOT EXISTS (
      SELECT 1 FROM skill_types existing
      WHERE existing.name = st.name AND existing.edition_id = (SELECT id FROM n26)
    )
  RETURNING id, name
),
new_skills AS (
  INSERT INTO skills (name, skill_type_id)
  SELECT s.name, ns.id
  FROM new_sets ns
  JOIN skill_types old_set
    ON old_set.name = ns.name AND old_set.edition_id = (SELECT id FROM n23)
  JOIN skills s ON s.skill_type_id = old_set.id
  RETURNING id
)
INSERT INTO fighter_type_skill_access (fighter_type_id, skill_type_id, access_level)
SELECT ft.id, ns.id, 'allowed'
FROM new_sets ns
CROSS JOIN fighter_types ft
JOIN gang_types gt ON gt.id = ft.gang_type_id
WHERE gt.gang_type = 'House Orlock'
  AND gt.edition_id = (SELECT id FROM n26)
  AND NOT ft.is_vehicle
  AND ns.name <> 'Incredible Drives';
