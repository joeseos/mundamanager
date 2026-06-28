'use client';

import BattleSessionsList from '@/components/gang/battle-sessions-tab';
import type { BattleSession } from '@/types/battle-session';
import type { CampaignGang } from '@/components/battle-session/create-battle-modal';

export default function CampaignBattleSessions({
  sessions,
  campaignId,
  userId,
  canAdd,
  campaignGangs,
}: {
  sessions: BattleSession[];
  campaignId: string;
  userId?: string;
  canAdd?: boolean;
  campaignGangs?: CampaignGang[];
}) {
  return (
    <BattleSessionsList
      sessions={sessions}
      campaignId={campaignId}
      canAdd={canAdd}
      userId={userId}
      campaignGangs={campaignGangs}
      variant="table"
      sessionUrl={(id) => `/campaigns/${campaignId}/battle-session/${id}`}
      wrapper={(children) => <div className="mb-6">{children}</div>}
    />
  );
}
