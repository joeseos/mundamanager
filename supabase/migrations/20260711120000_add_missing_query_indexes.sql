-- Indexes for query predicates that previously fell back to sequential scans.
-- Found by auditing every predicate used by the cached read layer and the
-- server actions against the schema (refac/cache-tags).

-- getCampaignCaptives: WHERE captured = true AND captured_by_gang_id IN (...)
-- (previously a seq scan over the fighters table)
CREATE INDEX IF NOT EXISTS idx_fighters_captured_by_gang
  ON public.fighters (captured_by_gang_id) WHERE captured = true;

-- getUserCampaigns / getUserShareCampaigns: WHERE user_id = X
-- (the existing composite index leads with campaign_id, so it cannot serve
-- user-first lookups)
CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id
  ON public.campaign_members (user_id);

-- Gang fighters bundle + getFighterTotalCost: WHERE fighter_owner_id IN (...)
CREATE INDEX IF NOT EXISTS idx_fighter_exotic_beasts_owner
  ON public.fighter_exotic_beasts (fighter_owner_id);

-- Gang fighters bundle nested embed: custom_weapon_profiles by custom_equipment_id
-- (only weapon_group_id was indexed)
CREATE INDEX IF NOT EXISTS idx_custom_weapon_profiles_equipment
  ON public.custom_weapon_profiles (custom_equipment_id);

-- getFriendsAndRequests: .or(requester_id.eq.X, addressee_id.eq.X)
-- (the requester side rides the UNIQUE constraint; the addressee side scanned)
CREATE INDEX IF NOT EXISTS idx_friends_addressee
  ON public.friends (addressee_id);

-- Home page custom content entries: WHERE user_id = X
-- (the other four custom_* tables already have this index)
CREATE INDEX IF NOT EXISTS idx_custom_skills_user_id
  ON public.custom_skills (user_id);
CREATE INDEX IF NOT EXISTS idx_custom_fighter_types_user_id
  ON public.custom_fighter_types (user_id);
