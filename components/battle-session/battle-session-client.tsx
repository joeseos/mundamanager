'use client';

import React from 'react';
import { useBattleSession } from '@/hooks/use-battle-session';
import ActiveSession from './active-session';
import ReviewSession from './review-session';
import ConfirmedSession from './confirmed-session';
import type { BattleSessionFull } from '@/types/battle-session';
import type { Scenario } from '@/types/campaign';

interface BattleSessionClientProps {
  initialSession: BattleSessionFull;
  userId: string;
  userGangs: { id: string; name: string; rating: number }[];
  campaignGangs: { gang_id: string; user_id: string }[];
  scenarios: Scenario[];
}

export default function BattleSessionClient({
  initialSession,
  userId,
  userGangs,
  campaignGangs,
  scenarios,
}: BattleSessionClientProps) {
  const { session, isLoading, refetch } = useBattleSession(initialSession.id);

  // Use realtime session if available, fall back to initial
  const currentSession = session || initialSession;

  let content: React.ReactNode;

  if (currentSession.status === 'confirmed') {
    content = <ConfirmedSession session={currentSession} userId={userId} />;
  } else if (currentSession.status === 'review') {
    content = (
      <ReviewSession
        session={currentSession}
        userId={userId}
      />
    );
  } else {
    // status === 'active'
    content = (
      <ActiveSession
        session={currentSession}
        userId={userId}
        userGangs={userGangs}
        campaignGangs={campaignGangs}
        scenarios={scenarios}
        refetch={refetch}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-5xl w-full space-y-4">
        {content}
      </div>
    </main>
  );
}
