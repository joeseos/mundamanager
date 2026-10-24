import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { checkAdmin, getUserIdFromClaims } from '@/utils/auth'
import { ADMIN_NOTIFICATION_TYPES, isAdminNotificationType } from '@/utils/notifications'
import { loadNotificationSends } from '@/utils/sent-notification-history'
import { postNotificationSend } from '@/utils/notification-send-request'

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

    return postNotificationSend(request, {
      senderId,
      campaignId: null,
      selectedAudience: 'users',
      recipientNoun: 'user',
      failureFallback: 'Failed to send notifications',
      requireLoggedInSince: true,
      type: (body) => {
        if (typeof body.type !== 'string' || !isAdminNotificationType(body.type)) {
          return NextResponse.json(
            { error: 'Type must be one of: mm_announcement, mm_staff_message' },
            { status: 400 }
          )
        }
        return body.type
      },
    })
  } catch (error) {
    console.error('Admin notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
