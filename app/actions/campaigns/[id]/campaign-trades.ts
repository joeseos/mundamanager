'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { isUuid } from '@/utils/uuid';
import { getGangCore, getGangStash } from '@/app/lib/shared/gang-data';
import { canViewHiddenGang, checkPermission, isArbitrator } from '@/utils/user-permissions';
import {
  invalidateCampaignCaptives,
  invalidateCampaignGang,
  invalidateCampaignResources,
  invalidateCampaignTrades,
  invalidateFighter,
  invalidateGang,
  invalidateGangFinancials,
  invalidateGangStash,
} from '@/utils/cache-tags';
import { isTradeableStashEquipment } from '@/utils/campaign-trade-stash';
import { createGangLog } from '@/app/actions/logs/gang-logs';

const TRADE_OUTCOME_MESSAGES: Record<string, string> = {
  not_authorized: 'You cannot do that.',
  not_found: 'Trade not found.',
  not_pending: 'This trade is no longer pending.',
  trading_disabled: 'Campaign trading is not enabled.',
  captive_unavailable: 'That captive is not available to trade.',
  equipment_unavailable: 'That item is not available to trade.',
  insufficient_credits: 'Insufficient credits.',
  insufficient_reputation: 'That gang does not have enough reputation.',
  insufficient_resources: 'That gang does not have enough of that campaign resource.',
  alignment_blocked: 'Law Abiding gangs cannot trade captives to Outlaw gangs.',
  bid_exists: 'You already have a pending bid on this listing.',
  invalid: 'This trade could not be completed.',
};

function mapOutcome(outcome: string | null): string | null {
  if (outcome === 'ok') return null;
  return TRADE_OUTCOME_MESSAGES[outcome ?? ''] ?? 'Something went wrong.';
}

export interface TradePaymentResourceInput {
  campaignTypeResourceId?: string;
  campaignResourceId?: string;
  amount: number;
}

export interface CreateCaptiveRansomParams {
  campaignId: string;
  proposerGangId: string;
  counterpartyGangId: string;
  fighterId: string;
  originalGangId: string;
  title: string;
  note?: string;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

export interface CreateEquipmentTradeParams {
  campaignId: string;
  proposerGangId: string;
  counterpartyGangId: string;
  fighterEquipmentId: string;
  title: string;
  note?: string;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

export interface TradeableStashItem {
  id: string;
  equipmentName: string;
}

export interface CreateListingParams {
  campaignId: string;
  proposerGangId: string;
  title: string;
  note?: string;
  fighterId?: string | null;
  originalGangId?: string | null;
  fighterEquipmentId?: string | null;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

export interface CreateCustomTradeParams {
  campaignId: string;
  proposerGangId: string;
  counterpartyGangId?: string | null;
  title: string;
  note?: string;
  customDescription: string;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

export interface CreateBidParams {
  campaignId: string;
  listingId: string;
  bidderGangId: string;
  listingAuthorGangId: string;
  title: string;
  note?: string;
  fighterId?: string | null;
  originalGangId?: string | null;
  fighterEquipmentId?: string | null;
  customDescription?: string | null;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

type TradeItemRow = {
  kind: string;
  fighter_id: string | null;
  fighter_equipment_id: string | null;
  amount: number | string | null;
  fighters: { gang_id: string | null } | { gang_id: string | null }[] | null;
};

type TradeRow = {
  id: string;
  campaign_id: string;
  proposer_gang_id: string;
  counterparty_gang_id: string | null;
  parent_trade_id: string | null;
  title: string;
  status: string;
  resolved_at: string | null;
  campaign_trade_items: TradeItemRow[] | null;
};

const TRADE_ROW_COLUMNS = `
  id,
  campaign_id,
  proposer_gang_id,
  counterparty_gang_id,
  parent_trade_id,
  title,
  status,
  resolved_at,
  campaign_trade_items (
    kind,
    fighter_id,
    fighter_equipment_id,
    amount,
    fighters ( gang_id )
  )
`;

type TradeLogActionType =
  | 'campaign_trade_proposed'
  | 'campaign_trade_bid'
  | 'campaign_trade_accepted'
  | 'campaign_trade_declined'
  | 'campaign_trade_cancelled';

type TradeFollowUpKind =
  | 'proposed_direct'
  | 'proposed_listing'
  | 'bid'
  | 'accepted'
  | 'declined'
  | 'cancelled_direct'
  | 'cancelled_listing';

type TradeGangInfo = {
  id: string;
  name: string;
  user_id: string | null;
};

function uniqueGangIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && isUuid(id)))];
}

function quotedTradeTitle(title: string | undefined): string {
  const trimmed = title?.trim() ?? '';
  return trimmed.length > 0 ? `"${trimmed}"` : 'a campaign trade';
}

function boldTradeTitle(title: string | undefined): string {
  const trimmed = title?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'a campaign trade';
}

function gangName(gangs: Map<string, TradeGangInfo>, gangId: string | null | undefined): string {
  if (!gangId) return 'another gang';
  return gangs.get(gangId)?.name ?? 'another gang';
}

async function loadTradeGangs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gangIds: Array<string | null | undefined>
): Promise<Map<string, TradeGangInfo>> {
  const ids = uniqueGangIds(gangIds);
  const gangs = new Map<string, TradeGangInfo>();
  if (ids.length === 0) return gangs;

  const { data, error } = await supabase
    .from('gangs')
    .select('id, name, user_id')
    .in('id', ids);
  if (error) {
    console.error('Error loading gangs for campaign trade follow-up:', error);
    return gangs;
  }

  for (const gang of data ?? []) {
    gangs.set(gang.id, {
      id: gang.id,
      name: gang.name ?? 'another gang',
      user_id: gang.user_id ?? null,
    });
  }
  return gangs;
}

async function notifyTradeOwners(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  campaignId: string;
  senderUserId: string;
  receiverGangIds: Array<string | null | undefined>;
  gangs: Map<string, TradeGangInfo>;
  text: string;
}): Promise<void> {
  const receiverIds = [...new Set(
    uniqueGangIds(params.receiverGangIds)
      .map((id) => params.gangs.get(id)?.user_id)
      .filter((id): id is string => !!id && id !== params.senderUserId)
  )];
  if (receiverIds.length === 0) return;

  const { error } = await params.supabase.rpc('notify_campaign_trade', {
    p_campaign_id: params.campaignId,
    p_text: params.text,
    p_receiver_ids: receiverIds,
  });
  if (error) console.error('Error sending campaign trade notification:', error);
}

async function loadAcceptedCampaignGangIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('campaign_gangs')
    .select('gang_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'ACCEPTED');
  if (error) {
    console.error('Error loading campaign gangs for trade notify:', error);
    return [];
  }
  return uniqueGangIds((data ?? []).map((row) => row.gang_id));
}

async function logTradeGangs(params: {
  gangIds: Array<string | null | undefined>;
  counterpartGangIds: Array<string | null | undefined>;
  gangs: Map<string, TradeGangInfo>;
  actionType: TradeLogActionType;
  verb: string;
  titleQuoted: string;
  userId: string;
}): Promise<void> {
  const gangIds = uniqueGangIds(params.gangIds);
  const counterparts = uniqueGangIds(params.counterpartGangIds);
  await Promise.all(gangIds.map(async (gangId) => {
    const otherId = counterparts.find((id) => id !== gangId);
    const description = otherId
      ? `${params.verb} ${params.titleQuoted} with ${gangName(params.gangs, otherId)}`
      : `${params.verb} ${params.titleQuoted}`;
    const result = await createGangLog({
      gang_id: gangId,
      action_type: params.actionType,
      description,
      user_id: params.userId,
    });
    if (!result.success) {
      console.error('Error creating campaign trade gang log:', result.error);
    }
  }));
}

async function followUpCampaignTrade(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  campaignId: string;
  title: string;
  kind: TradeFollowUpKind;
  proposerGangId: string;
  counterpartyGangId?: string | null;
  relatedGangIds?: string[];
  actorGangId: string;
}): Promise<void> {
  try {
    const relatedGangIds = params.relatedGangIds ?? [];
    const listingGangIds = params.kind === 'proposed_listing'
      ? await loadAcceptedCampaignGangIds(params.supabase, params.campaignId)
      : [];
    const gangs = await loadTradeGangs(params.supabase, [
      params.proposerGangId,
      params.counterpartyGangId,
      params.actorGangId,
      ...relatedGangIds,
      ...listingGangIds,
    ]);
    const titleQuoted = quotedTradeTitle(params.title);
    const titleBold = boldTradeTitle(params.title);
    const actorName = gangName(gangs, params.actorGangId);
    const proposerName = gangName(gangs, params.proposerGangId);
    const notifyBase = {
      supabase: params.supabase,
      campaignId: params.campaignId,
      senderUserId: params.userId,
      gangs,
    };

    switch (params.kind) {
      case 'proposed_direct':
        await logTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          actionType: 'campaign_trade_proposed',
          verb: 'Proposed',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${proposerName}** proposed **${titleBold}** to **${gangName(gangs, params.counterpartyGangId)}**.`,
        });
        break;
      case 'proposed_listing':
        await logTradeGangs({
          gangIds: [params.proposerGangId],
          counterpartGangIds: [],
          gangs,
          actionType: 'campaign_trade_proposed',
          verb: 'Posted listing',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: listingGangIds.filter((id) => id !== params.proposerGangId),
          text: `**${proposerName}** posted listing **${titleBold}**.`,
        });
        break;
      case 'bid':
        await logTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          actionType: 'campaign_trade_bid',
          verb: 'Bid on',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${proposerName}** bid on **${titleBold}**.`,
        });
        break;
      case 'accepted':
        await logTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          actionType: 'campaign_trade_accepted',
          verb: 'Accepted',
          titleQuoted,
          userId: params.userId,
        });
        if (relatedGangIds.length > 0) {
          await logTradeGangs({
            gangIds: relatedGangIds,
            counterpartGangIds: [params.counterpartyGangId ?? params.proposerGangId],
            gangs,
            actionType: 'campaign_trade_declined',
            verb: 'Bid declined on',
            titleQuoted,
            userId: params.userId,
          });
        }
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.proposerGangId],
          text: `**${actorName}** accepted **${titleBold}**.`,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: relatedGangIds,
          text: `Your bid on **${titleBold}** was declined because another bid was accepted.`,
        });
        break;
      case 'declined':
        await logTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          actionType: 'campaign_trade_declined',
          verb: 'Declined',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.proposerGangId],
          text: `**${actorName}** declined **${titleBold}**.`,
        });
        break;
      case 'cancelled_direct':
        await logTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          actionType: 'campaign_trade_cancelled',
          verb: 'Cancelled',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${actorName}** cancelled **${titleBold}**.`,
        });
        break;
      case 'cancelled_listing':
        await logTradeGangs({
          gangIds: [params.proposerGangId, ...relatedGangIds],
          counterpartGangIds: [params.proposerGangId],
          gangs,
          actionType: 'campaign_trade_cancelled',
          verb: 'Cancelled listing',
          titleQuoted,
          userId: params.userId,
        });
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: relatedGangIds,
          text: `**${actorName}** cancelled the listing **${titleBold}**.`,
        });
        break;
    }
  } catch (error) {
    console.error('Error following up campaign trade:', error);
  }
}

function normalizeTradePayments(
  creditsAmount: number,
  reputationAmount: number | undefined,
  resources: TradePaymentResourceInput[] | undefined
):
  | { error: string }
  | {
      creditsAmount: number;
      reputationAmount: number | null;
      resources: Array<{
        campaign_type_resource_id: string | null;
        campaign_resource_id: string | null;
        amount: number;
      }>;
    } {
  if (typeof creditsAmount !== 'number' || !Number.isFinite(creditsAmount) || creditsAmount < 0) {
    return { error: TRADE_OUTCOME_MESSAGES.invalid };
  }

  let normalizedReputation: number | null = null;
  if (reputationAmount !== undefined) {
    if (typeof reputationAmount !== 'number' || !Number.isFinite(reputationAmount) || reputationAmount < 0) {
      return { error: TRADE_OUTCOME_MESSAGES.invalid };
    }
    if (reputationAmount > 0) normalizedReputation = reputationAmount;
  }

  const normalizedResources: Array<{
    campaign_type_resource_id: string | null;
    campaign_resource_id: string | null;
    amount: number;
  }> = [];
  const seen = new Set<string>();
  for (const resource of resources ?? []) {
    if (typeof resource.amount !== 'number' || !Number.isFinite(resource.amount) || resource.amount < 0) {
      return { error: TRADE_OUTCOME_MESSAGES.invalid };
    }
    if (resource.amount === 0) continue;
    const hasType = typeof resource.campaignTypeResourceId === 'string' && isUuid(resource.campaignTypeResourceId);
    const hasCustom = typeof resource.campaignResourceId === 'string' && isUuid(resource.campaignResourceId);
    if (hasType === hasCustom) return { error: TRADE_OUTCOME_MESSAGES.invalid };
    const key = hasType ? resource.campaignTypeResourceId! : resource.campaignResourceId!;
    if (seen.has(key)) return { error: TRADE_OUTCOME_MESSAGES.invalid };
    seen.add(key);
    normalizedResources.push({
      campaign_type_resource_id: hasType ? resource.campaignTypeResourceId! : null,
      campaign_resource_id: hasCustom ? resource.campaignResourceId! : null,
      amount: resource.amount,
    });
  }

  return {
    creditsAmount,
    reputationAmount: normalizedReputation,
    resources: normalizedResources,
  };
}

function invalidateTradeCaches(params: {
  campaignId: string;
  proposerGangId: string;
  counterpartyGangId?: string | null;
  fighterId?: string | null;
  originalGangId?: string | null;
  creditsMoved?: boolean;
  stashMoved?: boolean;
  reputationMoved?: boolean;
  resourcesMoved?: boolean;
  accepted?: boolean;
  relatedGangIds?: string[];
}) {
  const gangIds = new Set<string>([params.proposerGangId]);
  if (params.counterpartyGangId) gangIds.add(params.counterpartyGangId);
  for (const gangId of params.relatedGangIds ?? []) {
    if (gangId) gangIds.add(gangId);
  }

  invalidateCampaignTrades(params.campaignId);
  for (const gangId of gangIds) {
    invalidateGang(gangId);
    if (params.creditsMoved || params.stashMoved || params.reputationMoved) {
      invalidateGangFinancials(gangId);
    }
    if (params.stashMoved) {
      invalidateGangStash(gangId);
    }
    if (params.resourcesMoved) {
      invalidateCampaignGang(params.campaignId, gangId);
    }
  }
  if (params.resourcesMoved) {
    invalidateCampaignResources(params.campaignId);
  }
  if (params.accepted) {
    invalidateCampaignCaptives(params.campaignId);
  }
  if (params.fighterId && params.originalGangId) {
    invalidateFighter(params.fighterId, params.originalGangId);
  }
}

function optionalUuid(value: string | null | undefined): boolean {
  return value == null || value === '' || isUuid(value);
}

function normalizeCustomDescription(value: string | null | undefined):
  | { error: string }
  | { customDescription: string | null } {
  if (value == null || value === '') {
    return { customDescription: null };
  }
  if (typeof value !== 'string') {
    return { error: TRADE_OUTCOME_MESSAGES.invalid };
  }
  const customDescription = value.trim();
  if (customDescription.length === 0) {
    return { customDescription: null };
  }
  if (customDescription.length > 40) {
    return { error: TRADE_OUTCOME_MESSAGES.invalid };
  }
  return { customDescription };
}

export async function createCaptiveRansom(params: CreateCaptiveRansomParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const {
      campaignId,
      proposerGangId,
      counterpartyGangId,
      fighterId,
      originalGangId,
      title,
      note,
      creditsAmount,
      reputationAmount,
      resources,
    } = params;

    const payments = normalizeTradePayments(creditsAmount, reputationAmount, resources);
    if ('error' in payments) {
      return { success: false, error: payments.error };
    }

    if (
      !isUuid(campaignId)
      || !isUuid(proposerGangId)
      || !isUuid(counterpartyGangId)
      || !isUuid(fighterId)
      || !isUuid(originalGangId)
      || typeof title !== 'string'
    ) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('create_campaign_trade_captive_ransom', {
      p_campaign_id: campaignId,
      p_proposer_gang_id: proposerGangId,
      p_counterparty_gang_id: counterpartyGangId,
      p_title: title,
      p_note: note ?? null,
      p_fighter_id: fighterId,
      p_credits_amount: payments.creditsAmount,
      p_reputation_amount: payments.reputationAmount,
      p_resources: payments.resources,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId,
      proposerGangId,
      counterpartyGangId,
      fighterId,
      originalGangId,
    });

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: 'proposed_direct',
      proposerGangId,
      counterpartyGangId,
      actorGangId: proposerGangId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating captive ransom:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose ransom',
    };
  }
}

export async function createEquipmentTrade(params: CreateEquipmentTradeParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const {
      campaignId,
      proposerGangId,
      counterpartyGangId,
      fighterEquipmentId,
      title,
      note,
      creditsAmount,
      reputationAmount,
      resources,
    } = params;

    const payments = normalizeTradePayments(creditsAmount, reputationAmount, resources);
    if ('error' in payments) {
      return { success: false, error: payments.error };
    }

    if (
      !isUuid(campaignId)
      || !isUuid(proposerGangId)
      || !isUuid(counterpartyGangId)
      || !isUuid(fighterEquipmentId)
      || typeof title !== 'string'
    ) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('create_campaign_trade_equipment', {
      p_campaign_id: campaignId,
      p_proposer_gang_id: proposerGangId,
      p_counterparty_gang_id: counterpartyGangId,
      p_title: title,
      p_note: note ?? null,
      p_fighter_equipment_id: fighterEquipmentId,
      p_credits_amount: payments.creditsAmount,
      p_reputation_amount: payments.reputationAmount,
      p_resources: payments.resources,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId,
      proposerGangId,
      counterpartyGangId,
      stashMoved: true,
    });

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: 'proposed_direct',
      proposerGangId,
      counterpartyGangId,
      actorGangId: proposerGangId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating equipment trade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose equipment trade',
    };
  }
}

export async function createListing(params: CreateListingParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const {
      campaignId,
      proposerGangId,
      title,
      note,
      fighterId,
      originalGangId,
      fighterEquipmentId,
      creditsAmount,
      reputationAmount,
      resources,
    } = params;

    const payments = normalizeTradePayments(creditsAmount, reputationAmount, resources);
    if ('error' in payments) {
      return { success: false, error: payments.error };
    }

    const hasCaptive = typeof fighterId === 'string' && isUuid(fighterId);
    const hasEquipment = typeof fighterEquipmentId === 'string' && isUuid(fighterEquipmentId);
    if (hasCaptive && hasEquipment) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    if (
      !isUuid(campaignId)
      || !isUuid(proposerGangId)
      || typeof title !== 'string'
      || (fighterId != null && fighterId !== '' && !isUuid(fighterId))
      || (fighterEquipmentId != null && fighterEquipmentId !== '' && !isUuid(fighterEquipmentId))
      || (hasCaptive && (!originalGangId || !isUuid(originalGangId)))
    ) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('create_campaign_trade_listing', {
      p_campaign_id: campaignId,
      p_proposer_gang_id: proposerGangId,
      p_title: title,
      p_note: note ?? null,
      p_fighter_id: hasCaptive ? fighterId : null,
      p_fighter_equipment_id: hasEquipment ? fighterEquipmentId : null,
      p_credits_amount: payments.creditsAmount,
      p_reputation_amount: payments.reputationAmount,
      p_resources: payments.resources,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId,
      proposerGangId,
      fighterId: hasCaptive ? fighterId : null,
      originalGangId: hasCaptive ? originalGangId : null,
      stashMoved: hasEquipment,
    });

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: 'proposed_listing',
      proposerGangId,
      actorGangId: proposerGangId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating campaign listing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post listing',
    };
  }
}

export async function createCustomTrade(params: CreateCustomTradeParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const {
      campaignId,
      proposerGangId,
      counterpartyGangId,
      title,
      note,
      customDescription,
      creditsAmount,
      reputationAmount,
      resources,
    } = params;

    const payments = normalizeTradePayments(creditsAmount, reputationAmount, resources);
    if ('error' in payments) {
      return { success: false, error: payments.error };
    }

    const custom = normalizeCustomDescription(customDescription);
    if ('error' in custom || !custom.customDescription) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    if (
      !isUuid(campaignId)
      || !isUuid(proposerGangId)
      || typeof title !== 'string'
      || !optionalUuid(counterpartyGangId)
    ) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const counterparty = counterpartyGangId && isUuid(counterpartyGangId) ? counterpartyGangId : null;
    if (counterparty && counterparty === proposerGangId) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('create_campaign_trade_custom', {
      p_campaign_id: campaignId,
      p_proposer_gang_id: proposerGangId,
      p_counterparty_gang_id: counterparty,
      p_title: title,
      p_note: note ?? null,
      p_custom_description: custom.customDescription,
      p_credits_amount: payments.creditsAmount,
      p_reputation_amount: payments.reputationAmount,
      p_resources: payments.resources,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId,
      proposerGangId,
      counterpartyGangId: counterparty,
    });

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: counterparty ? 'proposed_direct' : 'proposed_listing',
      proposerGangId,
      counterpartyGangId: counterparty,
      actorGangId: proposerGangId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating custom trade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose custom trade',
    };
  }
}

export async function createBid(params: CreateBidParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const {
      campaignId,
      listingId,
      bidderGangId,
      listingAuthorGangId,
      title,
      note,
      fighterId,
      originalGangId,
      fighterEquipmentId,
      creditsAmount,
      reputationAmount,
      resources,
    } = params;

    const payments = normalizeTradePayments(creditsAmount, reputationAmount, resources);
    if ('error' in payments) {
      return { success: false, error: payments.error };
    }

    const custom = normalizeCustomDescription(params.customDescription);
    if ('error' in custom) {
      return { success: false, error: custom.error };
    }

    const hasCaptive = typeof fighterId === 'string' && isUuid(fighterId);
    const hasEquipment = typeof fighterEquipmentId === 'string' && isUuid(fighterEquipmentId);
    const hasCustom = custom.customDescription != null;
    if ([hasCaptive, hasEquipment, hasCustom].filter(Boolean).length > 1) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    if (
      !isUuid(campaignId)
      || !isUuid(listingId)
      || !isUuid(bidderGangId)
      || !isUuid(listingAuthorGangId)
      || typeof title !== 'string'
      || (fighterId != null && fighterId !== '' && !isUuid(fighterId))
      || (fighterEquipmentId != null && fighterEquipmentId !== '' && !isUuid(fighterEquipmentId))
      || (hasCaptive && (!originalGangId || !isUuid(originalGangId)))
    ) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('create_campaign_trade_bid', {
      p_listing_id: listingId,
      p_bidder_gang_id: bidderGangId,
      p_title: title,
      p_note: note ?? null,
      p_fighter_id: hasCaptive ? fighterId : null,
      p_fighter_equipment_id: hasEquipment ? fighterEquipmentId : null,
      p_custom_description: custom.customDescription,
      p_credits_amount: payments.creditsAmount,
      p_reputation_amount: payments.reputationAmount,
      p_resources: payments.resources,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId,
      proposerGangId: bidderGangId,
      counterpartyGangId: listingAuthorGangId,
      fighterId: hasCaptive ? fighterId : null,
      originalGangId: hasCaptive ? originalGangId : null,
      stashMoved: hasEquipment,
    });

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: 'bid',
      proposerGangId: bidderGangId,
      counterpartyGangId: listingAuthorGangId,
      actorGangId: bidderGangId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating campaign bid:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place bid',
    };
  }
}

export async function listStashForEquipmentTrade(gangId: string): Promise<{
  success: boolean;
  items: TradeableStashItem[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!isUuid(gangId)) {
      return { success: false, items: [], error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const gang = await getGangCore(gangId);
    if (!gang) {
      return { success: false, items: [], error: TRADE_OUTCOME_MESSAGES.not_authorized };
    }
    if (!(await canViewHiddenGang(user.id, gangId, gang.user_id, gang.hidden))) {
      return { success: false, items: [], error: TRADE_OUTCOME_MESSAGES.not_authorized };
    }
    const canAct = gang.user_id === user.id
      || isArbitrator(await checkPermission(user.id, { gangId }));
    if (!canAct) {
      return { success: false, items: [], error: TRADE_OUTCOME_MESSAGES.not_authorized };
    }

    const stash = await getGangStash(gangId);
    const tradeable = stash.filter(isTradeableStashEquipment);
    if (tradeable.length === 0) {
      return { success: true, items: [] };
    }

    const { data: lockedRows, error: lockedError } = await supabase
      .from('campaign_trade_items')
      .select('fighter_equipment_id')
      .in('fighter_equipment_id', tradeable.map((item) => item.id))
      .eq('locked', true);
    if (lockedError) throw lockedError;

    const lockedIds = new Set(
      (lockedRows ?? [])
        .map((row) => row.fighter_equipment_id)
        .filter((id): id is string => typeof id === 'string')
    );

    return {
      success: true,
      items: tradeable
        .filter((item) => !lockedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          equipmentName: item.equipment_name,
        })),
    };
  } catch (error) {
    console.error('Error listing stash for equipment trade:', error);
    return {
      success: false,
      items: [],
      error: error instanceof Error ? error.message : 'Failed to load stash',
    };
  }
}

function tradeItems(trade: TradeRow): TradeItemRow[] {
  return trade.campaign_trade_items ?? [];
}

function tradeHasGoods(items: TradeItemRow[]): boolean {
  return items.some((item) => item.kind === 'captive' || item.kind === 'equipment' || item.kind === 'custom');
}

function amountMoved(items: TradeItemRow[], kind: string): boolean {
  return items.some((item) => item.kind === kind && Number(item.amount) > 0);
}

function captiveHomeGangId(items: TradeItemRow[]): string | null {
  const captive = items.find((item) => item.kind === 'captive' && item.fighter_id);
  const fighter = captive?.fighters;
  if (!fighter) return null;
  const row = Array.isArray(fighter) ? fighter[0] : fighter;
  return row?.gang_id ?? null;
}

async function loadTradeRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tradeId: string
): Promise<TradeRow | null> {
  const { data, error } = await supabase
    .from('campaign_trades')
    .select(TRADE_ROW_COLUMNS)
    .eq('id', tradeId)
    .maybeSingle();
  if (error || !data) {
    console.error('Error loading campaign trade after resolve:', error);
    return null;
  }
  return data as TradeRow;
}

/** Bids the resolve just declined share the listing's transaction timestamp. */
async function declinedBidderGangIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  resolvedAt: string | null
): Promise<string[]> {
  if (!resolvedAt) return [];
  const { data, error } = await supabase
    .from('campaign_trades')
    .select('proposer_gang_id')
    .eq('parent_trade_id', listingId)
    .eq('status', 'declined')
    .eq('resolved_at', resolvedAt);
  if (error) {
    console.error('Error loading declined campaign bids:', error);
    return [];
  }
  return uniqueGangIds((data ?? []).map((row) => row.proposer_gang_id));
}

async function followResolvedTrade(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tradeId: string;
  action: 'accept' | 'decline' | 'cancel';
}): Promise<void> {
  const trade = await loadTradeRow(params.supabase, params.tradeId);
  if (!trade) return;

  const parent = trade.parent_trade_id
    ? await loadTradeRow(params.supabase, trade.parent_trade_id)
    : null;
  const listingId = trade.parent_trade_id ?? (!trade.counterparty_gang_id ? trade.id : null);
  const notifyDeclinedBids = params.action === 'accept'
    ? trade.parent_trade_id != null
    : params.action === 'cancel' && !trade.counterparty_gang_id;
  const relatedGangIds = notifyDeclinedBids && listingId
    ? await declinedBidderGangIds(params.supabase, listingId, trade.resolved_at)
    : [];

  const ownItems = tradeItems(trade);
  const parentItems = parent ? tradeItems(parent) : null;
  const parentMissing = trade.parent_trade_id != null && !parent;
  const goodsItems = parentItems
    ? (tradeHasGoods(parentItems) ? parentItems : ownItems)
    : ownItems;
  const payItems = parentItems
    ? (tradeHasGoods(parentItems) ? ownItems : parentItems)
    : ownItems;
  const captive = goodsItems.find((item) => item.kind === 'captive');
  const accepted = params.action === 'accept';

  invalidateTradeCaches({
    campaignId: trade.campaign_id,
    proposerGangId: trade.proposer_gang_id,
    counterpartyGangId: trade.counterparty_gang_id,
    fighterId: accepted ? captive?.fighter_id : null,
    originalGangId: accepted ? captiveHomeGangId(goodsItems) : null,
    creditsMoved: accepted && (parentMissing || amountMoved(payItems, 'credits')),
    stashMoved: accepted && (parentMissing || goodsItems.some((item) => item.kind === 'equipment')),
    reputationMoved: accepted && (parentMissing || amountMoved(payItems, 'reputation')),
    resourcesMoved: accepted && (parentMissing || amountMoved(payItems, 'campaign_resource')),
    accepted,
    relatedGangIds,
  });

  await followUpCampaignTrade({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: trade.campaign_id,
    title: trade.title,
    kind: params.action === 'accept'
      ? 'accepted'
      : params.action === 'decline'
        ? 'declined'
        : trade.counterparty_gang_id
          ? 'cancelled_direct'
          : 'cancelled_listing',
    proposerGangId: trade.proposer_gang_id,
    counterpartyGangId: trade.counterparty_gang_id,
    relatedGangIds,
    actorGangId: params.action === 'cancel'
      ? trade.proposer_gang_id
      : (trade.counterparty_gang_id ?? trade.proposer_gang_id),
  });
}

export async function declineCampaignTrade(tradeId: string) {
  return resolveTrade(tradeId, 'decline');
}

export async function cancelCampaignTrade(tradeId: string) {
  return resolveTrade(tradeId, 'cancel');
}

async function resolveTrade(tradeId: string, action: 'decline' | 'cancel') {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!isUuid(tradeId)) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('resolve_campaign_trade', {
      p_trade_id: tradeId,
      p_action: action,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    await followResolvedTrade({ supabase, userId: user.id, tradeId, action });
    return { success: true };
  } catch (error) {
    console.error(`Error ${action}ing campaign trade:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : `Failed to ${action} trade`,
    };
  }
}

export async function acceptCampaignTrade(tradeId: string) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!isUuid(tradeId)) {
      return { success: false, error: TRADE_OUTCOME_MESSAGES.invalid };
    }

    const { data: outcome, error } = await supabase.rpc('accept_campaign_trade', {
      p_trade_id: tradeId,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    await followResolvedTrade({ supabase, userId: user.id, tradeId, action: 'accept' });
    return { success: true };
  } catch (error) {
    console.error('Error accepting campaign trade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept trade',
    };
  }
}
