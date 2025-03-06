import {createClient} from "@/utils/supabase/server";
import {NextResponse} from "next/server";
import {checkAdmin} from "@/utils/auth";

export async function GET() {
  const supabase = createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('alliances')
      .select('id, alliance_name, alliance_type, strong_alliance')
      .order('alliance_name');

    if (error) throw error;

    const transformedData = data.map(type => ({
      id: type.id,
      alliance_name: type.alliance_name,
      alliance_type: type.alliance_type,
      strong_alliance: type.strong_alliance
    }));

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching skill sets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill sets' },
      { status: 500 }
    );
  }
}
