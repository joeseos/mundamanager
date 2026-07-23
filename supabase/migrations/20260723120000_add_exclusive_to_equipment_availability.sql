-- Gang-exclusive equipment in the Trading Post.
--
-- Adds an "available only to this gang" allow-list flag to equipment_availability.
-- When an equipment item has one or more rows with exclusive = true, the equipment
-- picker RPC (get_equipment_detailed_data) shows that item ONLY to gangs whose gang
-- type / origin / variant matches a flagged row. Items with no flagged rows are
-- unaffected (default false = existing behaviour).
--
-- Previously, trading-post visibility was gated solely on trading-post-type
-- membership, so equipment attached to a trading-post type shared by several gang
-- types appeared for all of them, with no way to restrict it to a specific gang.
--
-- The get_equipment_detailed_data change that reads this column lives in
-- supabase/functions/get_equipment_detailed_data.sql and is applied to the
-- database separately (see supabase/README.md).

ALTER TABLE public.equipment_availability
    ADD COLUMN IF NOT EXISTS exclusive boolean NOT NULL DEFAULT false;
