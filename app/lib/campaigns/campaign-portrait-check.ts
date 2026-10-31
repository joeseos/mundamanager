import type { createClient } from '@/utils/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The foreign key only proves the portrait exists. This also checks it belongs to the campaign's type. */
export async function portraitBelongsToCampaignType(
  supabase: Supabase,
  portraitId: string,
  campaignTypeId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from('campaign_portraits')
    .select('campaign_type_id')
    .eq('id', portraitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, error: 'Campaign portrait not found' };
  if (data.campaign_type_id !== campaignTypeId) {
    return { success: false, error: 'This portrait belongs to a different campaign type' };
  }
  return { success: true };
}
