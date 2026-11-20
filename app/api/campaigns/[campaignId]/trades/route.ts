import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getCampaignTrades } from '@/app/lib/campaigns/[id]/get-campaign-data';

/**
 * GET /api/campaigns/[campaignId]/trades
 * Campaign trades list. The rows are read over the direct connection, so
 * confirm the caller first.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { campaignId } = params;

  if (!campaignId) {
    return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
  }

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trades = await getCampaignTrades(campaignId, 100);
    return NextResponse.json(trades);
  } catch (error) {
    console.error('Error fetching campaign trades:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}
