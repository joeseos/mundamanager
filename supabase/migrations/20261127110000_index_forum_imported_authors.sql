-- Rows pointing at an imported YakTribe author. Deleting an author (an import
-- rerun) and claiming one's posts look rows up by these, which without an
-- index is a full scan of forum_posts per author.

CREATE INDEX IF NOT EXISTS forum_threads_imported_author_id_idx ON public.forum_threads (imported_author_id);
CREATE INDEX IF NOT EXISTS forum_posts_imported_author_id_idx ON public.forum_posts (imported_author_id);
