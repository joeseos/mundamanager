'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CreateBattleModal from '@/components/battle-session/create-battle-modal';
import { statusColors, formatBattleSessionDate } from '@/types/battle-session';
import type { BattleSession } from '@/types/battle-session';

export default function GangBattleSessions({
  sessions,
  gangId,
  gangName,
  campaignId,
}: {
  sessions: BattleSession[];
  gangId: string;
  gangName: string;
  campaignId?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredSessions = filter === 'active'
    ? sessions.filter((s) => s.status === 'active')
    : sessions;


  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold">Battle Sessions</h2>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-neutral-900 hover:bg-gray-800 text-white"
        >
          New
        </Button>
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
        <p className="py-12 text-center text-neutral-500">
          {filter === 'active'
            ? 'No active battles. Create one to get started.'
            : 'No battle sessions yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => router.push(`/gang/${gangId}/battle-session/${session.id}`)}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatBattleSessionDate(session.updated_at)}
                </span>
                <Badge className={statusColors[session.status]}>
                  {session.status}
                </Badge>
              </div>
              <span className="text-neutral-400">&rarr;</span>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateBattleModal
          gangId={gangId}
          gangName={gangName}
          campaignId={campaignId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
