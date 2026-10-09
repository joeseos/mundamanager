-- Point a gang at one row in gang_portraits.
--
-- default_gang_image and gang_types.default_image_urls stay. The app still
-- resolves portraits from that index. gang_portrait_id is filled by the next
-- migration and is what the app will read once it is switched over.
--
-- Deleting a catalogue portrait clears the pointer. It does not delete the gang.
-- The index is partial because gangs with a custom upload, the silhouette, or
-- no selection keep a null gang_portrait_id, and a foreign-key check only looks up
-- non-null values.

ALTER TABLE public.gangs
    ADD COLUMN gang_portrait_id uuid;

ALTER TABLE public.gangs
    ADD CONSTRAINT gangs_gang_portrait_id_fkey
    FOREIGN KEY (gang_portrait_id)
    REFERENCES public.gang_portraits(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.gangs.gang_portrait_id IS
    'Selected shared portrait from gang_portraits. Null for a custom upload, the silhouette, or no catalogue image.';

CREATE INDEX gangs_gang_portrait_id_idx
    ON public.gangs (gang_portrait_id)
    WHERE gang_portrait_id IS NOT NULL;
