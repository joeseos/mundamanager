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

    const [exactMatches, prefixMatches, substringMatches] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', query)
        .limit(3),
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `${query}%`)
        .limit(5),
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${query}%`)
        .limit(10),
    ])

    if (exactMatches.error || prefixMatches.error || substringMatches.error) {
      console.error('Search users error:', exactMatches.error || prefixMatches.error || substringMatches.error)
      return Response.json({ error: 'Failed to search users' }, { status: 500 })
    }

    const seenIds = new Set<string>()
    const combinedResults: Array<{ id: string; username: string }> = []

    for (const user of exactMatches.data || []) {
      if (!seenIds.has(user.id)) {
        seenIds.add(user.id)
        combinedResults.push(user)
      }
    }
    for (const user of prefixMatches.data || []) {
      if (!seenIds.has(user.id)) {
        seenIds.add(user.id)
        combinedResults.push(user)
      }
    }
    for (const user of substringMatches.data || []) {
      if (!seenIds.has(user.id) && combinedResults.length < 10) {
        seenIds.add(user.id)
        combinedResults.push(user)
      }
    }

    return Response.json(combinedResults)
  } catch (error) {
    console.error('Search users error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
