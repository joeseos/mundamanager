-- Add storage RLS policy for campaign map images in subfolders
-- This allows campaign members to upload map images to campaigns/{campaignId}/map/

-- First, ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('users-images', 'users-images', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (to allow updates)
DROP POLICY IF EXISTS "Campaign map images can be uploaded by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images can be updated by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images can be deleted by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images are viewable by everyone" ON storage.objects;

-- Policy: Allow authenticated users to upload to campaigns/{campaignId}/map/*
-- The user must be a member of the campaign
CREATE POLICY "Campaign map images can be uploaded by campaign members"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND (
            -- Path pattern: campaigns/{uuid}/map/{filename}
            SPLIT_PART(name, '/', 1) = 'campaigns'
            AND SPLIT_PART(name, '/', 3) = 'map'
            -- Check if user is a campaign member using auth.uid()
            AND EXISTS (
                SELECT 1 FROM campaign_members cm
                WHERE cm.campaign_id = SPLIT_PART(name, '/', 2)::uuid
                AND cm.user_id = auth.uid()
            )
        )
    );

-- Policy: Allow authenticated users to update their own campaign map images
CREATE POLICY "Campaign map images can be updated by campaign members"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND EXISTS (
            SELECT 1 FROM campaign_members cm
            WHERE cm.campaign_id = SPLIT_PART(name, '/', 2)::uuid
            AND cm.user_id = auth.uid()
        )
    );

-- Policy: Allow authenticated users to delete campaign map images
CREATE POLICY "Campaign map images can be deleted by campaign members"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND EXISTS (
            SELECT 1 FROM campaign_members cm
            WHERE cm.campaign_id = SPLIT_PART(name, '/', 2)::uuid
            AND cm.user_id = auth.uid()
        )
    );

-- Policy: Allow everyone to read campaign map images
CREATE POLICY "Campaign map images are viewable by everyone"
    ON storage.objects FOR SELECT
    TO PUBLIC
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
    );
