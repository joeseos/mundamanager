import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { checkAdmin, getUserIdFromClaims } from '@/utils/auth'
import {
  ADMIN_NOTIFICATION_TYPES,
  isAdminNotificationType,
  parseExpiresInDays,
  prepareNotificationHtml,
} from '@/utils/notifications'
import { isUuid } from '@/utils/uuid'
import {
  loadNotificationSends,
  notificationSendFailure,
} from '@/utils/sent-notification-history'

type RequestBody = {
  text?: unknown
  type?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
}

type SendResult = {
  id?: string
  count?: number
}

export async function GET() {
  try {
    const supabase = await createClient()
    const senderId = await getUserIdFromClaims(supabase)
    const isAdmin = await checkAdmin(supabase, senderId ? { id: senderId } : undefined)
    if (!isAdmin || !senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const sends = await loadNotificationSends(createServiceRoleClient(), {
        types: ADMIN_NOTIFICATION_TYPES,
      })
      return NextResponse.json({ sends })
    } catch (fetchError) {
      console.error('Failed to fetch sent notifications:', fetchError)
      return NextResponse.json({ error: 'Failed to load sent messages' }, { status: 500 })
    }
  } catch (error) {
    console.error('Admin notifications history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const senderId = await getUserIdFromClaims(supabase)
    const isAdmin = await checkAdmin(supabase, senderId ? { id: senderId } : undefined)
    if (!isAdmin || !senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as RequestBody
    const prepared = prepareNotificationHtml(body.text)
    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error }, { status: 400 })
    }

    if (typeof body.type !== 'string' || !isAdminNotificationType(body.type)) {
      return NextResponse.json(
        { error: 'Type must be one of: mm_announcement, mm_staff_message' },
        { status: 400 }
      )
    }

    const expiresInDays = parseExpiresInDays(body.expiresInDays === undefined ? 30 : body.expiresInDays)
    if (expiresInDays == null) {
      return NextResponse.json(
        { error: 'Expires in days must be between 1 and 365' },
        { status: 400 }
      )
    }

    const audience = body.audience
    if (audience !== 'all' && audience !== 'users') {
      return NextResponse.json(
        { error: "Audience must be 'all' or 'users'" },
        { status: 400 }
      )
    }

    let receiverIds: string[] = []
    if (audience === 'users') {
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one user is required when audience is users' },
          { status: 400 }
        )
      }
      receiverIds = Array.from(new Set(body.userIds.filter(isUuid)))
      if (receiverIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one valid user ID is required' },
          { status: 400 }
        )
      }
    }

    const serviceClient = createServiceRoleClient()
    const { data, error } = await serviceClient.rpc('create_notification_send', {
      p_sender_id: senderId,
      p_type: body.type,
      p_campaign_id: null,
      p_text: prepared.text,
      p_link: null,
      p_expires_in_days: expiresInDays,
      p_audience: audience === 'all' ? 'all' : 'selected',
      p_receiver_ids: receiverIds,
    })

    if (error) {
      console.error('Failed to create admin notification send:', error)
      const failure = notificationSendFailure(error.message ?? '', 'Failed to send notifications')
      return NextResponse.json({ error: failure.error }, { status: failure.status })
    }

    const result = (data ?? {}) as SendResult
    return NextResponse.json({ success: true, count: result.count ?? 0 })
  } catch (error) {
    console.error('Admin notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
