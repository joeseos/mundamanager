import { BreadcrumbBar } from "@/components/breadcrumb-bar";
import { createClient } from "@/utils/supabase/server";

export default async function BattleSessionBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: gangData }, { data: session }] = await Promise.all([
    supabase.from("gangs").select("name").eq("id", id).maybeSingle(),
    supabase
      .from("battle_sessions")
      .select("created_at")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

  return (
    <BreadcrumbBar
      items={[
        { label: gangData?.name || 'Gang', href: `/gang/${id}` },
        { label: `Battle Sessions - ${session?.created_at ? new Date(session.created_at).toISOString().slice(0, 10) : 'Battle Session'}` },
      ]}
    />
  );
}
