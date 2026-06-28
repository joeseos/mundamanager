'use client';

import BattleSessionsList from '@/components/gang/battle-sessions-tab';
import type { BattleSession } from '@/types/battle-session';

export default function CampaignBattleSessions({
  sessions,
  campaignId,
  userId,
  canAdd,
}: {
  sessions: BattleSession[];
  campaignId: string;
  userId?: string;
  canAdd?: boolean;
}) {
  return (
    <BattleSessionsList
      sessions={sessions}
      campaignId={campaignId}
      canAdd={canAdd}
      userId={userId}
      variant="table"
      sessionUrl={(id) => `/campaigns/${campaignId}/battle-session/${id}`}
      wrapper={(children) => <div className="mb-6">{children}</div>}
    />
  );
}
