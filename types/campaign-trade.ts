export type CampaignTradeStatus = 'open' | 'fulfilled' | 'declined' | 'cancelled';

export type CampaignTradeItemKind =
  | 'captive'
  | 'equipment'
  | 'credits'
  | 'reputation'
  | 'campaign_resource'
  | 'custom';

export type CampaignTradeShape = 'direct' | 'listing' | 'bid';

export type CampaignTradeKind = 'selling' | 'looking-for' | 'direct' | 'bid';

export interface CampaignTradeItem {
  id: string;
  kind: CampaignTradeItemKind;
  amount: number | null;
  campaign_type_resource_id: string | null;
  campaign_resource_id: string | null;
  description: string | null;
}

export interface CampaignTrade {
  id: string;
  campaign_id: string;
  proposer_gang_id: string;
  proposer_gang_name: string;
  counterparty_gang_id: string | null;
  counterparty_gang_name: string | null;
  parent_trade_id: string | null;
  title: string;
  note: string | null;
  status: CampaignTradeStatus;
  created_at: string;
  updated_at: string | null;
  items: CampaignTradeItem[];
}

export const campaignTradeStatusLabels: Record<CampaignTradeStatus, string> = {
  open: 'Open',
  fulfilled: 'Fulfilled',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const campaignTradeStatusColors: Record<CampaignTradeStatus, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  fulfilled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-muted text-muted-foreground',
};

export const campaignTradeKindLabels: Record<CampaignTradeKind, string> = {
  selling: 'Selling',
  'looking-for': 'Looking for',
  direct: 'Selling: direct',
  bid: 'Offer',
};

export function isPaymentKind(kind: CampaignTradeItemKind): boolean {
  return kind === 'credits' || kind === 'reputation' || kind === 'campaign_resource';
}

export function campaignTradeShape(
  trade: Pick<CampaignTrade, 'parent_trade_id' | 'counterparty_gang_id'>
): CampaignTradeShape {
  if (trade.parent_trade_id) return 'bid';
  if (!trade.counterparty_gang_id) return 'listing';
  return 'direct';
}

export function campaignTradeKind(trade: CampaignTrade): CampaignTradeKind {
  const shape = campaignTradeShape(trade);
  if (shape === 'bid') return 'bid';
  if (shape === 'direct') return 'direct';
  const hasGoods = trade.items.some((item) => !isPaymentKind(item.kind));
  return hasGoods ? 'selling' : 'looking-for';
}
