import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CreateCampaign from '@/components/create-campaign'
import MyCampaigns from '@/components/my-campaigns'
import { CampaignsProvider } from '@/contexts/CampaignsContext'

export default async function CampaignsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <CampaignsProvider>
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <CreateCampaign />
          <MyCampaigns />
        </div>
      </main>
    </CampaignsProvider>
  )
} 