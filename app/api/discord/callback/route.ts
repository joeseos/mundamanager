import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromClaims } from "@/utils/auth"
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/utils/cache-tags'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // 1. Log all incoming search params
  console.log('[Discord Callback] Incoming params:', Object.fromEntries(searchParams.entries()))

  const guildId = searchParams.get('guild_id')
  const state = searchParams.get('state') // campaignId

  if (!guildId || !state) {
    // 2. Log which param is missing
    console.log('[Discord Callback] Missing params — guild_id:', guildId, 'state:', state)
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  const campaignId = state

  // 3. Log guildId and campaignId
  console.log('[Discord Callback] guildId:', guildId, 'campaignId:', campaignId)

  try {
    const supabase = await createClient()

    // Authenticate user
    const userId = await getUserIdFromClaims(supabase)

    // 4. Log userId (or null)
    console.log('[Discord Callback] userId:', userId)

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

    // 5. Log auth query results
    console.log('[Discord Callback] Auth check — userId:', userId, 'isCampaignAdmin:', isCampaignAdmin, 'isAppAdmin:', isAppAdmin, 'memberResult error:', memberResult.error, 'profileResult error:', profileResult.error)

    if (!isCampaignAdmin && !isAppAdmin) {
      // 6. Log unauthorized before redirect
      console.log('[Discord Callback] Unauthorized — redirecting. campaignId:', campaignId, 'userId:', userId)
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

    // 7. Log DB update result
    if (updateError) {
      console.error('[Discord Callback] DB update error:', updateError)
      return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=save_failed`, request.url))
    }

    console.log('[Discord Callback] DB update success — guildId:', guildId, 'campaignId:', campaignId)

    // Invalidate campaign cache
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaignId))
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId))

    // Return self-closing HTML that notifies the opener window via postMessage
    const origin = new URL(request.url).origin
    const html = `<!DOCTYPE html>
<html><head><title>Discord Connected</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff">
<p>Connected! You can close this window.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'discord-connected', guildId: ${JSON.stringify(guildId)} }, ${JSON.stringify(origin)});
  }
  window.close();
</script>
</body></html>`

    console.log('[Discord Callback] Success — returning HTML. guildId:', guildId, 'campaignId:', campaignId)

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('Discord callback error:', error)
    return NextResponse.redirect(new URL(`/campaigns/${campaignId}?error=unexpected`, request.url))
  }
}