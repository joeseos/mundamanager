import React from 'react';
import Campaign from "@/components/campaign";
import MemberSearch from "@/components/member-search";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";

interface CampaignDetails {
  id: string;
  campaign_name: string;
  campaign_type_id: string;
  campaign_type_name: string;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  members: any[];
}

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  try {
    const response = await fetch(
      'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_campaign_details',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          "campaign_id": params.id
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch campaign details');
    }

    const [campaignData] = await response.json();
    
    if (!campaignData) {
      notFound();
    }

    const transformedData = {
      ...campaignData,
      campaign_type: campaignData.campaign_type_name
    };

    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <Campaign {...transformedData} />
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <h2 className="text-xl font-semibold mb-4">Campaign Members</h2>
            <MemberSearch campaignId={params.id} />
          </div>
        </div>
      </main>
    );
  } catch (error) {
    console.error('Error in CampaignPage:', error);
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <div className="text-red-500">Error loading campaign data</div>
        </div>
      </main>
    );
  }
} 