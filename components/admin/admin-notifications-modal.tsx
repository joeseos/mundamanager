'use client'

import { useEffect, useId, useState } from 'react'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'
import { toast } from 'sonner'
import { LuFileText, LuMegaphone, LuMessageSquareText, LuX } from 'react-icons/lu'
import { Tooltip } from 'react-tooltip'
import { useCoarsePointer } from '@/hooks/use-coarse-pointer'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import {
  ADMIN_NOTIFICATION_TYPES,
  adminNotificationTypeLabel,
  getNotificationLinkDescription,
  getNotificationLinkLabel,
  notificationPlainTextLength,
  NOTIFICATION_BROADCAST_MAX_LENGTH,
  resolveNotificationLink,
  type AdminNotificationType,
} from '@/utils/notifications'
import { LazyRichTextEditor } from '@/components/ui/lazy-rich-text-editor'
import '@/components/ui/rich-text-editor.css'

type Audience = 'users' | 'all'
type ModalView = 'compose' | 'history'

type SentNotification = {
  id: string
  type: AdminNotificationType
  sentAt: string
  senderUsername: string
  recipientCount: number
  recipientUsernames: string[]
  preview: string
  text: string
  link: string
}

interface AdminNotificationsModalProps {
  onClose: () => void
}

function viewButtonClass(selected: boolean) {
  return selected ? '' : 'bg-muted text-muted-foreground hover:bg-muted/80'
}

function recipientLabel(send: SentNotification): string {
  if (send.recipientCount === 0) return 'No recipients'
  if (send.recipientUsernames.length === 0) {
    return `${send.recipientCount} ${send.recipientCount === 1 ? 'user' : 'users'}`
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

function SentMessageTooltip({ html, link }: { html: string; link: string }) {
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
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        {resolved && (
          <a
            href={resolved.href}
            target={resolved.isExternal ? '_blank' : undefined}
            rel={resolved.isExternal ? 'noopener noreferrer' : undefined}
            className="mt-3 block border-t border-border pt-2 text-left"
          >
            <span className="block text-sm font-medium">{getNotificationLinkLabel(link)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {getNotificationLinkDescription(link)}
            </span>
          </a>
        )}
      </Tooltip>
    </>
  )
}

export function AdminNotificationsModal({ onClose }: AdminNotificationsModalProps) {
  const [view, setView] = useState<ModalView>('compose')
  const [audience, setAudience] = useState<Audience>('users')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [type, setType] = useState<AdminNotificationType>('mm_announcement')
  const [text, setText] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [sends, setSends] = useState<SentNotification[]>([])
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const canSend =
    !isHtmlEffectivelyEmpty(text) &&
    notificationPlainTextLength(text) <= NOTIFICATION_BROADCAST_MAX_LENGTH &&
    expiresInDays >= 1 &&
    (audience === 'all' || selectedUsers.length > 0)

  useEffect(() => {
    if (view !== 'history') return

    let cancelled = false
    setHistoryStatus('loading')

    fetch('/api/admin/notifications')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load sent messages')
        }
        return data.sends as SentNotification[]
      })
      .then((nextSends) => {
        if (cancelled) return
        setSends(nextSends)
        setHistoryStatus('ready')
      })
      .catch((error) => {
        console.error('Failed to load sent notifications:', error)
        if (cancelled) return
        setHistoryStatus('error')
        toast.error(error instanceof Error ? error.message : 'Failed to load sent messages')
      })

    return () => {
      cancelled = true
    }
  }, [view])

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUsers((prev) => {
      if (prev.some((selected) => selected.id === user.id)) {
        return prev
      }
      return [...prev, user]
    })
  }

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((user) => user.id !== userId))
  }

  const toggleAllUsers = () => {
    if (audience === 'all') {
      setAudience('users')
      return
    }
    setSelectedUsers([])
    setAudience('all')
  }

  const handleSend = async () => {
    if (!canSend) {
      return false
    }

    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          type,
          expiresInDays,
          audience,
          userIds: audience === 'users' ? selectedUsers.map((user) => user.id) : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notifications')
      }

      toast.success(
        `Notification sent to ${data.count} ${data.count === 1 ? 'user' : 'users'}`
      )
      return true
    } catch (error) {
      console.error('Failed to send notifications:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send notifications')
      return false
    }
  }

  return (
    <Modal
      title="Notifications"
      helper={
        view === 'compose'
          ? 'Send a message to one or more users.'
          : 'Announcements and staff messages already sent.'
      }
      onClose={onClose}
      onConfirm={view === 'compose' ? handleSend : undefined}
      confirmText="Send"
      confirmDisabled={!canSend}
      width="4xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={view === 'compose' ? 'default' : 'outline'}
            onClick={() => setView('compose')}
            className={viewButtonClass(view === 'compose')}
          >
            New
          </Button>
          <Button
            type="button"
            variant={view === 'history' ? 'default' : 'outline'}
            onClick={() => setView('history')}
            className={viewButtonClass(view === 'history')}
          >
            Sent
          </Button>
        </div>

        {view === 'compose' ? (
          <>
            <div className="relative z-[80] space-y-2">
              <Label>Recipients</Label>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <UserSearchBar
                    placeholder="Search users by username"
                    onSelect={handleSelectUser}
                    disabled={audience === 'all'}
                    excludeIds={selectedUsers.map((user) => user.id)}
                  />
                </div>
                <Button
                  type="button"
                  variant={audience === 'all' ? 'default' : 'outline'}
                  onClick={toggleAllUsers}
                  className={`shrink-0 ${viewButtonClass(audience === 'all')}`}
                >
                  All users
                </Button>
              </div>
              {audience === 'users' && selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.id}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {user.username}
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(user.id)}
                        className="rounded-full p-0.5 hover:bg-muted"
                        aria-label={`Remove ${user.username}`}
                      >
                        <LuX className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {audience === 'all' && (
                <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                  This will send the notification to every user in the database. Double-check the
                  message before sending.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-type">Type</Label>
              <select
                id="notification-type"
                value={type}
                onChange={(e) => setType(e.target.value as AdminNotificationType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ADMIN_NOTIFICATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {adminNotificationTypeLabel[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <div className="bg-white rounded-md">
                <LazyRichTextEditor
                  content={text}
                  onChange={setText}
                  placeholder="Enter the notification message"
                  enableImages={false}
                  stickyWithinScrollContainer
                  notificationFormatting
                  charLimit={NOTIFICATION_BROADCAST_MAX_LENGTH}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-expires">Expires in (days)</Label>
              <Input
                id="notification-expires"
                type="number"
                min={1}
                value={expiresInDays}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10)
                  setExpiresInDays(Number.isNaN(value) ? 0 : value)
                }}
              />
            </div>
          </>
        ) : (
          <SentList sends={sends} status={historyStatus} />
        )}
      </div>
    </Modal>
  )
}

function SentList({
  sends,
  status,
}: {
  sends: SentNotification[]
  status: 'idle' | 'loading' | 'ready' | 'error'
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
        {sends.map((send) => (
          <tr key={send.id} className="border-b last:border-b-0">
            <td className="py-2 pr-3" title={adminNotificationTypeLabel[send.type]}>
              {send.type === 'mm_announcement' ? (
                <LuMegaphone className="h-4 w-4 text-violet-500" />
              ) : (
                <LuMessageSquareText className="h-4 w-4 text-green-500" />
              )}
            </td>
            <td className="truncate py-2 pr-3 text-muted-foreground">{sentDateLabel(send.sentAt)}</td>
            <td className="truncate py-2 pr-3 font-medium">{send.senderUsername}</td>
            <td className="truncate py-2 pr-3 text-muted-foreground">{recipientLabel(send)}</td>
            <td className="truncate py-2 pr-3">{send.preview}</td>
            <td className="py-2">
              <SentMessageTooltip html={send.text} link={send.link} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
