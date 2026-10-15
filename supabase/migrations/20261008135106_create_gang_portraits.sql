-- Shared gang portrait catalogue for the all-gangs image picker.
-- One row per file. group_label is the gallery section, so a file appears in
-- one section only. gangs will later point at a row with portrait_id; this
-- migration does not add that column or change default_image_urls.

BEGIN;

CREATE TABLE public.gang_portraits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    storage_path text NOT NULL,
    credit jsonb NOT NULL,
    group_label text NOT NULL,
    style text NOT NULL,
    label text,

    CONSTRAINT gang_portraits_storage_path_key
        UNIQUE (storage_path),

    CONSTRAINT gang_portraits_storage_path_check
        CHECK (storage_path <> '' AND storage_path !~ '^/'),

    CONSTRAINT gang_portraits_group_label_check
        CHECK (btrim(group_label) <> ''),

    CONSTRAINT gang_portraits_style_check
        CHECK (style IN ('colour', 'black & white', 'ai-assisted')),

    CONSTRAINT gang_portraits_label_check
        CHECK (label IS NULL OR btrim(label) <> ''),

    CONSTRAINT gang_portraits_credit_check
        CHECK (
            jsonb_typeof(credit) = 'object'
            AND btrim(coalesce(credit->>'name', '')) <> ''
        )
);

COMMENT ON TABLE public.gang_portraits IS
    'Catalogue of shared gang portraits in the gang-type-images bucket. One file belongs to one gallery section.';

COMMENT ON COLUMN public.gang_portraits.storage_path IS
    'Object path inside the gang-type-images bucket, such as djidiouf/house_cawdor.webp.';

COMMENT ON COLUMN public.gang_portraits.credit IS
    'Artist credit: name, url, and optional suffix. Shown with the portrait.';

COMMENT ON COLUMN public.gang_portraits.group_label IS
    'Gallery section title, such as House Cawdor. Not a foreign key to gang_types.';

COMMENT ON COLUMN public.gang_portraits.style IS
    'Portrait treatment used as a gallery filter: colour, black & white, or ai-assisted.';

COMMENT ON COLUMN public.gang_portraits.label IS
    'Extra name within a section, such as Faith or Pride 1. Null on the main portrait.';

CREATE INDEX gang_portraits_style_idx
    ON public.gang_portraits (style);

ALTER TABLE public.gang_portraits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view gang portraits"
    ON public.gang_portraits
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admin can create gang portraits"
    ON public.gang_portraits
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY "Only admin can update gang portraits"
    ON public.gang_portraits
    FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin()))
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY "Only admin can delete gang portraits"
    ON public.gang_portraits
    FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gang_portraits TO authenticated;

COMMIT;
