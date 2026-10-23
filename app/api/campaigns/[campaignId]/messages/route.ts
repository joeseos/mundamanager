import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { getUserIdFromClaims } from '@/utils/auth'
import { checkCampaignPermissions } from '@/utils/user-permissions'
import { isUuid } from '@/utils/uuid'
import { loadNotificationSends } from '@/utils/sent-notification-history'
import { postNotificationSend } from '@/utils/notification-send-request'

export async function GET(
  _request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await props.params
    if (!isUuid(campaignId)) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const senderId = await getUserIdFromClaims(supabase)
    if (!senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await checkCampaignPermissions(senderId, campaignId)
    if (!permissions.canManageMembers) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const sends = await loadNotificationSends(createServiceRoleClient(), { campaignId })
      return NextResponse.json({ sends })
    } catch (fetchError) {
      console.error('Failed to fetch campaign messages:', fetchError)
      return NextResponse.json({ error: 'Failed to load sent messages' }, { status: 500 })
    }
  } catch (error) {
    console.error('Campaign message history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await props.params
    if (!isUuid(campaignId)) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const senderId = await getUserIdFromClaims(supabase)
    if (!senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await checkCampaignPermissions(senderId, campaignId)
    if (!permissions.canManageMembers) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return postNotificationSend(request, {
      senderId,
      campaignId,
      selectedAudience: 'players',
      recipientNoun: 'player',
      failureFallback: 'Failed to send messages',
      type: 'campaign_message',
    })
  } catch (error) {
    console.error('Campaign messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
