'use client'

import { useState } from 'react'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'
import { toast } from 'sonner'
import { LuX } from 'react-icons/lu'

type Audience = 'users' | 'all'
type NotificationType = 'info' | 'warning' | 'error'

interface AdminNotificationsModalProps {
  onClose: () => void
}

export function AdminNotificationsModal({ onClose }: AdminNotificationsModalProps) {
  const [audience, setAudience] = useState<Audience>('users')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [type, setType] = useState<NotificationType>('info')
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)

  const canSend =
    text.trim().length > 0 &&
    expiresInDays >= 1 &&
    (audience === 'all' || selectedUsers.length > 0)

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
          link: link.trim(),
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
      helper="Send a message to one or more users."
      onClose={onClose}
      onConfirm={handleSend}
      confirmText="Send"
      confirmDisabled={!canSend}
      width="2xl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Audience</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={audience === 'users' ? 'default' : 'outline'}
              onClick={() => setAudience('users')}
              className={
                audience === 'users'
                  ? ''
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }
            >
              Specific users
            </Button>
            <Button
              type="button"
              variant={audience === 'all' ? 'default' : 'outline'}
              onClick={() => setAudience('all')}
              className={
                audience === 'all'
                  ? ''
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }
            >
              All users
            </Button>
          </div>
        </div>

        {audience === 'users' ? (
          <div className="space-y-2">
            <Label>Recipients</Label>
            <UserSearchBar
              placeholder="Search users by username"
              onSelect={handleSelectUser}
              excludeIds={selectedUsers.map((user) => user.id)}
            />
            {selectedUsers.length > 0 && (
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
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
            This will send the notification to every user in the database. Double-check the
            message before sending.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="notification-type">Type</Label>
          <select
            id="notification-type"
            value={type}
            onChange={(e) => setType(e.target.value as NotificationType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-text">Message</Label>
          <Textarea
            id="notification-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the notification message"
            rows={6}
            className="min-h-[120px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-link">Link (optional)</Label>
          <Input
            id="notification-link"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="e.g. /campaigns or https://..."
          />
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
      </div>
    </Modal>
  )
}
