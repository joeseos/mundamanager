'use client';

import { useEffect, useState, useCallback } from 'react';

type Notification = {
  id: number;
  text: string;
  type: 'info' | 'warning' | 'error';
  created_at: string;
  dismissed: boolean;
  link: string | null;
};

// Global notification store to ensure all components use the same notification data
const notificationStore = {
  notifications: [] as Notification[],
  listeners: new Set<(notifications: Notification[]) => void>(),
  
  // Update notifications and notify all listeners
  setNotifications(notifications: Notification[]) {
    this.notifications = notifications;
    this.notifyListeners();
  },
  
  // Add a listener function
  addListener(listener: (notifications: Notification[]) => void) {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.notifications);
  },
  
  // Remove a listener function
  removeListener(listener: (notifications: Notification[]) => void) {
    this.listeners.delete(listener);
  },
  
  // Notify all listeners with current notifications
  notifyListeners() {
    this.listeners.forEach(listener => {
      listener(this.notifications);
    });
  }
};

export function useFetchNotifications({
  onNotifications,
  userId,
  realtime,
}: {
  onNotifications: (notifications: Notification[]) => unknown;
  userId: string;
  realtime: boolean;
}) {
  const [initialFetched, setInitialFetched] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const now = new Date().toISOString();
      
      const { data } = await supabase
        .from('notifications')
        .select('id, text, dismissed, type, created_at, link')
        .eq('receiver_id', userId)
        .eq('dismissed', false)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(10);
      
      const notifications = data as Notification[] || [];
      notificationStore.setNotifications(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      notificationStore.setNotifications([]);
    }
  }, [userId]);

  // Register the onNotifications callback with the store
  useEffect(() => {
    notificationStore.addListener(onNotifications);
    
    return () => {
      notificationStore.removeListener(onNotifications);
    };
  }, [onNotifications]);

  // Fetch initial notifications
  useEffect(() => {
    const doInitialFetch = async () => {
      await fetchNotifications();
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
  const dismissNotification = useCallback(async (id: number) => {
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      
      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .eq('id', id);
      
      // Update the store immediately
      notificationStore.setNotifications(
        notificationStore.notifications.filter(n => n.id !== id)
      );
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  }, []);

  // Public method for dismissing all notifications
  const dismissAllNotifications = useCallback(async () => {
    if (notificationStore.notifications.length === 0) return;
    
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      
      const notificationIds = notificationStore.notifications.map(n => n.id);
      
      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .in('id', notificationIds);
      
      // Update the store immediately
      notificationStore.setNotifications([]);
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
    }
  }, []);

  return {
    dismissNotification,
    dismissAllNotifications
  };
}