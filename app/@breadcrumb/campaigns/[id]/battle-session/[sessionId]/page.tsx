import { getBattleSessionCached } from "@/app/lib/battle-sessions/get-battle-session-data";
import { BattleSessionBreadcrumbLayout } from "@/app/@breadcrumb/gang/[id]/battle-session/[sessionId]/page";

export default async function CampaignBattleSessionBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  // Cached read; the session already carries its campaign_name, so no separate
  // campaign lookup is needed. A breadcrumb must never throw: degrade to
  // fallback labels on any error.
  const session = await getBattleSessionCached(sessionId).catch(() => null);

  return (
    <BattleSessionBreadcrumbLayout
      parentLinks={[
        { href: '/?tab=campaigns', label: 'Campaigns' },
        { href: `/campaigns/${id}`, label: session?.campaign_name || 'Campaign' },
      ]}
      sessionDate={session?.created_at ? new Date(session.created_at).toISOString().slice(0, 10) : null}
    />
  );
}
