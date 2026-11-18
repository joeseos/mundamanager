'use client'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TradePaymentResourceInput } from '@/app/actions/campaigns/[id]/campaign-trades'
import type { CampaignTradeItem } from '@/types/campaign-trade'
import { LuPlus, LuTrash2 } from 'react-icons/lu'

export interface CampaignTradePaymentResource {
  id: string
  name: string
  isCustom: boolean
}

export interface CampaignTradePaymentRow {
  key: string
  resourceId: string
  amount: string
}

export interface CampaignTradePaymentValue {
  credits: string
  reputation: string
  resources: CampaignTradePaymentRow[]
}

export function emptyTradePaymentValue(): CampaignTradePaymentValue {
  return { credits: '0', reputation: '0', resources: [] }
}

let paymentRowKey = 0
function nextPaymentRowKey() {
  paymentRowKey += 1
  return `pay-${paymentRowKey}`
}

export function paymentValueFromItems(items: CampaignTradeItem[]): CampaignTradePaymentValue {
  const credits = items.find((item) => item.kind === 'credits')
  const reputation = items.find((item) => item.kind === 'reputation')
  const resources = items.filter((item) => item.kind === 'campaign_resource' && (item.amount ?? 0) > 0)
  return {
    credits: String(credits?.amount ?? 0),
    reputation: String(reputation?.amount ?? 0),
    resources: resources.map((item) => ({
      key: nextPaymentRowKey(),
      resourceId: item.campaign_type_resource_id ?? item.campaign_resource_id ?? '',
      amount: String(item.amount ?? 0),
    })),
  }
}

export function parseTradePayments(
  value: CampaignTradePaymentValue,
  catalog: CampaignTradePaymentResource[]
):
  | { success: false; error: string }
  | {
      success: true
      creditsAmount: number
      reputationAmount?: number
      resources: TradePaymentResourceInput[]
    } {
  const creditsAmount = Number(value.credits)
  if (!Number.isInteger(creditsAmount) || creditsAmount < 0) {
    return { success: false, error: 'Credits must be a whole number of 0 or more.' }
  }

  const reputationAmount = Number(value.reputation)
  if (!Number.isInteger(reputationAmount) || reputationAmount < 0) {
    return { success: false, error: 'Reputation must be a whole number of 0 or more.' }
  }

  const resources: TradePaymentResourceInput[] = []
  const seen = new Set<string>()
  for (const row of value.resources) {
    if (!row.resourceId) {
      return { success: false, error: 'Select a campaign resource.' }
    }
    const amount = Number(row.amount)
    if (!Number.isInteger(amount) || amount < 0) {
      return { success: false, error: 'Resource amounts must be a whole number of 0 or more.' }
    }
    if (amount === 0) continue
    if (seen.has(row.resourceId)) {
      return { success: false, error: 'Each campaign resource can only be listed once.' }
    }
    seen.add(row.resourceId)
    const catalogItem = catalog.find((item) => item.id === row.resourceId)
    if (!catalogItem) {
      return { success: false, error: 'Unknown campaign resource.' }
    }
    resources.push(
      catalogItem.isCustom
        ? { campaignResourceId: catalogItem.id, amount }
        : { campaignTypeResourceId: catalogItem.id, amount }
    )
  }

  return {
    success: true,
    creditsAmount,
    reputationAmount: reputationAmount > 0 ? reputationAmount : undefined,
    resources,
  }
}

interface CampaignTradePaymentFieldsProps {
  idPrefix: string
  catalog: CampaignTradePaymentResource[]
  value: CampaignTradePaymentValue
  onChange: (value: CampaignTradePaymentValue) => void
  heading?: string
}

export default function CampaignTradePaymentFields({
  idPrefix,
  catalog,
  value,
  onChange,
  heading,
}: CampaignTradePaymentFieldsProps) {
  const selectedIds = new Set(value.resources.map((row) => row.resourceId).filter(Boolean))

  return (
    <div className={`space-y-4${heading ? ' pt-2' : ''}`}>
      <div className="space-y-1">
        {heading && (
          <p className="text-sm font-medium">{heading}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-credits`} className="text-xs">Credits</Label>
            <Input
              id={`${idPrefix}-credits`}
              type="number"
              min={0}
              step={1}
              value={value.credits}
              onChange={(event) => onChange({ ...value, credits: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-reputation`} className="text-xs">Reputation</Label>
            <Input
              id={`${idPrefix}-reputation`}
              type="number"
              min={0}
              step={1}
              value={value.reputation}
              onChange={(event) => onChange({ ...value, reputation: event.target.value })}
            />
          </div>
        </div>
      </div>

      {catalog.length > 0 && (
        <div className="space-y-1">
          <Label className="block text-xs">Campaign resources</Label>
          {value.resources.map((row) => (
            <div key={row.key} className="flex gap-2 items-stretch">
              <div className="min-w-0 flex-1">
                <Combobox
                  id={`${idPrefix}-resource-${row.key}`}
                  options={catalog
                    .filter((item) => item.id === row.resourceId || !selectedIds.has(item.id))
                    .map((item) => ({ value: item.id, label: item.name }))}
                  value={row.resourceId}
                  onValueChange={(resourceId) => onChange({
                    ...value,
                    resources: value.resources.map((current) =>
                      current.key === row.key ? { ...current, resourceId } : current
                    ),
                  })}
                  placeholder="Select resource"
                />
              </div>
              <Input
                id={`${idPrefix}-resource-amount-${row.key}`}
                type="number"
                min={0}
                step={1}
                value={row.amount}
                onChange={(event) => onChange({
                  ...value,
                  resources: value.resources.map((current) =>
                    current.key === row.key ? { ...current, amount: event.target.value } : current
                  ),
                })}
                className="h-10 w-24"
              />
              <Button
                type="button"
                variant="outline_remove"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => onChange({
                  ...value,
                  resources: value.resources.filter((current) => current.key !== row.key),
                })}
                aria-label="Remove resource"
              >
                <LuTrash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {value.resources.length < catalog.length && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({
                ...value,
                resources: [
                  ...value.resources,
                  { key: nextPaymentRowKey(), resourceId: '', amount: '1' },
                ],
              })}
            >
              <LuPlus className="h-4 w-4 mr-1" />
              Add resource
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
