'use client';

import { useCallback, useState } from 'react';
import { X, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetchNotifications } from '../hooks/use-notifications';

type Notification = {
  id: number;
  text: string;
  type: 'info' | 'warning' | 'error';
  created_at: string;
  dismissed: boolean;
  link: string | null;
};

export default function NotificationsContent({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
 
  // Callback to handle incoming notifications
  const onNotifications = useCallback(
    (newNotifications: Notification[]) => {
      setNotifications(newNotifications);
    },
    []
  );

  // Fetch notifications and get dismiss functions
  const { dismissNotification, dismissAllNotifications } = useFetchNotifications({
    onNotifications,
    userId,
    realtime: true,
  });

  // Calculate time ago for displaying when a notification was created
  const timeAgo = (createdAt: string) => {
    const date = new Date(createdAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
   
    if (seconds < 60) return 'Just now';
   
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
   
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
   
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
   
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  // Get icon based on notification type
  const getNotificationIcon = (type: 'info' | 'warning' | 'error') => {
    switch (type) {
      case 'error':
        return <CircleAlert className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <TriangleAlert className="h-5 w-5 text-amber-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="w-full">
      {notifications.length > 0 && (
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-gray-500">
            You have {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={dismissAllNotifications}
            className="text-sm text-primary hover:text-primary-dark"
          >
            Dismiss all
          </button>
        </div>
      )}
     
      <div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-gray-500 border border-dashed rounded-lg">
            <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p>No notifications yet</p>
            <p className="text-sm mt-1">When you receive notifications, they will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "p-4 rounded-lg border hover:bg-gray-50 transition-colors",
                  notification.link && "cursor-pointer"
                )}
                onClick={() => {
                  if (notification.link) {
                    window.location.href = notification.link;
                    dismissNotification(notification.id);
                  }
                }}
              >
                <div className="flex items-center">
                  <div className="mr-3 flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm mb-1">{notification.text}</p>
                    <p className="text-xs text-gray-500">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(notification.id);
                    }}
                    className="ml-2 p-1 flex-shrink-0 text-gray-400 hover:text-gray-600"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}