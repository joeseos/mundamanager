import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'
import { checkAdmin } from '@/utils/auth'
import { editionSlugFromJoin } from '@/types/edition'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const isAdmin = await checkAdmin(supabase)
    if (!isAdmin) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')

    if (!query || query.length < 2) {
      return Response.json([])
    }

    const { data, error } = await supabase
      .from('campaigns')
      .select('id, campaign_name, campaign_type_id, campaign_types!campaign_type_id(campaign_type_name, editions:edition_id(slug))')
      .ilike('campaign_name', `%${query}%`)
      .limit(10)

    if (error) {
      console.error('Search campaigns error:', error)
      return Response.json({ error: 'Failed to search campaigns' }, { status: 500 })
    }

    const results = (data || []).map((campaign: any) => ({
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      campaign_type_id: campaign.campaign_type_id,
      campaign_type_name: campaign.campaign_types?.campaign_type_name || 'Unknown',
      edition_slug: editionSlugFromJoin(campaign.campaign_types?.editions),
    }))

    return Response.json(results)
  } catch (error) {
    console.error('Search campaigns error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
