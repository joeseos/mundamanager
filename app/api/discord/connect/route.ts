import { NextRequest, NextResponse } from 'next/server'
import { isUuid } from '@/utils/uuid'

/**
 * Starts the Discord bot connect flow for a campaign. The state sent to Discord
 * carries a nonce that is also kept in an httpOnly cookie, and the callback only
 * accepts a state whose nonce matches it, so no other page (e.g. an image in a
 * forum post) can make a signed-in user's browser call the callback.
 * The connect button opens this on NEXT_PUBLIC_APP_URL, the callback's host.
 */
export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaign_id')
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!isUuid(campaignId) || !clientId || !appUrl) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  const nonce = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '2048',
    scope: 'bot identify',
    redirect_uri: `${appUrl}/api/discord/callback`,
    response_type: 'code',
    state: `${campaignId}.${nonce}`,
  })
  const response = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`)
  response.cookies.set(`discord_oauth_state_${campaignId}`, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/discord/callback',
    maxAge: 600,
  })
  return response
}
