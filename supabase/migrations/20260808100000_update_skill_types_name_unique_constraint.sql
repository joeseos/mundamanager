ALTER TABLE public.skill_types
DROP CONSTRAINT skill_types_name_key;

ALTER TABLE public.skill_types
ADD CONSTRAINT skill_types_edition_id_name_key
UNIQUE (edition_id, name);
