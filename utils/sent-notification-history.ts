import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CAMPAIGN_MESSAGE_DAILY_CAP,
  CAMPAIGN_MESSAGE_SENDER_DAILY_CAP,
  SENT_NOTIFICATIONS_FETCH_LIMIT,
  notificationPreview,
} from '@/utils/notifications'
import { sanitizeNotificationHtml } from '@/utils/sanitize-notification-html'

const PROFILE_LOOKUP_CHUNK = 100

type SendRow = {
  id: string
  type: string
  text: string
  created_at: string
  sender_id: string | null
  recipient_count: number
  sample_receiver_ids: string[] | null
  logged_in_since: string | null
}

export type SentNotificationView = {
  id: string
  type: string
  sentAt: string
  senderUsername: string
  recipientCount: number
  recipientUsernames: string[]
  preview: string
  text: string
  loggedInSince: string | null
}

async function usernamesById(
  serviceClient: SupabaseClient,
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

export async function loadNotificationSends(
  serviceClient: SupabaseClient,
  filter: { campaignId: string } | { types: readonly string[] }
): Promise<SentNotificationView[]> {
  let query = serviceClient
    .from('notification_sends')
    .select('id, type, text, created_at, sender_id, recipient_count, sample_receiver_ids, logged_in_since')

  if ('campaignId' in filter) {
    query = query.eq('campaign_id', filter.campaignId).eq('type', 'campaign_message')
  } else {
    query = query.in('type', [...filter.types])
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(SENT_NOTIFICATIONS_FETCH_LIMIT)

  if (error) throw error
  const rows = (data ?? []) as SendRow[]

  const lookupIds: string[] = []
  for (const row of rows) {
    if (row.sender_id) lookupIds.push(row.sender_id)
    for (const receiverId of row.sample_receiver_ids ?? []) {
      lookupIds.push(receiverId)
    }
  }

  const names = await usernamesById(serviceClient, lookupIds)

  return rows.map((row) => {
    const text = sanitizeNotificationHtml(row.text ?? '')
    const recipientUsernames = (row.sample_receiver_ids ?? [])
      .map((id) => names.get(id))
      .filter((username): username is string => Boolean(username))
      .sort((a, b) => a.localeCompare(b))

    return {
      id: row.id,
      type: row.type,
      sentAt: row.created_at,
      senderUsername: (row.sender_id && names.get(row.sender_id)) || 'Unknown',
      recipientCount: row.recipient_count,
      recipientUsernames,
      preview: notificationPreview(text),
      text,
      loggedInSince: row.logged_in_since,
    }
  })
}

export function notificationSendFailure(
  message: string,
  fallback: string
): { status: number; error: string } {
  if (message.includes('campaign_message_sender_daily_cap')) {
    return {
      status: 429,
      error: `You can send ${CAMPAIGN_MESSAGE_SENDER_DAILY_CAP} campaign messages per day.`,
    }
  }
  if (message.includes('campaign_message_daily_cap')) {
    return {
      status: 429,
      error: `This campaign can send ${CAMPAIGN_MESSAGE_DAILY_CAP} messages per day.`,
    }
  }
  if (message.includes('recipients must be campaign members')) {
    return { status: 400, error: 'Recipients must be players in this campaign' }
  }
  if (message.includes('recipients must be existing users')) {
    return { status: 400, error: 'At least one valid user ID is required' }
  }
  if (message.includes('logged_in_since only applies to all-user sends')) {
    return { status: 400, error: 'A login cutoff only applies to an all-user send' }
  }
  if (message.includes('no recipients')) {
    return { status: 400, error: 'No recipients found' }
  }
  return { status: 500, error: fallback }
}
