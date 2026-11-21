'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import Modal from '@/components/ui/modal'
import { LuBan, LuCheck, LuChevronLeft, LuChevronRight, LuX } from 'react-icons/lu'
import { TbLayoutBottombarCollapse, TbLayoutNavbarCollapse, TbMoneybagPlus } from 'react-icons/tb'
import { BiSolidNotepad } from 'react-icons/bi'
import { Tooltip } from 'react-tooltip'
import { renderDescriptionTooltip } from '@/components/ui/tooltip-renderers'
import { formatLocalDate } from '@/utils/local-date'
import {
  acceptCampaignTrade,
  cancelCampaignTrade,
  declineCampaignTrade,
} from '@/app/actions/campaigns/[id]/campaign-trades'
import CampaignTradeModal from '@/components/campaigns/[id]/campaign-trade-modal'
import {
  campaignTradeKind,
  campaignTradeKindLabels,
  campaignTradeShape,
  campaignTradeStatusColors,
  campaignTradeStatusLabels,
  isPaymentKind,
  type CampaignTrade,
  type CampaignTradeItem,
  type CampaignTradeKind,
  type CampaignTradeStatus,
} from '@/types/campaign-trade'

const STATUS_OPTIONS: CampaignTradeStatus[] = ['open', 'fulfilled', 'declined', 'cancelled']
const KIND_OPTIONS: CampaignTradeKind[] = ['selling', 'looking-for', 'direct', 'bid']
const groupsPerPage = 10

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A'
  return formatLocalDate(new Date(dateString))
}

function itemSummary(item: CampaignTradeItem): string {
  switch (item.kind) {
    case 'credits':
      return `${item.amount ?? 0} credits`
    case 'reputation':
      return `${item.amount ?? 0} reputation`
    case 'campaign_resource':
      return item.description
        ? `${item.amount ?? 0} ${item.description}`
        : `${item.amount ?? 0} resource`
    case 'custom':
      return item.description?.trim()
        ? `Custom: ${item.description.trim()}`
        : 'Custom'
    default:
      return item.description?.trim() || item.kind
  }
}

function summarizeItems(items: CampaignTradeItem[]): string {
  if (items.length === 0) return '—'
  return items.map(itemSummary).join(', ')
}

function groupTradeBlocks(trades: CampaignTrade[]): CampaignTrade[][] {
  const filteredIds = new Set(trades.map((trade) => trade.id))
  const childrenByParent = new Map<string, CampaignTrade[]>()
  for (const trade of trades) {
    if (!trade.parent_trade_id || !filteredIds.has(trade.parent_trade_id)) continue
    const children = childrenByParent.get(trade.parent_trade_id) ?? []
    children.push(trade)
    childrenByParent.set(trade.parent_trade_id, children)
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const blocks: CampaignTrade[][] = []
  for (const trade of trades) {
    if (trade.parent_trade_id && filteredIds.has(trade.parent_trade_id)) continue
    const children = childrenByParent.get(trade.id)
    blocks.push(children ? [trade, ...children] : [trade])
  }
  return blocks
}

type PendingTradeAction = 'accept' | 'decline' | 'cancel'

function confirmCopy(action: PendingTradeAction, trade: CampaignTrade): string {
  if (action === 'cancel') {
    const kind = campaignTradeShape(trade) === 'bid' ? 'offer' : 'listing'
    return `Are you sure you want to cancel the ${kind} for ${trade.title}?`
  }
  const verb = action === 'accept' ? 'Accept' : 'Decline'
  return `${verb} "${trade.title}"?`
}

function cancelTitle(trade: CampaignTrade): string {
  return campaignTradeShape(trade) === 'bid' ? 'Cancel offer' : 'Cancel listing'
}

const nestedOfferStatusTextColors: Record<CampaignTradeStatus, string> = {
  open: 'text-green-700/70 dark:text-green-400/60',
  fulfilled: 'text-blue-700/70 dark:text-blue-400/60',
  declined: 'text-red-700/70 dark:text-red-400/60',
  cancelled: 'text-muted-foreground/70',
}

function NestedOfferStatus({
  isLast,
  status,
}: {
  isLast: boolean
  status: CampaignTradeStatus
}) {
  return (
    <td className="relative p-1 md:p-2">
      <span
        aria-hidden
        className={
          isLast
            ? 'pointer-events-none absolute left-2 top-0 h-[1.15rem] w-px bg-border'
            : 'pointer-events-none absolute left-2 top-0 bottom-0 w-px bg-border'
        }
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-2 top-[1.1rem] h-px w-2.5 bg-border"
      />
      <div className="pl-4">
        <div className="text-[10px] md:text-xs font-normal text-muted-foreground">
          {campaignTradeKindLabels.bid}
        </div>
        <div className={`text-[10px] md:text-xs font-normal ${nestedOfferStatusTextColors[status]}`}>
          {campaignTradeStatusLabels[status]}
        </div>
      </div>
    </td>
  )
}

function GangNameLink({ gangId, name }: { gangId: string; name: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted">
      <Link
        href={`/gang/${gangId}`}
        prefetch={false}
        className="hover:text-muted-foreground transition-colors"
      >
        {name}
      </Link>
    </span>
  )
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
  const [filterKind, setFilterKind] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pending, setPending] = useState<{ action: PendingTradeAction; trade: CampaignTrade } | null>(null)
  const [bidListing, setBidListing] = useState<CampaignTrade | null>(null)
  const [expandedOfferParents, setExpandedOfferParents] = useState<Set<string>>(new Set())

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

  const kindOptions = useMemo(() => {
    const present = new Set(trades.map((trade) => campaignTradeKind(trade)))
    return KIND_OPTIONS.filter((kind) => present.has(kind))
  }, [trades])

  const filteredBlocks = useMemo(() => {
    const matched = trades.filter((trade) => {
      if (filterStatus && trade.status !== filterStatus) return false
      if (filterGang) {
        const involvesGang = trade.proposer_gang_id === filterGang
          || trade.counterparty_gang_id === filterGang
        if (!involvesGang && campaignTradeShape(trade) !== 'listing') {
          return false
        }
      }
      if (filterKind && campaignTradeKind(trade) !== filterKind) return false
      return true
    })
    return groupTradeBlocks(matched)
  }, [trades, filterStatus, filterGang, filterKind])

  const pageResetKey = JSON.stringify([filterStatus, filterGang, filterKind])
  const [lastPageResetKey, setLastPageResetKey] = useState(pageResetKey)
  if (pageResetKey !== lastPageResetKey) {
    setLastPageResetKey(pageResetKey)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredBlocks.length / groupsPerPage)
  const pageBlocks = useMemo(() => {
    const start = (currentPage - 1) * groupsPerPage
    return filteredBlocks.slice(start, start + groupsPerPage)
  }, [filteredBlocks, currentPage])
  const hiddenOfferCountByParent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const block of pageBlocks) {
      const parent = block[0]
      if (!parent || parent.status !== 'fulfilled') continue
      const hidden = block.slice(1).filter((child) => child.status !== 'fulfilled').length
      if (hidden > 0) counts.set(parent.id, hidden)
    }
    return counts
  }, [pageBlocks])
  const currentTrades = useMemo(() => {
    return pageBlocks.flatMap((block) => {
      const parent = block[0]
      if (!parent || parent.status !== 'fulfilled' || expandedOfferParents.has(parent.id)) {
        return block
      }
      return [parent, ...block.slice(1).filter((child) => child.status === 'fulfilled')]
    })
  }, [pageBlocks, expandedOfferParents])

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
            <Label htmlFor="filter-trade-kind" className="text-xs">Trade type</Label>
            <Combobox
              id="filter-trade-kind"
              options={[
                { value: '', label: 'All trade types' },
                ...kindOptions.map((kind) => ({
                  value: kind,
                  label: campaignTradeKindLabels[kind],
                })),
              ]}
              value={filterKind}
              onValueChange={setFilterKind}
              placeholder="All trade types"
              className="h-9"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        {currentTrades.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground italic">{emptyText}</p>
        ) : (
          <table className="w-full text-xs md:text-sm [&_td]:align-top">
            <thead>
              <tr className="bg-muted border-b">
                <th className="p-1 md:p-2 text-left font-medium">Status</th>
                <th className="p-1 md:p-2 text-left font-medium">Title</th>
                <th className="p-1 md:p-2 text-left font-medium">Goods & services</th>
                <th className="p-1 md:p-2 text-left font-medium">Price</th>
                <th className="p-1 md:p-2 text-left font-medium">
                  <span className="md:hidden">Desc.</span>
                  <span className="hidden md:inline">Description</span>
                </th>
                <th className="p-1 md:p-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentTrades.map((trade, index) => {
                const shape = campaignTradeShape(trade)
                const kind = campaignTradeKind(trade)
                const parent = trade.parent_trade_id
                  ? trades.find((candidate) => candidate.id === trade.parent_trade_id)
                  : undefined
                const parentOnPage = !!trade.parent_trade_id
                  && currentTrades.some((candidate) => candidate.id === trade.parent_trade_id)
                const isNestedOffer = shape === 'bid' && parentOnPage
                const nextTrade = currentTrades[index + 1]
                const isLastNestedOffer = isNestedOffer
                  && nextTrade?.parent_trade_id !== trade.parent_trade_id
                const showCancel = trade.status === 'open' && canActFor(trade.proposer_gang_id)
                const showCounterparty = trade.status === 'open' && canActFor(trade.counterparty_gang_id)
                const showPlaceBid = allowTrading
                  && trade.status === 'open'
                  && (
                    (shape === 'listing'
                      && actorGangIds.some((gangId) => gangId !== trade.proposer_gang_id))
                    || (shape === 'direct'
                      && !!trade.counterparty_gang_id
                      && actorGangIds.includes(trade.counterparty_gang_id))
                  )
                const priceItems = trade.items.filter((item) => isPaymentKind(item.kind))
                const goodsItems = trade.items.filter((item) => !isPaymentKind(item.kind))
                const hiddenOfferCount = hiddenOfferCountByParent.get(trade.id) ?? 0
                const otherOffersExpanded = expandedOfferParents.has(trade.id)
                return (
                <tr
                  key={trade.id}
                  className={`border-b last:border-0${isNestedOffer ? ' bg-muted/40' : ''}`}
                >
                  {isNestedOffer ? (
                    <NestedOfferStatus
                      isLast={isLastNestedOffer}
                      status={trade.status}
                    />
                  ) : (
                  <td className="p-1 md:p-2">
                    <div className="font-normal text-muted-foreground">
                      {campaignTradeKindLabels[kind]}
                    </div>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium mt-0.5 ${campaignTradeStatusColors[trade.status]}`}>
                      {campaignTradeStatusLabels[trade.status]}
                    </span>
                  </td>
                  )}
                  <td className={`p-1 md:p-2${isNestedOffer ? ' pl-4 md:pl-6' : ''}`}>
                    {!isNestedOffer && (
                      <div className={shape === 'bid' ? 'text-xs font-normal' : 'font-medium'}>
                        {shape === 'bid' ? (parent?.title ?? trade.title) : trade.title}
                      </div>
                    )}
                    <div className={`flex items-center gap-1.5${!isNestedOffer ? ' mt-0.5' : ''}`}>
                      <GangNameLink
                        gangId={trade.proposer_gang_id}
                        name={trade.proposer_gang_name}
                      />
                      <span className="text-[10px] md:text-xs text-muted-foreground whitespace-nowrap">
                        on {formatDate(trade.created_at)}
                      </span>
                    </div>
                  </td>
                  <td className="p-1 md:p-2">
                    {shape !== 'bid' && trade.counterparty_gang_id && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">For:</span>
                        <GangNameLink
                          gangId={trade.counterparty_gang_id}
                          name={trade.counterparty_gang_name ?? 'Unknown'}
                        />
                      </div>
                    )}
                    <div className={`text-muted-foreground${shape === 'bid' ? ' text-[10px] md:text-xs' : ''}${shape !== 'bid' && trade.counterparty_gang_id ? ' mt-0.5' : ''}`}>
                      {summarizeItems(goodsItems)}
                    </div>
                  </td>
                  <td className={`p-1 md:p-2 text-muted-foreground${shape === 'bid' ? ' text-[10px] md:text-xs' : ''}`}>
                    {priceItems.length === 0
                      ? '—'
                      : priceItems.map((item) => (
                          <div key={item.id}>{itemSummary(item)}</div>
                        ))}
                  </td>
                  <td className="p-1 md:p-2">
                    {trade.note?.trim() && (
                      <span
                        className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
                        data-tooltip-id="trade-description-tooltip"
                        data-tooltip-title={trade.title}
                        data-tooltip-description={trade.note}
                      >
                        <BiSolidNotepad className="text-lg" aria-label="View trade description" />
                      </span>
                    )}
                  </td>
                    <td className="p-1 md:p-2 text-right">
                      <div className="flex justify-end gap-1">
                        {showCounterparty && (
                          <>
                            <Button
                              size="sm"
                              variant="outline_accept"
                              className="h-8 w-8 p-0"
                              aria-label="Accept"
                              title="Accept"
                              onClick={() => setPending({ action: 'accept', trade })}
                            >
                              <LuCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline_remove"
                              className="h-8 w-8 p-0"
                              aria-label="Decline"
                              title="Decline"
                              onClick={() => setPending({ action: 'decline', trade })}
                            >
                              <LuX className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {showPlaceBid && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            aria-label="Make an offer"
                            title="Make an offer"
                            onClick={() => setBidListing(trade)}
                          >
                              <TbMoneybagPlus className="h-4 w-4" />
                          </Button>
                        )}
                        {showCancel && (
                          <Button
                            size="sm"
                            variant="outline_cancel"
                            className="h-8 w-8 p-0"
                            aria-label="Cancel"
                            title="Cancel"
                            onClick={() => setPending({ action: 'cancel', trade })}
                          >
                            <LuBan className="h-4 w-4" />
                          </Button>
                        )}
                        {hiddenOfferCount > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            aria-label={otherOffersExpanded ? 'Hide other offers' : 'Show other offers'}
                            title={otherOffersExpanded ? 'Hide other offers' : 'Show other offers'}
                            onClick={() => {
                              setExpandedOfferParents((current) => {
                                const next = new Set(current)
                                if (next.has(trade.id)) next.delete(trade.id)
                                else next.add(trade.id)
                                return next
                              })
                            }}
                          >
                            {otherOffersExpanded ? (
                              <TbLayoutNavbarCollapse className="h-5 w-5" />
                            ) : (
                              <TbLayoutBottombarCollapse className="h-5 w-5" />
                            )}
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
                : cancelTitle(pending.trade)
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
              {confirmCopy(pending.action, pending.trade)}
            </p>
          }
        />
      )}
      <Tooltip
        id="trade-description-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        render={renderDescriptionTooltip}
        style={{
          padding: '6px',
          width: '24rem',
          maxWidth: '90vw',
          maxHeight: '60vh'
        }}
      />
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
