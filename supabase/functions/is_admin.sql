CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.user_role = 'admin'
  );
$$;