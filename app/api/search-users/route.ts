import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')
    
    if (!query || query.length < 2) {
      return Response.json([])
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${query}%`)
      .limit(10)

    if (error) {
      console.error('Search users error:', error)
      return Response.json({ error: 'Failed to search users' }, { status: 500 })
    }

    return Response.json(data || [])
  } catch (error) {
    console.error('Search users error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
} 