'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import type { NotificationType } from '@/utils/notifications';

// How long a tab can stay hidden before it drops its realtime channel. With no
// channels left the Supabase client closes the tab's WebSocket, which is what
// counts towards the project's concurrent Realtime connection quota.
const HIDDEN_UNSUBSCRIBE_DELAY_MS = 30_000;

// How often to retry subscribing while the socket is still closing.
const SOCKET_CLOSING_RETRY_MS = 250;

// Change events come in bursts (marking several notifications as read sends one
// UPDATE per row), so they are coalesced into one refetch.
const CHANGE_REFETCH_DEBOUNCE_MS = 300;

export type Notification = {
  id: string;
  text: string;
  type: NotificationType;
  created_at: string;
  dismissed: boolean;
  link: string | null;
  sender_id: string;
};

export const notificationsQueryKey = (userId: string) => ['notifications', userId] as const;

// Counts list fetches, so a mutation can tell whether one started while its
// write was in flight and may have read the rows from before it.
let fetchesStarted = 0;

async function fetchNotifications(userId: string, signal: AbortSignal): Promise<Notification[]> {
  fetchesStarted++;
  const { data, error } = await createClient()
    .from('notifications')
    .select('id, text, dismissed, type, created_at, link, sender_id')
    .eq('receiver_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    .abortSignal(signal);

  if (error) throw error;
  return data as Notification[];
}

const notificationsQueryOptions = (userId: string) => ({
  queryKey: notificationsQueryKey(userId),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchNotifications(userId, signal),
  // Realtime keeps the list current while the header is subscribed; a fresh
  // mount (page load, opening /account) still fetches.
  staleTime: 0,
});

export function useNotifications(userId: string) {
  return useQuery(notificationsQueryOptions(userId));
}

export function useUnreadNotificationCount(userId: string) {
  const { data } = useQuery({
    ...notificationsQueryOptions(userId),
    select: (notifications: Notification[]) => notifications.filter(n => !n.dismissed).length,
  });
  return data ?? 0;
}

// Applies a change to the cached list straight away. Fetches still in flight
// are cancelled, since they may have read the rows from before the change.
// After the write, the list is refetched only if another fetch started while
// the write was in flight; otherwise the optimistic list is already current.
function useOptimisticNotificationsMutation<TVariables>(
  userId: string,
  write: (variables: TVariables) => Promise<void>,
  apply: (notifications: Notification[], variables: TVariables) => Notification[]
) {
  const queryClient = useQueryClient();
  const queryKey = notificationsQueryKey(userId);

  const refetchIfFetchedDuringWrite = (fetchesAtStart: number) => {
    if (fetchesStarted !== fetchesAtStart) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  return useMutation({
    mutationFn: write,
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Notification[]>(queryKey);
      queryClient.setQueryData<Notification[]>(queryKey, old => old && apply(old, variables));
      return { previous, fetchesAtStart: fetchesStarted };
    },
    onError: (error, _variables, context) => {
      console.error('Error updating notifications:', error);
      if (!context) return;
      queryClient.setQueryData(queryKey, context.previous);
      refetchIfFetchedDuringWrite(context.fetchesAtStart);
    },
    onSuccess: (_data, _variables, context) => {
      if (context) refetchIfFetchedDuringWrite(context.fetchesAtStart);
    },
  });
}

export function useMarkNotificationsRead(userId: string) {
  return useOptimisticNotificationsMutation<string[]>(
    userId,
    async ids => {
      const { error } = await createClient()
        .from('notifications')
        .update({ dismissed: true })
        .in('id', ids);
      if (error) throw error;
    },
    (notifications, ids) =>
      notifications.map(n => (ids.includes(n.id) && !n.dismissed ? { ...n, dismissed: true } : n))
  );
}

export function useDeleteNotification(userId: string) {
  return useOptimisticNotificationsMutation<string>(
    userId,
    async id => {
      const response = await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(
        error => {
          console.error('Error deleting notification via API:', error);
          return null;
        }
      );
      if (response?.ok) return;
      if (response) {
        console.error(`Error deleting notification via API: status ${response.status}`);
      }

      // Fallback to direct Supabase delete if the API fails
      const { error } = await createClient().from('notifications').delete().eq('id', id);
      if (error) throw error;
    },
    (notifications, id) => notifications.filter(n => n.id !== id)
  );
}

// Keeps the notifications query current with a realtime subscription while the
// tab is visible. A hidden tab drops it after a grace period and subscribes
// again once visible.
export function useNotificationsRealtime(userId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const queryKey = notificationsQueryKey(userId);

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    // Changes made while the channel was not joined are not replayed, so every
    // join refetches the list, except one straight after the initial fetch.
    // A tab opened in the background joins later, after that fetch has gone stale.
    let refetchOnJoin = document.visibilityState !== 'visible';

    const refetch = () => queryClient.invalidateQueries({ queryKey });

    // Every time a notification is inserted or updated
    // we'll refetch the whole list to ensure sync
    const handleNotificationChange = () => {
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(refetch, CHANGE_REFETCH_DEBOUNCE_MS);
    };

    const subscribe = () => {
      if (cancelled || channel || document.visibilityState !== 'visible') return;

      // Right after its last channel is removed the socket may still be
      // closing, and connect() is a no-op until it has closed.
      if (supabase.realtime.isDisconnecting()) {
        retryTimer = setTimeout(subscribe, SOCKET_CLOSING_RETRY_MS);
        return;
      }

      try {
        channel = supabase
          // A fresh topic each time: removeChannel completes asynchronously, and
          // until then channel() would return the leaving channel.
          .channel(`notifications-changes-${Math.random().toString(36).slice(2)}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `receiver_id=eq.${userId}`,
            },
            handleNotificationChange
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'notifications',
              filter: `receiver_id=eq.${userId}`,
            },
            handleNotificationChange
          )
          .subscribe(status => {
            if (status !== 'SUBSCRIBED') return;
            if (refetchOnJoin) refetch();
            refetchOnJoin = true;
          });
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
      }
    };

    const unsubscribe = () => {
      if (!channel) return;

      supabase.removeChannel(channel);
      channel = null;
    };

    const handleVisibilityChange = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      if (document.visibilityState === 'hidden') {
        hideTimer = setTimeout(unsubscribe, HIDDEN_UNSUBSCRIBE_DELAY_MS);
      } else if (!channel) {
        // Nothing refreshed the realtime token while the socket was closed, and
        // a join with an expired token is rejected.
        supabase.realtime.setAuth().then(subscribe, subscribe);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    subscribe();

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (changeTimer) clearTimeout(changeTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [userId, queryClient]);
}
