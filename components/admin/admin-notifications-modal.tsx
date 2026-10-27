'use client'

import { useState } from 'react'
import { LuMegaphone, LuMessageSquareText } from 'react-icons/lu'
import UserSearchBar from '@/components/shared/user-search-bar'
import { NotificationComposerModal } from '@/components/shared/notification-composer-modal'
import { selectedViewButtonClass } from '@/components/shared/sent-notifications-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatLocalDate } from '@/utils/local-date'
import {
  ADMIN_NOTIFICATION_TYPES,
  adminNotificationTypeLabel,
  defaultLoggedInOnOrAfter,
  loggedInOnOrAfterDaysAgo,
  loggedInOnOrAfterInstant,
  loggedInOnOrAfterMonthsAgo,
  type AdminNotificationType,
} from '@/utils/notifications'

const LOGIN_WINDOW_PRESETS = [
  { value: 'ignore', label: 'Ignore date' },
  { value: '2w', label: '2 weeks' },
  { value: '1m', label: '1 month' },
  { value: '2m', label: '2 months' },
  { value: '4m', label: '4 months' },
] as const

const LOGIN_DATE_PRESETS = [
  { value: 'custom', label: 'Pick a date' },
] as const

const LOGIN_PRESETS = [...LOGIN_WINDOW_PRESETS, ...LOGIN_DATE_PRESETS] as const

type LoginPreset = (typeof LOGIN_PRESETS)[number]['value']

const LOGIN_PRESET_PHRASE: Partial<Record<LoginPreset, string>> = {
  '4m': 'in the last 4 months',
  '2m': 'in the last 2 months',
  '1m': 'in the last month',
  '2w': 'in the last 2 weeks',
}

function cutoffDateFor(preset: LoginPreset, customDate: string): string | null {
  if (preset === 'ignore') return null
  if (preset === '4m') return loggedInOnOrAfterMonthsAgo(4)
  if (preset === '2m') return loggedInOnOrAfterMonthsAgo(2)
  if (preset === '1m') return loggedInOnOrAfterMonthsAgo(1)
  if (preset === '2w') return loggedInOnOrAfterDaysAgo(14)
  return customDate
}

export function AdminNotificationsModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<AdminNotificationType>('mm_announcement')
  const [loginPreset, setLoginPreset] = useState<LoginPreset>('2m')
  const [customDate, setCustomDate] = useState(defaultLoggedInOnOrAfter)
  const cutoffDate = cutoffDateFor(loginPreset, customDate)
  const loggedInInstant = cutoffDate == null ? null : loggedInOnOrAfterInstant(cutoffDate)
  const presetPhrase = LOGIN_PRESET_PHRASE[loginPreset]

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
      onAllChange={(all) => {
        if (!all) return
        setLoginPreset('2m')
        setCustomDate(defaultLoggedInOnOrAfter())
      }}
      allAudience={{
        canSend: loginPreset === 'ignore' || loggedInInstant != null,
        body: loggedInInstant ? { loggedInSince: loggedInInstant } : undefined,
        warning:
          loginPreset === 'ignore'
            ? 'This will send the notification to every user, including people who have never logged in. Double-check the message before sending.'
            : loggedInInstant
              ? presetPhrase
                ? `This will send the notification to every user who logged in ${presetPhrase}, on or after ${cutoffDate}. Double-check the message before sending.`
                : `This will send the notification to every user who logged in on or after ${cutoffDate}. Double-check the message before sending.`
              : 'Pick a date that is not in the future.',
        fields: (
          <div className="space-y-2 pt-1">
            <div className="text-sm font-medium leading-none">User last login</div>
            <div className="grid grid-cols-5 gap-2">
              {LOGIN_WINDOW_PRESETS.map((preset) => {
                const selected = loginPreset === preset.value
                return (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => setLoginPreset(preset.value)}
                    className={`w-full ${selectedViewButtonClass(selected)}`}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>
            <div className={`grid gap-2 ${loginPreset === 'custom' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {LOGIN_DATE_PRESETS.map((preset) => {
                const selected = loginPreset === preset.value
                return (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => setLoginPreset(preset.value)}
                    className={`w-full ${selectedViewButtonClass(selected)}`}
                  >
                    {preset.label}
                  </Button>
                )
              })}
              {loginPreset === 'custom' && (
                <Input
                  id="notification-logged-in-since"
                  type="date"
                  aria-label="Logged in on or after"
                  className="h-10 w-full"
                  max={formatLocalDate(new Date())}
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                />
              )}
            </div>
          </div>
        ),
      }}
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
