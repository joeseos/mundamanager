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
      .from('gangs')
      .select('id, name, user_id, profiles!user_id(username)')
      .ilike('name', `%${query}%`)
      .limit(10)

    if (error) {
      console.error('Search gangs error:', error)
      return Response.json({ error: 'Failed to search gangs' }, { status: 500 })
    }

    const results = (data || []).map((gang: any) => ({
      id: gang.id,
      name: gang.name,
      user_id: gang.user_id,
      username: gang.profiles?.username || 'Unknown',
    }))

    return Response.json(results)
  } catch (error) {
    console.error('Search gangs error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
