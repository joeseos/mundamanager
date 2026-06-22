CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
BEGIN
  IF auth.jwt()->'user_profile' IS NOT NULL THEN
    RETURN coalesce(
      auth.jwt()->'user_profile'->>'user_role' = 'admin',
      false
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.user_role = 'admin'
  );
END;
$$;