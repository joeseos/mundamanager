-- Migrate trading post equipment references into fighter_type_equipment
INSERT INTO fighter_type_equipment (fighter_type_id, equipment_id)
SELECT fet.fighter_type_id, (elem)::uuid
FROM fighter_equipment_tradingpost fet
CROSS JOIN jsonb_array_elements_text(fet.equipment_tradingpost) AS elem
WHERE NOT EXISTS (
    SELECT 1 FROM fighter_type_equipment fte
    WHERE fte.fighter_type_id = fet.fighter_type_id
      AND fte.equipment_id = (elem)::uuid
);

DROP TABLE fighter_equipment_tradingpost;
