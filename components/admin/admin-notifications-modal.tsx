'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LuMegaphone, LuMessageSquareText } from 'react-icons/lu'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'
import {
  NotificationComposerModal,
  type ComposerRecipient,
} from '@/components/shared/notification-composer-modal'
import {
  ADMIN_NOTIFICATION_TYPES,
  adminNotificationTypeLabel,
  type AdminNotificationType,
} from '@/utils/notifications'

export function AdminNotificationsModal({ onClose }: { onClose: () => void }) {
  const [audienceAll, setAudienceAll] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<ComposerRecipient[]>([])
  const [type, setType] = useState<AdminNotificationType>('mm_announcement')

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUsers((prev) => {
      if (prev.some((selected) => selected.id === user.id)) return prev
      return [...prev, user]
    })
  }

  const toggleAllUsers = () => {
    if (audienceAll) {
      setAudienceAll(false)
      return
    }
    setSelectedUsers([])
    setAudienceAll(true)
  }

  return (
    <NotificationComposerModal
      title="Notifications"
      composeHelper="Send a message to one or more users."
      historyHelper="Announcements and staff messages already sent."
      onClose={onClose}
      historyUrl="/api/admin/notifications"
      recipientNoun="user"
      typeLabel={(send) =>
        send.type && send.type in adminNotificationTypeLabel
          ? adminNotificationTypeLabel[send.type as AdminNotificationType]
          : 'Message'
      }
      typeIcon={(send) =>
        send.type === 'mm_announcement' ? (
          <LuMegaphone className="h-4 w-4 text-violet-500" />
        ) : (
          <LuMessageSquareText className="h-4 w-4 text-green-500" />
        )
      }
      allLabel="All users"
      allWarning="This will send the notification to every user in the database. Double-check the message before sending."
      audienceAll={audienceAll}
      onToggleAll={toggleAllUsers}
      selected={selectedUsers}
      onRemoveRecipient={(userId) =>
        setSelectedUsers((prev) => prev.filter((user) => user.id !== userId))
      }
      picker={
        <UserSearchBar
          placeholder="Search users by username"
          onSelect={handleSelectUser}
          disabled={audienceAll}
          excludeIds={selectedUsers.map((user) => user.id)}
        />
      }
      extraFields={
        <div className="space-y-2">
          <label htmlFor="notification-type" className="text-sm font-medium leading-none">
            Type
          </label>
          <select
            id="notification-type"
            value={type}
            onChange={(event) => setType(event.target.value as AdminNotificationType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ADMIN_NOTIFICATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {adminNotificationTypeLabel[value]}
              </option>
            ))}
          </select>
        </div>
      }
      onSend={async ({ text, expiresInDays }) => {
        try {
          const response = await fetch('/api/admin/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              type,
              expiresInDays,
              audience: audienceAll ? 'all' : 'users',
              userIds: audienceAll ? undefined : selectedUsers.map((user) => user.id),
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
      }}
    />
  )
}
