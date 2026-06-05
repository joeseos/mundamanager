import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('custom_shared')
    .select('campaign_id')
    .eq('custom_trading_post_id', id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch shared campaigns" },
      { status: 500 }
    );
  }

  const campaignIds = (data || []).map(r => r.campaign_id).filter(Boolean);
  return NextResponse.json(campaignIds);
}
