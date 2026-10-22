'use client'

import type { ReactNode } from 'react'
import { LuFileText } from 'react-icons/lu'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { SENT_NOTIFICATIONS_FETCH_LIMIT } from '@/utils/notifications'
import '@/components/ui/rich-text-editor.css'

export type SentHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export type SentNotificationRow = {
  id: string
  type?: string
  sentAt: string
  senderUsername: string
  recipientCount: number
  recipientUsernames: string[]
  preview: string
  text: string
}

export function selectedViewButtonClass(selected: boolean) {
  return selected ? '' : 'bg-muted text-muted-foreground hover:bg-muted/80'
}

function recipientLabel(send: SentNotificationRow, noun: 'user' | 'player'): string {
  if (send.recipientCount === 0) return 'No recipients'
  const plural = noun === 'user' ? 'users' : 'players'
  if (send.recipientUsernames.length === 0) {
    return `${send.recipientCount} ${send.recipientCount === 1 ? noun : plural}`
  }

  const shown = send.recipientUsernames.join(', ')
  const extra = send.recipientCount - send.recipientUsernames.length
  return extra > 0 ? `${shown} + ${extra}` : shown
}

function sentDateLabel(sentAt: string): string {
  const date = new Date(sentAt)
  if (Number.isNaN(date.getTime())) return sentAt
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SentNotificationsList<T extends SentNotificationRow>({
  sends,
  status,
  recipientNoun,
  typeLabel,
  typeIcon,
}: {
  sends: T[]
  status: SentHistoryStatus
  recipientNoun: 'user' | 'player'
  typeLabel: (send: T) => string
  typeIcon: (send: T) => ReactNode
}) {
  if (status === 'loading' || status === 'idle') {
    return <p className="text-sm text-muted-foreground">Loading sent messages…</p>
  }

  if (status === 'error') {
    return <p className="text-sm text-muted-foreground">Could not load sent messages.</p>
  }

  if (sends.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages sent yet.</p>
  }

  return (
    <div>
      {sends.length >= SENT_NOTIFICATIONS_FETCH_LIMIT && (
        <p className="mb-2 text-xs italic text-muted-foreground">
          Only the most recent {SENT_NOTIFICATIONS_FETCH_LIMIT} sent messages are shown.
        </p>
      )}
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="w-12 pb-2 pr-3 font-medium">Type</th>
              <th className="w-44 whitespace-nowrap pb-2 pr-3 font-medium">Date</th>
              <th className="w-32 pb-2 pr-3 font-medium">Sender</th>
              <th className="w-48 pb-2 pr-3 font-medium">Recipients</th>
              <th className="pb-2 pr-3 font-medium">Message</th>
              <th className="w-8 pb-2 font-medium">
                <span className="sr-only">Content</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sends.map((send) => (
              <tr key={send.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3" title={typeLabel(send)}>
                  {typeIcon(send)}
                </td>
                <td className="truncate py-2 pr-3 text-muted-foreground">{sentDateLabel(send.sentAt)}</td>
                <td className="truncate py-2 pr-3 font-medium">{send.senderUsername}</td>
                <td className="truncate py-2 pr-3 text-muted-foreground">{recipientLabel(send, recipientNoun)}</td>
                <td className="truncate py-2 pr-3">{send.preview}</td>
                <td className="py-2">
                  <InfoTooltip
                    ariaLabel="Message content"
                    place="left"
                    wide
                    icon={<LuFileText className="h-4 w-4" />}
                  >
                    <div
                      className="notification-html prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: send.text }}
                    />
                  </InfoTooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
