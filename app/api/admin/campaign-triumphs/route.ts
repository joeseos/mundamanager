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
      .from('campaign_triumphs')
      .select('id, triumph, criteria, campaign_type_id, created_at, updated_at')
      .order('triumph', { ascending: true });

    if (campaignTypeId) {
      query = query.eq('campaign_type_id', campaignTypeId);
    }

    const { data: triumphs, error } = await query;

    if (error) throw error;
    return NextResponse.json(triumphs);
  } catch (error) {
    console.error('Error fetching campaign triumphs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign triumphs' },
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
    const { triumph, criteria, campaign_type_id } = body;

    if (!triumph?.trim()) {
      return NextResponse.json(
        { error: 'triumph is required' },
        { status: 400 }
      );
    }

    if (!criteria?.trim()) {
      return NextResponse.json(
        { error: 'criteria is required' },
        { status: 400 }
      );
    }

    if (!campaign_type_id) {
      return NextResponse.json(
        { error: 'campaign_type_id is required' },
        { status: 400 }
      );
    }

    const { data: campaignTriumph, error } = await supabase
      .from('campaign_triumphs')
      .insert([{
        triumph: triumph.trim(),
        criteria: criteria.trim(),
        campaign_type_id: campaign_type_id
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(campaignTriumph);
  } catch (error) {
    console.error('Error creating campaign triumph:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign triumph' },
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
    const { id, triumph, criteria, campaign_type_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (triumph !== undefined) {
      updateData.triumph = triumph.trim();
    }
    if (criteria !== undefined) {
      updateData.criteria = criteria.trim();
    }
    if (campaign_type_id !== undefined) {
      updateData.campaign_type_id = campaign_type_id;
    }

    const { data: campaignTriumph, error } = await supabase
      .from('campaign_triumphs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(campaignTriumph);
  } catch (error) {
    console.error('Error updating campaign triumph:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign triumph' },
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
      .from('campaign_triumphs')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign triumph:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign triumph' },
      { status: 500 }
    );
  }
}
