'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import CampaignTradeModal from '@/components/campaigns/[id]/campaign-trade-modal'
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

const STATUS_OPTIONS: CampaignTradeStatus[] = ['open', 'fulfilled', 'declined', 'cancelled']
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

type PendingTradeAction = 'accept' | 'decline' | 'cancel'

function confirmCopy(action: PendingTradeAction, title: string): string {
  const verb = action === 'accept' ? 'Accept' : action === 'decline' ? 'Decline' : 'Cancel'
  return `${verb} "${title}"?`
}

interface CampaignTradesListProps {
  initialTrades?: CampaignTrade[]
  involvedGangId?: string
  campaignId: string
  actorGangIds?: string[]
  isCampaignArb?: boolean
  allowTrading?: boolean
  userId?: string
}

export default function CampaignTradesList({
  initialTrades,
  involvedGangId,
  campaignId,
  actorGangIds = [],
  isCampaignArb = false,
  allowTrading = false,
  userId,
}: CampaignTradesListProps) {
  const queryClient = useQueryClient()
  const { data: trades = [] } = useQuery({
    queryKey: ['campaign-trades', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/trades`)
      if (!response.ok) throw new Error('Failed to fetch trades')
      return response.json() as Promise<CampaignTrade[]>
    },
    initialData: initialTrades,
  })
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
                <th className="p-1 md:p-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentTrades.map((trade) => {
                const shape = campaignTradeShape(trade)
                const parent = trade.parent_trade_id
                  ? trades.find((candidate) => candidate.id === trade.parent_trade_id)
                  : undefined
                const showCancel = trade.status === 'open' && canActFor(trade.proposer_gang_id)
                const showCounterparty = trade.status === 'open' && canActFor(trade.counterparty_gang_id)
                const showPlaceBid = allowTrading
                  && trade.status === 'open'
                  && shape === 'listing'
                  && actorGangIds.some((gangId) => gangId !== trade.proposer_gang_id)
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

      {pending && (
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
            await queryClient.invalidateQueries({ queryKey: ['campaign-trades', campaignId] })
            await queryClient.invalidateQueries({ queryKey: ['gang-captives'] })
            await queryClient.invalidateQueries({ queryKey: ['gang-tradeable-stash'] })
            return true
          }}
          content={
            <p>
              {confirmCopy(pending.action, pending.trade.title)}
            </p>
          }
        />
      )}
      {bidListing && (
        <CampaignTradeModal
          campaignId={campaignId}
          mode="bid"
          userId={userId}
          isCampaignArb={isCampaignArb}
          actorGangId={involvedGangId}
          listing={bidListing}
          onClose={() => setBidListing(null)}
          onPosted={() => setBidListing(null)}
        />
      )}
    </>
  )
}
