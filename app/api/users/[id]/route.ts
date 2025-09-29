import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'

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
        created_at
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
      .select('id, role, status, joined_at, campaign_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })

    if (membersError) {
      console.error('Error fetching user campaigns:', membersError)
      // Don't fail the request if campaigns can't be fetched
    }

    // Step 2: fetch campaigns by ids (if any)
    let campaignsById: Record<string, { id: string; campaign_name: string; status: string | null }> = {}
    if (campaignMembers && campaignMembers.length > 0) {
      const ids = Array.from(new Set(campaignMembers.map((m: any) => m.campaign_id).filter(Boolean)))
      if (ids.length > 0) {
        const { data: campaignsData, error: campaignsFetchError } = await supabase
          .from('campaigns')
          .select('id, campaign_name, status')
          .in('id', ids)
        if (campaignsFetchError) {
          console.error('Error fetching campaigns:', campaignsFetchError)
        } else if (campaignsData) {
          campaignsById = campaignsData.reduce((acc: any, c: any) => {
            acc[c.id] = c
            return acc
          }, {} as Record<string, { id: string; campaign_name: string; status: string | null }>)
        }
      }
    }

    const campaigns = (campaignMembers || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      status: m.status,
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
    const [customEquipmentResult, customFightersResult, customTerritoriesResult] = await Promise.all([
      supabase
        .from('custom_equipment')
        .select('*')
        .eq('user_id', userId)
        .order('equipment_name'),
      supabase
        .from('custom_fighter_types')
        .select('*')
        .eq('user_id', userId)
        .order('fighter_type'),
      supabase
        .from('custom_territories')
        .select('*')
        .eq('user_id', userId)
        .order('territory_name')
    ])

    const customAssets = {
      equipment: customEquipmentResult.data?.length || 0,
      fighters: customFightersResult.data?.length || 0,
      territories: customTerritoriesResult.data?.length || 0,
    }

    // Fetch related data for fighters (default skills and equipment)
    let fightersWithExtendedData = customFightersResult.data || [];
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
            access_level,
            skill_types (
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
          skill_type_id: row.skill_type_id,
          access_level: row.access_level,
          skill_type_name: row.skill_types?.name || 'Unknown'
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

    const customAssetsData = {
      equipment: customEquipmentResult.data || [],
      fighters: fightersWithExtendedData,
      territories: customTerritoriesResult.data || [],
    }

    return Response.json({
      profile,
      gangs: gangs || [],
      campaigns: dedupedCampaigns,
      customAssets,
      customAssetsData
    })
  } catch (error) {
    console.error('Error in user API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
