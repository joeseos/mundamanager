-- Function to automatically create a profile when a new user signs up
-- This runs with elevated privileges to bypass RLS policies
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert profile with username from user metadata
  INSERT INTO public.profiles (id, username, user_role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    'user'
  )
  ON CONFLICT (id) DO NOTHING; -- Handle race conditions gracefully
  
  RETURN NEW;
END;
$$;

