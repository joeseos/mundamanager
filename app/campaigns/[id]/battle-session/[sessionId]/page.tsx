import { renderBattleSessionPage } from '@/app/gang/[id]/battle-session/[sessionId]/page';

export default async function CampaignBattleSessionPage(props: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const params = await props.params;
  return renderBattleSessionPage(params.sessionId, `/campaigns/${params.id}/battle-session/${params.sessionId}`);
}
