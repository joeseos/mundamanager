'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/modal'
import { Combobox } from '@/components/ui/combobox'
import { buildGangComboboxOption } from '@/utils/gang-combobox-option'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createListing } from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignTradePaymentFields, {
  emptyTradePaymentValue,
  parseTradePayments,
  type CampaignTradePaymentResource,
  type CampaignTradePaymentValue,
} from '@/components/campaigns/[id]/campaign-trade-payment-fields'

export interface LookingForTradeGang {
  gangId: string
  gangName: string
  gangColour?: string | null
}

interface CampaignTradeLookingForModalProps {
  campaignId: string
  proposerGangId?: string
  actorGangs: LookingForTradeGang[]
  paymentResources?: CampaignTradePaymentResource[]
  onClose: () => void
  onProposed?: () => void
}

export default function CampaignTradeLookingForModal({
  campaignId,
  proposerGangId,
  actorGangs,
  paymentResources = [],
  onClose,
  onProposed,
}: CampaignTradeLookingForModalProps) {
  const proposers = proposerGangId
    ? actorGangs.filter((gang) => gang.gangId === proposerGangId)
    : actorGangs

  const [selectedProposer, setSelectedProposer] = useState(proposers[0]?.gangId ?? proposerGangId ?? '')
  const [payment, setPayment] = useState<CampaignTradePaymentValue>(emptyTradePaymentValue)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const confirmDisabled = !selectedProposer || !title.trim()

  return (
    <Modal
      title="Looking for goods and services"
      helper="Describe what you want and what you'll pay. Other gangs bid with the goods or service."
      confirmText="Post listing"
      confirmDisabled={confirmDisabled}
      onClose={onClose}
      onConfirm={async () => {
        const payments = parseTradePayments(payment, paymentResources)
        if (!payments.success) {
          toast.error(payments.error)
          return false
        }

        const result = await createListing({
          campaignId,
          proposerGangId: selectedProposer,
          title: title.trim(),
          note: note.trim() || undefined,
          creditsAmount: payments.creditsAmount,
          reputationAmount: payments.reputationAmount,
          resources: payments.resources,
        })
        if (!result.success) {
          toast.error(result.error ?? 'Failed to post listing')
          return false
        }
        toast.success('Listing posted')
        onProposed?.()
        return true
      }}
      content={
        <div className="space-y-4">
          {proposers.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="lookingfor-proposer" className="text-xs">Your gang *</Label>
              <Combobox
                id="lookingfor-proposer"
                options={proposers.map((gang) => buildGangComboboxOption({
                  id: gang.gangId,
                  name: gang.gangName,
                  gang_colour: gang.gangColour,
                }))}
                value={selectedProposer}
                onValueChange={setSelectedProposer}
                placeholder="Select gang"
                className="h-9"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="lookingfor-title" className="text-sm">Title *</Label>
            <Input
              id="lookingfor-title"
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What you want"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="lookingfor-note" className="text-xs">Description</Label>
            <Textarea
              id="lookingfor-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <CampaignTradePaymentFields
            idPrefix="lookingfor"
            catalog={paymentResources}
            value={payment}
            onChange={setPayment}
            heading="Offering"
          />
        </div>
      }
    />
  )
}
