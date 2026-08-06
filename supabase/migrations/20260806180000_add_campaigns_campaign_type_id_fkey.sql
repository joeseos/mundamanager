-- campaigns.campaign_type_id has always been a bare uuid: the column references
-- campaign_types by convention, but no constraint ever enforced it. Without the
-- FK, PostgREST cannot resolve a campaigns -> campaign_types embed and rejects
-- the whole query with PGRST200, which is how this was found (the campaign
-- edition guard on add-gang-to-campaign tried exactly that embed).
--
-- ON DELETE RESTRICT, deliberately not CASCADE. The existing FKs into
-- campaign_types (campaign_triumphs, campaign_type_allegiances,
-- campaign_type_resources) all cascade, but those are child config rows;
-- cascading from campaigns would delete thousands of user campaigns along with
-- a campaign type. RESTRICT matches how gang_types.edition_id protects editions.
--
-- Verified clean before writing: 5177 campaigns, 0 null campaign_type_id,
-- 0 rows pointing at a missing campaign type. This applies without fixups.

alter table public.campaigns
  add constraint campaigns_campaign_type_id_fkey
  foreign key (campaign_type_id) references public.campaign_types(id)
  on delete restrict;
