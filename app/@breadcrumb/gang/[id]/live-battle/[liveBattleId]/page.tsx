import { BreadcrumbBar } from "@/components/breadcrumb-bar";
import { createClient } from "@/utils/supabase/server";

export default async function LiveBattleBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; liveBattleId: string }>;
}) {
  const { id, liveBattleId } = await params;
  const supabase = await createClient();

  const [{ data: gangData }, { data: liveBattle }] = await Promise.all([
    supabase.from("gangs").select("name").eq("id", id).maybeSingle(),
    supabase
      .from("live_battles")
      .select("created_at")
      .eq("id", liveBattleId)
      .maybeSingle(),
  ]);

  return (
    <BreadcrumbBar
      items={[
        { label: gangData?.name || 'Gang', href: `/gang/${id}` },
        { label: `Live Battles - ${liveBattle?.created_at ? new Date(liveBattle.created_at).toISOString().slice(0, 10) : 'Live Battle'}` },
      ]}
    />
  );
}
