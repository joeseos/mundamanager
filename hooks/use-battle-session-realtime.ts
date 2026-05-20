'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useBattleSessionRealtime(sessionId: string) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const debouncedRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.refresh();
      }, 300);
    };

    const dbChannel = supabase
      .channel(`battle-session-db-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battle_sessions',
          filter: `id=eq.${sessionId}`,
        },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battle_session_fighters',
          filter: `battle_session_id=eq.${sessionId}`,
        },
        debouncedRefresh
      )
      .subscribe();

    const broadcastChannel = supabase
      .channel(`battle-session-sync-${sessionId}`)
      .on('broadcast', { event: 'refresh' }, debouncedRefresh)
      .subscribe();

    broadcastChannelRef.current = broadcastChannel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      broadcastChannelRef.current = null;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [sessionId, router]);

  const broadcast = useCallback(() => {
    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'refresh',
      payload: {},
    });
  }, []);

  return broadcast;
}
