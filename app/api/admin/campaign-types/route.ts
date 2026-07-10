import { TAGS } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";

export async function GET() {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: campaignTypes, error } = await supabase
      .from('campaign_types')
      .select('id, campaign_type_name, image_url, trading_posts, campaign_type_resources(id, resource_name)')
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

async function _POST(request: Request) {
  const supabase = await createClient();
  
  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { campaign_type_name, image_url, trading_posts, resources } = body;

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

    if (trading_posts !== undefined && trading_posts !== null && !Array.isArray(trading_posts)) {
      return NextResponse.json(
        { error: 'trading_posts must be an array or null' },
        { status: 400 }
      );
    }

    if (Array.isArray(trading_posts) && trading_posts.length > 0) {
      const { data: validIds } = await supabase
        .from('trading_post_types')
        .select('id')
        .in('id', trading_posts);
      if (!validIds || validIds.length !== trading_posts.length) {
        return NextResponse.json(
          { error: 'One or more trading_posts IDs are invalid' },
          { status: 400 }
        );
      }
    }

    const { data: campaignType, error } = await supabase
      .from('campaign_types')
      .insert([{
        campaign_type_name: campaign_type_name.trim(),
        image_url: image_url?.trim() || null,
        trading_posts: trading_posts ?? null
      }])
      .select()
      .single();

    if (error) throw error;

    // Insert initial resources if provided
    if (Array.isArray(resources) && resources.length > 0 && campaignType) {
      const newNames: string[] = resources.map((r: string) => r.trim()).filter(Boolean);
      if (newNames.length > 0) {
        const { error: resourceError } = await supabase
          .from('campaign_type_resources')
          .insert(newNames.map(resource_name => ({ campaign_type_id: campaignType.id, resource_name })));
        if (resourceError) throw resourceError;
      }
    }

    return NextResponse.json(campaignType);
  } catch (error) {
    console.error('Error creating campaign type:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign type' },
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
    const { id, campaign_type_name, image_url, trading_posts, resources } = body;

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
    if (trading_posts !== undefined) {
      if (trading_posts !== null && !Array.isArray(trading_posts)) {
        return NextResponse.json(
          { error: 'trading_posts must be an array or null' },
          { status: 400 }
        );
      }
      if (Array.isArray(trading_posts) && trading_posts.length > 0) {
        const { data: validIds } = await supabase
          .from('trading_post_types')
          .select('id')
          .in('id', trading_posts);
        if (!validIds || validIds.length !== trading_posts.length) {
          return NextResponse.json(
            { error: 'One or more trading_posts IDs are invalid' },
            { status: 400 }
          );
        }
      }
      updateData.trading_posts = trading_posts;
    }

    if (Object.keys(updateData).length === 0 && resources === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('campaign_types')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
    }

    // Sync campaign_type_resources if provided
    if (Array.isArray(resources)) {
      const newNames: string[] = resources.map((r: string) => r.trim()).filter(Boolean);

      const { data: existing } = await supabase
        .from('campaign_type_resources')
        .select('id, resource_name')
        .eq('campaign_type_id', id);

      const existingRows = existing ?? [];
      const existingNames = existingRows.map(r => r.resource_name);

      const toDelete = existingRows.filter(r => !newNames.includes(r.resource_name)).map(r => r.id);
      const toInsert = newNames.filter(name => !existingNames.includes(name));

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('campaign_type_resources')
          .delete()
          .in('id', toDelete);
        if (error) throw error;
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('campaign_type_resources')
          .insert(toInsert.map(resource_name => ({ campaign_type_id: id, resource_name })));
        if (error) throw error;
      }
    }

    const { data: updatedCampaignType, error: fetchError } = await supabase
      .from('campaign_types')
      .select('id, campaign_type_name, image_url, trading_posts, campaign_type_resources(id, resource_name)')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    return NextResponse.json(updatedCampaignType);
  } catch (error) {
    console.error('Error updating campaign type:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign type' },
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
      revalidateTag(TAGS.campaignTypes(), { expire: 0 });
    }
    return response;
  };
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
