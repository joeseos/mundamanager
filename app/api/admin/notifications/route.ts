import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { checkAdmin } from '@/utils/auth'

const ALLOWED_TYPES = ['info', 'warning', 'error'] as const
type NotificationType = (typeof ALLOWED_TYPES)[number]
const BATCH_SIZE = 500

type RequestBody = {
  text?: unknown
  type?: unknown
  link?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const isAdmin = await checkAdmin(supabase)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = (await request.json()) as RequestBody

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    if (typeof body.type !== 'string' || !ALLOWED_TYPES.includes(body.type as NotificationType)) {
      return NextResponse.json(
        { error: 'Type must be one of: info, warning, error' },
        { status: 400 }
      )
    }
    const type = body.type as NotificationType

    const link = typeof body.link === 'string' ? body.link.trim() : ''
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
      const pageSize = 1000
      let from = 0

      while (true) {
        const { data: profiles, error: profilesError } = await serviceClient
          .from('profiles')
          .select('id')
          .range(from, from + pageSize - 1)

        if (profilesError) {
          console.error('Failed to fetch profiles for notifications:', profilesError)
          return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
        }

        const pageIds = (profiles || []).map((profile) => profile.id).filter(Boolean)
        receiverIds.push(...pageIds)

        if (pageIds.length < pageSize) {
          break
        }

        from += pageSize
      }
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

      if (profilesError) {
        console.error('Failed to verify users for notifications:', profilesError)
        return NextResponse.json({ error: 'Failed to verify users' }, { status: 500 })
      }

      receiverIds = (profiles || []).map((profile) => profile.id)

      if (receiverIds.length === 0) {
        return NextResponse.json({ error: 'No matching users found' }, { status: 400 })
      }
    }

    if (receiverIds.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString()
    const rows = receiverIds.map((receiverId) => ({
      text,
      type,
      sender_id: null,
      receiver_id: receiverId,
      dismissed: false,
      link,
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
            error: 'Failed to send notifications',
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
