'use client';

import { useEffect, useMemo } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
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
const deleteMutationKey = (userId: string) => ['notifications', userId, 'delete'] as const;
const markReadMutationKey = (userId: string) => ['notifications', userId, 'mark-read'] as const;

const NO_NOTIFICATIONS: Notification[] = [];

async function fetchNotifications(userId: string, signal: AbortSignal): Promise<Notification[]> {
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

// The notifications as the user should see them: the cached list with the
// deletes and mark-as-reads that are still being written applied on top.
// Keeping pending changes out of the cache means a fetch that lands mid-write
// can't undo them, and a write that fails simply drops out.
export function useNotifications(userId: string) {
  const { data, refetch } = useQuery({
    queryKey: notificationsQueryKey(userId),
    queryFn: ({ signal }) => fetchNotifications(userId, signal),
  });
  const pendingDeletes = useMutationState({
    filters: { mutationKey: deleteMutationKey(userId), status: 'pending' },
    select: mutation => mutation.state.variables as string,
  });
  const pendingReads = useMutationState({
    filters: { mutationKey: markReadMutationKey(userId), status: 'pending' },
    select: mutation => mutation.state.variables as string[],
  });

  const notifications = useMemo(() => {
    if (!data) return NO_NOTIFICATIONS;
    if (pendingDeletes.length === 0 && pendingReads.length === 0) return data;

    const deleted = new Set(pendingDeletes);
    const read = new Set(pendingReads.flat());
    return data
      .filter(n => !deleted.has(n.id))
      .map(n => (read.has(n.id) && !n.dismissed ? { ...n, dismissed: true } : n));
  }, [data, pendingDeletes, pendingReads]);

  return { notifications, refetch };
}

export function useUnreadNotificationCount(userId: string) {
  const { notifications } = useNotifications(userId);
  return useMemo(() => notifications.filter(n => !n.dismissed).length, [notifications]);
}

// A write that useNotifications shows straight away while it is pending. Once
// it succeeds, the cached list is updated to match. A fetch still running at
// that point may have read the rows from before the write and would overwrite
// that, so it is restarted.
function useNotificationsMutation<TVariables>(
  userId: string,
  mutationKey: readonly unknown[],
  write: (variables: TVariables) => Promise<void>,
  apply: (notifications: Notification[], variables: TVariables) => Notification[]
) {
  const queryClient = useQueryClient();
  const queryKey = notificationsQueryKey(userId);

  return useMutation({
    mutationKey,
    mutationFn: write,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<Notification[]>(queryKey, old => old && apply(old, variables));
      if (queryClient.isFetching({ queryKey }) > 0) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: error => {
      console.error('Error updating notifications:', error);
    },
  });
}

export function useMarkNotificationsRead(userId: string) {
  return useNotificationsMutation<string[]>(
    userId,
    markReadMutationKey(userId),
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
  return useNotificationsMutation<string>(
    userId,
    deleteMutationKey(userId),
    async id => {
      const response = await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(
        error => {
          console.error('Error deleting notification via API:', error);
          return null;
        }
      );
      // A 404 means it is already gone, e.g. removed by the server action that answered it
      if (response?.ok || response?.status === 404) return;
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
