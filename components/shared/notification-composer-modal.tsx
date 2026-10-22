'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { LuX } from 'react-icons/lu'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import {
  NOTIFICATION_BROADCAST_MAX_LENGTH,
  NOTIFICATION_EXPIRES_MAX_DAYS,
  NOTIFICATION_EXPIRES_MIN_DAYS,
  notificationPlainTextLength,
} from '@/utils/notifications'
import { LazyRichTextEditor } from '@/components/ui/lazy-rich-text-editor'
import {
  selectedViewButtonClass,
  SentNotificationsList,
  type SentHistoryStatus,
  type SentNotificationRow,
} from '@/components/shared/sent-notifications-list'
import '@/components/ui/rich-text-editor.css'

type ModalView = 'compose' | 'history'

export type ComposerRecipient = {
  id: string
  username: string
}

async function loadSentNotifications(historyUrl: string): Promise<SentNotificationRow[]> {
  const response = await fetch(historyUrl)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Failed to load sent messages')
  }
  return data.sends as SentNotificationRow[]
}

export function NotificationComposerModal({
  title,
  composeHelper,
  historyHelper,
  onClose,
  historyUrl,
  recipientNoun,
  campaignName,
  typeLabel,
  typeIcon,
  allLabel,
  allWarning,
  audienceAll,
  onToggleAll,
  allToggleDisabled = false,
  allowSendAll = true,
  selected,
  onRemoveRecipient,
  picker,
  extraFields,
  onSend,
}: {
  title: string
  composeHelper: string
  historyHelper: string
  onClose: () => void
  historyUrl: string
  recipientNoun: 'user' | 'player'
  campaignName?: string
  typeLabel: (send: SentNotificationRow) => string
  typeIcon: (send: SentNotificationRow) => ReactNode
  allLabel: string
  allWarning: string
  audienceAll: boolean
  onToggleAll: () => void
  allToggleDisabled?: boolean
  allowSendAll?: boolean
  selected: ComposerRecipient[]
  onRemoveRecipient: (id: string) => void
  picker: ReactNode
  extraFields?: ReactNode
  onSend: (input: { text: string; expiresInDays: number }) => Promise<boolean>
}) {
  const queryClient = useQueryClient()
  const [view, setView] = useState<ModalView>('compose')
  const [text, setText] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)

  const history = useQuery({
    queryKey: ['sent-notifications', historyUrl],
    queryFn: () => loadSentNotifications(historyUrl),
    enabled: view === 'history',
  })

  useEffect(() => {
    if (!history.error) return
    console.error('Failed to load sent notifications:', history.error)
    toast.error(history.error instanceof Error ? history.error.message : 'Failed to load sent messages')
  }, [history.error])

  const expiresValid =
    expiresInDays >= NOTIFICATION_EXPIRES_MIN_DAYS && expiresInDays <= NOTIFICATION_EXPIRES_MAX_DAYS
  const canSend =
    !isHtmlEffectivelyEmpty(text) &&
    notificationPlainTextLength(text) <= NOTIFICATION_BROADCAST_MAX_LENGTH &&
    expiresValid &&
    (audienceAll ? allowSendAll : selected.length > 0)

  const historyStatus: SentHistoryStatus = history.isError
    ? 'error'
    : history.isSuccess
      ? 'ready'
      : view === 'history'
        ? 'loading'
        : 'idle'

  const handleSend = async () => {
    if (!canSend) return false
    const sent = await onSend({ text: text.trim(), expiresInDays })
    if (sent) queryClient.invalidateQueries({ queryKey: ['sent-notifications', historyUrl] })
    return sent
  }

  return (
    <Modal
      title={title}
      helper={view === 'compose' ? composeHelper : historyHelper}
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
          <div className="space-y-4">
            <div className="relative z-[80] space-y-2">
              <Label>Recipients</Label>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{picker}</div>
                <Button
                  type="button"
                  variant={audienceAll ? 'default' : 'outline'}
                  onClick={onToggleAll}
                  disabled={allToggleDisabled}
                  className={`shrink-0 ${selectedViewButtonClass(audienceAll)}`}
                >
                  {allLabel}
                </Button>
              </div>
              {!audienceAll && selected.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.map((recipient) => (
                    <Badge
                      key={recipient.id}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {recipient.username}
                      <button
                        type="button"
                        onClick={() => onRemoveRecipient(recipient.id)}
                        className="rounded-full p-0.5 hover:bg-muted"
                        aria-label={`Remove ${recipient.username}`}
                      >
                        <LuX className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {audienceAll && (
                <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                  {allWarning}
                </p>
              )}
            </div>

            {extraFields}

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
                min={NOTIFICATION_EXPIRES_MIN_DAYS}
                max={NOTIFICATION_EXPIRES_MAX_DAYS}
                value={expiresInDays}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  setExpiresInDays(Number.isNaN(value) ? 0 : value)
                }}
              />
            </div>
          </div>
        ) : (
          <SentNotificationsList
            sends={history.data ?? []}
            status={historyStatus}
            recipientNoun={recipientNoun}
            campaignName={campaignName}
            typeLabel={typeLabel}
            typeIcon={typeIcon}
          />
        )}
      </div>
    </Modal>
  )
}
