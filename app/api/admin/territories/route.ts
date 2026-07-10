import { TAGS } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignTypeId = searchParams.get('campaign_type_id');

    let query = supabase
      .from('territories')
      .select('id, territory_name, campaign_type_id, playing_card')
      .order('territory_name', { ascending: true });

    if (campaignTypeId) {
      query = query.eq('campaign_type_id', campaignTypeId);
    }

    const { data: territories, error } = await query;

    if (error) throw error;
    return NextResponse.json(territories);
  } catch (error) {
    console.error('Error fetching territories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch territories' },
      { status: 500 }
    );
  }
}

async function _POST(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { territory_name, campaign_type_id, playing_card } = body;
    const normalisedPlayingCard = typeof playing_card === 'string' ? playing_card.trim() || null : null;

    if (!territory_name?.trim()) {
      return NextResponse.json(
        { error: 'territory_name is required' },
        { status: 400 }
      );
    }

    if (territory_name.trim().length > 200) {
      return NextResponse.json(
        { error: 'territory_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    const { data: territory, error } = await supabase
      .from('territories')
      .insert([{
        territory_name: territory_name.trim(),
        campaign_type_id: campaign_type_id || null,
        playing_card: normalisedPlayingCard
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(territory);
  } catch (error) {
    console.error('Error creating territory:', error);
    return NextResponse.json(
      { error: 'Failed to create territory' },
      { status: 500 }
    );
  }
}

async function _PATCH(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, territory_name, campaign_type_id, playing_card } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (territory_name !== undefined) {
      const trimmedName = territory_name.trim();
      if (trimmedName.length > 200) {
        return NextResponse.json(
          { error: 'territory_name must be 200 characters or less' },
          { status: 400 }
        );
      }
      updateData.territory_name = trimmedName;
    }
    if (campaign_type_id !== undefined) {
      updateData.campaign_type_id = campaign_type_id || null;
    }
    if (playing_card !== undefined) {
      updateData.playing_card = typeof playing_card === 'string' ? playing_card.trim() || null : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: territory, error } = await supabase
      .from('territories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(territory);
  } catch (error) {
    console.error('Error updating territory:', error);
    return NextResponse.json(
      { error: 'Failed to update territory' },
      { status: 500 }
    );
  }
}

// Admin edits change global reference data that is cached app-wide; fire the
// matching tags once per successful mutation (previously nothing was fired,
// so admin edits never showed up until caches expired).
function withReferenceInvalidation(
  handler: (...args: any[]) => Promise<Response>
) {
  return async (...args: any[]) => {
    const response = await handler(...args);
    if (response.ok) {
      revalidateTag(TAGS.globalTerritories(), { expire: 0 });
    }
    return response;
  };
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
