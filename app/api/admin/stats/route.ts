import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { getUserCount } from '@/app/lib/get-stats-user';
import { getGangCount } from '@/app/lib/get-stats-gang';
import { getCampaignCount } from '@/app/lib/get-stats-campaign';

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use cached count functions instead of direct database queries
    // These are cached for 24 hours and automatically invalidated on create/delete
    const [userCount, gangCount, campaignCount] = await Promise.all([
      getUserCount(),
      getGangCount(),
      getCampaignCount()
    ]);

    return NextResponse.json({
      userCount,
      gangCount,
      campaignCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

