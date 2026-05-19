'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CreateBattleModal from '@/components/battle-session/create-battle-modal';
import { statusColors, formatBattleSessionDate } from '@/types/battle-session';
import type { BattleSession } from '@/types/battle-session';

export default function CampaignBattleSessions({
  sessions,
  campaignId,
  userGangId,
  gangName,
}: {
  sessions: BattleSession[];
  campaignId: string;
  userGangId: string | undefined;
  gangName: string | undefined;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredSessions = filter === 'active'
    ? sessions.filter((s) => s.status === 'pre_battle' || s.status === 'active')
    : sessions;


  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold">Battle Sessions</h2>
        {userGangId && (
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
      ) : (
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
                  onClick={() => router.push(`/campaigns/${campaignId}/battle-session/${session.id}`)}
                  className="border-b cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <td className="p-1 md:p-2">{formatBattleSessionDate(session.updated_at)}</td>
                  <td className="p-1 md:p-2">{session.scenario || '-'}</td>
                  <td className="p-1 md:p-2">
                    <Badge className={statusColors[session.status]}>
                      {session.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && userGangId && gangName && (
        <CreateBattleModal
          gangId={userGangId}
          gangName={gangName}
          campaignId={campaignId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
