'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  selectedViewButtonClass,
  SentNotificationsList,
  type SentHistoryStatus,
} from '@/components/shared/sent-notifications-list'
import { toast } from 'sonner'
import { LuMessageSquareText, LuX } from 'react-icons/lu'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import {
  notificationPlainTextLength,
  NOTIFICATION_BROADCAST_MAX_LENGTH,
} from '@/utils/notifications'
import { LazyRichTextEditor } from '@/components/ui/lazy-rich-text-editor'
import '@/components/ui/rich-text-editor.css'

type Audience = 'players' | 'all'
type ModalView = 'compose' | 'history'

type SentCampaignMessage = {
  id: string
  sentAt: string
  senderUsername: string
  recipientCount: number
  recipientUsernames: string[]
  preview: string
  text: string
  link: string
}

export type CampaignMessagePlayer = {
  id: string
  username: string
}

interface CampaignMessageModalProps {
  campaignId: string
  campaignName: string
  players: CampaignMessagePlayer[]
  onClose: () => void
}

function PlayerSearch({
  players,
  excludeIds,
  disabled,
  onSelect,
}: {
  players: CampaignMessagePlayer[]
  excludeIds: string[]
  disabled: boolean
  onSelect: (player: CampaignMessagePlayer) => void
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim().toLowerCase()
  const exclude = new Set(excludeIds)
  const results = trimmed
    ? players.filter(
        (player) => !exclude.has(player.id) && player.username.toLowerCase().includes(trimmed)
      )
    : []

  return (
    <div className="relative">
      <Input
        type="text"
        placeholder="Search campaign players by username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
        disabled={disabled}
      />
      {results.length > 0 && query && !disabled && (
        <div className="absolute mt-1 w-full bg-card rounded-lg border shadow-lg z-10">
          <ul className="py-2">
            {results.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(player)
                    setQuery('')
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-muted"
                >
                  <span className="font-medium">{player.username}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function CampaignMessageModal({ campaignId, campaignName, players, onClose }: CampaignMessageModalProps) {
  const [view, setView] = useState<ModalView>('compose')
  const [audience, setAudience] = useState<Audience>('players')
  const [selectedPlayers, setSelectedPlayers] = useState<CampaignMessagePlayer[]>([])
  const [text, setText] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [sends, setSends] = useState<SentCampaignMessage[]>([])
  const [historyStatus, setHistoryStatus] = useState<SentHistoryStatus>('idle')

  const campaignPlayers = useMemo(() => {
    const seen = new Set<string>()
    const unique: CampaignMessagePlayer[] = []
    for (const player of players) {
      if (!player.id || seen.has(player.id)) continue
      seen.add(player.id)
      unique.push(player)
    }
    unique.sort((a, b) => a.username.localeCompare(b.username))
    return unique
  }, [players])

  useEffect(() => {
    if (view !== 'history') return

    let cancelled = false
    setHistoryStatus('loading')

    fetch(`/api/campaigns/${campaignId}/messages`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load sent messages')
        }
        return data.sends as SentCampaignMessage[]
      })
      .then((nextSends) => {
        if (cancelled) return
        setSends(nextSends)
        setHistoryStatus('ready')
      })
      .catch((error) => {
        console.error('Failed to load sent campaign messages:', error)
        if (cancelled) return
        setHistoryStatus('error')
        toast.error(error instanceof Error ? error.message : 'Failed to load sent messages')
      })

    return () => {
      cancelled = true
    }
  }, [view, campaignId])

  const canSend =
    !isHtmlEffectivelyEmpty(text) &&
    notificationPlainTextLength(text) <= NOTIFICATION_BROADCAST_MAX_LENGTH &&
    expiresInDays >= 1 &&
    (audience === 'all' ? campaignPlayers.length > 0 : selectedPlayers.length > 0)

  const handleSelectPlayer = (player: CampaignMessagePlayer) => {
    setSelectedPlayers((prev) => {
      if (prev.some((selected) => selected.id === player.id)) return prev
      return [...prev, player]
    })
  }

  const toggleAllPlayers = () => {
    if (audience === 'all') {
      setAudience('players')
      return
    }
    setSelectedPlayers([])
    setAudience('all')
  }

  const handleSend = async () => {
    if (!canSend) return false

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          expiresInDays,
          audience,
          userIds: audience === 'players' ? selectedPlayers.map((player) => player.id) : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send messages')
      }

      toast.success(
        `Message sent to ${data.count} ${data.count === 1 ? 'player' : 'players'}`
      )
      return true
    } catch (error) {
      console.error('Failed to send campaign messages:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send messages')
      return false
    }
  }

  return (
    <Modal
      title="Campaign message"
      helper={
        view === 'compose'
          ? 'Send a message to players in this campaign.'
          : 'Campaign messages already sent.'
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
          <div className="space-y-4">
        <div className="relative z-[80] space-y-2">
          <Label>Recipients</Label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PlayerSearch
                players={campaignPlayers}
                excludeIds={selectedPlayers.map((player) => player.id)}
                disabled={audience === 'all'}
                onSelect={handleSelectPlayer}
              />
            </div>
            <Button
              type="button"
              variant={audience === 'all' ? 'default' : 'outline'}
              onClick={toggleAllPlayers}
              disabled={campaignPlayers.length === 0}
              className={`shrink-0 ${selectedViewButtonClass(audience === 'all')}`}
            >
              All players
            </Button>
          </div>
          {audience === 'players' && selectedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedPlayers.map((player) => (
                <Badge
                  key={player.id}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  {player.username}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPlayers((prev) => prev.filter((selected) => selected.id !== player.id))
                    }
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label={`Remove ${player.username}`}
                  >
                    <LuX className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {audience === 'all' && (
            <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
              This will send the message to every player in this campaign. Double-check the
              message before sending.
            </p>
          )}
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
          <Label htmlFor="campaign-message-expires">Expires in (days)</Label>
          <Input
            id="campaign-message-expires"
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
        ) : (
          <SentNotificationsList
            sends={sends}
            status={historyStatus}
            recipientNoun="player"
            campaignName={campaignName}
            typeLabel={() => 'Campaign message'}
            typeIcon={() => <LuMessageSquareText className="h-4 w-4 text-green-500" />}
          />
        )}
      </div>
    </Modal>
  )
}
