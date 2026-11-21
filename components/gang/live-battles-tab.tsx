'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { CampaignGang } from '@/components/live-battle/create-battle-modal';
import { statusLabels, formatLiveBattleDate, liveBattleScenarioLabel } from '@/types/live-battle';
import type { LiveBattle } from '@/types/live-battle';

const CreateBattleModal = dynamic(() => import('@/components/live-battle/create-battle-modal'), { ssr: false });

interface LiveBattlesListProps {
  liveBattles: LiveBattle[];
  gangId?: string;
  gangName?: string;
  campaignId?: string;
  canAdd?: boolean;
  userId?: string;
  campaignGangs?: CampaignGang[];
  /** Edition of the gang starting the battle; scopes the opponent pickers. */
  editionSlug?: string | null;
  variant?: 'cards' | 'table';
  liveBattleUrl: (liveBattleId: string) => string;
  wrapper?: (children: ReactNode) => ReactNode;
  /** Sits inside another card: no card of its own, and a sub-header. */
  embedded?: boolean;
}

export default function LiveBattlesList({
  liveBattles,
  gangId,
  gangName,
  campaignId,
  canAdd,
  userId,
  campaignGangs,
  editionSlug,
  variant = 'cards',
  liveBattleUrl,
  wrapper,
  embedded = false,
}: LiveBattlesListProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const showAddButton = canAdd ?? !!(gangId && gangName);

  const filteredLiveBattles = filter === 'active'
    ? liveBattles.filter((s) => s.status !== 'completed')
    : liveBattles;

  const content = (
    <>
      <div className={`flex justify-between ${embedded ? 'mb-3 items-center' : 'mb-4 items-start'}`}>
        {embedded ? (
          <h3 className="text-lg font-bold">Live Battles</h3>
        ) : (
          <h2 className="text-xl md:text-2xl font-bold">Live Battles</h2>
        )}
        {showAddButton && (
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
          >
            Add
          </Button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('active')}
          className={`rounded-full px-3 py-1 text-sm ${
            filter === 'active'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-sm ${
            filter === 'all'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          All
        </button>
      </div>

      {filteredLiveBattles.length === 0 ? (
        <p className="py-8 text-center text-neutral-500">
          {filter === 'active'
            ? 'No active live battles.'
            : 'No live battles yet.'}
        </p>
      ) : variant === 'table' ? (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="p-1 md:p-2 text-left font-medium">Date</th>
                <th className="p-1 md:p-2 text-left font-medium">Scenario</th>
                <th className="p-1 md:p-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLiveBattles.map((liveBattle) => (
                <tr
                  key={liveBattle.id}
                  onClick={() => router.push(liveBattleUrl(liveBattle.id))}
                  className="border-b cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <td className="p-1 md:p-2">{formatLiveBattleDate(liveBattle.updated_at)}</td>
                  <td className="p-1 md:p-2">{liveBattleScenarioLabel(liveBattle) || '-'}</td>
                  <td className="p-1 md:p-2 text-sm">
                    {statusLabels[liveBattle.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLiveBattles.map((liveBattle) => (
            <button
              key={liveBattle.id}
              onClick={() => router.push(liveBattleUrl(liveBattle.id))}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatLiveBattleDate(liveBattle.updated_at)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {statusLabels[liveBattle.status]}
                </span>
              </div>
              <span className="text-neutral-400">&rarr;</span>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && showAddButton && (
        <CreateBattleModal
          gangId={gangId}
          gangName={gangName}
          userId={userId}
          campaignId={campaignId}
          campaignGangs={campaignGangs}
          editionSlug={editionSlug}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );

  if (embedded) return content;

  return wrapper ? <>{wrapper(content)}</> : (
    <div className="bg-card shadow-md rounded-lg p-4">{content}</div>
  );
}
