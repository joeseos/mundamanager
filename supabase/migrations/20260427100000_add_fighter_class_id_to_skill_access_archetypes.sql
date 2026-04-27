ALTER TABLE public.skill_access_archetypes
  ADD COLUMN fighter_class_id uuid REFERENCES public.fighter_classes(id) ON DELETE SET NULL;
