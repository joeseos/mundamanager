import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";

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
      .select('id, territory_name, campaign_type_id')
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

export async function POST(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { territory_name, campaign_type_id } = body;

    if (!territory_name?.trim()) {
      return NextResponse.json(
        { error: 'territory_name is required' },
        { status: 400 }
      );
    }

    const { data: territory, error } = await supabase
      .from('territories')
      .insert([{
        territory_name: territory_name.trim(),
        campaign_type_id: campaign_type_id || null
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

export async function PATCH(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, territory_name, campaign_type_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (territory_name !== undefined) {
      updateData.territory_name = territory_name.trim();
    }
    if (campaign_type_id !== undefined) {
      updateData.campaign_type_id = campaign_type_id || null;
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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('territories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting territory:', error);
    return NextResponse.json(
      { error: 'Failed to delete territory' },
      { status: 500 }
    );
  }
}
