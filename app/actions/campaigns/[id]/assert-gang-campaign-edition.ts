import type { SupabaseClient } from '@supabase/supabase-js';
import { sameEditionSlug } from '@/types/edition';

/** Campaign type edition and gang type edition must match (null treated as n23). */
export async function assertGangMatchesCampaignEdition(
  supabase: SupabaseClient,
  campaignId: string,
  gangId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [{ data: campaign, error: campaignError }, { data: gang, error: gangError }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('campaign_types!campaign_type_id(editions:edition_id(slug))')
      .eq('id', campaignId)
      .single(),
    supabase
      .from('gangs')
      .select(`
        gang_types!gang_type_id(editions:edition_id(slug)),
        custom_gang_types!custom_gang_type_id(editions:edition_id(slug))
      `)
      .eq('id', gangId)
      .single(),
  ]);

  if (campaignError || !campaign) {
    return { ok: false, error: 'Campaign not found' };
  }
  if (gangError || !gang) {
    return { ok: false, error: 'Gang not found' };
  }

  const campaignEditionSlug = (campaign as any).campaign_types?.editions?.slug ?? null;
  const gangEditionSlug = (gang as any).gang_types?.editions?.slug
    ?? (gang as any).custom_gang_types?.editions?.slug
    ?? null;

  if (!sameEditionSlug(campaignEditionSlug, gangEditionSlug)) {
    return {
      ok: false,
      error: 'This gang is from a different edition than the campaign'
    };
  }

  return { ok: true };
}
