'use client'

import { useState, useId, type ReactNode } from 'react'
import { LuFileText } from 'react-icons/lu'
import { Tooltip } from 'react-tooltip'
import { useCoarsePointer } from '@/hooks/use-coarse-pointer'
import {
  SENT_NOTIFICATIONS_FETCH_LIMIT,
  getNotificationLinkDescription,
  getNotificationLinkLabel,
  resolveNotificationLink,
} from '@/utils/notifications'
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
  link: string
}

export function selectedViewButtonClass(selected: boolean) {
  return selected ? '' : 'bg-muted text-muted-foreground hover:bg-muted/80'
}

// Same page size as the fighter log modal. The route already caps the fetch.
const SENT_NOTIFICATIONS_PAGE_SIZE = 10

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

function localUtcOffsetLabel(date = new Date()): string {
  const totalMinutes = -date.getTimezoneOffset()
  if (totalMinutes === 0) return 'UTC'
  const sign = totalMinutes > 0 ? '+' : '\u2212'
  const abs = Math.abs(totalMinutes)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  const minutesPart = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `UTC${sign}${hours}${minutesPart}`
}

function SentMessageTooltip({ html, link, campaignName }: { html: string; link: string; campaignName?: string }) {
  const tooltipId = useId()
  const isCoarsePointer = useCoarsePointer()
  const resolved = link ? resolveNotificationLink(link) : null

  return (
    <>
      <button
        type="button"
        className="inline-flex shrink-0 cursor-help border-0 bg-transparent p-0 text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        aria-label="Message content"
        data-tooltip-id={tooltipId}
      >
        <LuFileText className="h-4 w-4" />
      </button>
      <Tooltip
        id={tooltipId}
        place="left"
        className="z-[2000]! opacity-100! shadow-lg"
        delayHide={resolved || isCoarsePointer ? 150 : undefined}
        clickable={Boolean(resolved) || isCoarsePointer}
        openOnClick={isCoarsePointer}
        positionStrategy={isCoarsePointer ? 'fixed' : 'absolute'}
        style={{
          padding: '12px',
          maxWidth: 'min(28rem, 90vw)',
          backgroundColor: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
        }}
      >
        <div className="notification-html prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        {resolved && (
          <a
            href={resolved.href}
            target={resolved.isExternal ? '_blank' : undefined}
            rel={resolved.isExternal ? 'noopener noreferrer' : undefined}
            className="mt-3 block border-t border-border pt-2 text-left"
          >
            <span className="block text-sm font-medium">{getNotificationLinkLabel(link, campaignName)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {getNotificationLinkDescription(link)}
            </span>
          </a>
        )}
      </Tooltip>
    </>
  )
}

export function SentNotificationsList<T extends SentNotificationRow>({
  sends,
  status,
  recipientNoun,
  campaignName,
  typeLabel,
  typeIcon,
}: {
  sends: T[]
  status: SentHistoryStatus
  recipientNoun: 'user' | 'player'
  campaignName?: string
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
    <SentNotificationsPage
      sends={sends}
      recipientNoun={recipientNoun}
      campaignName={campaignName}
      typeLabel={typeLabel}
      typeIcon={typeIcon}
    />
  )
}

function SentNotificationsPage<T extends SentNotificationRow>({
  sends,
  recipientNoun,
  campaignName,
  typeLabel,
  typeIcon,
}: {
  sends: T[]
  recipientNoun: 'user' | 'player'
  campaignName?: string
  typeLabel: (send: T) => string
  typeIcon: (send: T) => ReactNode
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.ceil(sends.length / SENT_NOTIFICATIONS_PAGE_SIZE)
  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * SENT_NOTIFICATIONS_PAGE_SIZE
  const pageSends = sends.slice(startIndex, startIndex + SENT_NOTIFICATIONS_PAGE_SIZE)

  const goToPage = (next: number) => {
    setCurrentPage(Math.max(1, Math.min(next, totalPages)))
  }

  return (
    <div>
      {sends.length >= SENT_NOTIFICATIONS_FETCH_LIMIT && (
        <p className="mb-2 text-xs italic text-muted-foreground">
          Only the most recent {SENT_NOTIFICATIONS_FETCH_LIMIT} sent messages are shown.
        </p>
      )}
      <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-xs font-medium text-muted-foreground">
          <th className="w-12 pb-2 pr-3 font-medium">Type</th>
          <th className="w-44 whitespace-nowrap pb-2 pr-3 font-medium">
            Date ({localUtcOffsetLabel()})
          </th>
          <th className="w-32 pb-2 pr-3 font-medium">Sender</th>
          <th className="w-48 pb-2 pr-3 font-medium">Recipients</th>
          <th className="pb-2 pr-3 font-medium">Message</th>
          <th className="w-8 pb-2 font-medium">
            <span className="sr-only">Content</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {pageSends.map((send) => (
          <tr key={send.id} className="border-b last:border-b-0">
            <td className="py-2 pr-3" title={typeLabel(send)}>
              {typeIcon(send)}
            </td>
            <td className="truncate py-2 pr-3 text-muted-foreground">{sentDateLabel(send.sentAt)}</td>
            <td className="truncate py-2 pr-3 font-medium">{send.senderUsername}</td>
            <td className="truncate py-2 pr-3 text-muted-foreground">{recipientLabel(send, recipientNoun)}</td>
            <td className="truncate py-2 pr-3">{send.preview}</td>
            <td className="py-2">
              <SentMessageTooltip html={send.text} link={send.link} campaignName={campaignName} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      {totalPages > 1 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border bg-muted px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center text-sm text-muted-foreground sm:text-left">
            Messages {startIndex + 1} to {Math.min(startIndex + SENT_NOTIFICATIONS_PAGE_SIZE, sends.length)} of {sends.length}
          </div>
          <div className="flex items-center justify-center space-x-2 sm:justify-end">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
                const showPage =
                  pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 1
                if (!showPage) {
                  if (pageNumber === 2 && page > 4) {
                    return (
                      <span key={pageNumber} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    )
                  }
                  if (pageNumber === totalPages - 1 && page < totalPages - 3) {
                    return (
                      <span key={pageNumber} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    )
                  }
                  return null
                }
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => goToPage(pageNumber)}
                    className={`rounded-md border px-3 py-1 text-sm ${
                      page === pageNumber ? 'border-black bg-black text-white' : 'hover:bg-muted'
                    }`}
                  >
                    {pageNumber}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
