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
    
    // Perform three separate queries for optimal ranking:
    // 1. Exact matches (highest priority)
    // 2. Prefix matches (starts with - second priority)  
    // 3. Substring matches (lowest priority)
    // This follows autocomplete best practices for relevance ranking
    
    const [exactMatches, prefixMatches, substringMatches] = await Promise.all([
      // Exact match
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', query)
        .limit(3),
      
      // Prefix match (starts with)
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `${query}%`)
        .limit(5),
      
      // Substring match
      supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${query}%`)
        .limit(10)
    ])

    if (exactMatches.error || prefixMatches.error || substringMatches.error) {
      console.error('Search users error:', exactMatches.error || prefixMatches.error || substringMatches.error)
      return Response.json({ error: 'Failed to search users' }, { status: 500 })
    }

    // Combine results with proper prioritization and deduplication
    const seenIds = new Set<string>()
    const combinedResults: Array<{id: string, username: string}> = []
    
    // Add exact matches first
    for (const user of exactMatches.data || []) {
      if (!seenIds.has(user.id)) {
        seenIds.add(user.id)
        combinedResults.push(user)
      }
    }
    
    // Add prefix matches second
    for (const user of prefixMatches.data || []) {
      if (!seenIds.has(user.id)) {
        seenIds.add(user.id)
        combinedResults.push(user)
      }
    }
    
    // Add substring matches last
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