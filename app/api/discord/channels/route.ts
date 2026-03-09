import { createClient } from '@/utils/supabase/server'
import { NextRequest } from 'next/server'
import { getUserIdFromClaims } from "@/utils/auth"

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get('guild_id')

  if (!guildId) {
    return Response.json({ error: 'guild_id is required' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Authenticate user
    const userId = await getUserIdFromClaims(supabase)
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access: must be owner/arbitrator/admin of a campaign linked to this guild
    const [campaignResult, profileResult] = await Promise.all([
      supabase
        .from('campaigns')
        .select('id')
        .eq('discord_guild_id', guildId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('user_role')
        .eq('id', userId)
        .single()
    ])

    const isAppAdmin = profileResult.data?.user_role === 'admin'

    if (!isAppAdmin && campaignResult.data) {
      // Check if user is owner/arbitrator of the linked campaign
      const { data: memberData } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignResult.data.id)
        .eq('user_id', userId)
        .in('role', ['OWNER', 'ARBITRATOR'])
        .maybeSingle()

      if (!memberData) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 })
      }
    } else if (!isAppAdmin) {
      return Response.json({ error: 'No campaign linked to this guild' }, { status: 404 })
    }

    // Fetch channels from Discord API using bot token
    const discordResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    })

    if (!discordResponse.ok) {
      console.error('Discord API error:', await discordResponse.text())
      return Response.json({ error: 'Failed to fetch channels' }, { status: 502 })
    }

    const channels = await discordResponse.json()

    // Filter to text channels only (type 0) and return id + name
    const textChannels = channels
      .filter((ch: { type: number }) => ch.type === 0)
      .map((ch: { id: string; name: string }) => ({ id: ch.id, name: ch.name }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

    return Response.json(textChannels)
  } catch (error) {
    console.error('Discord channels error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
