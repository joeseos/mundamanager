CREATE OR REPLACE FUNCTION private.is_forum_moderator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.user_role IN ('admin', 'moderator')
  );
$$;
