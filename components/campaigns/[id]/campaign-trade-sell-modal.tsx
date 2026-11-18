'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import { Combobox } from '@/components/ui/combobox'
import { buildGangComboboxOption } from '@/utils/gang-combobox-option'
import { buildCaptiveComboboxOption } from '@/utils/campaign-gang-fighter-options'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createCaptiveRansom,
  createCustomTrade,
  createEquipmentTrade,
  createListing,
  listStashForEquipmentTrade,
  type TradeableStashItem,
} from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignTradePaymentFields, {
  emptyTradePaymentValue,
  parseTradePayments,
  type CampaignTradePaymentResource,
  type CampaignTradePaymentValue,
} from '@/components/campaigns/[id]/campaign-trade-payment-fields'

export interface RansomCaptive {
  fighterId: string
  fighterName: string
  fighterType?: string | null
  originalGangId: string | null
  originalGangName: string
  originalGangColour?: string | null
  originalGangOwnerUsername?: string | null
}

export interface RansomHoldingGang {
  gangId: string
  gangName: string
  captives: RansomCaptive[]
}

export interface SellTradeGang {
  gangId: string
  gangName: string
  gangColour?: string | null
}

export interface SellTradeCounterparty {
  id: string
  name: string
  gangColour?: string | null
  ownerUsername?: string | null
}

type TradeKind = 'ransom' | 'equipment' | 'custom'

const TRADE_KINDS: { id: TradeKind; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'ransom', label: 'Captive' },
]

interface CampaignSellTradeModalProps {
  campaignId: string
  sellerGangId?: string
  actorGangs: SellTradeGang[]
  holdingGangs?: RansomHoldingGang[]
  counterparties: SellTradeCounterparty[]
  items?: TradeableStashItem[]
  paymentResources?: CampaignTradePaymentResource[]
  onClose: () => void
  onPosted?: () => void
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

export default function CampaignSellTradeModal({
  campaignId,
  sellerGangId,
  actorGangs,
  holdingGangs = [],
  counterparties,
  items: initialItems,
  paymentResources = [],
  onClose,
  onPosted,
}: CampaignSellTradeModalProps) {
  const sellers = sellerGangId
    ? actorGangs.filter((gang) => gang.gangId === sellerGangId)
    : actorGangs

  const [kind, setKind] = useState<TradeKind>('custom')
  const [selectedSeller, setSelectedSeller] = useState(sellers[0]?.gangId ?? sellerGangId ?? '')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [fetchedItems, setFetchedItems] = useState<TradeableStashItem[]>([])
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)
  const [fighterEquipmentId, setFighterEquipmentId] = useState(initialItems?.[0]?.id ?? '')
  const [fighterId, setFighterId] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [payment, setPayment] = useState<CampaignTradePaymentValue>(emptyTradePaymentValue)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const captives = holdingGangs.find((gang) => gang.gangId === selectedSeller)?.captives ?? []
  const selectedCaptive = captives.find((captive) => captive.fighterId === fighterId)
  const items = initialItems ?? (fetchedFor === selectedSeller ? fetchedItems : [])
  const loadingItems = kind === 'equipment' && !initialItems && !!selectedSeller && fetchedFor !== selectedSeller
  const selectedItem = items.find((item) => item.id === fighterEquipmentId)
  const canRansom = captives.length > 0

  const isOpenListing = counterpartyId === ''
  const counterpartyOptions = useMemo(
    () => [
      { value: '', label: 'Open to everyone', displayValue: 'Open to everyone' },
      ...counterparties
        .filter((gang) => gang.id !== selectedSeller)
        .map((gang) => buildGangComboboxOption({
          id: gang.id,
          name: gang.name,
          gang_colour: gang.gangColour,
          owner_username: gang.ownerUsername,
        })),
    ],
    [counterparties, selectedSeller]
  )

  useEffect(() => {
    if (kind !== 'equipment' || initialItems || !selectedSeller) return
    if (fetchedFor === selectedSeller) return

    let cancelled = false
    listStashForEquipmentTrade(selectedSeller).then((result) => {
      if (cancelled) return
      if (!result.success) {
        toast.error(result.error ?? 'Failed to load stash')
        setFetchedItems([])
        setFetchedFor(selectedSeller)
        setFighterEquipmentId('')
        setTitle('')
        return
      }
      setFetchedItems(result.items)
      setFetchedFor(selectedSeller)
      const first = result.items[0]
      setFighterEquipmentId(first?.id ?? '')
      setTitle(first ? defaultEquipmentTitle(first.equipmentName) : '')
    })
    return () => {
      cancelled = true
    }
  }, [fetchedFor, initialItems, kind, selectedSeller])

  const applyKindDefaults = (nextKind: TradeKind, nextCaptives = captives, nextItems = items) => {
    if (nextKind === 'ransom') {
      const next = nextCaptives.find((captive) => captive.fighterId === fighterId) ?? nextCaptives[0]
      setFighterId(next?.fighterId ?? '')
      setTitle(next ? defaultRansomTitle(next.fighterName) : '')
      if (next?.originalGangId && next.originalGangId !== selectedSeller) {
        setCounterpartyId(next.originalGangId)
      }
      return
    }
    if (nextKind === 'equipment') {
      const next = nextItems.find((item) => item.id === fighterEquipmentId) ?? nextItems[0]
      setFighterEquipmentId(next?.id ?? '')
      setTitle(next ? defaultEquipmentTitle(next.equipmentName) : '')
      return
    }
    setTitle(defaultCustomTitle(customDescription))
  }

  const selectKind = (nextKind: TradeKind) => {
    if (nextKind === 'ransom' && !canRansom) return
    setKind(nextKind)
    applyKindDefaults(nextKind)
  }

  const selectFighter = (nextFighterId: string) => {
    const next = captives.find((captive) => captive.fighterId === nextFighterId)
    setFighterId(nextFighterId)
    if (next) {
      setTitle(defaultRansomTitle(next.fighterName))
      if (next.originalGangId && next.originalGangId !== selectedSeller) {
        setCounterpartyId(next.originalGangId)
      }
    }
  }

  const selectItem = (nextId: string) => {
    const next = items.find((item) => item.id === nextId)
    setFighterEquipmentId(nextId)
    if (next) setTitle(defaultEquipmentTitle(next.equipmentName))
  }

  const confirmDisabled = !selectedSeller || !title.trim() || (
    kind === 'ransom'
      ? !fighterId
      : kind === 'equipment'
        ? !fighterEquipmentId || loadingItems
        : !customDescription.trim()
  )

  return (
    <Modal
      title="Selling goods and services"
      helper="Offer equipment, a captive, or custom terms to a specific gang, or leave Counterparty as Open to everyone for others to bid."
      confirmText="Post listing"
      confirmDisabled={confirmDisabled}
      onClose={onClose}
      onConfirm={async () => {
        const payments = parseTradePayments(payment, paymentResources)
        if (!payments.success) {
          toast.error(payments.error)
          return false
        }

        const shared = {
          campaignId,
          proposerGangId: selectedSeller,
          title: title.trim(),
          note: note.trim() || undefined,
          creditsAmount: payments.creditsAmount,
          reputationAmount: payments.reputationAmount,
          resources: payments.resources,
        }

        if (kind === 'ransom') {
          if (!selectedCaptive?.originalGangId) {
            toast.error('That captive has no original gang.')
            return false
          }
          const payload = {
            ...shared,
            fighterId,
            originalGangId: selectedCaptive.originalGangId,
          }
          const result = isOpenListing
            ? await createListing(payload)
            : await createCaptiveRansom({ ...payload, counterpartyGangId: counterpartyId })
          if (!result.success) {
            toast.error(result.error ?? (isOpenListing ? 'Failed to post listing' : 'Failed to post ransom'))
            return false
          }
          toast.success(isOpenListing ? 'Listing posted' : 'Ransom posted')
          onPosted?.()
          return true
        }

        if (kind === 'equipment') {
          if (!selectedItem) {
            toast.error('Select an item to trade.')
            return false
          }
          const payload = { ...shared, fighterEquipmentId }
          const result = isOpenListing
            ? await createListing(payload)
            : await createEquipmentTrade({ ...payload, counterpartyGangId: counterpartyId })
          if (!result.success) {
            toast.error(result.error ?? (isOpenListing ? 'Failed to post listing' : 'Failed to post equipment trade'))
            return false
          }
          toast.success(isOpenListing ? 'Listing posted' : 'Equipment trade posted')
          onPosted?.()
          return true
        }

        const description = customDescription.trim()
        if (description.length < 1 || description.length > 40) {
          toast.error('Custom terms must be 1 to 40 characters.')
          return false
        }
        const result = await createCustomTrade({
          ...shared,
          counterpartyGangId: isOpenListing ? null : counterpartyId,
          customDescription: description,
        })
        if (!result.success) {
          toast.error(result.error ?? (isOpenListing ? 'Failed to post listing' : 'Failed to post custom trade'))
          return false
        }
        toast.success(isOpenListing ? 'Listing posted' : 'Custom trade posted')
        onPosted?.()
        return true
      }}
      content={
        <div className="space-y-4">
          {sellers.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="sell-trade-seller" className="text-xs">Your gang *</Label>
              <Combobox
                id="sell-trade-seller"
                options={sellers.map((gang) => buildGangComboboxOption({
                  id: gang.gangId,
                  name: gang.gangName,
                  gang_colour: gang.gangColour,
                }))}
                value={selectedSeller}
                onValueChange={(value) => {
                  setSelectedSeller(value)
                  if (counterpartyId === value) setCounterpartyId('')
                  const nextCaptives = holdingGangs.find((gang) => gang.gangId === value)?.captives ?? []
                  if (kind === 'ransom' && nextCaptives.length === 0) {
                    setKind('equipment')
                    applyKindDefaults('equipment')
                    return
                  }
                  applyKindDefaults(kind, nextCaptives)
                }}
                placeholder="Select gang"
                className="h-9"
              />
            </div>
          )}

          <div className="flex gap-2">
            {TRADE_KINDS.map((option) => {
              const disabled = option.id === 'ransom' && !canRansom
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

          <div className="space-y-1">
            <Label htmlFor="sell-trade-counterparty" className="text-sm">Counterparty *</Label>
            <Combobox
              id="sell-trade-counterparty"
              options={counterpartyOptions}
              value={counterpartyId}
              onValueChange={setCounterpartyId}
              placeholder="Select gang"
              className="h-9"
            />
          </div>

          {kind === 'ransom' && (
            <div className="space-y-1">
              <Label htmlFor="sell-trade-captive" className="text-sm">Captive *</Label>
              <Combobox
                id="sell-trade-captive"
                options={captives.map((captive) => buildCaptiveComboboxOption(captive))}
                value={fighterId}
                onValueChange={selectFighter}
                placeholder="Select captive"
              />
            </div>
          )}

          {kind === 'equipment' && (
            <div className="space-y-1">
              <Label htmlFor="sell-trade-item" className="text-sm">Equipment in Stash *</Label>
              <Combobox
                id="sell-trade-item"
                options={items.map((item) => ({
                  value: item.id,
                  label: item.equipmentName,
                }))}
                value={fighterEquipmentId}
                onValueChange={selectItem}
                placeholder={loadingItems ? 'Loading stash...' : 'Select item'}
              />
            </div>
          )}

          {kind === 'custom' && (
            <div className="space-y-1">
              <Label htmlFor="sell-trade-description" className="text-sm">Custom terms *</Label>
              <Input
                id="sell-trade-description"
                maxLength={40}
                value={customDescription}
                onChange={(event) => {
                  const next = event.target.value
                  setCustomDescription(next)
                  setTitle(defaultCustomTitle(next))
                }}
                placeholder="Territory or service being sold"
              />
            </div>
          )}

          <CampaignTradePaymentFields
            idPrefix="sell-trade"
            catalog={paymentResources}
            value={payment}
            onChange={setPayment}
            heading="Asking price"
          />

          <div className="space-y-1">
            <Label htmlFor="sell-trade-title" className="text-sm">Title *</Label>
            <Input
              id="sell-trade-title"
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sell-trade-note" className="text-xs">Description</Label>
            <Textarea
              id="sell-trade-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
      }
    />
  )
}
