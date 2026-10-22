'use client'

import { useMemo } from 'react'
import { LuMessageSquareText } from 'react-icons/lu'
import { Combobox } from '@/components/ui/combobox'
import {
  NotificationComposerModal,
  type ComposerRecipient,
} from '@/components/shared/notification-composer-modal'

export function CampaignMessageModal({
  campaignId,
  players,
  onClose,
}: {
  campaignId: string
  players: ComposerRecipient[]
  onClose: () => void
}) {
  const campaignPlayers = useMemo(() => {
    const seen = new Set<string>()
    const unique: ComposerRecipient[] = []
    for (const player of players) {
      if (!player.id || seen.has(player.id)) continue
      seen.add(player.id)
      unique.push(player)
    }
    unique.sort((a, b) => a.username.localeCompare(b.username))
    return unique
  }, [players])

  return (
    <NotificationComposerModal
      title="Campaign message"
      composeHelper="Send a message to players in this campaign."
      historyHelper="Campaign messages already sent."
      onClose={onClose}
      historyUrl={`/api/campaigns/${campaignId}/messages`}
      sendUrl={`/api/campaigns/${campaignId}/messages`}
      recipientNoun="player"
      selectedAudience="players"
      typeLabel={() => 'Campaign message'}
      typeIcon={() => <LuMessageSquareText className="h-4 w-4 text-green-500" />}
      allLabel="All players"
      allWarning="This will send the message to every player in this campaign. Double-check the message before sending."
      allToggleDisabled={campaignPlayers.length === 0}
      allowSendAll={campaignPlayers.length > 0}
      picker={({ disabled, excludeIds, onSelect }) => (
        <Combobox
          options={campaignPlayers
            .filter((player) => !excludeIds.includes(player.id))
            .map((player) => ({ value: player.id, label: player.username }))}
          value=""
          onValueChange={(playerId) => {
            const player = campaignPlayers.find((candidate) => candidate.id === playerId)
            if (player) onSelect(player)
          }}
          placeholder="Search campaign players by username"
          disabled={disabled}
          noResultsText="No players found"
        />
      )}
    />
  )
}
