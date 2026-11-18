'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import Modal from '@/components/ui/modal'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { formatLocalDate } from '@/utils/local-date'
import {
  acceptCampaignTrade,
  cancelCampaignTrade,
  declineCampaignTrade,
} from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignBidModal, {
  type BidActorGang,
} from '@/components/campaigns/[id]/campaign-trade-bid-modal'
import type { CampaignTradePaymentResource } from '@/components/campaigns/[id]/campaign-trade-payment-fields'
import {
  campaignTradeShape,
  campaignTradeShapeLabels,
  campaignTradeStatusColors,
  campaignTradeStatusLabels,
  type CampaignTrade,
  type CampaignTradeItem,
  type CampaignTradeShape,
  type CampaignTradeStatus,
} from '@/types/campaign-trade'

const STATUS_OPTIONS: CampaignTradeStatus[] = ['pending', 'accepted', 'declined', 'cancelled']
const SHAPE_OPTIONS: CampaignTradeShape[] = ['direct', 'listing', 'bid']
const itemsPerPage = 10

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A'
  return formatLocalDate(new Date(dateString))
}

function isPaymentKind(kind: CampaignTradeItem['kind']) {
  return kind === 'credits' || kind === 'reputation' || kind === 'campaign_resource'
}

function tradeHasGoods(trade: CampaignTrade) {
  return trade.items.some((item) => item.kind === 'captive' || item.kind === 'equipment' || item.kind === 'custom')
}

function customItem(trade: CampaignTrade) {
  return trade.items.find((item) => item.kind === 'custom')
}

function itemSummary(item: CampaignTradeItem, trade: CampaignTrade): string {
  let text: string
  switch (item.kind) {
    case 'credits':
      text = `${item.amount ?? 0} credits`
      break
    case 'reputation':
      text = `${item.amount ?? 0} reputation`
      break
    case 'campaign_resource':
      text = item.description
        ? `${item.amount ?? 0} ${item.description}`
        : `${item.amount ?? 0} resource`
      break
    case 'custom':
      text = item.description?.trim()
        ? `Custom: ${item.description.trim()}`
        : 'Custom'
      break
    default:
      text = item.description?.trim() || item.kind
  }
  const isAsking = campaignTradeShape(trade) === 'listing'
    && tradeHasGoods(trade)
    && isPaymentKind(item.kind)
  return isAsking ? `Asking: ${text}` : text
}

function paymentFingerprint(items: CampaignTradeItem[]): string {
  return items
    .filter((item) => isPaymentKind(item.kind) && (item.amount ?? 0) > 0)
    .map((item) => `${item.kind}:${item.amount}:${item.campaign_type_resource_id ?? ''}:${item.campaign_resource_id ?? ''}`)
    .sort()
    .join('|')
}

type PendingTradeAction = 'accept' | 'decline' | 'cancel'

interface CampaignTradesListProps {
  trades: CampaignTrade[]
  involvedGangId?: string
  campaignId?: string
  actorGangIds?: string[]
  actorGangs?: BidActorGang[]
  isCampaignArb?: boolean
  paymentResources?: CampaignTradePaymentResource[]
}

function equipmentItem(trade: CampaignTrade) {
  return trade.items.find((item) => item.kind === 'equipment')
}

function paymentSummary(trade: CampaignTrade): string {
  const parts: string[] = []
  for (const item of trade.items) {
    const amount = item.amount ?? 0
    if (amount <= 0) continue
    if (item.kind === 'credits') parts.push(`${amount} credits`)
    else if (item.kind === 'reputation') parts.push(`${amount} reputation`)
    else if (item.kind === 'campaign_resource') {
      parts.push(item.description ? `${amount} ${item.description}` : `${amount} resource`)
    }
  }
  return parts.join(', ')
}

function settlementSides(trade: CampaignTrade, trades: CampaignTrade[]): {
  goods: CampaignTrade
  pay: CampaignTrade
  listing: CampaignTrade | null
} {
  if (campaignTradeShape(trade) !== 'bid' || !trade.parent_trade_id) {
    return { goods: trade, pay: trade, listing: null }
  }
  const listing = trades.find((candidate) => candidate.id === trade.parent_trade_id) ?? null
  if (!listing) return { goods: trade, pay: trade, listing: null }
  if (tradeHasGoods(listing)) {
    return { goods: listing, pay: trade, listing }
  }
  return { goods: trade, pay: listing, listing }
}

function confirmCopy(action: PendingTradeAction, trade: CampaignTrade, trades: CampaignTrade[]): string {
  const title = trade.title
  const { goods, pay, listing } = settlementSides(trade, trades)
  const custom = customItem(goods)
  const equipment = equipmentItem(goods)
  const good = equipment ? 'item' : tradeHasGoods(goods) && !custom ? 'captive' : 'item'
  if (action === 'accept') {
    const sellingAskDiffers = !!listing
      && tradeHasGoods(listing)
      && paymentFingerprint(listing.items).length > 0
      && paymentFingerprint(listing.items) !== paymentFingerprint(pay.items)
    const warn = sellingAskDiffers
      ? 'This bid\'s payment differs from the asking price. '
      : ''
    const payments = paymentSummary(pay)
    if (custom) {
      const recorded = 'Custom terms are recorded only; settle them at the table.'
      const body = payments
        ? `Accept "${title}"? ${payments} will move. ${recorded}`
        : `Accept "${title}"? ${recorded}`
      return `${warn}${body}`
    }
    const captive = goods.items.some((item) => item.kind === 'captive')
    const transfer = captive
      ? 'the captive will be released or change holder'
      : `the ${good} will be transferred`
    const body = payments
      ? `Accept "${title}"? ${payments} will move and ${transfer}.`
      : `Accept "${title}"? ${transfer.charAt(0).toUpperCase()}${transfer.slice(1)}.`
    return `${warn}${body}`
  }
  if (action === 'decline') {
    return `Decline "${title}"? The ${good} will be unlocked.`
  }
  if (campaignTradeShape(trade) === 'listing') {
    return `Cancel "${title}"? Pending bids will be declined and items unlocked.`
  }
  return `Cancel "${title}"? The ${good} will be unlocked.`
}

export default function CampaignTradesList({
  trades,
  involvedGangId,
  campaignId,
  actorGangIds = [],
  actorGangs = [],
  isCampaignArb = false,
  paymentResources = [],
}: CampaignTradesListProps) {
  const router = useRouter()
  const [filterStatus, setFilterStatus] = useState('')
  const [filterGang, setFilterGang] = useState(involvedGangId ?? '')
  const [filterShape, setFilterShape] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pending, setPending] = useState<{ action: PendingTradeAction; trade: CampaignTrade } | null>(null)
  const [bidListing, setBidListing] = useState<CampaignTrade | null>(null)

  const canActFor = (gangId: string | null) => {
    if (!gangId) return false
    return isCampaignArb || actorGangIds.includes(gangId)
  }

  const gangOptions = useMemo(() => {
    const gangs = new Map<string, string>()
    for (const trade of trades) {
      gangs.set(trade.proposer_gang_id, trade.proposer_gang_name)
      if (trade.counterparty_gang_id && trade.counterparty_gang_name) {
        gangs.set(trade.counterparty_gang_id, trade.counterparty_gang_name)
      }
    }
    return [...gangs.entries()]
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [trades])

  const statusOptions = useMemo(() => {
    const present = new Set(trades.map((trade) => trade.status))
    return STATUS_OPTIONS.filter((status) => present.has(status))
  }, [trades])

  const shapeOptions = useMemo(() => {
    const present = new Set(trades.map((trade) => campaignTradeShape(trade)))
    return SHAPE_OPTIONS.filter((shape) => present.has(shape))
  }, [trades])

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (filterStatus && trade.status !== filterStatus) return false
      if (filterGang) {
        const involvesGang = trade.proposer_gang_id === filterGang
          || trade.counterparty_gang_id === filterGang
        if (!involvesGang && campaignTradeShape(trade) !== 'listing') {
          return false
        }
      }
      if (filterShape && campaignTradeShape(trade) !== filterShape) return false
      return true
    })
  }, [trades, filterStatus, filterGang, filterShape])

  const pageResetKey = JSON.stringify([filterStatus, filterGang, filterShape])
  const [lastPageResetKey, setLastPageResetKey] = useState(pageResetKey)
  if (pageResetKey !== lastPageResetKey) {
    setLastPageResetKey(pageResetKey)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage)
  const currentTrades = useMemo(() => {
    const end = currentPage * itemsPerPage
    return filteredTrades.slice(end - itemsPerPage, end)
  }, [filteredTrades, currentPage])

  const emptyText = trades.length === 0
    ? 'No trades yet.'
    : 'No trades match the selected filters.'

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="filter-trade-status" className="text-xs">Status</Label>
            <Combobox
              id="filter-trade-status"
              options={[
                { value: '', label: 'All statuses' },
                ...statusOptions.map((status) => ({
                  value: status,
                  label: campaignTradeStatusLabels[status],
                })),
              ]}
              value={filterStatus}
              onValueChange={setFilterStatus}
              placeholder="All statuses"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-trade-gang" className="text-xs">Gang</Label>
            <Combobox
              id="filter-trade-gang"
              options={[
                { value: '', label: 'All gangs' },
                ...gangOptions,
              ]}
              value={filterGang}
              onValueChange={setFilterGang}
              placeholder="All gangs"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-trade-shape" className="text-xs">Shape</Label>
            <Combobox
              id="filter-trade-shape"
              options={[
                { value: '', label: 'All shapes' },
                ...shapeOptions.map((shape) => ({
                  value: shape,
                  label: campaignTradeShapeLabels[shape],
                })),
              ]}
              value={filterShape}
              onValueChange={setFilterShape}
              placeholder="All shapes"
              className="h-9"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        {currentTrades.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground italic">{emptyText}</p>
        ) : (
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="p-1 md:p-2 text-left font-medium">Date</th>
                <th className="p-1 md:p-2 text-left font-medium">Title</th>
                <th className="p-1 md:p-2 text-left font-medium">Status</th>
                <th className="p-1 md:p-2 text-left font-medium">From</th>
                <th className="p-1 md:p-2 text-left font-medium">To</th>
                <th className="p-1 md:p-2 text-left font-medium">Items</th>
                {campaignId && (
                  <th className="p-1 md:p-2 text-left font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {currentTrades.map((trade) => {
                const shape = campaignTradeShape(trade)
                const parent = trade.parent_trade_id
                  ? trades.find((candidate) => candidate.id === trade.parent_trade_id)
                  : undefined
                const showCancel = trade.status === 'pending' && canActFor(trade.proposer_gang_id)
                const showCounterparty = trade.status === 'pending' && canActFor(trade.counterparty_gang_id)
                const showPlaceBid = trade.status === 'pending'
                  && shape === 'listing'
                  && actorGangs.some((gang) => gang.gangId !== trade.proposer_gang_id)
                return (
                <tr key={trade.id} className="border-b last:border-0">
                  <td className="p-1 md:p-2 whitespace-nowrap">{formatDate(trade.created_at)}</td>
                  <td className="p-1 md:p-2">
                    <div className="font-medium">{trade.title}</div>
                    <div className="text-muted-foreground">
                      {campaignTradeShapeLabels[shape]}
                      {parent ? ` · ${parent.title}` : ''}
                    </div>
                  </td>
                  <td className="p-1 md:p-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${campaignTradeStatusColors[trade.status]}`}>
                      {campaignTradeStatusLabels[trade.status]}
                    </span>
                  </td>
                  <td className="p-1 md:p-2">
                    <Link
                      href={`/gang/${trade.proposer_gang_id}`}
                      prefetch={false}
                      className="hover:underline"
                    >
                      {trade.proposer_gang_name}
                    </Link>
                  </td>
                  <td className="p-1 md:p-2">
                    {trade.counterparty_gang_id ? (
                      <Link
                        href={`/gang/${trade.counterparty_gang_id}`}
                        prefetch={false}
                        className="hover:underline"
                      >
                        {trade.counterparty_gang_name ?? 'Unknown'}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Open to everyone</span>
                    )}
                  </td>
                  <td className="p-1 md:p-2 text-muted-foreground">
                    {trade.items.length === 0
                      ? '—'
                      : trade.items.map((item) => itemSummary(item, trade)).join(', ')}
                  </td>
                  {campaignId && (
                    <td className="p-1 md:p-2">
                      <div className="flex flex-wrap gap-1">
                        {showCounterparty && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPending({ action: 'accept', trade })}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPending({ action: 'decline', trade })}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {showPlaceBid && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setBidListing(trade)}
                          >
                            Place bid
                          </Button>
                        )}
                        {showCancel && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPending({ action: 'cancel', trade })}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <Button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <LuChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            Next
            <LuChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {pending && campaignId && (
        <Modal
          title={
            pending.action === 'accept'
              ? 'Accept trade'
              : pending.action === 'decline'
                ? 'Decline trade'
                : 'Cancel trade'
          }
          confirmText={
            pending.action === 'accept'
              ? 'Accept'
              : pending.action === 'decline'
                ? 'Decline'
                : 'Cancel'
          }
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const tradeId = pending.trade.id
            const result = pending.action === 'accept'
              ? await acceptCampaignTrade(tradeId)
              : pending.action === 'decline'
                ? await declineCampaignTrade(tradeId)
                : await cancelCampaignTrade(tradeId)
            if (!result.success) {
              toast.error(result.error ?? 'Failed to update trade')
              return false
            }
            toast.success(
              pending.action === 'accept'
                ? 'Trade accepted'
                : pending.action === 'decline'
                  ? 'Trade declined'
                  : 'Trade cancelled'
            )
            router.refresh()
            return true
          }}
          content={
            <p>
              {confirmCopy(pending.action, pending.trade, trades)}
            </p>
          }
        />
      )}
      {bidListing && campaignId && (
        <CampaignBidModal
          campaignId={campaignId}
          listing={bidListing}
          actorGangs={actorGangs}
          paymentResources={paymentResources}
          onClose={() => setBidListing(null)}
          onProposed={() => {
            setBidListing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
