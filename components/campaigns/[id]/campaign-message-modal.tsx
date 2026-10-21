'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LuMessageSquareText } from 'react-icons/lu'
import { Combobox } from '@/components/ui/combobox'
import {
  NotificationComposerModal,
  type ComposerRecipient,
} from '@/components/shared/notification-composer-modal'

export type CampaignMessagePlayer = {
  id: string
  username: string
}

export function CampaignMessageModal({
  campaignId,
  campaignName,
  players,
  onClose,
}: {
  campaignId: string
  campaignName: string
  players: CampaignMessagePlayer[]
  onClose: () => void
}) {
  const [audienceAll, setAudienceAll] = useState(false)
  const [selectedPlayers, setSelectedPlayers] = useState<ComposerRecipient[]>([])

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

  const selectedIds = new Set(selectedPlayers.map((player) => player.id))

  const toggleAllPlayers = () => {
    if (audienceAll) {
      setAudienceAll(false)
      return
    }
    setSelectedPlayers([])
    setAudienceAll(true)
  }

  return (
    <NotificationComposerModal
      title="Campaign message"
      composeHelper="Send a message to players in this campaign."
      historyHelper="Campaign messages already sent."
      onClose={onClose}
      historyUrl={`/api/campaigns/${campaignId}/messages`}
      recipientNoun="player"
      campaignName={campaignName}
      typeLabel={() => 'Campaign message'}
      typeIcon={() => <LuMessageSquareText className="h-4 w-4 text-green-500" />}
      allLabel="All players"
      allWarning="This will send the message to every player in this campaign. Double-check the message before sending."
      audienceAll={audienceAll}
      onToggleAll={toggleAllPlayers}
      allToggleDisabled={campaignPlayers.length === 0}
      allowSendAll={campaignPlayers.length > 0}
      selected={selectedPlayers}
      onRemoveRecipient={(playerId) =>
        setSelectedPlayers((prev) => prev.filter((player) => player.id !== playerId))
      }
      picker={
        <Combobox
          options={campaignPlayers
            .filter((player) => !selectedIds.has(player.id))
            .map((player) => ({ value: player.id, label: player.username }))}
          value=""
          onValueChange={(playerId) => {
            const player = campaignPlayers.find((candidate) => candidate.id === playerId)
            if (!player) return
            setSelectedPlayers((prev) => {
              if (prev.some((selected) => selected.id === player.id)) return prev
              return [...prev, player]
            })
          }}
          placeholder="Search campaign players by username"
          disabled={audienceAll}
          noResultsText="No players found"
        />
      }
      onSend={async ({ text, expiresInDays }) => {
        try {
          const response = await fetch(`/api/campaigns/${campaignId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              expiresInDays,
              audience: audienceAll ? 'all' : 'players',
              userIds: audienceAll ? undefined : selectedPlayers.map((player) => player.id),
            }),
          })
          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Failed to send messages')
          }
          toast.success(`Message sent to ${data.count} ${data.count === 1 ? 'player' : 'players'}`)
          return true
        } catch (error) {
          console.error('Failed to send campaign messages:', error)
          toast.error(error instanceof Error ? error.message : 'Failed to send messages')
          return false
        }
      }}
    />
  )
}
