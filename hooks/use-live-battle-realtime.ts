'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useLiveBattleRealtime(sessionId: string) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const suppressedRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const debouncedRefresh = () => {
      if (suppressedRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['live-battle', sessionId] });
      }, 300);
    };

    const dbChannel = supabase
      .channel(`live-battle-db-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_battles',
          filter: `id=eq.${sessionId}`,
        },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_battle_fighters',
          filter: `live_battle_id=eq.${sessionId}`,
        },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_battle_participants',
          filter: `live_battle_id=eq.${sessionId}`,
        },
        debouncedRefresh
      )
      .subscribe();

    const broadcastChannel = supabase
      .channel(`live-battle-sync-${sessionId}`)
      .on('broadcast', { event: 'refresh' }, debouncedRefresh)
      .subscribe();

    broadcastChannelRef.current = broadcastChannel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      broadcastChannelRef.current = null;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [sessionId, queryClient]);

  const broadcast = useCallback(() => {
    broadcastChannelRef.current?.httpSend('refresh', {});
  }, []);

  const suppressRefetch = useCallback(() => {
    suppressedRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressedRef.current = false;
    }, 2000);
  }, []);

  return { broadcast, suppressRefetch };
}
