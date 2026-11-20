'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import { Combobox } from '@/components/ui/combobox'
import { buildGangComboboxOption } from '@/utils/gang-combobox-option'
import { buildFighterComboboxOption } from '@/utils/campaign-gang-fighter-options'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createCampaignTrade } from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignTradePaymentFields, {
  emptyTradePaymentValue,
  parseTradePayments,
  paymentValueFromItems,
  type CampaignTradePaymentResource,
  type CampaignTradePaymentValue,
} from '@/components/campaigns/[id]/campaign-trade-payment-fields'
import type { CampaignTrade } from '@/types/campaign-trade'
import type { CampaignResource } from '@/utils/campaigns/resources'
import type { TradeableStashItem } from '@/utils/campaign-trade-stash'

export type CampaignTradeModalMode = 'sell' | 'looking-for' | 'bid'

type TradeKind = 'custom' | 'equipment' | 'ransom'

const TRADE_KINDS: { id: TradeKind; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'ransom', label: 'Captive' },
]

interface CampaignGangOption {
  id: string
  name: string
  gang_colour?: string | null
  user_id?: string | null
  owner_username?: string | null
}

interface RansomCaptive {
  fighterId: string
  fighterName: string
  fighterType?: string | null
  originalGangId?: string | null
  originalGangName: string
}

interface CampaignTradeModalProps {
  campaignId: string
  mode: CampaignTradeModalMode
  userId?: string
  isCampaignArb?: boolean
  actorGangId?: string
  listing?: CampaignTrade
  onClose: () => void
  onPosted?: () => void
}

function listingHasGoods(listing: CampaignTrade) {
  return listing.items.some((item) => item.kind === 'captive' || item.kind === 'equipment' || item.kind === 'custom')
}

function defaultRansomTitle(fighterName: string) {
  return `Ransom: ${fighterName}`
}

function defaultEquipmentTitle(equipmentName: string) {
  return `Equipment: ${equipmentName}`
}

function defaultCustomTitle(description: string) {
  const body = description.trim()
  if (!body) return ''
  return `Misc.: ${body}`.slice(0, 100)
}

function toPaymentCatalog(resources: CampaignResource[]): CampaignTradePaymentResource[] {
  return resources.map((resource) => ({
    id: resource.id,
    name: resource.resource_name,
    isCustom: resource.is_custom,
  }))
}

export default function CampaignTradeModal({
  campaignId,
  mode,
  userId,
  isCampaignArb = false,
  actorGangId,
  listing,
  onClose,
  onPosted,
}: CampaignTradeModalProps) {
  const queryClient = useQueryClient()
  const isSellingBid = mode === 'bid' && !!listing && listingHasGoods(listing)
  const showGoods = mode === 'sell' || (mode === 'bid' && !isSellingBid)
  const showPayments = mode !== 'bid' || isSellingBid
  const showCounterparty = mode === 'sell'

  const [kind, setKind] = useState<TradeKind>('custom')
  const [selectedActor, setSelectedActor] = useState(actorGangId ?? '')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [fighterEquipmentId, setFighterEquipmentId] = useState('')
  const [fighterId, setFighterId] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [payment, setPayment] = useState<CampaignTradePaymentValue>(
    isSellingBid && listing ? paymentValueFromItems(listing.items) : emptyTradePaymentValue()
  )
  const [title, setTitle] = useState(mode === 'bid' && listing ? `Bid: ${listing.title}` : '')
  const [note, setNote] = useState('')

  const { data: campaignGangs = [] } = useQuery({
    queryKey: ['campaign-gangs', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`)
      if (!response.ok) throw new Error('Failed to fetch campaign gangs')
      return response.json() as Promise<CampaignGangOption[]>
    },
    staleTime: 0,
    meta: { errorMessage: 'Failed to load gangs' },
  })

  const { data: paymentResources = [] } = useQuery({
    queryKey: ['campaign-resources', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/resources`)
      if (!response.ok) throw new Error('Failed to fetch resources')
      const resources = await response.json() as CampaignResource[]
      return toPaymentCatalog(resources)
    },
    staleTime: 0,
    meta: { errorMessage: 'Failed to load resources' },
  })

  const actors = useMemo(() => {
    const gangs = campaignGangs.filter((gang) => {
      if (actorGangId) return gang.id === actorGangId
      const allowed = isCampaignArb || (!!userId && gang.user_id === userId)
      if (!allowed) return false
      if (mode === 'bid' && listing) return gang.id !== listing.proposer_gang_id
      return true
    })
    return gangs.map((gang) => ({
      gangId: gang.id,
      gangName: gang.name,
      gangColour: gang.gang_colour,
    }))
  }, [actorGangId, campaignGangs, isCampaignArb, listing, mode, userId])

  const actingGangId = selectedActor || actorGangId || actors[0]?.gangId || ''

  const { data: captives = [], isFetching: loadingCaptives } = useQuery({
    queryKey: ['gang-captives', actingGangId],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${actingGangId}/captives`)
      if (!response.ok) throw new Error('Failed to load captives')
      const json = await response.json() as { captives?: RansomCaptive[] }
      return json.captives ?? []
    },
    enabled: showGoods && !!actingGangId,
    staleTime: 0,
    meta: { errorMessage: 'Failed to load captives' },
  })

  const { data: stashItems = [], isFetching: loadingStash } = useQuery({
    queryKey: ['gang-tradeable-stash', actingGangId],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${actingGangId}/tradeable-stash`)
      if (!response.ok) throw new Error('Failed to load stash')
      const json = await response.json() as { items?: TradeableStashItem[] }
      return json.items ?? []
    },
    enabled: showGoods && kind === 'equipment' && !!actingGangId,
    staleTime: 0,
    meta: { errorMessage: 'Failed to load stash' },
  })

  const actingFighterId = fighterId && captives.some((captive) => captive.fighterId === fighterId)
    ? fighterId
    : (captives[0]?.fighterId ?? '')
  const actingEquipmentId = fighterEquipmentId && stashItems.some((item) => item.id === fighterEquipmentId)
    ? fighterEquipmentId
    : (stashItems[0]?.id ?? '')
  const selectedCaptive = captives.find((captive) => captive.fighterId === actingFighterId)
  const isOpenListing = counterpartyId === ''

  const counterpartyOptions = useMemo(
    () => [
      { value: '', label: 'Open to everyone', displayValue: 'Open to everyone' },
      ...campaignGangs
        .filter((gang) => gang.id !== actingGangId)
        .map((gang) => buildGangComboboxOption({
          id: gang.id,
          name: gang.name,
          gang_colour: gang.gang_colour,
          owner_username: gang.owner_username,
        })),
    ],
    [actingGangId, campaignGangs]
  )

  const applyKindDefaults = (nextKind: TradeKind) => {
    if (nextKind === 'ransom') {
      const next = captives[0]
      setFighterId(next?.fighterId ?? '')
      if (mode === 'sell') setTitle(next ? defaultRansomTitle(next.fighterName) : '')
      return
    }
    if (nextKind === 'equipment') {
      const next = stashItems[0]
      setFighterEquipmentId(next?.id ?? '')
      if (mode === 'sell') setTitle(next ? defaultEquipmentTitle(next.equipmentName) : '')
      return
    }
    if (mode === 'sell') setTitle(defaultCustomTitle(customDescription))
  }

  const selectKind = (nextKind: TradeKind) => {
    if (nextKind === 'ransom' && captives.length === 0 && kind !== 'ransom') {
      return
    }
    setKind(nextKind)
    applyKindDefaults(nextKind)
  }

  const confirmDisabled = !actingGangId || !title.trim() || (
    !showGoods
      ? false
      : kind === 'ransom'
        ? !actingFighterId || loadingCaptives
        : kind === 'equipment'
          ? !actingEquipmentId || loadingStash
          : !customDescription.trim()
  )

  const modalTitle = mode === 'sell'
    ? 'Selling goods and services'
    : mode === 'looking-for'
      ? 'Looking for goods and services'
      : 'Place bid'
  const helper = mode === 'sell'
    ? 'Offer equipment, a captive, or custom terms to a specific gang, or leave Counterparty as Open to everyone for others to bid.'
    : mode === 'looking-for'
      ? "Describe what you want and what you'll pay. Other gangs bid with the goods or service."
      : undefined
  const confirmText = mode === 'bid' ? 'Place bid' : 'Post listing'

  return (
    <Modal
      title={modalTitle}
      helper={helper}
      confirmText={confirmText}
      confirmDisabled={confirmDisabled}
      onClose={onClose}
      onConfirm={async () => {
        const payments = showPayments
          ? parseTradePayments(payment, paymentResources)
          : { success: true as const, creditsAmount: 0, reputationAmount: undefined, resources: [] }
        if (!payments.success) {
          toast.error(payments.error)
          return false
        }
        if (showGoods && kind === 'ransom' && !selectedCaptive?.originalGangId) {
          toast.error('That captive has no original gang.')
          return false
        }
        if (showGoods && kind === 'custom') {
          const description = customDescription.trim()
          if (description.length < 1 || description.length > 40) {
            toast.error('Custom terms must be 1 to 40 characters.')
            return false
          }
        }

        const result = await createCampaignTrade({
          campaignId,
          proposerGangId: actingGangId,
          counterpartyGangId: mode === 'bid'
            ? listing?.proposer_gang_id
            : mode === 'sell' && !isOpenListing
              ? counterpartyId
              : null,
          parentTradeId: mode === 'bid' ? listing?.id : null,
          title: title.trim(),
          note: note.trim() || undefined,
          goodsKind: showGoods
            ? (kind === 'ransom' ? 'captive' : kind)
            : null,
          fighterId: showGoods && kind === 'ransom' ? actingFighterId : null,
          fighterEquipmentId: showGoods && kind === 'equipment' ? actingEquipmentId : null,
          customDescription: showGoods && kind === 'custom' ? customDescription.trim() : null,
          creditsAmount: payments.creditsAmount,
          reputationAmount: payments.reputationAmount,
          resources: payments.resources,
        })
        if (!result.success) {
          toast.error(result.error ?? 'Failed to post trade')
          return false
        }
        toast.success(mode === 'bid' ? 'Bid placed' : 'Listing posted')
        await queryClient.invalidateQueries({ queryKey: ['campaign-trades', campaignId] })
        await queryClient.invalidateQueries({ queryKey: ['gang-captives'] })
        await queryClient.invalidateQueries({ queryKey: ['gang-tradeable-stash'] })
        onPosted?.()
        return true
      }}
      content={
        <div className="space-y-4">
          {actors.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="trade-actor" className="text-xs">Your gang *</Label>
              <Combobox
                id="trade-actor"
                options={actors.map((gang) => buildGangComboboxOption({
                  id: gang.gangId,
                  name: gang.gangName,
                  gang_colour: gang.gangColour,
                }))}
                value={actingGangId}
                onValueChange={(value) => {
                  setSelectedActor(value)
                  if (counterpartyId === value) setCounterpartyId('')
                  setFighterId('')
                  setFighterEquipmentId('')
                }}
                placeholder="Select gang"
                className="h-9"
              />
            </div>
          )}

          {showGoods && (
            <div className="flex gap-2">
              {TRADE_KINDS.map((option) => {
                const disabled = option.id === 'ransom' && !loadingCaptives && captives.length === 0
                return (
                  <span
                    key={option.id}
                    className="inline-flex min-w-0 flex-1"
                    title={disabled ? 'This gang is not holding any captives.' : undefined}
                  >
                    <Button
                      type="button"
                      size="sm"
                      className="w-full font-medium"
                      variant={kind === option.id ? 'default' : 'outline'}
                      disabled={disabled}
                      onClick={() => selectKind(option.id)}
                    >
                      {option.label}
                    </Button>
                  </span>
                )
              })}
            </div>
          )}

          {showCounterparty && (
            <div className="space-y-1">
              <Label htmlFor="trade-counterparty" className="text-sm">Counterparty *</Label>
              <Combobox
                id="trade-counterparty"
                options={counterpartyOptions}
                value={counterpartyId}
                onValueChange={setCounterpartyId}
                placeholder="Select gang"
                className="h-9"
              />
            </div>
          )}

          {showGoods && kind === 'ransom' && (
            <div className="space-y-1">
              <Label htmlFor="trade-captive" className="text-sm">Captive *</Label>
              <Combobox
                id="trade-captive"
                options={captives.map((captive) => buildFighterComboboxOption({
                  id: captive.fighterId,
                  fighter_name: captive.fighterName,
                  fighter_type: captive.fighterType,
                }))}
                value={actingFighterId}
                onValueChange={(nextId) => {
                  const next = captives.find((captive) => captive.fighterId === nextId)
                  setFighterId(nextId)
                  if (next && mode === 'sell') {
                    setTitle(defaultRansomTitle(next.fighterName))
                    if (next.originalGangId && next.originalGangId !== actingGangId) {
                      setCounterpartyId(next.originalGangId)
                    }
                  }
                }}
                placeholder={loadingCaptives ? 'Loading captives...' : 'Select captive'}
              />
            </div>
          )}

          {showGoods && kind === 'equipment' && (
            <div className="space-y-1">
              <Label htmlFor="trade-item" className="text-sm">Equipment in Stash *</Label>
              <Combobox
                id="trade-item"
                options={stashItems.map((item) => ({
                  value: item.id,
                  label: item.equipmentName,
                }))}
                value={actingEquipmentId}
                onValueChange={(nextId) => {
                  const next = stashItems.find((item) => item.id === nextId)
                  setFighterEquipmentId(nextId)
                  if (next && mode === 'sell') setTitle(defaultEquipmentTitle(next.equipmentName))
                }}
                placeholder={loadingStash ? 'Loading stash...' : 'Select item'}
              />
            </div>
          )}

          {showGoods && kind === 'custom' && (
            <div className="space-y-1">
              <Label htmlFor="trade-description" className="text-sm">Custom terms *</Label>
              <Input
                id="trade-description"
                maxLength={40}
                value={customDescription}
                onChange={(event) => {
                  const next = event.target.value
                  setCustomDescription(next)
                  if (mode === 'sell') setTitle(defaultCustomTitle(next))
                }}
                placeholder="Territory or service being sold"
              />
            </div>
          )}

          {showPayments && (
            <CampaignTradePaymentFields
              idPrefix="trade"
              catalog={paymentResources}
              value={payment}
              onChange={setPayment}
              heading={mode === 'sell' ? 'Asking price' : mode === 'looking-for' ? 'Offering' : undefined}
            />
          )}

          <div className="space-y-1">
            <Label htmlFor="trade-title" className="text-sm">Title *</Label>
            <Input
              id="trade-title"
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={mode === 'looking-for' ? 'What you want' : undefined}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="trade-note" className="text-xs">{mode === 'bid' ? 'Note' : 'Description'}</Label>
            <Textarea
              id="trade-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
      }
    />
  )
}
