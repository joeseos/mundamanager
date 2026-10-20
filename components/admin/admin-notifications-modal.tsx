'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'
import {
  selectedViewButtonClass,
  SentNotificationsList,
  type SentHistoryStatus,
} from '@/components/shared/sent-notifications-list'
import { toast } from 'sonner'
import { LuMegaphone, LuMessageSquareText, LuX } from 'react-icons/lu'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import {
  ADMIN_NOTIFICATION_TYPES,
  adminNotificationTypeLabel,
  notificationPlainTextLength,
  NOTIFICATION_BROADCAST_MAX_LENGTH,
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

export function AdminNotificationsModal({ onClose }: AdminNotificationsModalProps) {
  const [view, setView] = useState<ModalView>('compose')
  const [audience, setAudience] = useState<Audience>('users')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [type, setType] = useState<AdminNotificationType>('mm_announcement')
  const [text, setText] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [sends, setSends] = useState<SentNotification[]>([])
  const [historyStatus, setHistoryStatus] = useState<SentHistoryStatus>('idle')

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
            className={selectedViewButtonClass(view === 'compose')}
          >
            New
          </Button>
          <Button
            type="button"
            variant={view === 'history' ? 'default' : 'outline'}
            onClick={() => setView('history')}
            className={selectedViewButtonClass(view === 'history')}
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
                  className={`shrink-0 ${selectedViewButtonClass(audience === 'all')}`}
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
          <SentNotificationsList
            sends={sends}
            status={historyStatus}
            recipientNoun="user"
            typeLabel={(send) => adminNotificationTypeLabel[send.type]}
            typeIcon={(send) =>
              send.type === 'mm_announcement' ? (
                <LuMegaphone className="h-4 w-4 text-violet-500" />
              ) : (
                <LuMessageSquareText className="h-4 w-4 text-green-500" />
              )
            }
          />
        )}
      </div>
    </Modal>
  )
}

