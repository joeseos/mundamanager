-- Gang, fighter and campaign images in users-images could be uploaded,
-- replaced and deleted by any signed-in user: the old policies only checked
-- the shape of the path. Now only those who can edit the gang (its owner, the
-- Arbitrators of its campaigns, admins: the same rule as the gangs UPDATE
-- policy) write under gangs/<gang id>/, and only the campaign's Owner and
-- Arbitrators (and admins) write under campaigns/<campaign id>/, the same rule
-- as the campaign map policies.
--
-- Avatars and forum images keep their own policies. Reads stay public through
-- "Anyone can view users-images".
--
-- Safe to run more than once.

BEGIN;

DROP POLICY IF EXISTS "Users can upload their own images to users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images in users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images from users-images" ON storage.objects;
DROP POLICY IF EXISTS "Gang images can be uploaded by gang owners and arbs" ON storage.objects;
DROP POLICY IF EXISTS "Gang images can be updated by gang owners and arbs" ON storage.objects;
DROP POLICY IF EXISTS "Gang images can be deleted by gang owners and arbs" ON storage.objects;
DROP POLICY IF EXISTS "Campaign images can be uploaded by campaign arbs" ON storage.objects;
DROP POLICY IF EXISTS "Campaign images can be updated by campaign arbs" ON storage.objects;
DROP POLICY IF EXISTS "Campaign images can be deleted by campaign arbs" ON storage.objects;

-- objects.name inside the subquery: a bare name would be gangs.name.
CREATE POLICY "Gang images can be uploaded by gang owners and arbs"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'gangs'
        AND (
            (SELECT private.is_admin())
            OR EXISTS (
                SELECT 1 FROM public.gangs g
                WHERE g.id = SPLIT_PART(objects.name, '/', 2)::uuid
                AND g.user_id = (SELECT auth.uid())
            )
            OR private.is_gang_arb(SPLIT_PART(name, '/', 2)::uuid)
        )
    );

CREATE POLICY "Gang images can be updated by gang owners and arbs"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'gangs'
        AND (
            (SELECT private.is_admin())
            OR EXISTS (
                SELECT 1 FROM public.gangs g
                WHERE g.id = SPLIT_PART(objects.name, '/', 2)::uuid
                AND g.user_id = (SELECT auth.uid())
            )
            OR private.is_gang_arb(SPLIT_PART(name, '/', 2)::uuid)
        )
    )
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'gangs'
        AND (
            (SELECT private.is_admin())
            OR EXISTS (
                SELECT 1 FROM public.gangs g
                WHERE g.id = SPLIT_PART(objects.name, '/', 2)::uuid
                AND g.user_id = (SELECT auth.uid())
            )
            OR private.is_gang_arb(SPLIT_PART(name, '/', 2)::uuid)
        )
    );

CREATE POLICY "Gang images can be deleted by gang owners and arbs"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'gangs'
        AND (
            (SELECT private.is_admin())
            OR EXISTS (
                SELECT 1 FROM public.gangs g
                WHERE g.id = SPLIT_PART(objects.name, '/', 2)::uuid
                AND g.user_id = (SELECT auth.uid())
            )
            OR private.is_gang_arb(SPLIT_PART(name, '/', 2)::uuid)
        )
    );

CREATE POLICY "Campaign images can be uploaded by campaign arbs"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND ((SELECT private.is_admin()) OR private.is_arb(SPLIT_PART(name, '/', 2)::uuid))
    );

CREATE POLICY "Campaign images can be updated by campaign arbs"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND ((SELECT private.is_admin()) OR private.is_arb(SPLIT_PART(name, '/', 2)::uuid))
    )
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND ((SELECT private.is_admin()) OR private.is_arb(SPLIT_PART(name, '/', 2)::uuid))
    );

CREATE POLICY "Campaign images can be deleted by campaign arbs"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND ((SELECT private.is_admin()) OR private.is_arb(SPLIT_PART(name, '/', 2)::uuid))
    );

COMMIT;
