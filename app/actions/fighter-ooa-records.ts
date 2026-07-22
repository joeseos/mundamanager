'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';
import type { FighterOoaRecord } from '@/types/fighter-ooa-record';

// Re-exported for existing call sites; the canonical definitions live in a
// plain (non-'use server') module so client components can also import them.
export type { FighterOoaRecord, CampaignGangWithFighters } from '@/types/fighter-ooa-record';

// -----------------------------------------------------------------------------
// Shared injured-fighter snapshot helper
// -----------------------------------------------------------------------------
// Every write path (single create, single update, and the XP-flow batch
// insert) needs the same "look up injured fighter -> gang -> vehicle -> build
// snapshot fields" logic. This is factored into one batched lookup so all
// three paths query the database the same way, whether snapshotting one
// fighter or many.

interface InjuredSnapshot {
  injured_fighter_id: string | null;
  injured_gang_id: string | null;
  injured_fighter_name: string | null;
  injured_fighter_type: string | null;
  injured_fighter_class: string | null;
  injured_gang_name: string | null;
  vehicle_type: string | null;
  vehicle_name: string | null;
}

const UNKNOWN_INJURED_SNAPSHOT: InjuredSnapshot = {
  injured_fighter_id: null,
  injured_gang_id: null,
  injured_fighter_name: 'Unknown',
  injured_fighter_type: null,
  injured_fighter_class: null,
  injured_gang_name: null,
  vehicle_type: null,
  vehicle_name: null,
};

/**
 * Batches the injured-fighter -> gang -> vehicle snapshot lookup for one or
 * more fighter ids. Returns a map keyed by fighter id; ids that don't
 * resolve to an existing fighter are simply absent from the map (callers
 * decide how to handle a miss).
 *
 * When a fighter has multiple vehicles assigned (shouldn't normally happen,
 * but isn't enforced by the schema), the oldest one is used so the pick is
 * deterministic rather than dependent on query return order.
 */
async function fetchInjuredSnapshotMap(
  supabase: any,
  injuredFighterIds: string[]
): Promise<Map<string, InjuredSnapshot>> {
  const map = new Map<string, InjuredSnapshot>();
  const ids = Array.from(new Set(injuredFighterIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const [{ data: fighters, error: fightersError }, { data: vehicles, error: vehiclesError }] = await Promise.all([
    supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, fighter_class, gang_id, gangs!gang_id(id, name)')
      .in('id', ids),
    supabase
      .from('vehicles')
      .select('fighter_id, vehicle_type, vehicle_name')
      .in('fighter_id', ids)
      .order('created_at', { ascending: true }),
  ]);

  if (fightersError) throw fightersError;
  if (vehiclesError) throw vehiclesError;

  const vehicleByFighter = new Map<string, any>();
  (vehicles || []).forEach((v: any) => {
    // Vehicles are ordered oldest-first above, so the first one seen per
    // fighter is kept — deterministic even if a fighter has more than one.
    if (v.fighter_id && !vehicleByFighter.has(v.fighter_id)) vehicleByFighter.set(v.fighter_id, v);
  });

  (fighters || []).forEach((f: any) => {
    const gang = f.gangs && typeof f.gangs === 'object' ? f.gangs : null;
    const vehicle = vehicleByFighter.get(f.id);
    map.set(f.id, {
      injured_fighter_id: f.id,
      injured_gang_id: f.gang_id ?? null,
      injured_fighter_name: f.fighter_name ?? null,
      injured_fighter_type: f.fighter_type ?? null,
      injured_fighter_class: f.fighter_class ?? null,
      injured_gang_name: (gang as any)?.name ?? null,
      vehicle_type: vehicle?.vehicle_type ?? null,
      vehicle_name: vehicle?.vehicle_name ?? null,
    });
  });

  return map;
}

/**
 * Builds the injured-fighter snapshot fields for a single OOA / wreck
 * record. Pass `injuredFighterId` as null/undefined to mark the target as
 * Unknown. When `required` is true (explicit single-record create/update
 * paths), throws if the fighter id doesn't resolve to an existing fighter.
 */
async function buildInjuredSnapshot(
  supabase: any,
  injuredFighterId?: string | null,
  opts: { required?: boolean } = {}
): Promise<InjuredSnapshot> {
  if (!injuredFighterId) return { ...UNKNOWN_INJURED_SNAPSHOT };

  const map = await fetchInjuredSnapshotMap(supabase, [injuredFighterId]);
  const snapshot = map.get(injuredFighterId);

  if (!snapshot) {
    if (opts.required) throw new Error('Injured fighter not found');
    return { ...UNKNOWN_INJURED_SNAPSHOT, injured_fighter_id: null };
  }

  return snapshot;
}

// -----------------------------------------------------------------------------
// Campaign gang / fighter lookup (used by the target pickers in the Add XP
// and OOA history modals). Reads for records/gangs go through Route
// Handlers (see app/api/fighters/[id]/ooa-records and
// app/api/campaigns/campaign-gangs); this file keeps only the writes.
// -----------------------------------------------------------------------------

/**
 * Inserts OOA / vehicle-wreck records for the fighter who caused them.
 * Snapshots the injured fighter's name, type, class, gang name, and (for
 * wrecks) their vehicle type/name so history survives later edits or
 * deletions. Used by the Add XP flow (see `updateFighterXpWithOoa` in
 * `edit-fighter.ts`), which may report several records in one call.
 */
export async function insertFighterOoaRecords(
  supabase: any,
  params: {
    causing_fighter_id: string;
    causing_fighter_name?: string | null;
    causing_fighter_type?: string | null;
    causing_fighter_class?: string | null;
    causing_gang_id: string;
    causing_gang_name?: string | null;
    campaign_id?: string;
    records: Array<{ injured_fighter_id?: string; event_type: 'out_of_action' | 'vehicle_wrecked' }>;
  }
) {
  const validRecords = (params.records || []).filter(r => r?.event_type);
  if (validRecords.length === 0) return;

  const injuredIds = Array.from(
    new Set(validRecords.map(r => r.injured_fighter_id).filter((id): id is string => !!id))
  );

  const snapshotMap = await fetchInjuredSnapshotMap(supabase, injuredIds);

  const rows = validRecords.map(r => {
    const isUnknown = !r.injured_fighter_id;
    const snapshot = !isUnknown ? snapshotMap.get(r.injured_fighter_id!) : undefined;
    return {
      causing_fighter_id: params.causing_fighter_id,
      causing_gang_id: params.causing_gang_id,
      causing_fighter_name: params.causing_fighter_name ?? null,
      causing_fighter_type: params.causing_fighter_type ?? null,
      causing_fighter_class: params.causing_fighter_class ?? null,
      causing_fighter_gang_name: params.causing_gang_name ?? null,
      injured_fighter_id: r.injured_fighter_id ?? null,
      injured_gang_id: snapshot?.injured_gang_id ?? null,
      injured_fighter_name: isUnknown ? 'Unknown' : (snapshot?.injured_fighter_name ?? null),
      injured_fighter_type: snapshot?.injured_fighter_type ?? null,
      injured_fighter_class: snapshot?.injured_fighter_class ?? null,
      injured_gang_name: snapshot?.injured_gang_name ?? null,
      event_type: r.event_type,
      vehicle_type: snapshot?.vehicle_type ?? null,
      vehicle_name: snapshot?.vehicle_name ?? null,
      campaign_id: params.campaign_id ?? null
    };
  });

  const { error } = await supabase.from('fighter_ooa_records').insert(rows);
  if (error) throw error;
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

    const injuredSnapshot = await buildInjuredSnapshot(supabase, params.injured_fighter_id, {
      required: !!params.injured_fighter_id,
    });

    const row: Record<string, unknown> = {
      created_at: createdAt.toISOString(),
      causing_fighter_id: causing.id,
      causing_gang_id: causing.gang_id,
      causing_fighter_name: causing.fighter_name ?? null,
      causing_fighter_type: causing.fighter_type ?? null,
      causing_fighter_class: causing.fighter_class ?? null,
      causing_fighter_gang_name: (causingGang as any)?.name ?? null,
      event_type: params.event_type,
      campaign_id: params.campaign_id ?? null,
      ...injuredSnapshot,
    };

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
 * Re-snapshots injured fighter/gang/vehicle data server-side, based on the
 * fighter's *current* data (not the state at record creation time).
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

    const injuredSnapshot = await buildInjuredSnapshot(supabase, params.injured_fighter_id, {
      required: !!params.injured_fighter_id,
    });

    const updateData: Record<string, unknown> = {
      event_type: params.event_type,
      ...(createdAtIso ? { created_at: createdAtIso } : {}),
      ...injuredSnapshot,
    };

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
