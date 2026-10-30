-- Shared campaign portrait catalogue for the campaign image picker.
-- One row per file. group_label is the gallery section, so a file appears in
-- one section only. campaigns will later point at a row with portrait_id; this
-- migration does not add that column or change campaign_types.image_url.

BEGIN;

CREATE TABLE public.campaign_portraits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    storage_path text NOT NULL,
    credit jsonb NOT NULL,
    group_label text NOT NULL,
    style text NOT NULL,
    label text,

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
        )
);

COMMENT ON TABLE public.campaign_portraits IS
    'Catalogue of shared campaign portraits in the campaign-type-images bucket. One file belongs to one gallery section.';

COMMENT ON COLUMN public.campaign_portraits.storage_path IS
    'Object path inside the campaign-type-images bucket, such as admin/law_and_misrule.webp.';

COMMENT ON COLUMN public.campaign_portraits.credit IS
    'Artist credit: name, url, and optional suffix. Shown with the portrait.';

COMMENT ON COLUMN public.campaign_portraits.group_label IS
    'Gallery section title, such as Law and Misrule. Not a foreign key to campaign_types.';

COMMENT ON COLUMN public.campaign_portraits.style IS
    'Portrait treatment used as a gallery filter: colour, black & white, or ai-assisted.';

COMMENT ON COLUMN public.campaign_portraits.label IS
    'Extra name within a section. Null on the main portrait.';

CREATE INDEX campaign_portraits_style_idx
    ON public.campaign_portraits (style);

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

COMMIT;
