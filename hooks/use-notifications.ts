'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import type { NotificationType } from '@/utils/notifications';
import { NOTIFICATION_TOASTER_ID } from '@/utils/notification-toast';

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
  // Null when no user sent it, e.g. admin notifications
  sender_id: string | null;
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

const NOTIFICATIONS_HREF = '/account#notifications';
const NEW_NOTIFICATION_TOAST_MS = 8_000;

function viewNotifications(push: (href: string) => void) {
  if (window.location.pathname === '/account') {
    document.getElementById('notifications')?.scrollIntoView();
    return;
  }
  push(NOTIFICATIONS_HREF);
}

function showNewNotificationToast(count: number, onView: () => void) {
  toast.message(count === 1 ? 'You received a new notification' : `You received ${count} new notifications`, {
    toasterId: NOTIFICATION_TOASTER_ID,
    duration: NEW_NOTIFICATION_TOAST_MS,
    action: {
      label: 'View all notifications',
      onClick: onView,
    },
    classNames: {
      toast: 'flex-wrap',
      actionButton: 'mt-1 !ml-0 w-full basis-full justify-center !h-8 !px-3 !text-sm',
    },
  });
}

// Newest notification already accounted for in this browser, so a later visit can
// toast what arrived while the tab was closed or the user was signed out.
const toastCursorKey = (userId: string) => `notification-toast-cursor:${userId}`;

type ToastCursor = {
  createdAt: string;
  ids: string[]; // Notifications that share createdAt and have already been accounted for
};

function readToastCursor(userId: string): ToastCursor | null {
  try {
    const raw = localStorage.getItem(toastCursorKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ToastCursor;
    if (typeof parsed?.createdAt !== 'string' || !Array.isArray(parsed.ids)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToastCursor(userId: string, cursor: ToastCursor) {
  try {
    localStorage.setItem(toastCursorKey(userId), JSON.stringify(cursor));
  } catch {
    // Storage can be unavailable. Toasts for this visit still work.
  }
}

function cursorFromNotifications(notifications: Notification[]): ToastCursor | null {
  const createdAt = notifications.reduce(
    (newest, notification) => (notification.created_at > newest ? notification.created_at : newest),
    ''
  );
  if (!createdAt) return null;
  return {
    createdAt,
    ids: notifications.filter(notification => notification.created_at === createdAt).map(notification => notification.id),
  };
}

// Moves the cursor forward only through arrivals just announced. An empty list keeps
// the previous server cursor, and a row we did not announce cannot jump past it.
function settledCursor(stored: ToastCursor, announced: Notification[]): ToastCursor {
  let createdAt = stored.createdAt;
  let ids = stored.ids;
  for (const notification of announced) {
    if (notification.created_at > createdAt) {
      createdAt = notification.created_at;
      ids = [notification.id];
    } else if (notification.created_at === createdAt && !ids.includes(notification.id)) {
      ids = [...ids, notification.id];
    }
  }
  return { createdAt, ids };
}

function laterCursor(a: ToastCursor | null, b: ToastCursor | null): ToastCursor | null {
  if (!a) return b;
  if (!b) return a;
  if (a.createdAt > b.createdAt) return a;
  if (b.createdAt > a.createdAt) return b;
  return { createdAt: a.createdAt, ids: [...new Set([...a.ids, ...b.ids])] };
}

function cursorsEqual(a: ToastCursor, b: ToastCursor) {
  if (a.createdAt !== b.createdAt || a.ids.length !== b.ids.length) return false;
  return a.ids.every((id, index) => id === b.ids[index]);
}

function isUnseenArrival(notification: Notification, cursor: ToastCursor) {
  if (notification.dismissed) return false;
  if (notification.created_at > cursor.createdAt) return true;
  return notification.created_at === cursor.createdAt && !cursor.ids.includes(notification.id);
}

// Ids already toasted in this page session, so the header and the account page
// cannot each announce the same arrival.
const toastedIds = new Set<string>();

function claimArrivals(notifications: Notification[]): Notification[] {
  const fresh: Notification[] = [];
  for (const notification of notifications) {
    if (toastedIds.has(notification.id)) continue;
    toastedIds.add(notification.id);
    fresh.push(notification);
  }
  return fresh;
}

// Toasts when a notification arrives while the site is open, and on the next visit
// for any that arrived while this browser was closed or signed out. The first list
// this browser sees only sets the cursor, so an existing unread backlog is not
// announced as new. An older row that slides into the latest-20 window is not new.
export function useNotificationToasts(userId: string) {
  const { data, isSuccess } = useQuery({
    queryKey: notificationsQueryKey(userId),
    queryFn: ({ signal }) => fetchNotifications(userId, signal),
  });
  const router = useRouter();
  const cursorRef = useRef<ToastCursor | null>(null);
  const readyRef = useRef(false);
  const userIdRef = useRef(userId);

  if (userIdRef.current !== userId) {
    userIdRef.current = userId;
    cursorRef.current = null;
    readyRef.current = false;
  }

  useEffect(() => {
    if (!isSuccess || !data) return;

    const stored = laterCursor(readyRef.current ? cursorRef.current : null, readToastCursor(userId));
    // The first successful list in this browser is a baseline. Later fetches with
    // no cursor yet (the first list was empty) still announce real arrivals.
    const establishingBaseline = !readyRef.current && !stored;
    const missed = establishingBaseline
      ? []
      : stored
        ? data.filter(notification => isUnseenArrival(notification, stored))
        : data.filter(notification => !notification.dismissed);
    const claimed = claimArrivals(missed);
    if (claimed.length > 0) showNewNotificationToast(claimed.length, () => viewNotifications(href => router.push(href)));

    // No cursor yet: the whole list is the baseline. Otherwise only announced
    // rows move the cursor forward.
    const next = stored ? settledCursor(stored, claimed) : cursorFromNotifications(data);
    if (next) {
      cursorRef.current = next;
      if (!stored || !cursorsEqual(stored, next)) writeToastCursor(userId, next);
    }
    readyRef.current = true;
  }, [data, isSuccess, router, userId]);
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
