'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/modal'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createBid,
  listStashForEquipmentTrade,
  type TradeableStashItem,
} from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignTradePaymentFields, {
  emptyTradePaymentValue,
  parseTradePayments,
  paymentValueFromItems,
  type CampaignTradePaymentResource,
  type CampaignTradePaymentValue,
} from '@/components/campaigns/[id]/campaign-trade-payment-fields'
import type { CampaignTrade } from '@/types/campaign-trade'
import { buildGangComboboxOption } from '@/utils/gang-combobox-option'
import { buildCaptiveComboboxOption } from '@/utils/campaign-gang-fighter-options'
import type { RansomCaptive } from '@/components/campaigns/[id]/campaign-trade-sell-modal'

export interface BidActorGang {
  gangId: string
  gangName: string
  gangColour?: string | null
}

type BidGoodKind = 'captive' | 'equipment' | 'custom'

interface CampaignBidModalProps {
  campaignId: string
  listing: CampaignTrade
  actorGangs: BidActorGang[]
  paymentResources?: CampaignTradePaymentResource[]
  onClose: () => void
  onProposed?: () => void
}

function listingHasGoods(listing: CampaignTrade) {
  return listing.items.some((item) => item.kind === 'captive' || item.kind === 'equipment' || item.kind === 'custom')
}

export default function CampaignBidModal({
  campaignId,
  listing,
  actorGangs,
  paymentResources = [],
  onClose,
  onProposed,
}: CampaignBidModalProps) {
  const isSellingListing = listingHasGoods(listing)
  const bidders = actorGangs.filter((gang) => gang.gangId !== listing.proposer_gang_id)
  const [selectedBidder, setSelectedBidder] = useState(bidders[0]?.gangId ?? '')
  const [payment, setPayment] = useState<CampaignTradePaymentValue>(
    isSellingListing ? paymentValueFromItems(listing.items) : emptyTradePaymentValue()
  )
  const [title, setTitle] = useState(`Bid: ${listing.title}`)
  const [note, setNote] = useState('')
  const [goodKind, setGoodKind] = useState<BidGoodKind>('equipment')
  const [customDescription, setCustomDescription] = useState('')
  const [fighterId, setFighterId] = useState('')
  const [captives, setCaptives] = useState<RansomCaptive[]>([])
  const [captivesFor, setCaptivesFor] = useState<string | null>(null)
  const [stashItems, setStashItems] = useState<TradeableStashItem[]>([])
  const [stashFor, setStashFor] = useState<string | null>(null)
  const [fighterEquipmentId, setFighterEquipmentId] = useState('')

  const loadingCaptives = !isSellingListing && goodKind === 'captive' && !!selectedBidder && captivesFor !== selectedBidder
  const loadingStash = !isSellingListing && goodKind === 'equipment' && !!selectedBidder && stashFor !== selectedBidder
  const selectedCaptive = captives.find((captive) => captive.fighterId === fighterId)

  useEffect(() => {
    if (isSellingListing || !selectedBidder || goodKind !== 'captive') return

    let cancelled = false
    fetch(`/api/gangs/${selectedBidder}/captives`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load captives')
        return response.json() as Promise<{ captives?: Array<{
          fighterId: string
          fighterName: string
          fighterType?: string | null
          originalGangId: string | null
          originalGangName: string
          originalGangColour?: string | null
          originalGangOwnerUsername?: string | null
        }> }>
      })
      .then((json) => {
        if (cancelled) return
        const next = (json.captives ?? []).map((captive) => ({
          fighterId: captive.fighterId,
          fighterName: captive.fighterName,
          fighterType: captive.fighterType,
          originalGangId: captive.originalGangId,
          originalGangName: captive.originalGangName,
          originalGangColour: captive.originalGangColour,
          originalGangOwnerUsername: captive.originalGangOwnerUsername,
        }))
        setCaptives(next)
        setCaptivesFor(selectedBidder)
        setFighterId(next[0]?.fighterId ?? '')
      })
      .catch((error) => {
        if (cancelled) return
        console.error(error)
        toast.error('Failed to load captives')
        setCaptives([])
        setCaptivesFor(selectedBidder)
        setFighterId('')
      })
    return () => {
      cancelled = true
    }
  }, [goodKind, isSellingListing, selectedBidder])

  useEffect(() => {
    if (isSellingListing || !selectedBidder || goodKind !== 'equipment') return

    let cancelled = false
    listStashForEquipmentTrade(selectedBidder).then((result) => {
      if (cancelled) return
      if (!result.success) {
        toast.error(result.error ?? 'Failed to load stash')
        setStashItems([])
        setStashFor(selectedBidder)
        setFighterEquipmentId('')
        return
      }
      setStashItems(result.items)
      setStashFor(selectedBidder)
      setFighterEquipmentId(result.items[0]?.id ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [goodKind, isSellingListing, selectedBidder])

  const confirmDisabled = useMemo(() => {
    if (!selectedBidder || !title.trim()) return true
    if (isSellingListing) return false
    if (goodKind === 'captive') return !fighterId || loadingCaptives
    if (goodKind === 'custom') {
      const length = customDescription.trim().length
      return length < 1 || length > 40
    }
    return !fighterEquipmentId || loadingStash
  }, [
    customDescription,
    fighterEquipmentId,
    fighterId,
    goodKind,
    isSellingListing,
    loadingCaptives,
    loadingStash,
    selectedBidder,
    title,
  ])

  return (
    <Modal
      title="Place bid"
      confirmText="Place bid"
      confirmDisabled={confirmDisabled}
      onClose={onClose}
      onConfirm={async () => {
        const payments = isSellingListing
          ? parseTradePayments(payment, paymentResources)
          : { success: true as const, creditsAmount: 0, reputationAmount: undefined, resources: [] }
        if (!payments.success) {
          toast.error(payments.error)
          return false
        }
        if (!isSellingListing && goodKind === 'captive' && !selectedCaptive?.originalGangId) {
          toast.error('That captive has no original gang.')
          return false
        }
        if (!isSellingListing && goodKind === 'custom') {
          const description = customDescription.trim()
          if (description.length < 1 || description.length > 40) {
            toast.error('Custom terms must be 1 to 40 characters.')
            return false
          }
        }

        const result = await createBid({
          campaignId,
          listingId: listing.id,
          bidderGangId: selectedBidder,
          listingAuthorGangId: listing.proposer_gang_id,
          title: title.trim(),
          note: note.trim() || undefined,
          fighterId: !isSellingListing && goodKind === 'captive' ? fighterId : null,
          originalGangId: !isSellingListing && goodKind === 'captive' ? selectedCaptive?.originalGangId : null,
          fighterEquipmentId: !isSellingListing && goodKind === 'equipment' ? fighterEquipmentId : null,
          customDescription: !isSellingListing && goodKind === 'custom' ? customDescription.trim() : null,
          creditsAmount: payments.creditsAmount,
          reputationAmount: payments.reputationAmount,
          resources: payments.resources,
        })
        if (!result.success) {
          toast.error(result.error ?? 'Failed to place bid')
          return false
        }
        toast.success('Bid placed')
        onProposed?.()
        return true
      }}
      content={
        <div className="space-y-4">
          {bidders.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="bid-bidder" className="text-xs">Your gang *</Label>
              <Combobox
                id="bid-bidder"
                options={bidders.map((gang) => buildGangComboboxOption({
                  id: gang.gangId,
                  name: gang.gangName,
                  gang_colour: gang.gangColour,
                }))}
                value={selectedBidder}
                onValueChange={setSelectedBidder}
                placeholder="Select gang"
                className="h-9"
              />
            </div>
          )}

          {isSellingListing ? (
            <CampaignTradePaymentFields
              idPrefix="bid"
              catalog={paymentResources}
              value={payment}
              onChange={setPayment}
            />
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="bid-good-kind" className="text-xs">Offer *</Label>
                <Combobox
                  id="bid-good-kind"
                  options={[
                    { value: 'equipment', label: 'Equipment' },
                    { value: 'captive', label: 'Captive' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                  value={goodKind}
                  onValueChange={(value) => setGoodKind(value as BidGoodKind)}
                  className="h-9"
                />
              </div>
              {goodKind === 'custom' ? (
                <div className="space-y-1">
                  <Label htmlFor="bid-custom" className="text-sm">Custom terms *</Label>
                  <Input
                    id="bid-custom"
                    maxLength={40}
                    value={customDescription}
                    onChange={(event) => setCustomDescription(event.target.value)}
                    placeholder="Territory or service being sold"
                  />
                </div>
              ) : goodKind === 'captive' ? (
                <div className="space-y-1">
                  <Label htmlFor="bid-captive" className="text-sm">Captive *</Label>
                  <Combobox
                    id="bid-captive"
                    options={captives.map((captive) => buildCaptiveComboboxOption(captive))}
                    value={fighterId}
                    onValueChange={setFighterId}
                    placeholder={loadingCaptives ? 'Loading captives...' : 'Select captive'}
                    className="h-9"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="bid-equipment" className="text-sm">Equipment in Stash *</Label>
                  <Combobox
                    id="bid-equipment"
                    options={stashItems.map((item) => ({
                      value: item.id,
                      label: item.equipmentName,
                    }))}
                    value={fighterEquipmentId}
                    onValueChange={setFighterEquipmentId}
                    placeholder={loadingStash ? 'Loading stash...' : 'Select item'}
                    className="h-9"
                  />
                </div>
              )}
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="bid-title" className="text-sm">Title *</Label>
            <Input
              id="bid-title"
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bid-note" className="text-xs">Note</Label>
            <Textarea
              id="bid-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
      }
    />
  )
}
