'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createBattleSession } from '@/app/actions/battle-sessions';
import { Badge } from '@/components/ui/badge';
import type { BattleSession, BattleSessionStatus } from '@/types/battle-session';

const statusColors: Record<BattleSessionStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  cancelled: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
};

export default function BattleSessionHub({
  sessions,
  userId,
}: {
  sessions: BattleSession[];
  userId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const createMutation = useMutation({
    mutationFn: () => createBattleSession({}),
    onSuccess: (result) => {
      if (result.success && result.session_id) {
        router.push(`/battle-session/${result.session_id}`);
      } else {
        toast.error(result.error || 'Failed to create session');
      }
    },
    onError: () => toast.error('Failed to create battle session'),
  });

  const filteredSessions =
    filter === 'active'
      ? sessions.filter((s) => s.status === 'active' || s.status === 'review')
      : sessions;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-5xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Battle Sessions</h1>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {createMutation.isPending ? 'Creating...' : 'New Battle'}
            </button>
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
                  onClick={() => router.push(`/battle-session/${session.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {session.scenario || 'Untitled Battle'}
                      </span>
                      <Badge
                        className={statusColors[session.status]}
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatDate(session.updated_at)}
                    </p>
                  </div>
                  <span className="text-neutral-400">&rarr;</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
