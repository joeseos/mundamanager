/**
 * Client-side fetch wrappers for the fighter OOA / vehicle-wreck history
 * Route Handlers. These are the reads for this feature; writes stay as
 * server actions in `app/actions/fighter-ooa-records.ts`.
 */

import type { CampaignGangWithFighters, FighterOoaRecord } from '@/types/fighter-ooa-record';

/**
 * Fetches a fighter's OOA / vehicle-wreck history.
 * @param direction 'caused' (default) for records this fighter caused, or
 * 'sustained' for records where this fighter was the target.
 */
export async function fetchFighterOoaRecords(
  fighterId: string,
  direction: 'caused' | 'sustained' = 'caused'
): Promise<FighterOoaRecord[]> {
  const res = await fetch(`/api/fighters/${fighterId}/ooa-records?direction=${direction}`);
  if (!res.ok) throw new Error('Failed to fetch fighter OOA records');
  return res.json();
}

interface CampaignGangApiResult {
  id: string;
  name: string;
  gang_colour: string | null;
  owner_username?: string | null;
  fighters?: Array<{
    id: string;
    fighter_name: string;
    fighter_type: string | null;
    fighter_class: string | null;
    gang_id: string;
  }>;
}

/**
 * Fetches the gangs participating in the given campaign (plus the fighter's
 * own gang) with their fighters, for the optional OOA/Wreck target
 * comboboxes. If no campaignId is provided, only the fighter's own gang is
 * returned. Backed by the shared /api/campaigns/campaign-gangs route.
 */
export async function fetchCampaignGangsAndFighters(params: {
  campaignId?: string;
  gangId: string;
}): Promise<CampaignGangWithFighters[]> {
  const search = new URLSearchParams();
  if (params.campaignId) search.set('campaignId', params.campaignId);
  if (params.gangId) search.set('gangId', params.gangId);
  search.set('includeFighters', 'true');

  const res = await fetch(`/api/campaigns/campaign-gangs?${search.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch campaign gangs');

  const gangs: CampaignGangApiResult[] = await res.json();

  return gangs.map((g) => ({
    gang_id: g.id,
    name: g.name,
    gang_colour: g.gang_colour ?? null,
    // The shared route falls back to the literal string 'Unknown' for other
    // consumers; normalise that to null here so the gang combobox omits the
    // owner suffix instead of showing "• Unknown".
    owner_username: g.owner_username && g.owner_username !== 'Unknown' ? g.owner_username : null,
    fighters: g.fighters || [],
  }));
}
