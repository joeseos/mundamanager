'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import CreateBattleModal from '@/components/battle-session/create-battle-modal';
import type { CampaignGang } from '@/components/battle-session/create-battle-modal';
import { statusLabels, formatBattleSessionDate } from '@/types/battle-session';
import type { BattleSession } from '@/types/battle-session';

interface BattleSessionsListProps {
  sessions: BattleSession[];
  gangId?: string;
  gangName?: string;
  campaignId?: string;
  canAdd?: boolean;
  userId?: string;
  campaignGangs?: CampaignGang[];
  variant?: 'cards' | 'table';
  sessionUrl: (sessionId: string) => string;
  wrapper?: (children: ReactNode) => ReactNode;
}

export default function BattleSessionsList({
  sessions,
  gangId,
  gangName,
  campaignId,
  canAdd,
  userId,
  campaignGangs,
  variant = 'cards',
  sessionUrl,
  wrapper,
}: BattleSessionsListProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const showAddButton = canAdd ?? !!(gangId && gangName);

  const filteredSessions = filter === 'active'
    ? sessions.filter((s) => s.status !== 'completed')
    : sessions;

  const content = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold">Battle Sessions</h2>
        {showAddButton && (
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
          >
            New
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

      {filteredSessions.length === 0 ? (
        <p className="py-8 text-center text-neutral-500">
          {filter === 'active'
            ? 'No active battle sessions.'
            : 'No battle sessions yet.'}
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
              {filteredSessions.map((session) => (
                <tr
                  key={session.id}
                  onClick={() => router.push(sessionUrl(session.id))}
                  className="border-b cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <td className="p-1 md:p-2">{formatBattleSessionDate(session.updated_at)}</td>
                  <td className="p-1 md:p-2">{session.scenario || '-'}</td>
                  <td className="p-1 md:p-2 text-sm">
                    {statusLabels[session.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => router.push(sessionUrl(session.id))}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatBattleSessionDate(session.updated_at)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {statusLabels[session.status]}
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
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );

  return wrapper ? <>{wrapper(content)}</> : (
    <div className="bg-card shadow-md rounded-lg p-4">{content}</div>
  );
}
