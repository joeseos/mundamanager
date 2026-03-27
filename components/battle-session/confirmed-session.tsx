'use client';

import Link from 'next/link';
import type { BattleSessionFull } from '@/types/battle-session';

interface ConfirmedSessionProps {
  session: BattleSessionFull;
  userId: string;
}

export default function ConfirmedSession({
  session,
  userId,
}: ConfirmedSessionProps) {
  const winner = session.participants.find(
    (p) => p.gang_id === session.winner_gang_id
  );

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Battle Complete</h1>
        <p className="mt-1 text-neutral-500">
          {session.scenario || 'Battle Session'}
        </p>
        {session.campaign_name && (
          <p className="text-sm text-neutral-400">{session.campaign_name}</p>
        )}
      </div>

      {/* Winner */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-800">
        {winner ? (
          <>
            <p className="text-sm text-neutral-500">Winner</p>
            <p className="text-xl font-bold">{winner.gang?.name}</p>
            <p className="text-sm text-neutral-500">
              {winner.profile?.username}
            </p>
          </>
        ) : (
          <p className="text-lg font-medium text-neutral-500">Draw</p>
        )}
      </div>

      {/* Results per gang */}
      <div className="mb-6 space-y-4">
        {session.participants.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="font-semibold">{p.gang?.name}</span>
                <span className="ml-2 text-sm text-neutral-500">
                  {p.profile?.username}
                </span>
              </div>
              {p.gang_id === session.winner_gang_id && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                  Winner
                </span>
              )}
            </div>

            {/* Gang-level results */}
            <div className="mb-2 flex gap-4 text-sm">
              {p.credits_earned !== 0 && (
                <span>
                  Credits: {p.credits_earned > 0 ? '+' : ''}
                  {p.credits_earned}
                </span>
              )}
              {p.reputation_change !== 0 && (
                <span>
                  Reputation: {p.reputation_change > 0 ? '+' : ''}
                  {p.reputation_change}
                </span>
              )}
            </div>

            {/* Fighter results */}
            {p.fighters.length > 0 && (
              <div className="space-y-1">
                {p.fighters.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="font-medium">
                      {f.fighter?.fighter_name}
                    </span>
                    {f.xp_earned > 0 && (
                      <span className="text-neutral-500">
                        +{f.xp_earned} XP
                      </span>
                    )}
                    {f.out_of_action && (
                      <span className="text-red-500">OOA</span>
                    )}
                    {f.pending_injuries?.map((injury, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      >
                        {injury.effect_name}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Link to gang */}
            {p.user_id === userId && (
              <Link
                href={`/gang/${p.gang_id}`}
                className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                View Gang
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Links */}
      <div className="flex justify-center gap-4">
        <Link
          href="/battle-session"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Back to Battle Sessions
        </Link>
        {session.campaign_id && (
          <Link
            href={`/campaigns/${session.campaign_id}`}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            View Campaign
          </Link>
        )}
      </div>
    </div>
  );
}
