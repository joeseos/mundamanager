import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'
import { checkAdmin } from '@/utils/auth'

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
      .select('id, campaign_name, campaign_type_id')
      .ilike('campaign_name', `%${query}%`)
      .limit(10)

    if (error) {
      console.error('Search campaigns error:', error)
      return Response.json({ error: 'Failed to search campaigns' }, { status: 500 })
    }

    const typeIds = Array.from(new Set((data || []).map(c => c.campaign_type_id).filter(Boolean)))
    let typesMap: Record<string, string> = {}

    if (typeIds.length > 0) {
      const { data: types } = await supabase
        .from('campaign_types')
        .select('id, campaign_type_name')
        .in('id', typeIds)

      if (types) {
        typesMap = Object.fromEntries(types.map(t => [t.id, t.campaign_type_name]))
      }
    }

    const results = (data || []).map((campaign: any) => ({
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      campaign_type_id: campaign.campaign_type_id,
      campaign_type_name: typesMap[campaign.campaign_type_id] || 'Unknown',
    }))

    return Response.json(results)
  } catch (error) {
    console.error('Search campaigns error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
