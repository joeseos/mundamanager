'use client';

import { useCallback, useState, useEffect } from 'react';
import { CircleAlert, Info, TriangleAlert, Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { useFetchNotifications } from '../hooks/use-notifications';
import { useRouter, usePathname } from 'next/navigation';
import Modal from '@/components/modal';

type Notification = {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'invite';
  created_at: string;
  dismissed: boolean;
  link: string | null;
};

export default function NotificationsContent({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === '/profile';

  // Callback to handle incoming notifications
  const onNotifications = useCallback(
    (newNotifications: Notification[]) => {
      setNotifications(newNotifications);
    },
    []
  );

  // Fetch notifications and get dismiss/delete functions
  const { dismissNotification, dismissAllNotifications, deleteNotification } = useFetchNotifications({
    onNotifications,
    userId,
    realtime: true,
    isProfilePage,
  });

  // Handle deleting a notification
  const handleDelete = async () => {
    if (notificationToDelete === null) return false;
    
    try {
      await deleteNotification(notificationToDelete);
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  };

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
  const getNotificationIcon = (type: 'info' | 'warning' | 'error' | 'invite') => {
    switch (type) {
      case 'error':
        return <CircleAlert className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <TriangleAlert className="h-5 w-5 text-amber-500" />;
      case 'invite':
        return <UserPlus className="h-5 w-5 text-indigo-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="w-full">
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
                  "p-4 rounded-lg border transition-colors",
                  notification.dismissed 
                    ? "bg-gray-50" 
                    : "hover:bg-gray-50",
                  notification.link && "cursor-pointer"
                )}
                onClick={() => {
                  if (notification.link) {
                    router.push(notification.link);
                    if (!notification.dismissed) {
                      dismissNotification(notification.id);
                    }
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
                      setNotificationToDelete(notification.id);
                    }}
                    className="ml-2 p-1 flex-shrink-0 text-gray-400 hover:text-red-500"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {notificationToDelete !== null && (
        <Modal
          title="Delete Notification"
          helper="This action cannot be undone."
          content={
            <p>Are you sure you want to delete this notification?</p>
          }
          onClose={() => setNotificationToDelete(null)}
          onConfirm={handleDelete}
          confirmText="Delete"
        />
      )}
    </div>
  );
}