import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'
import { checkAdmin } from '@/utils/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const isAdmin = await checkAdmin(supabase)
    if (!isAdmin) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { id: userId } = await params

    if (!userId) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, patreon_tier_id, patreon_tier_title, patron_status')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    return Response.json(profile)
  } catch (error) {
    console.error('User detail error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
