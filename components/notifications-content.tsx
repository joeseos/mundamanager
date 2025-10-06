'use client';

import { useCallback, useState, useEffect } from 'react';
import { CircleAlert, Info, TriangleAlert, UserPlus, Check, X } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { useFetchNotifications } from '../hooks/use-notifications';
import { useRouter, usePathname } from 'next/navigation';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends';
import { LuTrash2 } from "react-icons/lu";

type Notification = {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'invite' | 'friend_request';
  created_at: string;
  dismissed: boolean;
  link: string | null;
  sender_id?: string; // Add sender_id for friend requests
};

export default function NotificationsContent({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === '/account';

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
    realtime: false, // Disable realtime here since SettingsModal handles it
    isProfilePage,
  });

  // Handle friend request acceptance
  const handleAcceptFriendRequest = async (notificationId: string, senderId: string) => {
    setProcessingRequest(notificationId);
    try {
      await acceptFriendRequest(senderId, userId);
      await deleteNotification(notificationId);
      router.refresh();
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  // Handle friend request decline
  const handleDeclineFriendRequest = async (notificationId: string, senderId: string) => {
    setProcessingRequest(notificationId);
    try {
      await declineFriendRequest(senderId, userId);
      await deleteNotification(notificationId);
      router.refresh();
    } catch (error) {
      console.error('Error declining friend request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

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
  const getNotificationIcon = (type: 'info' | 'warning' | 'error' | 'invite' | 'friend_request') => {
    switch (type) {
      case 'error':
        return <CircleAlert className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <TriangleAlert className="h-5 w-5 text-amber-500" />;
      case 'invite':
        return <UserPlus className="h-5 w-5 text-indigo-500" />;
      case 'friend_request':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="w-full">
      <div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground border border-dashed rounded-lg">
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
                    ? "bg-muted" 
                    : "hover:bg-muted",
                  notification.link && notification.type !== 'friend_request' && "cursor-pointer"
                )}
                onClick={() => {
                  // Only navigate on click if it's not a friend request and has a link
                  if (notification.link && notification.type !== 'friend_request') {
                    router.push(notification.link);
                    if (!notification.dismissed) {
                      dismissNotification(notification.id);
                    }
                  }
                }}
              >
                <div className="flex items-start">
                  <div className="mr-3 flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm mb-1 whitespace-pre-line">
                      {notification.text}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                  {/* Friend Request Action Buttons (moved to the right, now using Button) */}
                  {notification.type === 'friend_request' && notification.sender_id && (
                    <div className="flex gap-2 items-center ml-2 self-center mt-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeclineFriendRequest(notification.id, notification.sender_id!);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Declining...' : 'Decline'}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptFriendRequest(notification.id, notification.sender_id!);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="default"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Accepting...' : 'Accept'}
                      </Button>
                    </div>
                  )}
                  {notification.type !== 'friend_request' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotificationToDelete(notification.id);
                      }}
                      className="ml-2 p-1 flex-shrink-0 text-gray-400 hover:text-red-500"
                      aria-label="Delete notification"
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </button>
                  )}
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
            <div>
              <p>Are you sure you want to delete this notification?</p>
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setNotificationToDelete(null)}
          onConfirm={handleDelete}
          confirmText="Delete"
        />
      )}
    </div>
  );
}