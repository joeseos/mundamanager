import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { checkAdmin, getUserIdFromClaims } from '@/utils/auth'
import {
  isAdminNotificationType,
  isSafeNotificationLink,
  notificationPlainTextLength,
  NOTIFICATION_BROADCAST_MAX_LENGTH,
} from '@/utils/notifications'
import { sanitizeNotificationHtml } from '@/utils/sanitize-notification-html'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import { fetchAllRows } from '@/utils/supabase/fetch-all-rows'

const BATCH_SIZE = 500
const PREVIEW_LENGTH = 60

type AdminSentNotification = {
  id: string
  type: string
  text: string
  link: string
  sentAt: string
  senderUsername: string
  recipientCount: number
  recipientUsernames: string[]
}

function notificationPreview(html: string): string {
  const plain = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= PREVIEW_LENGTH) return plain
  return `${plain.slice(0, PREVIEW_LENGTH).trimEnd()}…`
}

export async function GET() {
  try {
    const supabase = await createClient()
    const senderId = await getUserIdFromClaims(supabase)
    const isAdmin = await checkAdmin(supabase, senderId ? { id: senderId } : undefined)
    if (!isAdmin || !senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()
    const { data, error } = await serviceClient.rpc('list_admin_sent_notifications')
    if (error) {
      console.error('Failed to fetch sent notifications:', error)
      return NextResponse.json({ error: 'Failed to load sent messages' }, { status: 500 })
    }

    const rows = (Array.isArray(data) ? data : []) as AdminSentNotification[]
    const sends = rows.flatMap((row) => {
      if (!isAdminNotificationType(row.type)) return []
      const text = sanitizeNotificationHtml(typeof row.text === 'string' ? row.text : '')
      const link = typeof row.link === 'string' && isSafeNotificationLink(row.link) ? row.link.trim() : ''
      return [{
        id: row.id,
        type: row.type,
        sentAt: row.sentAt,
        senderUsername: row.senderUsername || 'Unknown',
        recipientCount: row.recipientCount,
        recipientUsernames: Array.isArray(row.recipientUsernames) ? row.recipientUsernames : [],
        preview: notificationPreview(text),
        text,
        link,
      }]
    })

    return NextResponse.json({ sends })
  } catch (error) {
    console.error('Admin notifications history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type RequestBody = {
  text?: unknown
  type?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
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

    let text = typeof body.text === 'string' ? body.text.trim() : ''
    // This route is the rich-text composer, so the stored row is always HTML.
    text = sanitizeNotificationHtml(text).trim()
    if (!text || isHtmlEffectivelyEmpty(text)) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    if (notificationPlainTextLength(text) > NOTIFICATION_BROADCAST_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Message must be at most ${NOTIFICATION_BROADCAST_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }

    if (typeof body.type !== 'string' || !isAdminNotificationType(body.type)) {
      return NextResponse.json(
        { error: 'Type must be one of: mm_announcement, mm_staff_message' },
        { status: 400 }
      )
    }
    const type = body.type

    const expiresInDays =
      typeof body.expiresInDays === 'number' && Number.isFinite(body.expiresInDays)
        ? Math.floor(body.expiresInDays)
        : 30

    if (expiresInDays < 1) {
      return NextResponse.json(
        { error: 'Expires in days must be at least 1' },
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

    const serviceClient = createServiceRoleClient()
    let receiverIds: string[] = []

    if (audience === 'all') {
      let profiles: { id: string }[]
      try {
        profiles = await fetchAllRows((from, to) =>
          serviceClient
            .from('profiles')
            .select('id')
            .order('id', { ascending: true })
            .range(from, to)
        )
      } catch (profilesError) {
        console.error('Failed to fetch profiles for notifications:', profilesError)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
      }

      receiverIds = profiles.map((profile) => profile.id).filter(Boolean)
    } else {
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one user is required when audience is users' },
          { status: 400 }
        )
      }

      const uniqueIds = Array.from(
        new Set(
          body.userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      )

      if (uniqueIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one valid user ID is required' },
          { status: 400 }
        )
      }

      const { data: profiles, error: profilesError } = await serviceClient
        .from('profiles')
        .select('id')
        .in('id', uniqueIds)
        .order('id', { ascending: true })

      if (profilesError) {
        console.error('Failed to verify users for notifications:', profilesError)
        return NextResponse.json({ error: 'Failed to verify users' }, { status: 500 })
      }

      receiverIds = (profiles || []).map((profile) => profile.id)
    }

    if (receiverIds.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString()
    const rows = receiverIds.map((receiverId) => ({
      text,
      type,
      is_html: true,
      sender_id: senderId,
      receiver_id: receiverId,
      dismissed: false,
      link: null,
      expires_at: expiresAt,
    }))

    let insertedCount = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await serviceClient.from('notifications').insert(batch)

      if (insertError) {
        console.error('Failed to insert notification batch:', insertError)
        return NextResponse.json(
          {
            error:
              insertedCount > 0
                ? `Failed after sending to ${insertedCount} users. Some recipients may already have received this notification — check before retrying.`
                : 'Failed to send notifications',
            count: insertedCount,
            partial: insertedCount > 0,
          },
          { status: 500 }
        )
      }

      insertedCount += batch.length
    }

    return NextResponse.json({ success: true, count: insertedCount })
  } catch (error) {
    console.error('Admin notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
