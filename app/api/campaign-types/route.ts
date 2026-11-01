import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { getCampaignTypes, getTradingPostTypesCached } from '@/app/lib/reference-data';

/** Campaign and trading post types for the create-campaign modal, from the site-wide cache. */
export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [campaignTypes, tradingPostTypes] = await Promise.all([
      getCampaignTypes(),
      getTradingPostTypesCached()
    ]);

    return NextResponse.json({ campaignTypes, tradingPostTypes });
  } catch (error) {
    console.error('Error fetching campaign types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign types' },
      { status: 500 }
    );
  }
}
