-- Ensure fighter_types inherit edition through their gang type.

ALTER TABLE public.fighter_types
  ALTER COLUMN gang_type_id SET NOT NULL;

CREATE INDEX fighter_types_gang_type_id_idx
  ON public.fighter_types USING btree (gang_type_id);

ALTER TABLE public.fighter_types
  ADD CONSTRAINT fighter_types_gang_type_id_fkey
  FOREIGN KEY (gang_type_id)
  REFERENCES public.gang_types(gang_type_id)
  ON DELETE CASCADE;
