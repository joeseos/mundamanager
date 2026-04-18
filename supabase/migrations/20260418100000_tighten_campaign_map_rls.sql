-- Tighten RLS on campaign_maps, campaign_map_objects and the related
-- storage.objects policies so that only system admins or campaign
-- OWNER/ARBITRATOR members (via private.is_arb) can create, update or
-- delete map data. Reads remain publicly accessible, matching the rest
-- of the campaign data model.
--
-- Safe to run multiple times: drops existing policies first.

-- ---------------------------------------------------------------------------
-- public.campaign_maps
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Campaign maps are viewable by everyone" ON public.campaign_maps;
DROP POLICY IF EXISTS "Campaign maps can be inserted by authenticated users" ON public.campaign_maps;
DROP POLICY IF EXISTS "Campaign maps can be updated by authenticated users" ON public.campaign_maps;
DROP POLICY IF EXISTS "Campaign maps can be deleted by authenticated users" ON public.campaign_maps;

CREATE POLICY "Campaign maps are viewable by everyone"
    ON public.campaign_maps FOR SELECT
    USING (true);

CREATE POLICY "Only admins or campaign arbs can insert campaign maps"
    ON public.campaign_maps FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin() AS is_admin)
        OR (SELECT private.is_arb(campaign_maps.campaign_id) AS is_arb)
    );

CREATE POLICY "Only admins or campaign arbs can update campaign maps"
    ON public.campaign_maps FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (SELECT private.is_arb(campaign_maps.campaign_id) AS is_arb)
    )
    WITH CHECK (
        (SELECT private.is_admin() AS is_admin)
        OR (SELECT private.is_arb(campaign_maps.campaign_id) AS is_arb)
    );

CREATE POLICY "Only admins or campaign arbs can delete campaign maps"
    ON public.campaign_maps FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR (SELECT private.is_arb(campaign_maps.campaign_id) AS is_arb)
    );

-- ---------------------------------------------------------------------------
-- public.campaign_map_objects
-- ---------------------------------------------------------------------------
-- The table only references campaign_map_id, so we resolve the owning
-- campaign through public.campaign_maps.

DROP POLICY IF EXISTS "Campaign map objects are viewable by everyone" ON public.campaign_map_objects;
DROP POLICY IF EXISTS "Campaign map objects can be inserted by authenticated users" ON public.campaign_map_objects;
DROP POLICY IF EXISTS "Campaign map objects can be updated by authenticated users" ON public.campaign_map_objects;
DROP POLICY IF EXISTS "Campaign map objects can be deleted by authenticated users" ON public.campaign_map_objects;

CREATE POLICY "Campaign map objects are viewable by everyone"
    ON public.campaign_map_objects FOR SELECT
    USING (true);

CREATE POLICY "Only admins or campaign arbs can insert campaign map objects"
    ON public.campaign_map_objects FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT private.is_admin() AS is_admin)
        OR EXISTS (
            SELECT 1
            FROM public.campaign_maps m
            WHERE m.id = campaign_map_objects.campaign_map_id
              AND (SELECT private.is_arb(m.campaign_id) AS is_arb)
        )
    );

CREATE POLICY "Only admins or campaign arbs can update campaign map objects"
    ON public.campaign_map_objects FOR UPDATE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR EXISTS (
            SELECT 1
            FROM public.campaign_maps m
            WHERE m.id = campaign_map_objects.campaign_map_id
              AND (SELECT private.is_arb(m.campaign_id) AS is_arb)
        )
    )
    WITH CHECK (
        (SELECT private.is_admin() AS is_admin)
        OR EXISTS (
            SELECT 1
            FROM public.campaign_maps m
            WHERE m.id = campaign_map_objects.campaign_map_id
              AND (SELECT private.is_arb(m.campaign_id) AS is_arb)
        )
    );

CREATE POLICY "Only admins or campaign arbs can delete campaign map objects"
    ON public.campaign_map_objects FOR DELETE
    TO authenticated
    USING (
        (SELECT private.is_admin() AS is_admin)
        OR EXISTS (
            SELECT 1
            FROM public.campaign_maps m
            WHERE m.id = campaign_map_objects.campaign_map_id
              AND (SELECT private.is_arb(m.campaign_id) AS is_arb)
        )
    );

-- ---------------------------------------------------------------------------
-- storage.objects: restrict campaign map image uploads to campaign arbs
-- ---------------------------------------------------------------------------
-- The previous policy allowed any campaign member to upload, overwrite or
-- delete map images. Tighten to the same OWNER/ARBITRATOR role the server
-- actions enforce, and add a WITH CHECK on UPDATE.

DROP POLICY IF EXISTS "Campaign map images can be uploaded by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images can be updated by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images can be deleted by campaign members" ON storage.objects;
DROP POLICY IF EXISTS "Campaign map images are viewable by everyone" ON storage.objects;

CREATE POLICY "Campaign map images can be uploaded by campaign arbs"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (SELECT private.is_arb(SPLIT_PART(name, '/', 2)::uuid) AS is_arb)
        )
    );

CREATE POLICY "Campaign map images can be updated by campaign arbs"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (SELECT private.is_arb(SPLIT_PART(name, '/', 2)::uuid) AS is_arb)
        )
    )
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (SELECT private.is_arb(SPLIT_PART(name, '/', 2)::uuid) AS is_arb)
        )
    );

CREATE POLICY "Campaign map images can be deleted by campaign arbs"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
        AND (
            (SELECT private.is_admin() AS is_admin)
            OR (SELECT private.is_arb(SPLIT_PART(name, '/', 2)::uuid) AS is_arb)
        )
    );

CREATE POLICY "Campaign map images are viewable by everyone"
    ON storage.objects FOR SELECT
    TO PUBLIC
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'campaigns'
        AND SPLIT_PART(name, '/', 3) = 'map'
    );
