'use client';

import { useCallback, useState, useEffect, type MouseEvent } from 'react';
import { LuOctagonX, LuUserPlus, LuTriangleAlert, LuSwords, LuLink2, LuArrowUpRight } from "react-icons/lu";
import { LuCheck } from "react-icons/lu";
import { ImInfo } from "react-icons/im";
import { HiX } from "react-icons/hi";
import { cn } from '@/app/lib/utils';
import { useFetchNotifications } from '../../hooks/use-notifications';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends';
import { acceptGangInvite, declineGangInvite } from '@/app/actions/campaigns/[id]/campaign-gangs';
import { LuTrash2 } from "react-icons/lu";
import { notificationTextToHtml, type NotificationType, hasNotificationLink, resolveNotificationLink, getNotificationLinkLabel, getNotificationLinkDescription } from '@/utils/notifications';

type Notification = {
  id: string;
  text: string;
  type: NotificationType;
  created_at: string;
  dismissed: boolean;
  link: string | null;
  sender_id?: string; // Add sender_id for friend requests and gang invites
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
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
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
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error declining friend request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  // Parse campaignId and gangId from notification link
  const parseGangInviteLink = (link: string | null): { campaignId: string; gangId: string } | null => {
    if (!link) return null;
    try {
      const url = new URL(link);
      const pathParts = url.pathname.split('/');
      const campaignId = pathParts[pathParts.length - 1];
      const gangId = url.searchParams.get('gangId');
      if (campaignId && gangId) {
        return { campaignId, gangId };
      }
    } catch {
      // Invalid URL
    }
    return null;
  };

  // Handle gang invite acceptance
  const handleAcceptGangInvite = async (notificationId: string, link: string | null) => {
    const params = parseGangInviteLink(link);
    if (!params) {
      console.error('Invalid gang invite link');
      return;
    }

    setProcessingRequest(notificationId);
    try {
      const result = await acceptGangInvite(params);
      if (result.success) {
        await deleteNotification(notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      } else {
        console.error('Error accepting gang invite:', result.error);
      }
    } catch (error) {
      console.error('Error accepting gang invite:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  // Handle gang invite decline
  const handleDeclineGangInvite = async (notificationId: string, link: string | null) => {
    const params = parseGangInviteLink(link);
    if (!params) {
      console.error('Invalid gang invite link');
      return;
    }

    setProcessingRequest(notificationId);
    try {
      const result = await declineGangInvite(params);
      if (result.success) {
        await deleteNotification(notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      } else {
        console.error('Error declining gang invite:', result.error);
      }
    } catch (error) {
      console.error('Error declining gang invite:', error);
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

  // Render notification text with **bold** support (escapes HTML for XSS safety).
  // Shared with the email worker via utils/notifications/render so both channels match.
  const renderNotificationText = (text: string) => notificationTextToHtml(text);

  const handleNotificationLinkClick = (
    event: MouseEvent,
    notification: Notification
  ) => {
    event.stopPropagation();

    if (!hasNotificationLink(notification.link)) {
      return;
    }

    const { href, isExternal } = resolveNotificationLink(notification.link!);

    if (isExternal) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(href);
    }

    if (!notification.dismissed) {
      dismissNotification(notification.id);
    }
  };

  const renderNotificationLinkAttachment = (notification: Notification) => {
    if (!hasNotificationLink(notification.link)) {
      return null;
    }

    const { href, isExternal } = resolveNotificationLink(notification.link!);
    const label = getNotificationLinkLabel(notification.link!);
    const description = getNotificationLinkDescription(notification.link!);

    const attachmentContent = (
      <>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
          <LuLink2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <LuArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </>
    );

    const attachmentClassName =
      'flex w-full items-center gap-3 rounded-md border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/70';

    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={attachmentClassName}
          onClick={(event) => handleNotificationLinkClick(event, notification)}
        >
          {attachmentContent}
        </a>
      );
    }

    return (
      <Link
        href={href}
        className={attachmentClassName}
        onClick={(event) => handleNotificationLinkClick(event, notification)}
      >
        {attachmentContent}
      </Link>
    );
  };

  // Get icon based on notification type
  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'error':
        return <LuOctagonX className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <LuTriangleAlert className="h-5 w-5 text-amber-500" />;
      case 'invite': // legacy: pre-split campaign/battle invites
      case 'campaign_invite':
        return <LuUserPlus className="h-5 w-5 text-indigo-500" />;
      case 'battle_invite':
        return <LuSwords className="h-5 w-5 text-rose-500" />;
      case 'friend_request':
        return <LuUserPlus className="h-5 w-5 text-green-500" />;
      case 'gang_invite':
        return <LuUserPlus className="h-5 w-5 text-orange-500" />;
      default:
        return <ImInfo className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="w-full">
      <div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground border border-dashed rounded-lg">
            <ImInfo className="h-8 w-8 mx-auto mb-2 text-gray-400" />
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
                  notification.dismissed ? "bg-muted" : "hover:bg-muted"
                )}
              >
                <div className="flex items-start">
                  <div className="mr-3 shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm mb-1 whitespace-pre-line"
                      dangerouslySetInnerHTML={{ __html: renderNotificationText(notification.text) }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                  {/* Friend Request Action Buttons */}
                  {notification.type === 'friend_request' && notification.sender_id && (
                    <div className="flex gap-2 items-center ml-2 self-center mt-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeclineFriendRequest(notification.id, notification.sender_id!);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="outline_remove"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <HiX className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Declining...' : 'Decline'}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptFriendRequest(notification.id, notification.sender_id!);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="outline_accept"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <LuCheck className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Accepting...' : 'Accept'}
                      </Button>
                    </div>
                  )}
                  {/* Gang Invite Action Buttons */}
                  {notification.type === 'gang_invite' && notification.link && (
                    <div className="flex gap-2 items-center ml-2 self-center mt-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeclineGangInvite(notification.id, notification.link);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="outline_remove"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <HiX className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Declining...' : 'Decline'}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptGangInvite(notification.id, notification.link);
                        }}
                        disabled={processingRequest === notification.id}
                        variant="outline_accept"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <LuCheck className="h-3 w-3" />
                        {processingRequest === notification.id ? 'Accepting...' : 'Accept'}
                      </Button>
                    </div>
                  )}
                  {notification.type !== 'friend_request' && notification.type !== 'gang_invite' && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotificationToDelete(notification.id);
                      }}
                      variant="ghost"
                      size="icon"
                      className="ml-2 shrink-0 text-gray-400 hover:text-red-500 hover:bg-transparent"
                      aria-label="Delete notification"
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {hasNotificationLink(notification.link) && (
                  <div className="mt-3 ml-8 border-t border-border/60 pt-3">
                    {renderNotificationLinkAttachment(notification)}
                  </div>
                )}
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