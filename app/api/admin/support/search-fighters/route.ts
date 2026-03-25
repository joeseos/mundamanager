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
      .from('fighters')
      .select('id, fighter_name, gang_id, gangs!gang_id(id, name)')
      .ilike('fighter_name', `%${query}%`)
      .limit(10)

    if (error) {
      console.error('Search fighters error:', error)
      return Response.json({ error: 'Failed to search fighters' }, { status: 500 })
    }

    const results = (data || []).map((fighter: any) => ({
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      gang_id: fighter.gang_id,
      gang_name: fighter.gangs?.name || 'Unknown',
    }))

    return Response.json(results)
  } catch (error) {
    console.error('Search fighters error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
