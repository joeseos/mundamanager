
BEGIN
  RETURN CASE fighter_class
    WHEN 'Leader' THEN ARRAY['Cunning', 'Shooting', 'Savant']
    WHEN 'Champion' THEN ARRAY['Leadership', 'Shooting']
    WHEN 'Crew' THEN ARRAY['Ferocity', 'Shooting']
    WHEN 'Prospect' THEN ARRAY['Ferocity', 'Cunning']
    WHEN 'Specialist' THEN ARRAY['Combat', 'Savant']
    WHEN 'Juve' THEN ARRAY['Cunning', 'Agility']
    ELSE ARRAY[]::text[]
  END;
END;
