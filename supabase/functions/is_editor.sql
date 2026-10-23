-- Article editors: profiles.user_role 'editor', plus every admin.
CREATE OR REPLACE FUNCTION private.is_editor()
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
    AND p.user_role IN ('admin', 'editor')
  );
$$;
