'use client';

import Link from 'next/link';
import type { BattleSessionFull } from '@/types/battle-session';
import { getSessionWinnerIds } from '@/utils/battle-winners';

interface CompletedSessionProps {
  session: BattleSessionFull;
  userId: string;
}

export default function CompletedSession({
  session,
  userId,
}: CompletedSessionProps) {
  // Multi-winner aware: derive every flagged winner from the participants list,
  // falling back to the legacy winner_gang_id for historical sessions.
  const winnerIds = getSessionWinnerIds(session);
  const winnerSet = new Set(winnerIds);
  const winnerParticipants = session.participants.filter((p) =>
    winnerSet.has(p.gang_id)
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

      {/* Winner / Winners */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-800">
        {winnerParticipants.length === 0 ? (
          <p className="text-lg font-medium text-neutral-500">Draw</p>
        ) : winnerParticipants.length === 1 ? (
          <p className="text-lg font-medium">
            <span className="text-neutral-500">Winner </span>
            {winnerParticipants[0].gang?.name}
          </p>
        ) : (
          <div className="text-lg font-medium">
            <p className="text-neutral-500">Winners</p>
            <ul className="mt-1 space-y-0.5">
              {winnerParticipants.map((w) => (
                <li key={w.id}>{w.gang?.name}</li>
              ))}
            </ul>
          </div>
        )}
        {session.claimed_territory && (
          <p className="mt-1 text-sm text-neutral-500">
            Claimed Territory: <span className="font-medium text-foreground">{session.claimed_territory}</span>
          </p>
        )}
      </div>

      {/* Results per gang */}
      <div className="mb-6 space-y-4">
        {session.participants.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
          >
            <div className="mb-2 flex items-center gap-2">
              {winnerSet.has(p.gang_id) && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                  Winner
                </span>
              )}
              <span className="font-semibold">{p.gang?.name}</span>
              <span className="text-sm text-neutral-500">
                {p.profile?.username}
              </span>
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
                    {(f.session_record?.xp_earned ?? 0) > 0 && (
                      <span className="text-neutral-500">
                        +{f.session_record.xp_earned} XP
                      </span>
                    )}
                    {(f.session_record?.injuries ?? []).map((injury: { effect_name: string }, idx: number) => (
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
          href={`/gang/${session.participants.find((p) => p.user_id === userId)?.gang_id || ''}`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Back to Gang
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
