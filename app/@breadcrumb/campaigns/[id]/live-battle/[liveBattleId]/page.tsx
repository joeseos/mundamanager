import { createClient } from "@/utils/supabase/server";
import { BreadcrumbBar } from "@/components/breadcrumb-bar";

export default async function CampaignLiveBattleBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; liveBattleId: string }>;
}) {
  const { id, liveBattleId } = await params;
  const supabase = await createClient();

  const [{ data: campaignData }, { data: liveBattle }] = await Promise.all([
    supabase.from("campaigns").select("campaign_name").eq("id", id).maybeSingle(),
    supabase
      .from("live_battles")
      .select("created_at")
      .eq("id", liveBattleId)
      .maybeSingle(),
  ]);

  return (
    <BreadcrumbBar
      items={[
        { label: 'Campaigns', href: '/?tab=campaigns' },
        { label: campaignData?.campaign_name || 'Campaign', href: `/campaigns/${id}` },
        { label: `Live Battles - ${liveBattle?.created_at ? new Date(liveBattle.created_at).toISOString().slice(0, 10) : 'Live Battle'}` },
      ]}
    />
  );
}
