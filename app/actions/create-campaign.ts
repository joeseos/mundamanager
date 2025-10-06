'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";

interface CreateCampaignParams {
  name: string;
  campaignTypeId: string;
}

type CreateCampaignResult =
  | { success: true; data: { id: string; campaign_name: string; campaign_type_id: string; created_at: string } }
  | { success: false; error: string };

export async function createCampaign({ name, campaignTypeId }: CreateCampaignParams): Promise<CreateCampaignResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: campaign, error: insertError } = await supabase
      .from('campaigns')
      .insert([
        {
          campaign_type_id: campaignTypeId,
          campaign_name: name.trimEnd(),
          status: 'Active',
        },
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    const { error: memberError } = await supabase
      .from('campaign_members')
      .insert([
        {
          campaign_id: campaign.id,
          user_id: user.id,
          role: 'OWNER',
          invited_by: user.id,
        },
      ]);

    if (memberError) {
      throw memberError;
    }

    return {
      success: true,
      data: {
        id: campaign.id,
        campaign_name: campaign.campaign_name,
        campaign_type_id: campaign.campaign_type_id,
        created_at: campaign.created_at,
      },
    };
  } catch (error) {
    console.error('Error in createCampaign server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}


