'use client'

import { useState } from 'react'
import { LuMegaphone, LuMessageSquareText } from 'react-icons/lu'
import UserSearchBar from '@/components/shared/user-search-bar'
import { NotificationComposerModal } from '@/components/shared/notification-composer-modal'
import {
  ADMIN_NOTIFICATION_TYPES,
  adminNotificationTypeLabel,
  type AdminNotificationType,
} from '@/utils/notifications'

export function AdminNotificationsModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<AdminNotificationType>('mm_announcement')

  return (
    <NotificationComposerModal
      title="Notifications"
      composeHelper="Send a message to one or more users."
      historyHelper="Announcements and staff messages already sent."
      onClose={onClose}
      historyUrl="/api/admin/notifications"
      sendUrl="/api/admin/notifications"
      recipientNoun="user"
      selectedAudience="users"
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
      extraBody={{ type }}
      picker={({ disabled, excludeIds, onSelect }) => (
        <UserSearchBar
          placeholder="Search users by username"
          onSelect={onSelect}
          disabled={disabled}
          excludeIds={excludeIds}
        />
      )}
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
    />
  )
}
