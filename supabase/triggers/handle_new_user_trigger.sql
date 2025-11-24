-- Create trigger to fire when a new user is inserted into auth.users
-- This trigger calls the handle_new_user() function to create a profile automatically
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
