-- Forum likes: not on your own posts, nor on removed ones
DROP POLICY IF EXISTS "Users can like posts" ON public.forum_post_likes;

CREATE POLICY "Users can like posts"
  ON public.forum_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.forum_posts p
      WHERE p.id = post_id
        AND p.deleted_at IS NULL
        AND p.author_id IS DISTINCT FROM (SELECT auth.uid())
    )
  );
