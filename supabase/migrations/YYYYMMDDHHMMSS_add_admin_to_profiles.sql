-- Add is_admin column to profiles table
ALTER TABLE profiles 
ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster queries
CREATE INDEX idx_profiles_is_admin ON profiles(is_admin); 