'use server';

import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { isUuid } from '@/utils/uuid';
import { getGangCore, getGangStash } from '@/app/lib/shared/gang-data';
import { checkPermission, isArbitrator } from '@/utils/user-permissions';
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
  not_open: 'This trade is no longer open.',
  trading_disabled: 'Campaign trading is not enabled.',
  captive_unavailable: 'That captive is not available to trade.',
  equipment_unavailable: 'That item is not available to trade.',
  insufficient_credits: 'Insufficient credits.',
  insufficient_reputation: 'That gang does not have enough reputation.',
  insufficient_resources: 'That gang does not have enough of that campaign resource.',
  alignment_blocked: 'Law Abiding gangs cannot trade captives to Outlaw gangs.',
  bid_exists: 'You already have an open bid on this listing.',
  invalid: 'This trade could not be completed.',
};

function mapOutcome(outcome: string | null): string | null {
  if (outcome === 'ok') return null;
  return TRADE_OUTCOME_MESSAGES[outcome ?? ''] ?? 'Something went wrong.';
}

function fail(code: keyof typeof TRADE_OUTCOME_MESSAGES): { success: false; error: string } {
  return { success: false, error: TRADE_OUTCOME_MESSAGES[code] };
}

export interface TradePaymentResourceInput {
  campaignTypeResourceId?: string;
  campaignResourceId?: string;
  amount: number;
}

export type CampaignTradeGoodsKind = 'custom' | 'equipment' | 'captive';

export interface CreateCampaignTradeParams {
  campaignId: string;
  proposerGangId: string;
  counterpartyGangId?: string | null;
  parentTradeId?: string | null;
  title: string;
  note?: string;
  goodsKind?: CampaignTradeGoodsKind | null;
  fighterId?: string | null;
  fighterEquipmentId?: string | null;
  customDescription?: string | null;
  creditsAmount: number;
  reputationAmount?: number;
  resources?: TradePaymentResourceInput[];
}

type UserClient = Awaited<ReturnType<typeof createClient>>;
type WriterClient = ReturnType<typeof createServiceRoleClient>;

type TradeItemInsert = {
  trade_id: string;
  giving_gang_id: string;
  kind: string;
  fighter_id?: string | null;
  fighter_equipment_id?: string | null;
  amount?: number | null;
  campaign_type_resource_id?: string | null;
  campaign_resource_id?: string | null;
  description?: string | null;
  locked: boolean;
};

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

function uniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

async function loadTradeGangs(
  supabase: UserClient,
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
  supabase: UserClient;
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

  const text = params.text.trim().slice(0, 500);
  if (!text) return;

  const { error } = await params.supabase.from('notifications').insert(
    receiverIds.map((receiverId) => ({
      receiver_id: receiverId,
      sender_id: params.senderUserId,
      type: 'campaign_trade',
      text,
      link: `/campaigns/${params.campaignId}`,
      dismissed: false,
    }))
  );
  if (error) console.error('Error sending campaign trade notification:', error);
}

async function loadAcceptedCampaignGangIds(
  supabase: UserClient,
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

async function logAcceptedTradeGangs(params: {
  gangIds: Array<string | null | undefined>;
  counterpartGangIds: Array<string | null | undefined>;
  gangs: Map<string, TradeGangInfo>;
  titleQuoted: string;
  userId: string;
}): Promise<void> {
  const gangIds = uniqueGangIds(params.gangIds);
  const counterparts = uniqueGangIds(params.counterpartGangIds);
  await Promise.all(gangIds.map(async (gangId) => {
    const otherId = counterparts.find((id) => id !== gangId);
    const description = otherId
      ? `Accepted ${params.titleQuoted} with ${gangName(params.gangs, otherId)}`
      : `Accepted ${params.titleQuoted}`;
    const result = await createGangLog({
      gang_id: gangId,
      action_type: 'campaign_trade_accepted',
      description,
      user_id: params.userId,
    });
    if (!result.success) {
      console.error('Error creating campaign trade gang log:', result.error);
    }
  }));
}

async function followUpCampaignTrade(params: {
  supabase: UserClient;
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
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${proposerName}** proposed **${titleBold}** to **${gangName(gangs, params.counterpartyGangId)}**.`,
        });
        break;
      case 'proposed_listing':
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: listingGangIds.filter((id) => id !== params.proposerGangId),
          text: `**${proposerName}** posted listing **${titleBold}**.`,
        });
        break;
      case 'bid':
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${proposerName}** bid on **${titleBold}**.`,
        });
        break;
      case 'accepted':
        await logAcceptedTradeGangs({
          gangIds: [params.proposerGangId, params.counterpartyGangId],
          counterpartGangIds: [params.proposerGangId, params.counterpartyGangId],
          gangs,
          titleQuoted,
          userId: params.userId,
        });
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
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.proposerGangId],
          text: `**${actorName}** declined **${titleBold}**.`,
        });
        break;
      case 'cancelled_direct':
        await notifyTradeOwners({
          ...notifyBase,
          receiverGangIds: [params.counterpartyGangId],
          text: `**${actorName}** cancelled **${titleBold}**.`,
        });
        break;
      case 'cancelled_listing':
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
  if (typeof creditsAmount !== 'number' || !Number.isInteger(creditsAmount) || creditsAmount < 0) {
    return { error: TRADE_OUTCOME_MESSAGES.invalid };
  }

  let normalizedReputation: number | null = null;
  if (reputationAmount !== undefined) {
    if (typeof reputationAmount !== 'number' || !Number.isInteger(reputationAmount) || reputationAmount < 0) {
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
    if (typeof resource.amount !== 'number' || !Number.isInteger(resource.amount) || resource.amount < 0) {
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
  relatedGangIds?: string[];
  accepted?: boolean;
}) {
  const gangIds = uniqueGangIds([
    params.proposerGangId,
    params.counterpartyGangId,
    ...(params.relatedGangIds ?? []),
  ]);

  invalidateCampaignTrades(params.campaignId);
  for (const gangId of gangIds) {
    invalidateGang(gangId);
    if (params.accepted) {
      invalidateGangFinancials(gangId);
      invalidateGangStash(gangId);
      invalidateCampaignGang(params.campaignId, gangId);
    }
  }
  if (params.accepted) {
    invalidateCampaignResources(params.campaignId);
    invalidateCampaignCaptives(params.campaignId);
  }
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

async function canActForGang(userId: string, gangId: string): Promise<boolean> {
  const gang = await getGangCore(gangId);
  if (!gang) return false;
  if (gang.user_id === userId) return true;
  return isArbitrator(await checkPermission(userId, { gangId }));
}

async function isAcceptedCampaignGang(
  supabase: UserClient,
  campaignId: string,
  gangId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('campaign_gangs')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('gang_id', gangId)
    .eq('status', 'ACCEPTED')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function tradingEnabled(supabase: UserClient, campaignId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('allow_trading')
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw error;
  return data?.allow_trading === true;
}

async function resourceDescription(
  supabase: UserClient,
  campaignId: string,
  typeId: string | null,
  customId: string | null
): Promise<string | null> {
  if (typeId) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('campaign_type_id')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.campaign_type_id) return null;
    const { data: resource, error: resourceError } = await supabase
      .from('campaign_type_resources')
      .select('resource_name')
      .eq('id', typeId)
      .eq('campaign_type_id', data.campaign_type_id)
      .maybeSingle();
    if (resourceError) throw resourceError;
    const name = resource?.resource_name?.trim();
    return name && name.length > 0 ? name : null;
  }
  if (customId) {
    const { data, error } = await supabase
      .from('campaign_resources')
      .select('resource_name')
      .eq('id', customId)
      .eq('campaign_id', campaignId)
      .maybeSingle();
    if (error) throw error;
    const name = data?.resource_name?.trim();
    return name && name.length > 0 ? name : null;
  }
  return null;
}

async function lockedItemExists(
  supabase: UserClient,
  column: 'fighter_id' | 'fighter_equipment_id',
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('campaign_trade_items')
    .select('id')
    .eq(column, id)
    .eq('locked', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function loadCaptiveGoods(
  supabase: UserClient,
  fighterId: string,
  givingGangId: string
): Promise<{ error: string } | { fighterId: string; description: string }> {
  const { data, error } = await supabase
    .from('fighters')
    .select('id, fighter_name, captured, captured_by_gang_id')
    .eq('id', fighterId)
    .maybeSingle();
  if (error) throw error;
  const name = data?.fighter_name?.trim() ?? '';
  if (
    !data
    || data.captured !== true
    || data.captured_by_gang_id !== givingGangId
    || name.length < 1
  ) {
    return { error: TRADE_OUTCOME_MESSAGES.captive_unavailable };
  }
  if (await lockedItemExists(supabase, 'fighter_id', fighterId)) {
    return { error: TRADE_OUTCOME_MESSAGES.captive_unavailable };
  }
  return { fighterId, description: name };
}

async function loadEquipmentGoods(
  fighterEquipmentId: string,
  givingGangId: string
): Promise<{ error: string } | { fighterEquipmentId: string; description: string }> {
  const stash = await getGangStash(givingGangId);
  const item = stash.find((row) => row.id === fighterEquipmentId);
  if (!item || !isTradeableStashEquipment(item) || item.equipment_name.trim().length < 1) {
    return { error: TRADE_OUTCOME_MESSAGES.equipment_unavailable };
  }
  return { fighterEquipmentId, description: item.equipment_name.trim() };
}

async function insertTradeWithItems(
  writer: WriterClient,
  trade: {
    campaign_id: string;
    proposer_gang_id: string;
    counterparty_gang_id: string | null;
    parent_trade_id: string | null;
    title: string;
    note: string | null;
  },
  items: Omit<TradeItemInsert, 'trade_id'>[],
  uniqueCode: keyof typeof TRADE_OUTCOME_MESSAGES
): Promise<{ error: string } | { tradeId: string }> {
  const { data, error } = await writer
    .from('campaign_trades')
    .insert({ ...trade, status: 'open' })
    .select('id')
    .single();
  if (error) {
    if (uniqueViolation(error)) return { error: TRADE_OUTCOME_MESSAGES[uniqueCode] };
    throw error;
  }
  const tradeId = data.id as string;
  const { error: itemsError } = await writer
    .from('campaign_trade_items')
    .insert(items.map((item) => ({ ...item, trade_id: tradeId })));
  if (itemsError) {
    await writer.from('campaign_trades').delete().eq('id', tradeId);
    if (uniqueViolation(itemsError)) return { error: TRADE_OUTCOME_MESSAGES[uniqueCode] };
    throw itemsError;
  }
  return { tradeId };
}

export async function createCampaignTrade(params: CreateCampaignTradeParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const writer = createServiceRoleClient();

    const campaignId = params.campaignId;
    const proposerGangId = params.proposerGangId;
    const parentTradeId = params.parentTradeId || null;
    const counterpartyGangId = params.counterpartyGangId || null;
    const fighterId = params.fighterId || null;
    const fighterEquipmentId = params.fighterEquipmentId || null;
    const title = typeof params.title === 'string' ? params.title.trim() : '';
    const note = typeof params.note === 'string' && params.note.trim() ? params.note.trim() : null;

    if (!isUuid(campaignId) || !isUuid(proposerGangId) || title.length < 1 || title.length > 100) {
      return fail('invalid');
    }
    if (parentTradeId && !isUuid(parentTradeId)) return fail('invalid');
    if (counterpartyGangId && !isUuid(counterpartyGangId)) return fail('invalid');
    if (fighterId && !isUuid(fighterId)) return fail('invalid');
    if (fighterEquipmentId && !isUuid(fighterEquipmentId)) return fail('invalid');
    if (counterpartyGangId && counterpartyGangId === proposerGangId) return fail('invalid');

    if (!(await canActForGang(user.id, proposerGangId))) return fail('not_authorized');
    if (!(await tradingEnabled(supabase, campaignId))) return fail('trading_disabled');
    if (!(await isAcceptedCampaignGang(supabase, campaignId, proposerGangId))) return fail('invalid');

    const payments = normalizeTradePayments(params.creditsAmount, params.reputationAmount, params.resources);
    if ('error' in payments) return { success: false, error: payments.error };

    const custom = normalizeCustomDescription(params.customDescription);
    if ('error' in custom) return { success: false, error: custom.error };

    const goodsKind = params.goodsKind ?? null;
    const goodsCount = [fighterId, fighterEquipmentId, custom.customDescription].filter(Boolean).length;
    if (goodsKind === 'captive' && (!fighterId || goodsCount !== 1)) return fail('invalid');
    if (goodsKind === 'equipment' && (!fighterEquipmentId || goodsCount !== 1)) return fail('invalid');
    if (goodsKind === 'custom' && (!custom.customDescription || goodsCount !== 1)) return fail('invalid');
    if (!goodsKind && goodsCount !== 0) return fail('invalid');

    let listingHasGoods = false;
    let resolvedCounterparty = counterpartyGangId;
    let resolvedParent = parentTradeId;
    let followKind: TradeFollowUpKind;

    if (parentTradeId) {
      const { data: listing, error: listingError } = await supabase
        .from('campaign_trades')
        .select('id, campaign_id, proposer_gang_id, counterparty_gang_id, parent_trade_id, status')
        .eq('id', parentTradeId)
        .maybeSingle();
      if (listingError) throw listingError;
      if (!listing) return fail('not_found');
      if (listing.campaign_id !== campaignId) return fail('invalid');
      if (listing.status !== 'open') return fail('not_open');
      if (listing.counterparty_gang_id || listing.parent_trade_id) return fail('invalid');
      if (listing.proposer_gang_id === proposerGangId) return fail('invalid');

      const { data: listingItems, error: listingItemsError } = await supabase
        .from('campaign_trade_items')
        .select('kind')
        .eq('trade_id', listing.id);
      if (listingItemsError) throw listingItemsError;
      listingHasGoods = (listingItems ?? []).some((item) => (
        item.kind === 'captive' || item.kind === 'equipment' || item.kind === 'custom'
      ));

      if (listingHasGoods) {
        if (goodsKind) return fail('invalid');
      } else if (!goodsKind) {
        return fail('invalid');
      }

      resolvedCounterparty = listing.proposer_gang_id;
      resolvedParent = listing.id;
      followKind = 'bid';
    } else if (counterpartyGangId) {
      if (!goodsKind) return fail('invalid');
      if (!(await isAcceptedCampaignGang(supabase, campaignId, counterpartyGangId))) return fail('invalid');
      followKind = 'proposed_direct';
    } else {
      followKind = 'proposed_listing';
    }

    if (resolvedCounterparty && !(await isAcceptedCampaignGang(supabase, campaignId, resolvedCounterparty))) {
      return fail('invalid');
    }

    const goodsRows: Omit<TradeItemInsert, 'trade_id'>[] = [];
    if (goodsKind === 'captive' && fighterId) {
      const captive = await loadCaptiveGoods(supabase, fighterId, proposerGangId);
      if ('error' in captive) return { success: false, error: captive.error };
      goodsRows.push({
        giving_gang_id: proposerGangId,
        kind: 'captive',
        fighter_id: captive.fighterId,
        description: captive.description,
        locked: true,
      });
    } else if (goodsKind === 'equipment' && fighterEquipmentId) {
      if (await lockedItemExists(supabase, 'fighter_equipment_id', fighterEquipmentId)) {
        return fail('equipment_unavailable');
      }
      const equipment = await loadEquipmentGoods(fighterEquipmentId, proposerGangId);
      if ('error' in equipment) return { success: false, error: equipment.error };
      goodsRows.push({
        giving_gang_id: proposerGangId,
        kind: 'equipment',
        fighter_equipment_id: equipment.fighterEquipmentId,
        description: equipment.description,
        locked: true,
      });
    } else if (goodsKind === 'custom' && custom.customDescription) {
      goodsRows.push({
        giving_gang_id: proposerGangId,
        kind: 'custom',
        description: custom.customDescription,
        locked: true,
      });
    }

    const payGiver = followKind === 'proposed_direct' ? resolvedCounterparty : proposerGangId;
    if (!payGiver) return fail('invalid');

    const paymentRows: Omit<TradeItemInsert, 'trade_id'>[] = [{
      giving_gang_id: payGiver,
      kind: 'credits',
      amount: payments.creditsAmount,
      locked: true,
    }];
    if (payments.reputationAmount != null) {
      paymentRows.push({
        giving_gang_id: payGiver,
        kind: 'reputation',
        amount: payments.reputationAmount,
        locked: true,
      });
    }
    for (const resource of payments.resources) {
      const description = await resourceDescription(
        supabase,
        campaignId,
        resource.campaign_type_resource_id,
        resource.campaign_resource_id
      );
      if (!description) return fail('invalid');
      paymentRows.push({
        giving_gang_id: payGiver,
        kind: 'campaign_resource',
        amount: resource.amount,
        campaign_type_resource_id: resource.campaign_type_resource_id,
        campaign_resource_id: resource.campaign_resource_id,
        description,
        locked: true,
      });
    }

    const inserted = await insertTradeWithItems(
      writer,
      {
        campaign_id: campaignId,
        proposer_gang_id: proposerGangId,
        counterparty_gang_id: resolvedCounterparty,
        parent_trade_id: resolvedParent,
        title,
        note,
      },
      [...goodsRows, ...paymentRows],
      followKind === 'bid'
        ? 'bid_exists'
        : goodsKind === 'captive'
          ? 'captive_unavailable'
          : goodsKind === 'equipment'
            ? 'equipment_unavailable'
            : 'invalid'
    );
    if ('error' in inserted) return { success: false, error: inserted.error };

    invalidateTradeCaches({
      campaignId,
      proposerGangId,
      counterpartyGangId: resolvedCounterparty,
    });
    if (goodsKind === 'equipment') {
      invalidateGangStash(proposerGangId);
    }

    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId,
      title,
      kind: followKind,
      proposerGangId,
      counterpartyGangId: resolvedCounterparty,
      actorGangId: proposerGangId,
    });

    return { success: true, tradeId: inserted.tradeId };
  } catch (error) {
    console.error('Error creating campaign trade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create trade',
    };
  }
}

async function unlockTradeItems(writer: WriterClient, tradeIds: string[]) {
  if (tradeIds.length === 0) return;
  const { error } = await writer
    .from('campaign_trade_items')
    .update({ locked: false, updated_at: new Date().toISOString() })
    .in('trade_id', tradeIds)
    .eq('locked', true);
  if (error) throw error;
}

type TradeCaptiveItem = {
  fighter_id: string | null;
  fighters: { gang_id: string | null } | { gang_id: string | null }[] | null;
};

function captiveHomeFromItems(
  items: TradeCaptiveItem[] | null | undefined
): { fighterId: string; homeGangId: string } | null {
  for (const item of items ?? []) {
    if (!item.fighter_id) continue;
    const fighter = item.fighters;
    const row = Array.isArray(fighter) ? fighter[0] : fighter;
    if (row?.gang_id) return { fighterId: item.fighter_id, homeGangId: row.gang_id };
  }
  return null;
}

async function loadCaptiveHome(
  supabase: UserClient,
  trade: { parent_trade_id: string | null; campaign_trade_items?: TradeCaptiveItem[] | null }
): Promise<{ fighterId: string; homeGangId: string } | null> {
  const own = captiveHomeFromItems(trade.campaign_trade_items);
  if (own) return own;
  if (!trade.parent_trade_id) return null;

  const { data, error } = await supabase
    .from('campaign_trade_items')
    .select('fighter_id, fighters ( gang_id )')
    .eq('trade_id', trade.parent_trade_id)
    .not('fighter_id', 'is', null);
  if (error) {
    console.error('Error loading captive home gang for campaign trade:', error);
    return null;
  }
  return captiveHomeFromItems(data as TradeCaptiveItem[]);
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
    const writer = createServiceRoleClient();

    if (!isUuid(tradeId)) return fail('invalid');

    const { data: trade, error } = await supabase
      .from('campaign_trades')
      .select('id, campaign_id, proposer_gang_id, counterparty_gang_id, parent_trade_id, title, status')
      .eq('id', tradeId)
      .maybeSingle();
    if (error) throw error;
    if (!trade) return fail('not_found');
    if (trade.status !== 'open') return fail('not_open');

    const isListing = !trade.parent_trade_id && !trade.counterparty_gang_id;
    if (action === 'decline' && isListing) return fail('invalid');

    const actorGangId = action === 'cancel' ? trade.proposer_gang_id : trade.counterparty_gang_id;
    if (!actorGangId) return fail('invalid');
    if (!(await canActForGang(user.id, actorGangId))) return fail('not_authorized');

    const resolvedAt = new Date().toISOString();
    const nextStatus = action === 'cancel' ? 'cancelled' : 'declined';
    const relatedIds: string[] = [];
    const relatedGangIds: string[] = [];

    if (action === 'cancel' && isListing) {
      const { data: bids, error: bidsError } = await writer
        .from('campaign_trades')
        .select('id, proposer_gang_id')
        .eq('parent_trade_id', tradeId)
        .eq('status', 'open');
      if (bidsError) throw bidsError;
      relatedIds.push(...(bids ?? []).map((bid) => bid.id));
      relatedGangIds.push(...uniqueGangIds((bids ?? []).map((bid) => bid.proposer_gang_id)));
    }

    const { data: updated, error: updateError } = await writer
      .from('campaign_trades')
      .update({ status: nextStatus, resolved_at: resolvedAt, updated_at: resolvedAt })
      .eq('id', tradeId)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return fail('not_open');

    if (relatedIds.length > 0) {
      const { error: declineBidsError } = await writer
        .from('campaign_trades')
        .update({ status: 'declined', resolved_at: resolvedAt, updated_at: resolvedAt })
        .in('id', relatedIds)
        .eq('status', 'open');
      if (declineBidsError) throw declineBidsError;
    }

    await unlockTradeItems(writer, [tradeId, ...relatedIds]);
    invalidateTradeCaches({
      campaignId: trade.campaign_id,
      proposerGangId: trade.proposer_gang_id,
      counterpartyGangId: trade.counterparty_gang_id,
    });
    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId: trade.campaign_id,
      title: trade.title,
      kind: action === 'decline'
        ? 'declined'
        : trade.counterparty_gang_id
          ? 'cancelled_direct'
          : 'cancelled_listing',
      proposerGangId: trade.proposer_gang_id,
      counterpartyGangId: trade.counterparty_gang_id,
      relatedGangIds,
      actorGangId,
    });
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

    if (!isUuid(tradeId)) return fail('invalid');

    const { data: trade, error: tradeError } = await supabase
      .from('campaign_trades')
      .select(`
        id,
        campaign_id,
        proposer_gang_id,
        counterparty_gang_id,
        parent_trade_id,
        title,
        status,
        campaign_trade_items ( fighter_id, fighters ( gang_id ) )
      `)
      .eq('id', tradeId)
      .maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) return fail('not_found');

    let relatedGangIds: string[] = [];
    if (trade.parent_trade_id) {
      const { data: siblings, error: siblingsError } = await supabase
        .from('campaign_trades')
        .select('proposer_gang_id')
        .eq('parent_trade_id', trade.parent_trade_id)
        .eq('status', 'open')
        .neq('id', tradeId);
      if (siblingsError) throw siblingsError;
      relatedGangIds = uniqueGangIds((siblings ?? []).map((row) => row.proposer_gang_id));
    }

    const captive = await loadCaptiveHome(supabase, trade);

    const { data: outcome, error } = await supabase.rpc('accept_campaign_trade', {
      p_trade_id: tradeId,
    });

    if (error) throw error;
    const message = mapOutcome(outcome);
    if (message) return { success: false, error: message };

    invalidateTradeCaches({
      campaignId: trade.campaign_id,
      proposerGangId: trade.proposer_gang_id,
      counterpartyGangId: trade.counterparty_gang_id,
      accepted: true,
    });
    if (captive) {
      invalidateFighter(captive.fighterId, captive.homeGangId);
    }
    await followUpCampaignTrade({
      supabase,
      userId: user.id,
      campaignId: trade.campaign_id,
      title: trade.title,
      kind: 'accepted',
      proposerGangId: trade.proposer_gang_id,
      counterpartyGangId: trade.counterparty_gang_id,
      relatedGangIds,
      actorGangId: trade.counterparty_gang_id ?? trade.proposer_gang_id,
    });
    return { success: true };
  } catch (error) {
    console.error('Error accepting campaign trade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept trade',
    };
  }
}
