import { createClient } from "@/utils/supabase/server";
import { BreadcrumbBar } from "@/components/breadcrumb-bar";

export default async function CampaignBattleSessionBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: campaignData }, { data: session }] = await Promise.all([
    supabase.from("campaigns").select("campaign_name").eq("id", id).maybeSingle(),
    supabase
      .from("battle_sessions")
      .select("created_at")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

  return (
    <BreadcrumbBar
      items={[
        { label: 'Campaigns', href: '/?tab=campaigns' },
        { label: campaignData?.campaign_name || 'Campaign', href: `/campaigns/${id}` },
        { label: `Battle Sessions - ${session?.created_at ? new Date(session.created_at).toISOString().slice(0, 10) : 'Battle Session'}` },
      ]}
    />
  );
}
