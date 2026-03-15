'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { BattleSessionFull } from '@/types/battle-session';
import { getBattleSession } from '@/app/actions/battle-sessions';

export function useBattleSession(sessionId: string) {
  const [session, setSession] = useState<BattleSessionFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);
  const gangChannelRef = useRef<any>(null);
  const supabaseRef = useRef<any>(null);

  const fetchSession = useCallback(async () => {
    try {
      const data = await getBattleSession(sessionId);
      setSession(data);
    } catch (err) {
      console.error('Error fetching battle session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Realtime subscription
  useEffect(() => {
    let mounted = true;

    const setupRealtime = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        supabaseRef.current = supabase;

        const handleChange = () => {
          if (mounted) fetchSession();
        };

        const channel = supabase
          .channel(`battle-session-${sessionId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'battle_sessions',
              filter: `id=eq.${sessionId}`,
            },
            handleChange
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'battle_session_participants',
              filter: `battle_session_id=eq.${sessionId}`,
            },
            handleChange
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'battle_session_fighters',
              filter: `battle_session_id=eq.${sessionId}`,
            },
            handleChange
          )
          .subscribe();

        channelRef.current = channel;
      } catch (err) {
        console.error('Error setting up battle session realtime:', err);
      }
    };

    setupRealtime();

    return () => {
      mounted = false;
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, fetchSession]);

  // Subscribe to rating changes on each participant's gang so the live
  // rating difference updates when fighters are added/removed outside the session.
  const gangIdsKey = session?.participants.map((p) => p.gang_id).join(',') ?? '';

  useEffect(() => {
    if (!gangIdsKey) return;

    let mounted = true;

    const setupGangSubs = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();

        // Tear down previous channel before building a new one
        if (gangChannelRef.current) {
          await supabase.removeChannel(gangChannelRef.current);
          gangChannelRef.current = null;
        }

        const ids = gangIdsKey.split(',').filter(Boolean);
        if (ids.length === 0 || !mounted) return;

        let channel = supabase.channel(`gang-ratings-${sessionId}`);
        for (const gangId of ids) {
          channel = channel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'gangs', filter: `id=eq.${gangId}` },
            () => { if (mounted) fetchSession(); }
          );
        }
        gangChannelRef.current = channel.subscribe();
      } catch (err) {
        console.error('Error setting up gang realtime:', err);
      }
    };

    setupGangSubs();

    return () => {
      mounted = false;
      if (gangChannelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(gangChannelRef.current);
        gangChannelRef.current = null;
      }
    };
  }, [gangIdsKey, sessionId, fetchSession]);

  return { session, isLoading, refetch: fetchSession };
}
