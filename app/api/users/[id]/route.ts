import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'
import { getUserCustomCollections } from '@/app/lib/customise/custom-collections'
import { editionSlugFromJoin, gangEditionSlug, withEditionSlug } from '@/types/edition'
import type { UserCampaign } from '@/types/campaign'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    
    if (!userId) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    
    // Fetch user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, user_role, patreon_tier_id, patreon_tier_title, patron_status, created_at')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch user's public gangs (only basic info)
    const { data: gangs, error: gangsError } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_colour,
        credits,
        reputation,
        rating,
        created_at,
        gang_types!gang_type_id ( editions:edition_id ( slug ) ),
        custom_gang_type:custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (gangsError) {
      console.error('Error fetching user gangs:', gangsError)
      // Don't fail the request if gangs can't be fetched
    }

    // Fetch user's campaign memberships (public campaigns only)
    // Step 1: get campaign membership rows
    const { data: campaignMembers, error: membersError } = await supabase
      .from('campaign_members')
      .select('id, role, joined_at, campaign_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })

    if (membersError) {
      console.error('Error fetching user campaigns:', membersError)
      // Don't fail the request if campaigns can't be fetched
    }

    // Step 2: fetch campaigns by ids (if any)
    let campaignsById: Record<string, UserCampaign> = {}
    if (campaignMembers && campaignMembers.length > 0) {
      const ids = Array.from(new Set(campaignMembers.map((m: any) => m.campaign_id).filter(Boolean)))
      if (ids.length > 0) {
        const { data: campaignsData, error: campaignsFetchError } = await supabase
          .from('campaigns')
          .select('id, campaign_name, status, campaign_types!campaign_type_id (editions:edition_id (slug))')
          .in('id', ids)
        if (campaignsFetchError) {
          console.error('Error fetching campaigns:', campaignsFetchError)
        } else if (campaignsData) {
          campaignsById = campaignsData.reduce((acc: Record<string, UserCampaign>, c: any) => {
            const { campaign_types, ...campaign } = c
            acc[c.id] = { ...campaign, edition_slug: editionSlugFromJoin(campaign_types?.editions) }
            return acc
          }, {} as Record<string, UserCampaign>)
        }
      }
    }

    const campaigns = (campaignMembers || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      joined_at: m.joined_at,
      campaign_id: m.campaign_id,
      campaign: m.campaign_id ? campaignsById[m.campaign_id] ?? null : null,
    }))

    // Hide orphaned memberships that reference non-existing campaigns
    const visibleCampaigns = campaigns.filter((c) => !!c.campaign)

    // Deduplicate by campaign_id, keeping the most recent (list is already ordered by joined_at desc)
    const dedupedCampaignsMap = new Map<string, typeof visibleCampaigns[number]>()
    for (const c of visibleCampaigns) {
      if (c.campaign_id && !dedupedCampaignsMap.has(c.campaign_id)) {
        dedupedCampaignsMap.set(c.campaign_id, c)
      }
    }
    const dedupedCampaigns = Array.from(dedupedCampaignsMap.values())

    // Fetch custom assets data - get full data for the components
    const [customEquipmentResult, customFightersResult, customSkillsResult, customGangTypesResult, customTradingPostsResult] = await Promise.all([
      supabase
        .from('custom_equipment')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('equipment_name'),
      supabase
        .from('custom_fighter_types')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('fighter_type'),
      supabase
        .from('custom_skills')
        .select(`
          id,
          user_id,
          skill_name,
          skill_type_id,
          custom_skill_type_id,
          description,
          created_at,
          updated_at,
          skill_types (name),
          custom_skill_types (name, editions:edition_id (slug))
        `)
        .eq('user_id', userId)
        .order('skill_name'),
      supabase
        .from('custom_gang_types')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('gang_type'),
      supabase
        .from('custom_trading_posts')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('custom_trading_post_name')
    ])

    // Map custom skills to include skill_type_name
    const customSkillsData = (customSkillsResult.data || []).map((skill: any) => ({
      id: skill.id,
      user_id: skill.user_id,
      skill_name: skill.skill_name,
      skill_type_id: skill.skill_type_id,
      skill_type_name: skill.skill_types?.name || skill.custom_skill_types?.name || 'Unknown',
      description: skill.description,
      created_at: skill.created_at,
      updated_at: skill.updated_at,
      // A custom skill has no edition of its own; it inherits its type's.
      edition_slug: editionSlugFromJoin(skill.custom_skill_types?.editions),
    }));

    // Fetch the user's collections (with resolved item names)
    let customCollections: Awaited<ReturnType<typeof getUserCustomCollections>> = []
    try {
      customCollections = await getUserCustomCollections(userId, supabase)
    } catch (collectionsError) {
      console.error('Error fetching custom collections:', collectionsError)
    }

    const customAssets = {
      equipment: customEquipmentResult.data?.length || 0,
      fighters: customFightersResult.data?.length || 0,
      skills: customSkillsData.length,
      gangTypes: customGangTypesResult.data?.length || 0,
      tradingPosts: customTradingPostsResult.data?.length || 0,
      collections: customCollections.length,
    }

    // Fetch related data for fighters (default skills and equipment)
    let fightersWithExtendedData: any[] = (customFightersResult.data || []).map(withEditionSlug);
    if (fightersWithExtendedData.length > 0) {
      const fighterIds = fightersWithExtendedData.map((f: any) => f.id);
      
      // Fetch default skills and skill access
      const [defaultSkillsResult, skillAccessResult] = await Promise.all([
        supabase
          .from('fighter_defaults')
          .select(`
            custom_fighter_type_id,
            skill_id,
            skills (
              id,
              name
            )
          `)
          .in('custom_fighter_type_id', fighterIds)
          .not('skill_id', 'is', null),
        supabase
          .from('fighter_type_skill_access')
          .select(`
            custom_fighter_type_id,
            skill_type_id,
            custom_skill_type_id,
            access_level,
            skill_types (
              id,
              name
            ),
            custom_skill_types (
              id,
              name
            )
          `)
          .in('custom_fighter_type_id', fighterIds)
      ]);

      const defaultSkillsData = defaultSkillsResult.data;
      const skillAccessData = skillAccessResult.data;

      // Fetch default equipment (both regular and custom)
      const [defaultEquipmentResult, defaultCustomEquipmentResult] = await Promise.all([
        supabase
          .from('fighter_defaults')
          .select(`
            custom_fighter_type_id,
            equipment_id,
            equipment (
              id,
              equipment_name
            )
          `)
          .in('custom_fighter_type_id', fighterIds)
          .not('equipment_id', 'is', null),
        supabase
          .from('fighter_defaults')
          .select(`
            custom_fighter_type_id,
            custom_equipment_id,
            custom_equipment (
              id,
              equipment_name
            )
          `)
          .in('custom_fighter_type_id', fighterIds)
          .not('custom_equipment_id', 'is', null)
      ]);

      // Group default skills by fighter ID
      const defaultSkillsByFighter = (defaultSkillsData || []).reduce((acc: any, row: any) => {
        if (!acc[row.custom_fighter_type_id]) {
          acc[row.custom_fighter_type_id] = [];
        }
        acc[row.custom_fighter_type_id].push({
          skill_id: row.skill_id,
          skill_name: row.skills?.name || 'Unknown'
        });
        return acc;
      }, {});

      // Group skill access by fighter ID
      const skillAccessByFighter = (skillAccessData || []).reduce((acc: any, row: any) => {
        if (!acc[row.custom_fighter_type_id]) {
          acc[row.custom_fighter_type_id] = [];
        }
        acc[row.custom_fighter_type_id].push({
          skill_type_id: row.skill_type_id || row.custom_skill_type_id,
          access_level: row.access_level,
          skill_type_name: row.skill_types?.name || row.custom_skill_types?.name || 'Unknown',
          is_custom: !!row.custom_skill_type_id
        });
        return acc;
      }, {});

      // Group default equipment by fighter ID
      const defaultEquipmentByFighter: any = {};
      
      // Process regular equipment
      (defaultEquipmentResult.data || []).forEach((row: any) => {
        if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
          defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
        }
        defaultEquipmentByFighter[row.custom_fighter_type_id].push({
          equipment_id: row.equipment_id,
          equipment_name: row.equipment?.equipment_name || 'Unknown'
        });
      });

      // Process custom equipment
      (defaultCustomEquipmentResult.data || []).forEach((row: any) => {
        if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
          defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
        }
        defaultEquipmentByFighter[row.custom_fighter_type_id].push({
          equipment_id: `custom_${row.custom_equipment_id}`,
          equipment_name: `${row.custom_equipment?.equipment_name || 'Unknown'} (Custom)`
        });
      });

      // Combine fighter data with related data
      fightersWithExtendedData = fightersWithExtendedData.map((fighter: any) => ({
        ...fighter,
        default_skills: defaultSkillsByFighter[fighter.id] || [],
        default_equipment: defaultEquipmentByFighter[fighter.id] || [],
        skill_access: skillAccessByFighter[fighter.id] || []
      }));
    }

    // Every custom asset carries its edition_slug: the profile filters these by
    // edition and the copy action stamps the copy with it, so a missing slug
    // would read as N23 and mis-stamp a copy of an N26 asset.
    const customAssetsData = {
      equipment: (customEquipmentResult.data || []).map(withEditionSlug),
      fighters: fightersWithExtendedData,
      skills: customSkillsData,
      gangTypes: (customGangTypesResult.data || []).map(withEditionSlug),
      tradingPosts: (customTradingPostsResult.data || []).map(withEditionSlug),
      collections: customCollections,
    }

    return Response.json({
      profile,
      // The battle-session opponent picker needs each gang's ruleset, and these
      // are other users' gangs so nothing on the client knows it. Destructured
      // out of the row so the public shape stays flat.
      gangs: (gangs || []).map(({ gang_types, custom_gang_type, ...gang }: any) => ({
        ...gang,
        edition_slug: gangEditionSlug({ gang_types, custom_gang_type }),
      })),
      campaigns: dedupedCampaigns,
      customAssets,
      customAssetsData
    })
  } catch (error) {
    console.error('Error in user API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
