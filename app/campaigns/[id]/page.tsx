import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CampaignPageContent from "@/components/campaign/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaign/campaign-error-boundary";

export default async function CampaignPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .rpc('get_campaign_details', {
        campaign_id: params.id
      });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    const [campaignData] = data || [];
    
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