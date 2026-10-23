import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/utils/supabase/server'
import { parseExpiresInDays, parseLoggedInSince, prepareNotificationHtml } from '@/utils/notifications'
import { isUuid } from '@/utils/uuid'
import { notificationSendFailure } from '@/utils/sent-notification-history'

type SendBody = {
  text?: unknown
  type?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
  loggedInSince?: unknown
}

type SendResult = {
  id?: string
  count?: number
}

export async function postNotificationSend(
  request: Request,
  input: {
    senderId: string
    campaignId: string | null
    selectedAudience: 'users' | 'players'
    recipientNoun: 'user' | 'player'
    failureFallback: string
    type: string | ((body: SendBody) => string | NextResponse)
    /** Admin all-user sends must include a login cutoff. Other callers ignore the field. */
    requireLoggedInSince?: boolean
  }
): Promise<NextResponse> {
  const body = (await request.json()) as SendBody
  const prepared = prepareNotificationHtml(body.text)
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: 400 })
  }

  const resolvedType = typeof input.type === 'function' ? input.type(body) : input.type
  if (resolvedType instanceof NextResponse) return resolvedType

  const expiresInDays = parseExpiresInDays(body.expiresInDays === undefined ? 30 : body.expiresInDays)
  if (expiresInDays == null) {
    return NextResponse.json({ error: 'Expires in days must be between 1 and 365' }, { status: 400 })
  }

  const audience = body.audience
  if (audience !== 'all' && audience !== input.selectedAudience) {
    return NextResponse.json(
      { error: `Audience must be 'all' or '${input.selectedAudience}'` },
      { status: 400 }
    )
  }

  let receiverIds: string[] = []
  if (audience === input.selectedAudience) {
    const ids = Array.isArray(body.userIds) ? body.userIds.filter(isUuid) : []
    if (ids.length === 0) {
      return NextResponse.json(
        { error: `At least one ${input.recipientNoun} is required` },
        { status: 400 }
      )
    }
    receiverIds = Array.from(new Set(ids))
  }

  let loggedInSince: string | null = null
  if (input.requireLoggedInSince && audience === 'all') {
    loggedInSince = parseLoggedInSince(body.loggedInSince)
    if (!loggedInSince) {
      return NextResponse.json(
        { error: 'Logged in on or after must be a real date that is not in the future' },
        { status: 400 }
      )
    }
  }

  const { data, error } = await createServiceRoleClient().rpc('create_notification_send', {
    p_sender_id: input.senderId,
    p_type: resolvedType,
    p_campaign_id: input.campaignId,
    p_text: prepared.text,
    p_expires_in_days: expiresInDays,
    p_audience: audience === 'all' ? 'all' : 'selected',
    p_receiver_ids: receiverIds,
    p_logged_in_since: loggedInSince,
  })

  if (error) {
    console.error('Failed to create notification send:', error)
    const failure = notificationSendFailure(error.message ?? '', input.failureFallback)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  const result = (data ?? {}) as SendResult
  return NextResponse.json({ success: true, count: result.count ?? 0 })
}
