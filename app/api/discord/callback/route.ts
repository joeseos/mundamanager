import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromClaims } from "@/utils/auth"
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/utils/cache-tags'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const guildId = searchParams.get('guild_id')
  const state = searchParams.get('state') // campaignId

  if (!code || !guildId || !state) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  const campaignId = state

  try {
    const supabase = await createClient()

    // Authenticate user
    const userId = await getUserIdFromClaims(supabase)
    if (!userId) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Verify user is owner/arbitrator of the campaign, or an app-level admin
    const [memberResult, profileResult] = await Promise.all([
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId)
        .in('role', ['OWNER', 'ARBITRATOR'])
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('user_role')
        .eq('id', userId)
        .single()
    ])

    const isAppAdmin = profileResult.data?.user_role === 'admin'
    const isCampaignAdmin = !!memberResult.data

    if (!isCampaignAdmin && !isAppAdmin) {
      return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=unauthorized`, request.url))
    }

    // Exchange the code for an access token (validates the OAuth2 flow)
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/discord/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('Discord token exchange failed:', await tokenResponse.text())
      return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=discord_auth_failed`, request.url))
    }

    // Save guild_id to campaign
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        discord_guild_id: guildId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)

    if (updateError) {
      console.error('Failed to save discord_guild_id:', updateError)
      return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=save_failed`, request.url))
    }

    // Invalidate campaign cache
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaignId))
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId))

    return NextResponse.redirect(new URL(`/campaigns/${campaignId}?discord=connected`, request.url))
  } catch (error) {
    console.error('Discord callback error:', error)
    return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=unexpected`, request.url))
  }
}
