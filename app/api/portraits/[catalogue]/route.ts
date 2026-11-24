import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getUserIdFromClaims } from "@/utils/auth";
import {
  PORTRAIT_CATALOGUES,
  isPortraitCatalogueKey,
  toCampaignPortrait,
  toPortrait,
} from "@/utils/portrait-catalogue";

export async function GET(_request: Request, props: { params: Promise<{ catalogue: string }> }) {
  const { catalogue } = await props.params;
  if (!isPortraitCatalogueKey(catalogue)) {
    return NextResponse.json({ error: 'Unknown portrait catalogue' }, { status: 404 });
  }

  const supabase = await createClient();
  if (!await getUserIdFromClaims(supabase)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = PORTRAIT_CATALOGUES[catalogue];
    if (config.requiresCampaignType) {
      const { data, error } = await supabase
        .from(config.table)
        .select(config.columns)
        .order('storage_path');
      if (error) throw error;
      return NextResponse.json((data ?? []).map((row) => toCampaignPortrait(row)));
    }

    const { data, error } = await supabase
      .from(config.table)
      .select(config.columns)
      .order('storage_path');
    if (error) throw error;
    return NextResponse.json((data ?? []).map((row) => toPortrait(row)));
  } catch (error) {
    console.error('Error fetching portraits:', error);
    return NextResponse.json({ error: 'Failed to fetch portraits' }, { status: 500 });
  }
}
