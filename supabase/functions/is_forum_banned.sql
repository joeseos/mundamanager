CREATE OR REPLACE FUNCTION private.is_forum_banned()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM forum_bans b
    WHERE b.user_id = auth.uid()
    AND (b.until IS NULL OR b.until > now())
  );
$$;
