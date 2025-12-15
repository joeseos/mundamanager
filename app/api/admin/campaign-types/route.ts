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

    if (campaign_type_name.trim().length > 200) {
      return NextResponse.json(
        { error: 'campaign_type_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    // Validate image_url format if provided
    if (image_url && image_url.trim()) {
      try {
        new URL(image_url.trim());
      } catch {
        return NextResponse.json(
          { error: 'image_url must be a valid URL' },
          { status: 400 }
        );
      }
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
      const trimmedName = campaign_type_name.trim();
      if (trimmedName.length > 200) {
        return NextResponse.json(
          { error: 'campaign_type_name must be 200 characters or less' },
          { status: 400 }
        );
      }
      updateData.campaign_type_name = trimmedName;
    }
    if (image_url !== undefined) {
      const trimmedUrl = image_url?.trim() || null;
      if (trimmedUrl) {
        try {
          new URL(trimmedUrl);
        } catch {
          return NextResponse.json(
            { error: 'image_url must be a valid URL' },
            { status: 400 }
          );
        }
      }
      updateData.image_url = trimmedUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
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

