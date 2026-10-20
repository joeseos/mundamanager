import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/utils/supabase/server'
import { getUserIdFromClaims } from '@/utils/auth'
import { checkCampaignPermissions } from '@/utils/user-permissions'
import {
  isSafeNotificationLink,
  notificationPlainTextLength,
  NOTIFICATION_BROADCAST_MAX_LENGTH,
} from '@/utils/notifications'
import { sanitizeNotificationHtml } from '@/utils/sanitize-notification-html'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import { fetchAllRows } from '@/utils/supabase/fetch-all-rows'

const BATCH_SIZE = 500
const PROFILE_LOOKUP_CHUNK = 100
const PREVIEW_LENGTH = 60
const RECIPIENT_SAMPLE_SIZE = 3
const CAMPAIGN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SentNotificationRow = {
  id: string
  text: string
  link: string | null
  sender_id: string | null
  receiver_id: string
  created_at: string
  expires_at: string
}

type SentGroup = {
  id: string
  text: string
  link: string
  sentAt: string
  senderId: string | null
  receiverIds: Set<string>
}

function notificationPreview(html: string): string {
  const plain = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= PREVIEW_LENGTH) return plain
  return `${plain.slice(0, PREVIEW_LENGTH).trimEnd()}…`
}

function sentGroupKey(row: SentNotificationRow): string {
  return JSON.stringify([row.sender_id, row.text, row.link ?? '', row.expires_at])
}

async function usernamesById(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  ids: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const unique = Array.from(new Set(ids))

  for (let i = 0; i < unique.length; i += PROFILE_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + PROFILE_LOOKUP_CHUNK)
    const { data, error } = await serviceClient
      .from('profiles')
      .select('id, username')
      .in('id', chunk)

    if (error) throw error

    for (const profile of data ?? []) {
      if (profile.id && profile.username) {
        names.set(profile.id, profile.username)
      }
    }
  }

  return names
}

function campaignMessageLinks(campaignId: string): string[] {
  return [
    `/campaigns/${campaignId}`,
    `https://www.mundamanager.com/campaigns/${campaignId}`,
    `https://mundamanager.com/campaigns/${campaignId}`,
  ]
}

type RequestBody = {
  text?: unknown
  link?: unknown
  expiresInDays?: unknown
  audience?: unknown
  userIds?: unknown
}

type MemberRow = {
  id: string
  user_id: string
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await props.params
    if (!campaignId || !CAMPAIGN_ID_PATTERN.test(campaignId)) {
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

    const serviceClient = createServiceRoleClient()
    let rows: SentNotificationRow[]
    try {
      // Scope by the link this route stores. Membership is not a campaign id:
      // a send whose recipients also belong to another campaign would show up there,
      // and a send would vanish here when one recipient left.
      rows = await fetchAllRows((from, to) =>
        serviceClient
          .from('notifications')
          .select('id, text, link, sender_id, receiver_id, created_at, expires_at')
          .eq('type', 'campaign_message')
          .in('link', campaignMessageLinks(campaignId))
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      )
    } catch (fetchError) {
      console.error('Failed to fetch campaign messages:', fetchError)
      return NextResponse.json({ error: 'Failed to load sent messages' }, { status: 500 })
    }

    const groups = new Map<string, SentGroup>()
    for (const row of rows) {
      const key = sentGroupKey(row)
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          id: row.id,
          text: sanitizeNotificationHtml(row.text),
          link: isSafeNotificationLink(row.link) ? row.link.trim() : '',
          sentAt: row.created_at,
          senderId: row.sender_id,
          receiverIds: new Set([row.receiver_id]),
        })
        continue
      }

      existing.receiverIds.add(row.receiver_id)
      if (new Date(row.created_at).getTime() < new Date(existing.sentAt).getTime()) {
        existing.sentAt = row.created_at
        existing.id = row.id
      }
    }

    const campaignSends = Array.from(groups.values())

    const lookupIds: string[] = []
    for (const group of campaignSends) {
      if (group.senderId) lookupIds.push(group.senderId)
      for (const receiverId of Array.from(group.receiverIds).sort().slice(0, RECIPIENT_SAMPLE_SIZE)) {
        lookupIds.push(receiverId)
      }
    }

    let names: Map<string, string>
    try {
      names = await usernamesById(serviceClient, lookupIds)
    } catch (profilesError) {
      console.error('Failed to load campaign message usernames:', profilesError)
      return NextResponse.json({ error: 'Failed to load sent messages' }, { status: 500 })
    }

    const sends = campaignSends
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .map((group) => {
        const recipientUsernames = Array.from(group.receiverIds)
          .sort()
          .slice(0, RECIPIENT_SAMPLE_SIZE)
          .map((id) => names.get(id))
          .filter((username): username is string => Boolean(username))
          .sort((a, b) => a.localeCompare(b))

        return {
          id: group.id,
          sentAt: group.sentAt,
          senderUsername: (group.senderId && names.get(group.senderId)) || 'Unknown',
          recipientCount: group.receiverIds.size,
          recipientUsernames,
          preview: notificationPreview(group.text),
          text: group.text,
          link: group.link,
        }
      })

    return NextResponse.json({ sends })
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
    if (!campaignId || !CAMPAIGN_ID_PATTERN.test(campaignId)) {
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

    let text = typeof body.text === 'string' ? body.text.trim() : ''
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

    const link = `/campaigns/${campaignId}`

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
    if (audience !== 'all' && audience !== 'players') {
      return NextResponse.json(
        { error: "Audience must be 'all' or 'players'" },
        { status: 400 }
      )
    }

    const serviceClient = createServiceRoleClient()
    let members: MemberRow[]
    try {
      members = await fetchAllRows((from, to) =>
        serviceClient
          .from('campaign_members')
          .select('id, user_id')
          .eq('campaign_id', campaignId)
          .order('user_id', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    } catch (membersError) {
      console.error('Failed to fetch campaign members for messages:', membersError)
      return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
    }

    const playerIds = new Set(
      members.map((member) => member.user_id).filter((id): id is string => Boolean(id))
    )

    let receiverIds: string[]
    if (audience === 'all') {
      receiverIds = Array.from(playerIds)
    } else {
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one player is required' },
          { status: 400 }
        )
      }

      const uniqueIds = Array.from(
        new Set(
          body.userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      )

      if (uniqueIds.length === 0 || uniqueIds.some((id) => !playerIds.has(id))) {
        return NextResponse.json(
          { error: 'Recipients must be players in this campaign' },
          { status: 400 }
        )
      }

      receiverIds = uniqueIds
    }

    if (receiverIds.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString()
    const rows = receiverIds.map((receiverId) => ({
      text,
      type: 'campaign_message',
      is_html: true,
      sender_id: senderId,
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
        console.error('Failed to insert campaign message batch:', insertError)
        return NextResponse.json(
          {
            error:
              insertedCount > 0
                ? `Failed after sending to ${insertedCount} players. Some recipients may already have received this message — check before retrying.`
                : 'Failed to send messages',
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
    console.error('Campaign messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
