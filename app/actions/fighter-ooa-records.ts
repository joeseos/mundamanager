'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';

export interface FighterOoaRecord {
  id: string;
  created_at: string;
  causing_fighter_id: string | null;
  causing_gang_id: string | null;
  causing_fighter_name: string | null;
  causing_fighter_type: string | null;
  causing_fighter_class: string | null;
  causing_fighter_gang_name: string | null;
  injured_fighter_id: string | null;
  injured_gang_id: string | null;
  injured_fighter_name: string | null;
  injured_fighter_type: string | null;
  injured_fighter_class: string | null;
  injured_gang_name: string | null;
  event_type: 'out_of_action' | 'vehicle_wrecked';
  vehicle_type: string | null;
  vehicle_name: string | null;
  campaign_id: string | null;
}

export interface CampaignGangWithFighters {
  gang_id: string;
  name: string;
  gang_colour: string | null;
  owner_username: string | null;
  fighters: Array<{
    id: string;
    fighter_name: string;
    fighter_type: string | null;
    fighter_class: string | null;
    gang_id: string;
  }>;
}

/**
 * Returns the history of fighters that the given fighter has put Out of Action
 * or whose vehicle they wrecked. Uses snapshotted values so deleted
 * fighters/gangs still render.
 */
export async function getFighterOoaRecords(fighterId: string): Promise<FighterOoaRecord[]> {
  const supabase = await createClient();
  await getAuthenticatedUser(supabase);

  const { data, error } = await supabase
    .from('fighter_ooa_records')
    .select('*')
    .eq('causing_fighter_id', fighterId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as FighterOoaRecord[];
}

/**
 * Returns the history of fighters that have put the given fighter Out of Action
 * or wrecked their vehicle (the reverse of getFighterOoaRecords). Uses
 * snapshotted values so deleted fighters/gangs still render.
 */
export async function getFighterSustainedOoaRecords(fighterId: string): Promise<FighterOoaRecord[]> {
  const supabase = await createClient();
  await getAuthenticatedUser(supabase);

  const { data, error } = await supabase
    .from('fighter_ooa_records')
    .select('*')
    .eq('injured_fighter_id', fighterId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as FighterOoaRecord[];
}

/**
 * Returns the gangs participating in the given campaign (plus the fighter's own
 * gang) with their fighters, for the optional OOA/Wreck target comboboxes.
 * If no campaignId is provided, only the fighter's own gang is returned.
 */
export async function getCampaignGangsAndFighters(params: {
  campaignId?: string;
  gangId: string;
}): Promise<CampaignGangWithFighters[]> {
  const supabase = await createClient();
  await getAuthenticatedUser(supabase);

  const gangIds = new Set<string>();
  if (params.gangId) gangIds.add(params.gangId);

  // Prefer campaign_gangs.user_id (campaign member) when available, matching
  // /api/campaigns/campaign-gangs used by the battle-log gang combobox.
  const campaignOwnerByGangId = new Map<string, string>();

  if (params.campaignId) {
    const { data: campaignGangs, error: cgError } = await supabase
      .from('campaign_gangs')
      .select('gang_id, user_id')
      .eq('campaign_id', params.campaignId)
      .eq('status', 'ACCEPTED');

    if (cgError) throw cgError;
    (campaignGangs || []).forEach((cg: any) => {
      if (cg.gang_id) {
        gangIds.add(cg.gang_id);
        if (cg.user_id) campaignOwnerByGangId.set(cg.gang_id, cg.user_id);
      }
    });
  }

  const ids = Array.from(gangIds);
  if (ids.length === 0) return [];

  const [{ data: gangs, error: gangsError }, { data: fighters, error: fightersError }] = await Promise.all([
    supabase
      .from('gangs')
      .select('id, name, gang_colour, user_id')
      .in('id', ids),
    supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, fighter_class, gang_id')
      .in('gang_id', ids)
      .order('fighter_name', { ascending: true }),
  ]);

  if (gangsError) throw gangsError;
  if (fightersError) throw fightersError;

  const ownerUserIds = Array.from(
    new Set(
      (gangs || [])
        .map((g: any) => campaignOwnerByGangId.get(g.id) || g.user_id)
        .filter((id: unknown): id is string => typeof id === 'string' && !!id)
    )
  );

  const profileMap = new Map<string, string>();
  if (ownerUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ownerUserIds);
    (profiles || []).forEach((p: any) => {
      if (p.id && p.username) profileMap.set(p.id, p.username);
    });
  }

  const fightersByGang = new Map<string, CampaignGangWithFighters['fighters']>();
  (fighters || []).forEach((f: any) => {
    if (!fightersByGang.has(f.gang_id)) fightersByGang.set(f.gang_id, []);
    fightersByGang.get(f.gang_id)!.push({
      id: f.id,
      fighter_name: f.fighter_name,
      fighter_type: f.fighter_type ?? null,
      fighter_class: f.fighter_class ?? null,
      gang_id: f.gang_id,
    });
  });

  return (gangs || [])
    .map((g: any) => {
      const ownerUserId = campaignOwnerByGangId.get(g.id) || g.user_id || null;
      return {
        gang_id: g.id,
        name: g.name,
        gang_colour: g.gang_colour ?? null,
        owner_username: ownerUserId ? profileMap.get(ownerUserId) ?? null : null,
        fighters: fightersByGang.get(g.id) || [],
      };
    })
    .sort((a: CampaignGangWithFighters, b: CampaignGangWithFighters) =>
      (a.name || '').localeCompare(b.name || '')
    );
}

/**
 * Creates a single OOA / wreck record for the given causing fighter.
 * Snapshots causing and injured fighter/gang/vehicle data server-side.
 * Pass injured_fighter_id as null/undefined to mark the target as Unknown.
 */
export async function createFighterOoaRecord(params: {
  causing_fighter_id: string;
  campaign_id?: string | null;
  injured_fighter_id?: string | null;
  event_type: 'out_of_action' | 'vehicle_wrecked';
  /** ISO timestamp for the event; defaults to now when omitted. */
  created_at?: string | null;
}): Promise<{ success: boolean; data?: FighterOoaRecord; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    if (!params.causing_fighter_id) {
      throw new Error('Causing fighter id is required');
    }
    if (params.event_type !== 'out_of_action' && params.event_type !== 'vehicle_wrecked') {
      throw new Error('Invalid event type');
    }

    const createdAt = params.created_at ? new Date(params.created_at) : new Date();
    if (isNaN(createdAt.getTime())) {
      throw new Error('Invalid date');
    }

    const { data: causing, error: causingError } = await supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, fighter_class, gang_id, gangs!gang_id(name)')
      .eq('id', params.causing_fighter_id)
      .single();

    if (causingError || !causing) {
      throw new Error('Causing fighter not found');
    }

    const causingGang = causing.gangs && typeof causing.gangs === 'object' ? causing.gangs : null;

    let row: Record<string, unknown> = {
      created_at: createdAt.toISOString(),
      causing_fighter_id: causing.id,
      causing_gang_id: causing.gang_id,
      causing_fighter_name: causing.fighter_name ?? null,
      causing_fighter_type: causing.fighter_type ?? null,
      causing_fighter_class: causing.fighter_class ?? null,
      causing_fighter_gang_name: (causingGang as any)?.name ?? null,
      injured_fighter_id: null,
      injured_gang_id: null,
      injured_fighter_name: 'Unknown',
      injured_fighter_type: null,
      injured_fighter_class: null,
      injured_gang_name: null,
      event_type: params.event_type,
      vehicle_type: null,
      vehicle_name: null,
      campaign_id: params.campaign_id ?? null,
    };

    if (params.injured_fighter_id) {
      const { data: injured, error: injuredError } = await supabase
        .from('fighters')
        .select('id, fighter_name, fighter_type, fighter_class, gang_id, gangs!gang_id(id, name)')
        .eq('id', params.injured_fighter_id)
        .single();

      if (injuredError || !injured) {
        throw new Error('Injured fighter not found');
      }

      const gang = injured.gangs && typeof injured.gangs === 'object' ? injured.gangs : null;

      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('vehicle_type, vehicle_name')
        .eq('fighter_id', params.injured_fighter_id)
        .maybeSingle();

      row = {
        ...row,
        injured_fighter_id: injured.id,
        injured_gang_id: injured.gang_id ?? null,
        injured_fighter_name: injured.fighter_name ?? null,
        injured_fighter_type: injured.fighter_type ?? null,
        injured_fighter_class: injured.fighter_class ?? null,
        injured_gang_name: (gang as any)?.name ?? null,
        vehicle_type: vehicle?.vehicle_type ?? null,
        vehicle_name: vehicle?.vehicle_name ?? null,
      };
    }

    const { data, error } = await supabase
      .from('fighter_ooa_records')
      .insert(row)
      .select('*')
      .single();

    if (error) throw error;

    return { success: true, data: data as FighterOoaRecord };
  } catch (error) {
    console.error('Error creating fighter OOA record:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}

/**
 * Updates an OOA / wreck record's injured target and/or event type.
 * Re-snapshots injured fighter/gang/vehicle data server-side.
 * Pass injured_fighter_id as null/undefined to mark the target as Unknown.
 */
export async function updateFighterOoaRecord(params: {
  record_id: string;
  injured_fighter_id?: string | null;
  event_type: 'out_of_action' | 'vehicle_wrecked';
  /** ISO timestamp for the event. */
  created_at?: string | null;
}): Promise<{ success: boolean; data?: FighterOoaRecord; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    if (!params.record_id) {
      throw new Error('Record id is required');
    }
    if (params.event_type !== 'out_of_action' && params.event_type !== 'vehicle_wrecked') {
      throw new Error('Invalid event type');
    }

    let createdAtIso: string | undefined;
    if (params.created_at) {
      const createdAt = new Date(params.created_at);
      if (isNaN(createdAt.getTime())) {
        throw new Error('Invalid date');
      }
      createdAtIso = createdAt.toISOString();
    }

    let updateData: Record<string, unknown> = {
      event_type: params.event_type,
      ...(createdAtIso ? { created_at: createdAtIso } : {}),
      injured_fighter_id: null,
      injured_gang_id: null,
      injured_fighter_name: 'Unknown',
      injured_fighter_type: null,
      injured_fighter_class: null,
      injured_gang_name: null,
      vehicle_type: null,
      vehicle_name: null,
    };

    if (params.injured_fighter_id) {
      const { data: injured, error: injuredError } = await supabase
        .from('fighters')
        .select('id, fighter_name, fighter_type, fighter_class, gang_id, gangs!gang_id(id, name)')
        .eq('id', params.injured_fighter_id)
        .single();

      if (injuredError || !injured) {
        throw new Error('Injured fighter not found');
      }

      const gang = injured.gangs && typeof injured.gangs === 'object' ? injured.gangs : null;

      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('vehicle_type, vehicle_name')
        .eq('fighter_id', params.injured_fighter_id)
        .maybeSingle();

      updateData = {
        event_type: params.event_type,
        ...(createdAtIso ? { created_at: createdAtIso } : {}),
        injured_fighter_id: injured.id,
        injured_gang_id: injured.gang_id ?? null,
        injured_fighter_name: injured.fighter_name ?? null,
        injured_fighter_type: injured.fighter_type ?? null,
        injured_fighter_class: injured.fighter_class ?? null,
        injured_gang_name: (gang as any)?.name ?? null,
        vehicle_type: vehicle?.vehicle_type ?? null,
        vehicle_name: vehicle?.vehicle_name ?? null,
      };
    }

    const { data, error } = await supabase
      .from('fighter_ooa_records')
      .update(updateData)
      .eq('id', params.record_id)
      .select('*')
      .single();

    if (error) throw error;

    return { success: true, data: data as FighterOoaRecord };
  } catch (error) {
    console.error('Error updating fighter OOA record:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}

/**
 * Deletes an OOA / wreck history record.
 */
export async function deleteFighterOoaRecord(
  recordId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    if (!recordId) {
      throw new Error('Record id is required');
    }

    const { error } = await supabase
      .from('fighter_ooa_records')
      .delete()
      .eq('id', recordId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error deleting fighter OOA record:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}
