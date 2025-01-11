"use client"

import React, { useState } from 'react';
import Campaign from "@/components/campaign";
import MemberSearch from "@/components/campaign-member-search";

interface CampaignPageContentProps {
  campaignData: {
    id: string;
    campaign_name: string;
    campaign_type_id: string;
    campaign_type_name: string;
    status: string | null;
    created_at: string;
    updated_at: string | null;
    members: any[];
  };
}

export default function CampaignPageContent({ campaignData }: CampaignPageContentProps) {
  const [isAdmin, setIsAdmin] = useState(false);

  const transformedData = React.useMemo(() => ({
    id: campaignData.id,
    campaign_name: campaignData.campaign_name,
    campaign_type: campaignData.campaign_type_name,
    created_at: campaignData.created_at,
    updated_at: campaignData.updated_at
  }), [campaignData]);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <Campaign {...transformedData} onAdminStatusChange={setIsAdmin} />
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h2 className="text-xl font-semibold mb-4">Campaign Members</h2>
          <MemberSearch campaignId={campaignData.id} isAdmin={isAdmin} />
        </div>
      </div>
    </main>
  );
} 