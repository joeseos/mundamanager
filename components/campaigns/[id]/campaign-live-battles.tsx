'use client';

import LiveBattlesList from '@/components/gang/live-battles-tab';
import type { LiveBattle } from '@/types/live-battle';
import type { CampaignGang } from '@/components/live-battle/create-battle-modal';

export default function CampaignLiveBattles({
  sessions,
  campaignId,
  userId,
  canAdd,
  campaignGangs,
  editionSlug,
}: {
  sessions: LiveBattle[];
  campaignId: string;
  userId?: string;
  canAdd?: boolean;
  campaignGangs?: CampaignGang[];
  editionSlug?: string | null;
}) {
  return (
    <LiveBattlesList
      sessions={sessions}
      campaignId={campaignId}
      canAdd={canAdd}
      userId={userId}
      campaignGangs={campaignGangs}
      editionSlug={editionSlug}
      variant="table"
      sessionUrl={(id) => `/campaigns/${campaignId}/live-battle/${id}`}
      embedded
    />
  );
}
