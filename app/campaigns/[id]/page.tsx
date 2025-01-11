import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CampaignPageContent from "@/components/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaign-error-boundary";

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

    return (
      <CampaignErrorBoundary>
        <CampaignPageContent campaignData={campaignData} />
      </CampaignErrorBoundary>
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