-- Campaign Maps: image-based map editor for campaigns
CREATE TABLE IF NOT EXISTS public.campaign_maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    background_image_url text NOT NULL,
    hex_grid_enabled boolean DEFAULT false NOT NULL,
    hex_size numeric DEFAULT 50 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaign_maps_campaign_id_key UNIQUE (campaign_id)
);

ALTER TABLE public.campaign_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign maps are viewable by everyone"
    ON public.campaign_maps FOR SELECT
    USING (true);

CREATE POLICY "Campaign maps can be inserted by authenticated users"
    ON public.campaign_maps FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Campaign maps can be updated by authenticated users"
    ON public.campaign_maps FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Campaign maps can be deleted by authenticated users"
    ON public.campaign_maps FOR DELETE
    TO authenticated
    USING (true);

-- Campaign Map Objects: markers, routes, areas, labels on the map
CREATE TABLE IF NOT EXISTS public.campaign_map_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    campaign_map_id uuid NOT NULL REFERENCES public.campaign_maps(id) ON DELETE CASCADE,
    object_type text NOT NULL,
    geometry jsonb NOT NULL,
    properties jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.campaign_map_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign map objects are viewable by everyone"
    ON public.campaign_map_objects FOR SELECT
    USING (true);

CREATE POLICY "Campaign map objects can be inserted by authenticated users"
    ON public.campaign_map_objects FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Campaign map objects can be updated by authenticated users"
    ON public.campaign_map_objects FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Campaign map objects can be deleted by authenticated users"
    ON public.campaign_map_objects FOR DELETE
    TO authenticated
    USING (true);

-- Extend campaign_territories with map association columns
ALTER TABLE public.campaign_territories
    ADD COLUMN IF NOT EXISTS map_object_id uuid REFERENCES public.campaign_map_objects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS map_hex_coords jsonb,
    ADD COLUMN IF NOT EXISTS show_name_on_map boolean DEFAULT true;
