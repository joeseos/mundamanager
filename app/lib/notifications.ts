import { withUserClaims } from '@/utils/db/client';
import { campaignIdFromNotificationLink, type NotificationType } from '@/utils/notifications';
import { getCampaignBasic } from '@/app/lib/campaigns/[id]/get-campaign-data';

export type Notification = {
  id: string;
  text: string;
  type: NotificationType;
  created_at: string;
  dismissed: boolean;
  link: string | null;
  // Null on older admin notifications sent before the author was recorded
  sender_id: string | null;
  sender_username: string | null;
  // True when text is sanitized TipTap HTML. False is plain text with optional **bold**.
  is_html: boolean;
  // Name of the campaign the link points to, for its label
  campaign_name: string | null;
};

/**
 * The user's 20 newest unexpired notifications. Not cached: many are inserted
 * by SQL functions, which cannot invalidate a cache tag. Read with the user's
 * claims, as the policies only return a user's own notifications.
 * `userId` must be the authenticated caller's own id.
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const rows = await withUserClaims(userId, (tx) => tx.query.notifications.findMany({
    columns: { id: true, text: true, dismissed: true, type: true, link: true, sender_id: true, is_html: true },
    extras: (notification, { sql }) => ({
      created_at: sql<string>`to_json(${notification.created_at})`.as('created_at'),
    }),
    where: (notification, { and, eq, gt, sql }) =>
      and(eq(notification.receiver_id, userId), gt(notification.expires_at, sql`now()`)),
    orderBy: (notification, { desc }) => desc(notification.created_at),
    limit: 20,
    with: { sender: { columns: { username: true } } },
  }));

  const campaignIds = [...new Set(rows.flatMap((row) => (row.link && campaignIdFromNotificationLink(row.link)) || []))];
  const campaigns = await Promise.all(campaignIds.map(getCampaignBasic));
  const campaignNames = new Map(campaigns.flatMap((campaign) => (campaign ? [[campaign.id, campaign.campaign_name]] : [])));

  return rows.map(({ sender, ...row }) => {
    const campaignId = row.link && campaignIdFromNotificationLink(row.link);
    return {
      ...row,
      sender_username: sender?.username ?? null,
      campaign_name: (campaignId && campaignNames.get(campaignId)) || null,
    };
  });
}
