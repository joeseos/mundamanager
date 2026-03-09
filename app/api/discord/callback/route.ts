import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromClaims } from "@/utils/auth"
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/utils/cache-tags'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const guildId = searchParams.get('guild_id')
  const state = searchParams.get('state') // campaignId

  if (!guildId || !state) {
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

    // Save guild_id to campaign — no token exchange needed
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