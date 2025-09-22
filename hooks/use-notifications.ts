'use client';

import { useEffect, useState, useCallback } from 'react';

type Notification = {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'invite';
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

  // Update notifications and notify all listeners
  setNotifications(notifications: Notification[]) {
    this.notifications = notifications;
    this.unreadCount = notifications.filter(n => !n.dismissed).length;
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
          
          await supabase
            .from('notifications')
            .update({ dismissed: true })
            .in('id', unreadIds);
            
            // Update the notifications to be marked as read for the UI
            notifications.forEach(n => {
              if (!n.dismissed) n.dismissed = true;
            });
        }
      }
      
      notificationStore.setNotifications(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
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

  // Set up real-time subscription
  useEffect(() => {
    if (!initialFetched || !realtime) return;

    const setupRealtimeSubscription = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();

        // Every time a notification changes (insert, update, delete)
        // we'll refetch the whole list to ensure sync
        const handleNotificationChange = () => {
          fetchNotifications();
        };

        const channel = supabase
          .channel('notifications-changes')
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
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
        return () => {};
      }
    };

    const cleanup = setupRealtimeSubscription();
    return () => {
      if (cleanup) {
        cleanup.then(cleanupFn => cleanupFn && cleanupFn());
      }
    };
  }, [initialFetched, realtime, userId, fetchNotifications]);

  // Public method for dismissing notifications
  const dismissNotification = useCallback(async (id: string) => {
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .eq('id', id);

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

      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .in('id', notificationIds);

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

        await supabase
          .from('notifications')
          .delete()
          .eq('id', id);

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