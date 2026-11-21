import { renderLiveBattlePage } from '@/app/gang/[id]/live-battle/[sessionId]/page';

export default async function CampaignLiveBattlePage(props: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const params = await props.params;
  return renderLiveBattlePage(params.sessionId, `/campaigns/${params.id}/live-battle/${params.sessionId}`);
}
