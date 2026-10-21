import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { getUserIdFromClaims } from '@/utils/auth'
import { checkCampaignPermissions } from '@/utils/user-permissions'
import { parseExpiresInDays, prepareNotificationHtml } from '@/utils/notifications'
import { isUuid } from '@/utils/uuid'
import {
  loadNotificationSends,
  notificationSendFailure,
} from '@/utils/sent-notification-history'

type RequestBody = {
  text?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
}

type SendResult = {
  id?: string
  count?: number
}

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

    const body = (await request.json()) as RequestBody
    const prepared = prepareNotificationHtml(body.text)
    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error }, { status: 400 })
    }

    const expiresInDays = parseExpiresInDays(body.expiresInDays === undefined ? 30 : body.expiresInDays)
    if (expiresInDays == null) {
      return NextResponse.json(
        { error: 'Expires in days must be between 1 and 365' },
        { status: 400 }
      )
    }

    const audience = body.audience
    if (audience !== 'all' && audience !== 'players') {
      return NextResponse.json(
        { error: "Audience must be 'all' or 'players'" },
        { status: 400 }
      )
    }

    let receiverIds: string[] = []
    if (audience === 'players') {
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one player is required' },
          { status: 400 }
        )
      }
      receiverIds = Array.from(new Set(body.userIds.filter(isUuid)))
      if (receiverIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one player is required' },
          { status: 400 }
        )
      }
    }

    const serviceClient = createServiceRoleClient()
    const { data, error } = await serviceClient.rpc('create_notification_send', {
      p_sender_id: senderId,
      p_type: 'campaign_message',
      p_campaign_id: campaignId,
      p_text: prepared.text,
      p_link: `/campaigns/${campaignId}`,
      p_expires_in_days: expiresInDays,
      p_audience: audience === 'all' ? 'all' : 'selected',
      p_receiver_ids: receiverIds,
    })

    if (error) {
      console.error('Failed to create campaign message send:', error)
      const failure = notificationSendFailure(error.message ?? '', 'Failed to send messages')
      return NextResponse.json({ error: failure.error }, { status: failure.status })
    }

    const result = (data ?? {}) as SendResult
    return NextResponse.json({ success: true, count: result.count ?? 0 })
  } catch (error) {
    console.error('Campaign messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
