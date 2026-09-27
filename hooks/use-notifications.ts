'use client';

import { useEffect, useState, useCallback } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from '@/utils/notifications';

// How long a tab can stay hidden before it drops its realtime channel. With no
// channels left the Supabase client closes the tab's WebSocket, which is what
// counts towards the project's concurrent Realtime connection quota.
const HIDDEN_UNSUBSCRIBE_DELAY_MS = 30_000;

// How often to retry subscribing while the socket is still closing.
const SOCKET_CLOSING_RETRY_MS = 250;

type Notification = {
  id: string;
  text: string;
  type: NotificationType;
  created_at: string;
  dismissed: boolean;
  link: string | null;
  sender_id: string;
};

// Global notification store to ensure all components use the same notification data
const notificationStore = {
  notifications: [] as Notification[],
  unreadCount: 0,
  listeners: new Set<(notifications: Notification[]) => void>(),
  countListeners: new Set<(count: number) => void>(),
  fetchPromise: null as Promise<void> | null,
  latestFetchId: 0,
  // Deletes and dismissals saved from this tab. They are reapplied to every list
  // the store receives, because a fetch that started before one of them would
  // otherwise undo it.
  deletedIds: new Set<string>(),
  dismissedIds: new Set<string>(),

  // Update notifications and notify all listeners
  setNotifications(notifications: Notification[]) {
    this.notifications = notifications
      .filter(n => !this.deletedIds.has(n.id))
      .map(n => (this.dismissedIds.has(n.id) && !n.dismissed ? { ...n, dismissed: true } : n));
    this.unreadCount = this.notifications.filter(n => !n.dismissed).length;
    this.notifyListeners();
    this.notifyCountListeners();
  },

  // Add a listener function
  addListener(listener: (notifications: Notification[]) => void) {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.notifications);
  },

  // Add a count listener function
  addCountListener(listener: (count: number) => void) {
    this.countListeners.add(listener);
    // Immediately notify with current count
    listener(this.unreadCount);
  },

  // Remove a listener function
  removeListener(listener: (notifications: Notification[]) => void) {
    this.listeners.delete(listener);
  },

  // Remove a count listener function
  removeCountListener(listener: (count: number) => void) {
    this.countListeners.delete(listener);
  },

  // Notify all listeners with current notifications
  notifyListeners() {
    this.listeners.forEach(listener => {
      listener(this.notifications);
    });
  },

  // Notify all count listeners with current unread count
  notifyCountListeners() {
    this.countListeners.forEach(listener => {
      listener(this.unreadCount);
    });
  },

  // Deduplicated fetch method
  async fetchNotifications(fetchFn: () => Promise<void>) {
    // If a fetch is already in progress, return the existing promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Start a new fetch and store the promise
    this.fetchPromise = fetchFn().finally(() => {
      // Clear the promise when done (success or error)
      this.fetchPromise = null;
    });

    return this.fetchPromise;
  }
};

export function useFetchNotifications({
  onNotifications,
  userId,
  realtime,
  onUnreadCountChange,
  isProfilePage,
}: {
  onNotifications: (notifications: Notification[]) => unknown;
  userId: string;
  realtime: boolean;
  onUnreadCountChange?: (count: number) => void;
  isProfilePage?: boolean;
}) {
  const [initialFetched, setInitialFetched] = useState(false);

  const fetchNotifications = useCallback(async () => {
    // Fetches can overlap (a change event during a refetch), and only the most
    // recently started one may update the store.
    const fetchId = ++notificationStore.latestFetchId;

    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const now = new Date().toISOString();

      const { data } = await supabase
        .from('notifications')
        .select('id, text, dismissed, type, created_at, link, sender_id')
        .eq('receiver_id', userId)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(20);

      const notifications = data as Notification[] || [];
      
      // If on profile page, auto-mark new notifications as read
      if (isProfilePage) {
        // Find unread notifications
        const unreadIds = notifications
          .filter(n => !n.dismissed)
          .map(n => n.id);
          
        // Mark them as read in the database
        if (unreadIds.length > 0) {
          const { createClient } = await import('@/utils/supabase/client');
          const supabase = createClient();
          
          const { error } = await supabase
            .from('notifications')
            .update({ dismissed: true })
            .in('id', unreadIds);

          if (error) {
            console.error('Error marking notifications as read:', error);
          } else {
            // setNotifications shows them as read from now on. Reapply to the
            // current list too, in case a newer fetch has already replaced it.
            unreadIds.forEach(id => notificationStore.dismissedIds.add(id));
            notificationStore.setNotifications(notificationStore.notifications);
          }
        }
      }
      
      if (fetchId !== notificationStore.latestFetchId) return;
      notificationStore.setNotifications(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      if (fetchId !== notificationStore.latestFetchId) return;
      notificationStore.setNotifications([]);
    }
  }, [userId, isProfilePage]);

  // Register the onNotifications callback with the store
  useEffect(() => {
    notificationStore.addListener(onNotifications);

    return () => {
      notificationStore.removeListener(onNotifications);
    };
  }, [onNotifications]);

  // Register the onUnreadCountChange callback if provided
  useEffect(() => {
    if (onUnreadCountChange) {
      notificationStore.addCountListener(onUnreadCountChange);
      
      return () => {
        notificationStore.removeCountListener(onUnreadCountChange);
      };
    }
  }, [onUnreadCountChange]);

  // Fetch initial notifications
  useEffect(() => {
    const doInitialFetch = async () => {
      await notificationStore.fetchNotifications(fetchNotifications);
      setInitialFetched(true);
    };

    doInitialFetch();
  }, [fetchNotifications]);

  // Set up real-time subscription while the tab is visible. A hidden tab drops
  // it after a grace period and subscribes again once visible.
  useEffect(() => {
    if (!initialFetched || !realtime) return;

    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Changes made while the channel was not joined are not replayed, so every
    // join refetches the list, except one straight after the initial fetch.
    let refetchOnJoin = false;

    // Every time a notification is inserted or updated
    // we'll refetch the whole list to ensure sync
    const handleNotificationChange = () => {
      fetchNotifications();
    };

    const subscribe = () => {
      if (cancelled || !supabase || channel || document.visibilityState !== 'visible') return;

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
            if (refetchOnJoin) fetchNotifications();
            refetchOnJoin = true;
          });
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
      }
    };

    const unsubscribe = () => {
      if (!supabase || !channel) return;

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
      } else if (supabase && !channel) {
        // Nothing refreshed the realtime token while the socket was closed, and
        // a join with an expired token is rejected.
        supabase.realtime.setAuth().then(subscribe, subscribe);
      }
    };

    import('@/utils/supabase/client')
      .then(({ createClient }) => {
        if (cancelled) return;

        supabase = createClient();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        // A tab opened in the background joins later, after the initial fetch has gone stale.
        refetchOnJoin = document.visibilityState !== 'visible';
        subscribe();
      })
      .catch(error => {
        console.error('Error setting up realtime subscription:', error);
      });

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [initialFetched, realtime, userId, fetchNotifications]);

  // Public method for dismissing notifications
  const dismissNotification = useCallback(async (id: string) => {
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      const { error } = await supabase
        .from('notifications')
        .update({ dismissed: true })
        .eq('id', id);
      if (error) throw error;

      notificationStore.dismissedIds.add(id);
      // Update the store to mark the notification as dismissed but keep it visible
      notificationStore.setNotifications(
        notificationStore.notifications.map(n => 
          n.id === id ? { ...n, dismissed: true } : n
        )
      );
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  }, []);

  // Public method for dismissing all notifications
  const dismissAllNotifications = useCallback(async () => {
    if (notificationStore.notifications.filter(n => !n.dismissed).length === 0) return;

    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      const notificationIds = notificationStore.notifications
        .filter(n => !n.dismissed)
        .map(n => n.id);

      const { error } = await supabase
        .from('notifications')
        .update({ dismissed: true })
        .in('id', notificationIds);
      if (error) throw error;

      notificationIds.forEach(id => notificationStore.dismissedIds.add(id));
      // Update the store to mark all notifications as dismissed but keep them visible
      notificationStore.setNotifications(
        notificationStore.notifications.map(n => ({ ...n, dismissed: true }))
      );
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
    }
  }, []);

  // Public method for deleting a notification
  const deleteNotification = useCallback(async (id: string) => {
    try {
      // Use the API endpoint
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      notificationStore.deletedIds.add(id);
      // Update the store immediately on success
      notificationStore.setNotifications(
        notificationStore.notifications.filter(n => n.id !== id)
      );
    } catch (error) {
      console.error('Error deleting notification via API:', error);
      
      // Fallback to direct Supabase delete if API fails
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();

        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('id', id);
        if (deleteError) throw deleteError;

        notificationStore.deletedIds.add(id);
        // Update the store immediately
        notificationStore.setNotifications(
          notificationStore.notifications.filter(n => n.id !== id)
        );
      } catch (fallbackError) {
        console.error('Fallback error deleting notification:', fallbackError);
      }
    }
  }, []);

  return {
    dismissNotification,
    dismissAllNotifications,
    deleteNotification,
    getUnreadCount: () => notificationStore.unreadCount
  };
}