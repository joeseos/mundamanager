export type CampaignTradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type CampaignTradeItemKind =
  | 'captive'
  | 'equipment'
  | 'credits'
  | 'reputation'
  | 'campaign_resource'
  | 'custom';

export type CampaignTradeShape = 'direct' | 'listing' | 'bid';

export interface CampaignTradeItem {
  id: string;
  trade_id: string;
  giving_gang_id: string;
  kind: CampaignTradeItemKind;
  fighter_id: string | null;
  /** Captive's home gang (`fighters.gang_id`). Reader-only; not a table column. */
  original_gang_id: string | null;
  fighter_equipment_id: string | null;
  amount: number | null;
  campaign_type_resource_id: string | null;
  campaign_resource_id: string | null;
  description: string | null;
  locked: boolean;
  created_at: string;
  updated_at: string | null;
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
  resolved_at: string | null;
  items: CampaignTradeItem[];
}

export const campaignTradeStatusLabels: Record<CampaignTradeStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const campaignTradeStatusColors: Record<CampaignTradeStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-muted text-muted-foreground',
};

export const campaignTradeShapeLabels: Record<CampaignTradeShape, string> = {
  direct: 'Direct',
  listing: 'Listing',
  bid: 'Bid',
};

export function campaignTradeShape(
  trade: Pick<CampaignTrade, 'parent_trade_id' | 'counterparty_gang_id'>
): CampaignTradeShape {
  if (trade.parent_trade_id) return 'bid';
  if (!trade.counterparty_gang_id) return 'listing';
  return 'direct';
}
