'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateCampaignMapParams {
  campaignId: string;
  backgroundImageUrl: string;
  hexGridEnabled?: boolean;
  hexSize?: number;
}

export interface UpdateCampaignMapParams {
  campaignId: string;
  backgroundImageUrl?: string;
  hexGridEnabled?: boolean;
  hexSize?: number;
}

export interface MapObjectData {
  id?: string;
  // Client-supplied stable identifier used to round-trip new (insert) rows
  // back to their database-assigned IDs without relying on array ordering.
  // Required for inserts; ignored for updates.
  tempId?: string;
  object_type: string;
  geometry: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export interface UpsertMapObjectsParams {
  campaignId: string;
  objects: MapObjectData[];
}

export interface BulkDeleteMapObjectsParams {
  campaignId: string;
  objectIds: string[];
}

export interface UpdateTerritoryMapAssociationParams {
  campaignId: string;
  territoryId: string;
  mapObjectId?: string | null;
  mapHexCoords?: { x: number; y: number; z: number } | null;
  showNameOnMap?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyCampaignEditor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, campaignId: string) {
  const { data: members, error } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);

  if (error || !members || members.length === 0) return false;
  return members.some((m: { role: string }) => m.role === 'OWNER' || m.role === 'ARBITRATOR');
}

function invalidateMapCache(campaignId: string) {
  revalidateTag(`campaign-map-${campaignId}`);
  revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createCampaignMap(params: CreateCampaignMapParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data, error } = await supabase
      .from('campaign_maps')
      .insert({
        campaign_id: params.campaignId,
        background_image_url: params.backgroundImageUrl,
        hex_grid_enabled: params.hexGridEnabled ?? false,
        hex_size: params.hexSize ?? 50,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign map:', error);
      return { success: false, error: error.message };
    }

    invalidateMapCache(params.campaignId);
    return { success: true, data };
  } catch (error) {
    console.error('Error in createCampaignMap:', error);
    return { success: false, error: 'Failed to create campaign map' };
  }
}

export async function updateCampaignMap(params: UpdateCampaignMapParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.backgroundImageUrl !== undefined) updates.background_image_url = params.backgroundImageUrl;
    if (params.hexGridEnabled !== undefined) updates.hex_grid_enabled = params.hexGridEnabled;
    if (params.hexSize !== undefined) updates.hex_size = params.hexSize;

    const { data, error } = await supabase
      .from('campaign_maps')
      .update(updates)
      .eq('campaign_id', params.campaignId)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign map:', error);
      return { success: false, error: error.message };
    }

    invalidateMapCache(params.campaignId);
    return { success: true, data };
  } catch (error) {
    console.error('Error in updateCampaignMap:', error);
    return { success: false, error: 'Failed to update campaign map' };
  }
}

export async function upsertMapObjects(params: UpsertMapObjectsParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: mapRow } = await supabase
      .from('campaign_maps')
      .select('id')
      .eq('campaign_id', params.campaignId)
      .single();

    if (!mapRow) {
      return { success: false, error: 'Campaign map not found' };
    }

    const toInsert = params.objects.filter(o => !o.id);
    const toUpdate = params.objects.filter(o => !!o.id);

    // Reject inserts that don't carry a tempId — the client uses it to map
    // the database-assigned ID back onto its local object once we return.
    if (toInsert.some(o => !o.tempId)) {
      return { success: false, error: 'Missing tempId on new map object' };
    }

    // Run the bulk insert and all per-row updates concurrently. Updates are
    // kept as individual statements (rather than a single upsert) so a stale
    // ID can't be silently inserted as a fresh row by `ON CONFLICT DO UPDATE`.
    const updatedAt = new Date().toISOString();

    // Capture the tempIds in the same order as the insert payload so we can
    // pair each returned row with its originating tempId after the bulk
    // insert resolves. Postgres preserves row order within a single
    // INSERT ... RETURNING statement, which is what supabase-js uses here.
    const insertTempIds = toInsert.map(o => o.tempId!);

    const insertPromise = toInsert.length > 0
      ? supabase
          .from('campaign_map_objects')
          .insert(
            toInsert.map(o => ({
              campaign_map_id: mapRow.id,
              object_type: o.object_type,
              geometry: o.geometry,
              properties: o.properties ?? {},
            }))
          )
          .select()
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });

    const updatePromises = toUpdate.map(obj =>
      supabase
        .from('campaign_map_objects')
        .update({
          object_type: obj.object_type,
          geometry: obj.geometry,
          properties: obj.properties ?? {},
          updated_at: updatedAt,
        })
        .eq('id', obj.id!)
        .eq('campaign_map_id', mapRow.id)
        .select()
        .single()
    );

    const [insertResult, ...updateResults] = await Promise.all([insertPromise, ...updatePromises]);

    if (insertResult.error) {
      console.error('Error inserting map objects:', insertResult.error);
      return { success: false, error: insertResult.error.message };
    }

    const failedUpdate = updateResults.find(r => r.error);
    if (failedUpdate?.error) {
      console.error('Error updating map object:', failedUpdate.error);
      return { success: false, error: failedUpdate.error.message };
    }

    const insertedRows = (insertResult.data ?? []) as Array<{ id: string }>;

    // Build an explicit tempId → real id map. This is the contract the
    // client should rely on, rather than positional indexing into `data`.
    const tempIdToId: Record<string, string> = {};
    insertTempIds.forEach((tempId, idx) => {
      const row = insertedRows[idx];
      if (row?.id) tempIdToId[tempId] = row.id;
    });

    const results: unknown[] = [
      ...insertedRows,
      ...updateResults.map(r => r.data).filter(Boolean),
    ];

    invalidateMapCache(params.campaignId);
    return { success: true, data: results, tempIdToId };
  } catch (error) {
    console.error('Error in upsertMapObjects:', error);
    return { success: false, error: 'Failed to upsert map objects' };
  }
}

/**
 * Delete a subset of map objects belonging to a campaign's map.
 *
 * Use this for **partial** edits (e.g. the user removed specific shapes in
 * the map editor while the map itself is kept). Do NOT call this alongside
 * `deleteCampaignMap`: `campaign_map_objects.campaign_map_id` has
 * `ON DELETE CASCADE`, so deleting the map row automatically removes all
 * child objects. Combining the two is redundant and racy.
 */
export async function bulkDeleteMapObjects(params: BulkDeleteMapObjectsParams) {
  try {
    if (params.objectIds.length === 0) {
      return { success: true };
    }

    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: mapRow } = await supabase
      .from('campaign_maps')
      .select('id')
      .eq('campaign_id', params.campaignId)
      .single();

    if (!mapRow) {
      return { success: false, error: 'Campaign map not found' };
    }

    const { error } = await supabase
      .from('campaign_map_objects')
      .delete()
      .in('id', params.objectIds)
      .eq('campaign_map_id', mapRow.id);

    if (error) {
      console.error('Error bulk deleting map objects:', error);
      return { success: false, error: error.message };
    }

    invalidateMapCache(params.campaignId);
    return { success: true };
  } catch (error) {
    console.error('Error in bulkDeleteMapObjects:', error);
    return { success: false, error: 'Failed to delete map objects' };
  }
}

export async function updateTerritoryMapAssociation(params: UpdateTerritoryMapAssociationParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const updates: Record<string, unknown> = {};

    if (params.mapObjectId !== undefined) {
      updates.map_object_id = params.mapObjectId;
      if (params.mapObjectId) updates.map_hex_coords = null;
    }
    if (params.mapHexCoords !== undefined) {
      updates.map_hex_coords = params.mapHexCoords;
      if (params.mapHexCoords) updates.map_object_id = null;
    }
    if (params.showNameOnMap !== undefined) {
      updates.show_name_on_map = params.showNameOnMap;
    }

    const { error } = await supabase
      .from('campaign_territories')
      .update(updates)
      .eq('id', params.territoryId)
      .eq('campaign_id', params.campaignId);

    if (error) {
      console.error('Error updating territory map association:', error);
      return { success: false, error: error.message };
    }

    invalidateMapCache(params.campaignId);
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(params.campaignId));
    return { success: true };
  } catch (error) {
    console.error('Error in updateTerritoryMapAssociation:', error);
    return { success: false, error: 'Failed to update territory map association' };
  }
}

export async function bulkUpdateTerritoryMapAssociations(params: {
  campaignId: string;
  associations: Array<{
    territoryId: string;
    mapObjectId?: string | null;
    mapHexCoords?: { x: number; y: number; z: number } | null;
    showNameOnMap?: boolean;
  }>;
}) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const updatePromises = params.associations
      .map(assoc => {
        const updates: Record<string, unknown> = {};

        if (assoc.mapObjectId !== undefined) {
          updates.map_object_id = assoc.mapObjectId;
          if (assoc.mapObjectId) updates.map_hex_coords = null;
        }
        if (assoc.mapHexCoords !== undefined) {
          updates.map_hex_coords = assoc.mapHexCoords;
          if (assoc.mapHexCoords) updates.map_object_id = null;
        }
        if (assoc.showNameOnMap !== undefined) {
          updates.show_name_on_map = assoc.showNameOnMap;
        }

        if (Object.keys(updates).length === 0) return null;

        return supabase
          .from('campaign_territories')
          .update(updates)
          .eq('id', assoc.territoryId)
          .eq('campaign_id', params.campaignId);
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const results = await Promise.all(updatePromises);

    const failed = results.find(r => r.error);
    if (failed?.error) {
      console.error('Error updating territory map association:', failed.error);
      return { success: false, error: failed.error.message };
    }

    invalidateMapCache(params.campaignId);
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(params.campaignId));
    return { success: true };
  } catch (error) {
    console.error('Error in bulkUpdateTerritoryMapAssociations:', error);
    return { success: false, error: 'Failed to update territory map associations' };
  }
}

/**
 * Fully delete a campaign's map, its child objects and any uploaded map
 * images. Relies on the `ON DELETE CASCADE` on
 * `campaign_map_objects.campaign_map_id` (and the matching SET NULL on
 * `campaign_territories.map_object_id`) — do NOT pre-call
 * `bulkDeleteMapObjects` before this; that would be redundant.
 */
export async function deleteCampaignMap(params: { campaignId: string }) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const isEditor = await verifyCampaignEditor(supabase, user.id, params.campaignId);
    if (!isEditor) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Verify the map exists before deletion (PGRST116 = no rows, treat as
    // already-deleted and continue so storage cleanup still runs).
    const { error: mapError } = await supabase
      .from('campaign_maps')
      .select('id')
      .eq('campaign_id', params.campaignId)
      .single();

    if (mapError && mapError.code !== 'PGRST116') {
      console.error('Error fetching campaign map for deletion:', mapError);
      return { success: false, error: mapError.message };
    }

    // Delete the campaign map (this cascades to campaign_map_objects).
    const { error: deleteError } = await supabase
      .from('campaign_maps')
      .delete()
      .eq('campaign_id', params.campaignId);

    if (deleteError) {
      console.error('Error deleting campaign map:', deleteError);
      return { success: false, error: deleteError.message };
    }

    // Clean up map images from storage. Best-effort: log errors but don't
    // fail the request, since the DB row is already gone.
    try {
      const { data: mapFiles } = await supabase.storage
        .from('users-images')
        .list(`campaigns/${params.campaignId}/map/`);

      if (mapFiles && mapFiles.length > 0) {
        const filesToRemove = mapFiles
          .filter(f => f.name)
          .map(f => `campaigns/${params.campaignId}/map/${f.name}`);

        if (filesToRemove.length > 0) {
          await supabase.storage
            .from('users-images')
            .remove(filesToRemove);
        }
      }
    } catch (storageError) {
      console.error('Error cleaning up map images:', storageError);
    }

    invalidateMapCache(params.campaignId);
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(params.campaignId));

    return { success: true };
  } catch (error) {
    console.error('Error in deleteCampaignMap:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete campaign map'
    };
  }
}
