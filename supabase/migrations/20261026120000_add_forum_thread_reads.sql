-- Forum read state: the last post each user has read in each thread (when they
-- reached its last page), so the thread list can show threads with posts they
-- haven't seen in bold. Private to the user.
--
-- DEPLOY ORDER: apply after 20261026100000_add_forum_reports.sql.

BEGIN;

CREATE TABLE public.forum_thread_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);

COMMENT ON TABLE public.forum_thread_reads IS
  'The time of the last post each user has read in each forum thread. A thread with a later post is unread.';

CREATE INDEX forum_thread_reads_thread_idx
  ON public.forum_thread_reads (thread_id);

ALTER TABLE public.forum_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reads"
  ON public.forum_thread_reads FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can mark threads read"
  ON public.forum_thread_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their reads"
  ON public.forum_thread_reads FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.forum_thread_reads FROM PUBLIC, anon, authenticated;
-- Only the user's own rows, and a wrong time only misleads the user themselves
GRANT SELECT, INSERT, UPDATE ON public.forum_thread_reads TO authenticated;
GRANT ALL ON public.forum_thread_reads TO service_role;

COMMIT;
