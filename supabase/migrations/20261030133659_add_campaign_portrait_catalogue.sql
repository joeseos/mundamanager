-- Campaign portrait catalogue, the campaign pointer, and admin storage.
--
-- One row per file in campaign_portraits. campaign_type_id is the campaign
-- type the portrait belongs to. group_label is the type name at save time;
-- the app shows the current name through the foreign key.
-- campaigns.campaign_portrait_id points at one row. campaign_types.image_url
-- stays as the fallback when a campaign has no custom upload and no portrait.
-- Deleting a catalogue portrait clears that pointer. It does not delete the campaign.

BEGIN;

CREATE TABLE public.campaign_portraits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    storage_path text NOT NULL,
    credit jsonb NOT NULL,
    group_label text NOT NULL,
    style text NOT NULL,
    label text,
    campaign_type_id uuid NOT NULL,

    CONSTRAINT campaign_portraits_storage_path_key
        UNIQUE (storage_path),

    CONSTRAINT campaign_portraits_storage_path_check
        CHECK (storage_path <> '' AND storage_path !~ '^/'),

    CONSTRAINT campaign_portraits_group_label_check
        CHECK (btrim(group_label) <> ''),

    CONSTRAINT campaign_portraits_style_check
        CHECK (style IN ('colour', 'black & white', 'ai-assisted')),

    CONSTRAINT campaign_portraits_label_check
        CHECK (label IS NULL OR btrim(label) <> ''),

    CONSTRAINT campaign_portraits_credit_check
        CHECK (
            jsonb_typeof(credit) = 'object'
            AND btrim(coalesce(credit->>'name', '')) <> ''
        ),

    CONSTRAINT campaign_portraits_campaign_type_id_fkey
        FOREIGN KEY (campaign_type_id)
        REFERENCES public.campaign_types(id)
);

COMMENT ON TABLE public.campaign_portraits IS
    'Catalogue of shared campaign portraits in the campaign-type-images bucket. One file belongs to one campaign type.';

COMMENT ON COLUMN public.campaign_portraits.storage_path IS
    'Object path inside the campaign-type-images bucket, such as admin/law_and_misrule.webp.';

COMMENT ON COLUMN public.campaign_portraits.credit IS
    'Artist credit: name, url, and optional suffix. Shown with the portrait.';

COMMENT ON COLUMN public.campaign_portraits.group_label IS
    'Campaign type name copied when the portrait is saved. The app displays the current name through campaign_type_id.';

COMMENT ON COLUMN public.campaign_portraits.style IS
    'Portrait treatment used as a gallery filter: colour, black & white, or ai-assisted.';

COMMENT ON COLUMN public.campaign_portraits.label IS
    'Extra name within a section. Null on the main portrait.';

COMMENT ON COLUMN public.campaign_portraits.campaign_type_id IS
    'Campaign type this portrait belongs to. Renaming the type does not detach the portrait.';

CREATE INDEX campaign_portraits_style_idx
    ON public.campaign_portraits (style);

CREATE INDEX campaign_portraits_campaign_type_id_idx
    ON public.campaign_portraits (campaign_type_id);

ALTER TABLE public.campaign_portraits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view campaign portraits"
    ON public.campaign_portraits
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create campaign portraits"
    ON public.campaign_portraits
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY "Only admin can update campaign portraits"
    ON public.campaign_portraits
    FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin()))
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY "Only admin can delete campaign portraits"
    ON public.campaign_portraits
    FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_portraits TO authenticated;

ALTER TABLE public.campaigns
    ADD COLUMN campaign_portrait_id uuid;

ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_campaign_portrait_id_fkey
    FOREIGN KEY (campaign_portrait_id)
    REFERENCES public.campaign_portraits(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.campaigns.campaign_portrait_id IS
    'Selected shared portrait from campaign_portraits. Null for a custom upload, the campaign type image, or no catalogue image.';

CREATE INDEX campaigns_campaign_portrait_id_idx
    ON public.campaigns (campaign_portrait_id)
    WHERE campaign_portrait_id IS NOT NULL;

-- Admin uploads go to the public campaign-type-images bucket under admin/<file>.webp.
-- Listing a folder needs a SELECT policy. Insert, update, delete, and that list
-- are limited to objects whose first path segment is admin.
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-type-images', 'campaign-type-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Campaign type images can be listed by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be uploaded by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be updated by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be deleted by admins" ON storage.objects;

CREATE POLICY "Campaign type images can be listed by admins"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be uploaded by admins"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be updated by admins"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    )
    WITH CHECK (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be deleted by admins"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

COMMIT;
