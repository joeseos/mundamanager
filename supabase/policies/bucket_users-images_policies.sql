-- WARNING: These DROP statements will remove ANY policies with these names
-- regardless of which bucket they apply to. If you have policies with the same
-- names on other buckets, they will also be dropped.

-- To be safe, first check what policies exist:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'objects';

-- Drop existing policies (use with caution)
DROP POLICY IF EXISTS "Users can upload their own images to users-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images in users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images from users-images" ON storage.objects;

-- Alternative: If you want to be extra safe, manually drop only the specific policies
-- you know exist, or use the Supabase dashboard to manage policies

-- Create updated policies with unique names specific to users-images bucket
CREATE POLICY "Users can upload their own images to users-images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'users-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'gangs'
  AND (
    -- Allow fighter images: gangs/{gang_id}/fighters/{filename}
    (storage.foldername(name))[3] = 'fighters'
    OR
    -- Allow gang images: gangs/{gang_id}/{filename} (no fighters subfolder)
    (storage.foldername(name))[2] IS NOT NULL AND (storage.foldername(name))[3] IS NULL
  )
);

-- Policy to allow users to view images (public bucket)
CREATE POLICY "Anyone can view users-images" ON storage.objects
FOR SELECT USING (
  bucket_id = 'users-images'
);

-- Policy to allow users to update their own images
CREATE POLICY "Users can update their own images in users-images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'users-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'gangs'
  AND (
    -- Allow fighter images: gangs/{gang_id}/fighters/{filename}
    (storage.foldername(name))[3] = 'fighters'
    OR
    -- Allow gang images: gangs/{gang_id}/{filename} (no fighters subfolder)
    (storage.foldername(name))[2] IS NOT NULL AND (storage.foldername(name))[3] IS NULL
  )
);

-- Policy to allow users to delete their own images
CREATE POLICY "Users can delete their own images from users-images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'users-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'gangs'
  AND (
    -- Allow fighter images: gangs/{gang_id}/fighters/{filename}
    (storage.foldername(name))[3] = 'fighters'
    OR
    -- Allow gang images: gangs/{gang_id}/{filename} (no fighters subfolder)
    (storage.foldername(name))[2] IS NOT NULL AND (storage.foldername(name))[3] IS NULL
  )
);