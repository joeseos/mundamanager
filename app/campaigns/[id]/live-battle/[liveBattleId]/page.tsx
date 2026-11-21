import { renderLiveBattlePage } from '@/app/gang/[id]/live-battle/[liveBattleId]/page';

export default async function CampaignLiveBattlePage(props: {
  params: Promise<{ id: string; liveBattleId: string }>;
}) {
  const params = await props.params;
  return renderLiveBattlePage(params.liveBattleId, `/campaigns/${params.id}/live-battle/${params.liveBattleId}`);
}
