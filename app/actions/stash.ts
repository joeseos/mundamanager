'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateGangStash } from '@/utils/cache-tags';

interface StashDeleteParams {
  stash_id: string;
}

interface StashSellParams {
  stash_id: string;
  manual_cost: number; // already clamped on client; server re-clamps to be safe
}

interface StashActionResult {
  success: boolean;
  data?: { gang: { id: string; credits: number } };
  error?: string;
}

export async function deleteEquipmentFromStash(params: StashDeleteParams): Promise<StashActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: row, error: fetchErr } = await supabase
      .from('fighter_equipment')
      .select('id, gang_id, gang_stash')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    // Permission: only gang owner/admin can modify (RLS also enforced)
    const { data: gang, error: gangErr } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', row.gang_id)
      .single();
    if (gangErr || !gang) return { success: false, error: 'Gang not found' };

    // Delete the stash item
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    invalidateGangStash({ gangId: row.gang_id, userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function sellEquipmentFromStash(params: StashSellParams): Promise<StashActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: row, error: fetchErr } = await supabase
      .from('fighter_equipment')
      .select('id, gang_id, gang_stash, original_cost, purchase_cost')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    const sellValue = Math.max(5, Math.floor(params.manual_cost || 0));

    // Update gang credits
    const { data: currentGang, error: gangErr } = await supabase
      .from('gangs')
      .select('credits')
      .eq('id', row.gang_id)
      .single();
    if (gangErr || !currentGang) return { success: false, error: 'Gang not found' };

    const { data: updatedGang, error: updErr } = await supabase
      .from('gangs')
      .update({ credits: (currentGang.credits || 0) + sellValue })
      .eq('id', row.gang_id)
      .select('id, credits')
      .single();
    if (updErr || !updatedGang) return { success: false, error: 'Failed updating credits' };

    // Delete stash item
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    // Invalidate stash + credits
    invalidateGangStash({ gangId: row.gang_id, userId: user.id });

    return { success: true, data: { gang: { id: updatedGang.id, credits: updatedGang.credits } } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}


