'use client';

import BattleSessionsList from '@/components/gang/battle-sessions-tab';
import type { BattleSession } from '@/types/battle-session';

export default function CampaignBattleSessions({
  sessions,
  campaignId,
  userGangId,
  gangName,
  canAdd,
}: {
  sessions: BattleSession[];
  campaignId: string;
  userGangId: string | undefined;
  gangName: string | undefined;
  canAdd?: boolean;
}) {
  return (
    <BattleSessionsList
      sessions={sessions}
      gangId={userGangId}
      gangName={gangName}
      campaignId={campaignId}
      canAdd={canAdd}
      variant="table"
      sessionUrl={(id) => `/campaigns/${campaignId}/battle-session/${id}`}
      wrapper={(children) => <div className="mb-6">{children}</div>}
    />
  );
}
