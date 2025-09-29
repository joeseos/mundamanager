-- Add created_at column to profiles table
ALTER TABLE profiles 
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE;

-- Copy created_at values from auth.users to public.profiles
UPDATE profiles 
SET created_at = auth.users.created_at
FROM auth.users
WHERE profiles.id = auth.users.id;

-- Set default for future inserts
ALTER TABLE profiles 
ALTER COLUMN created_at SET DEFAULT TIMEZONE('utc'::text, NOW());

-- Create index for better query performance
CREATE INDEX idx_profiles_created_at ON profiles(created_at);
