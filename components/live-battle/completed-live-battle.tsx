'use client';

import Link from 'next/link';
import { liveBattleScenarioLabel, type LiveBattleFull, type LiveBattleRecord } from '@/types/live-battle';
import { getLiveBattleWinnerIds } from '@/utils/battle-winners';

interface CompletedLiveBattleProps {
  liveBattle: LiveBattleFull;
  userId: string;
}

// Participation XP only counts once completion has added it.
const earnedXp = (record?: Partial<LiveBattleRecord>) =>
  (record?.xp_earned ?? 0) + (record?.participation_xp_awarded ? (record.participation_xp ?? 0) : 0);

export default function CompletedLiveBattle({
  liveBattle,
  userId,
}: CompletedLiveBattleProps) {
  // Multi-winner aware: derive every flagged winner from the participants list,
  // falling back to the legacy winner_gang_id for historical live battles.
  const winnerIds = getLiveBattleWinnerIds(liveBattle);
  const winnerSet = new Set(winnerIds);
  const winnerParticipants = liveBattle.participants.filter((p) =>
    winnerSet.has(p.gang_id)
  );

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Battle Complete</h1>
        <p className="mt-1 text-neutral-500">
          {liveBattleScenarioLabel(liveBattle) || 'Live Battle'}
        </p>
        {liveBattle.campaign_name && (
          <p className="text-sm text-neutral-400">{liveBattle.campaign_name}</p>
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
        {liveBattle.claimed_territory && (
          <p className="mt-1 text-sm text-neutral-500">
            Claimed Territory: <span className="font-medium text-foreground">{liveBattle.claimed_territory}</span>
          </p>
        )}
      </div>

      {/* Results per gang */}
      <div className="mb-6 space-y-4">
        {liveBattle.participants.map((p) => (
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
            <div className="mb-2 flex gap-4 flex-wrap text-sm">
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
              {(p.resource_changes ?? []).filter((r) => r.quantity_delta !== 0).map((r) => (
                <span key={r.resource_id}>
                  {r.resource_name}: {r.quantity_delta > 0 ? '+' : ''}{r.quantity_delta}
                </span>
              ))}
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
                      {f.fighter?.fighter_name ?? 'Unknown Fighter'}
                    </span>
                    {earnedXp(f.live_battle_record) > 0 && (
                      <span className="text-neutral-500">
                        +{earnedXp(f.live_battle_record)} XP
                      </span>
                    )}
                    {(f.live_battle_record?.injuries ?? []).map((injury: { effect_name: string }, idx: number) => (
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
                prefetch={false}
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
          href={`/gang/${liveBattle.participants.find((p) => p.user_id === userId)?.gang_id || ''}`}
          prefetch={false}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Back to Gang
        </Link>
        {liveBattle.campaign_id && (
          <Link
            href={`/campaigns/${liveBattle.campaign_id}`}
            prefetch={false}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            View Campaign
          </Link>
        )}
      </div>
    </div>
  );
}
