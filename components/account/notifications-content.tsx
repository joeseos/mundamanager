'use client';

import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { LuOctagonX, LuUserPlus, LuTriangleAlert, LuSwords, LuLink2, LuArrowUpRight } from "react-icons/lu";
import { LuCheck } from "react-icons/lu";
import { ImInfo } from "react-icons/im";
import { HiX } from "react-icons/hi";
import { cn } from '@/app/lib/utils';
import { useDeleteNotification, useMarkNotificationsRead, useNotifications } from '../../hooks/use-notifications';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends';
import { acceptGangInvite, declineGangInvite } from '@/app/actions/campaigns/[id]/campaign-gangs';
import { acceptJoinRequest, declineJoinRequest } from '@/app/actions/campaigns/[id]/campaign-join-requests';
import { LuTrash2 } from "react-icons/lu";
import { notificationTextToHtml, type NotificationType, isSafeNotificationLink, resolveNotificationLink, getNotificationLinkLabel, getNotificationLinkDescription } from '@/utils/notifications';

type Notification = {
  id: string;
  text: string;
  type: NotificationType;
  created_at: string;
  dismissed: boolean;
  link: string | null;
  sender_id?: string; // Add sender_id for friend requests and gang invites
};

type NotificationActionResult = { success: boolean; error?: string };

type NotificationResponse = 'accept' | 'decline';

// An in-app Accept/Decline response to a notification. resolveArgs pulls the server-action
// arguments out of the notification; returning null hides the buttons.
type NotificationAction<Args> = {
  label: string; // Used in error messages, e.g. 'gang invite'
  resolveArgs: (notification: Notification, userId: string) => Args | null;
  accept: (args: Args) => Promise<NotificationActionResult>;
  decline: (args: Args) => Promise<NotificationActionResult>;
};

// Type-checks accept/decline against the entry's own resolveArgs, then widens the entry so
// types with different argument shapes can share one registry.
function defineNotificationAction<Args>(action: NotificationAction<Args>): NotificationAction<any> {
  return action;
}

// Parse campaignId (last path segment) and optional gangId from a campaign notification link
function parseCampaignLink(link: string | null): { campaignId: string; gangId: string | null } | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const pathParts = url.pathname.split('/');
    const campaignId = pathParts[pathParts.length - 1];
    if (campaignId) {
      return { campaignId, gangId: url.searchParams.get('gangId') };
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// Notification types answered in-app with Accept/Decline. An entry here is all a new type needs:
// it gets the buttons, and loses the delete button and link attachment.
const notificationActions: Partial<Record<NotificationType, NotificationAction<any>>> = {
  friend_request: defineNotificationAction({
    label: 'friend request',
    // sender_id is the requester; the current user is the addressee
    resolveArgs: (notification, userId) =>
      notification.sender_id ? { requesterId: notification.sender_id, addresseeId: userId } : null,
    accept: ({ requesterId, addresseeId }) => acceptFriendRequest(requesterId, addresseeId),
    decline: ({ requesterId, addresseeId }) => declineFriendRequest(requesterId, addresseeId),
  }),
  gang_invite: defineNotificationAction({
    label: 'gang invite',
    resolveArgs: (notification) => {
      const params = parseCampaignLink(notification.link);
      return params?.gangId ? { campaignId: params.campaignId, gangId: params.gangId } : null;
    },
    accept: acceptGangInvite,
    decline: declineGangInvite,
  }),
  campaign_join_request: defineNotificationAction({
    label: 'join request',
    // sender_id is the requester
    resolveArgs: (notification) => {
      const params = parseCampaignLink(notification.link);
      return params && notification.sender_id ? { campaignId: params.campaignId, userId: notification.sender_id } : null;
    },
    accept: acceptJoinRequest,
    decline: declineJoinRequest,
  }),
};

const isActionableNotification = (type: NotificationType) => notificationActions[type] !== undefined;

// Actionable notifications' links only carry action args, so they never show as an attachment
const shouldShowLinkAttachment = (notification: Notification): notification is Notification & { link: string } =>
  !isActionableNotification(notification.type) && isSafeNotificationLink(notification.link);

function NotificationActionButtons({
  pending,
  onAccept,
  onDecline,
}: {
  pending: NotificationResponse | null; // The response in flight for this notification, if any
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex gap-2 items-center ml-2 self-center mt-2">
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onDecline();
        }}
        disabled={pending !== null}
        variant="outline_remove"
        size="sm"
        className="flex items-center gap-1"
      >
        <HiX className="h-3 w-3" />
        {pending === 'decline' ? 'Declining...' : 'Decline'}
      </Button>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onAccept();
        }}
        disabled={pending !== null}
        variant="outline_accept"
        size="sm"
        className="flex items-center gap-1"
      >
        <LuCheck className="h-3 w-3" />
        {pending === 'accept' ? 'Accepting...' : 'Accept'}
      </Button>
    </div>
  );
}

export default function NotificationsContent({ userId }: { userId: string }) {
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<{ id: string; response: NotificationResponse } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === '/account';

  // Kept current by the header's realtime subscription (SettingsModal)
  const { data: notifications = [], isFetchedAfterMount } = useNotifications(userId);
  const { mutate: markRead } = useMarkNotificationsRead(userId);
  const { mutate: deleteNotification, mutateAsync: deleteNotificationAsync } = useDeleteNotification(userId);

  // Opening the account page marks its notifications as read, once its own
  // fetch has loaded them
  const markedReadOnOpen = useRef(false);
  useEffect(() => {
    if (!isProfilePage || !isFetchedAfterMount || markedReadOnOpen.current) return;
    markedReadOnOpen.current = true;

    const unreadIds = notifications.filter(n => !n.dismissed).map(n => n.id);
    if (unreadIds.length > 0) markRead(unreadIds);
  }, [isProfilePage, isFetchedAfterMount, notifications, markRead]);

  // Resolve a notification's in-app action and its server-action args; null if either is missing
  const getNotificationAction = (notification: Notification) => {
    const action = notificationActions[notification.type];
    const args = action?.resolveArgs(notification, userId);
    return action && args != null ? { action, args } : null;
  };

  // Handle accepting/declining an actionable notification, removing it from the list on success
  const handleNotificationAction = async (notification: Notification, response: NotificationResponse) => {
    const resolved = getNotificationAction(notification);
    if (!resolved) return;

    const { action, args } = resolved;
    const verb = response === 'accept' ? 'accepting' : 'declining';
    const failureMessage = `Failed to ${response} ${action.label}`;
    setProcessingRequest({ id: notification.id, response });
    try {
      const result = await action[response](args);
      if (result.success) {
        deleteNotification(notification.id);
      } else {
        console.error(`Error ${verb} ${action.label}:`, result.error);
        toast.error(result.error || failureMessage);
      }
    } catch (error) {
      console.error(`Error ${verb} ${action.label}:`, error);
      toast.error(failureMessage);
    } finally {
      setProcessingRequest(null);
    }
  };

  // Handle deleting a notification
  const handleDelete = async () => {
    if (notificationToDelete === null) return false;
    
    try {
      await deleteNotificationAsync(notificationToDelete);
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
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

    if (!shouldShowLinkAttachment(notification)) {
      return;
    }

    const resolved = resolveNotificationLink(notification.link);
    if (!resolved) {
      return;
    }

    const { href, isExternal } = resolved;

    if (isExternal) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(href);
    }

    if (!notification.dismissed) {
      markRead([notification.id]);
    }
  };

  const renderNotificationLinkAttachment = (notification: Notification) => {
    if (!shouldShowLinkAttachment(notification)) {
      return null;
    }

    const resolved = resolveNotificationLink(notification.link);
    if (!resolved) {
      return null;
    }

    const { href, isExternal } = resolved;
    const label = getNotificationLinkLabel(notification.link);
    const description = getNotificationLinkDescription(notification.link);

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
      case 'campaign_challenge':
        return <LuSwords className="h-5 w-5 text-rose-500" />;
      case 'friend_request':
        return <LuUserPlus className="h-5 w-5 text-green-500" />;
      case 'gang_invite':
        return <LuUserPlus className="h-5 w-5 text-orange-500" />;
      case 'campaign_join_request':
        return <LuUserPlus className="h-5 w-5 text-sky-500" />;
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
                  {getNotificationAction(notification) && (
                    <NotificationActionButtons
                      pending={processingRequest?.id === notification.id ? processingRequest.response : null}
                      onAccept={() => handleNotificationAction(notification, 'accept')}
                      onDecline={() => handleNotificationAction(notification, 'decline')}
                    />
                  )}
                  {!isActionableNotification(notification.type) && (
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
                {shouldShowLinkAttachment(notification) && (
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