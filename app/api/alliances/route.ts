import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { editionSlugFromJoin } from "@/types/edition";

interface Alliance {
  id: string;
  alliance_name: string;
  alliance_type: string | null;
  alliance_crew_name: string | null;
  strong_alliance: string | null;
  editions?: { slug: string } | { slug: string }[] | null;
}

export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('alliances')
      .select('id, alliance_name, alliance_type, alliance_crew_name, strong_alliance, editions:edition_id (slug)')
      .order('alliance_name');

    if (error) throw error;

    const modelData = (data as Alliance[]).map((alliance) => ({
      id: alliance.id,
      alliance_name: alliance.alliance_name,
      alliance_type: alliance.alliance_type,
      alliance_crew_name: alliance.alliance_crew_name,
      strong_alliance: alliance.strong_alliance,
      edition_slug: editionSlugFromJoin(alliance.editions),
    }));

    return NextResponse.json(modelData);
  } catch (error) {
    console.error('Error fetching alliances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alliances' },
      { status: 500 }
    );
  }
}
