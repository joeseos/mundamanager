ALTER TABLE public.gangs
  ADD COLUMN note_private text,
  ADD COLUMN note_private_updated_at timestamptz;
