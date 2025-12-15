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

    if (triumph.trim().length > 200) {
      return NextResponse.json(
        { error: 'triumph must be 200 characters or less' },
        { status: 400 }
      );
    }

    if (!criteria?.trim()) {
      return NextResponse.json(
        { error: 'criteria is required' },
        { status: 400 }
      );
    }

    if (criteria.trim().length > 2000) {
      return NextResponse.json(
        { error: 'criteria must be 2000 characters or less' },
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
      const trimmedTriumph = triumph.trim();
      if (trimmedTriumph.length > 200) {
        return NextResponse.json(
          { error: 'triumph must be 200 characters or less' },
          { status: 400 }
        );
      }
      updateData.triumph = trimmedTriumph;
    }
    if (criteria !== undefined) {
      const trimmedCriteria = criteria.trim();
      if (trimmedCriteria.length > 2000) {
        return NextResponse.json(
          { error: 'criteria must be 2000 characters or less' },
          { status: 400 }
        );
      }
      updateData.criteria = trimmedCriteria;
    }
    if (campaign_type_id !== undefined) {
      updateData.campaign_type_id = campaign_type_id;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
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

