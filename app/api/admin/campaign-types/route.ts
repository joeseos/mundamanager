import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: campaignTypes, error } = await supabase
      .from('campaign_types')
      .select('id, campaign_type_name, image_url')
      .order('campaign_type_name', { ascending: true });

    if (error) throw error;
    return NextResponse.json(campaignTypes);
  } catch (error) {
    console.error('Error fetching campaign types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign types' },
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
    const { campaign_type_name, image_url } = body;

    if (!campaign_type_name?.trim()) {
      return NextResponse.json(
        { error: 'campaign_type_name is required' },
        { status: 400 }
      );
    }

    const { data: campaignType, error } = await supabase
      .from('campaign_types')
      .insert([{
        campaign_type_name: campaign_type_name.trim(),
        image_url: image_url?.trim() || null
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(campaignType);
  } catch (error) {
    console.error('Error creating campaign type:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign type' },
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
    const { id, campaign_type_name, image_url } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (campaign_type_name !== undefined) {
      updateData.campaign_type_name = campaign_type_name.trim();
    }
    if (image_url !== undefined) {
      updateData.image_url = image_url?.trim() || null;
    }

    const { data: campaignType, error } = await supabase
      .from('campaign_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(campaignType);
  } catch (error) {
    console.error('Error updating campaign type:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign type' },
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
      .from('campaign_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign type:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign type' },
      { status: 500 }
    );
  }
}
