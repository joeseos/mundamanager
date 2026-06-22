CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT coalesce(
    auth.jwt()->'user_profile'->>'user_role' = 'admin',
    false
  );
$$;