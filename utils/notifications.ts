// Central definition of notification categories, their email behaviour, and the shared
// notification-text renderer.
//
// This is the Next.js-side single source of truth: the account settings UI (labels +
// which categories are toggleable), the preference server action, the unsubscribe route,
// and the in-app notification list all read from here. The Deno email worker keeps a
// small mirror of the email-eligible subset (Deno requires .ts import extensions the Next
// files don't use), and the DB knows nothing about these types — the enqueue trigger gates
// on a coarse capability list and the worker resolves preferences at send time.

import { decodeHtmlEntities, isHtmlEffectivelyEmpty } from './htmlCleanUp';
import { escapeHtml } from './html';
import { formatLocalDate } from './local-date';
import { sanitizeNotificationHtml } from './sanitize-notification-html';

export type NotificationType =
  | 'info'
  | 'warning'
  | 'error'
  | 'campaign_invite'
  | 'friend_request'
  | 'battle_invite'
  | 'gang_invite'
  | 'campaign_join_request'
  | 'campaign_challenge'
  | 'user_message'
  | 'campaign_message'
  | 'mm_staff_message'
  | 'mm_announcement'
  | 'forum_reply'
  | 'forum_mention'
  | 'forum_article';

export interface NotificationEmailConfig {
  /** Human label shown on the preferences screen. */
  label: string;
  /** Whether this category can be delivered by email at all (non-suppressible if false). */
  supportsEmail: boolean;
  /** Default email opt-in used when the user has no preference row for this category. */
  defaultEnabled: boolean;
  /** Email subject line for this category. `{sender}` is replaced with the sender's username. */
  subject: string;
  /**
   * App path for the email button, overriding the notification's `link`. Used when the
   * notification is acted on elsewhere (e.g. accept/decline in the account notifications list).
   * When this is absent, the button uses `link`.
   */
  ctaPath?: string;
}

export const notificationEmailConfig: Record<NotificationType, NotificationEmailConfig> = {
  // Campaign-member invitations.
  campaign_invite: {
    label: 'Campaign invitations',
    supportsEmail: true,
    defaultEnabled: true,
    subject: "You've been invited to a campaign",
  },
  // Gang-into-campaign invitations (PENDING) — the gang owner is asked to accept.
  gang_invite: {
    label: 'Gang campaign invitations',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} wants to add your gang to a campaign',
    // Accept/decline lives in the account notifications list, not on the campaign page.
    ctaPath: '/account',
  },
  friend_request: {
    label: 'Friend requests',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} sent you a friend request',
    // The notification has no link; accept/decline lives in the account notifications list.
    ctaPath: '/account',
  },
  // Requests to join a campaign — every OWNER/ARBITRATOR is asked to accept/decline.
  campaign_join_request: {
    label: 'Campaign join requests',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} wants to join your campaign',
    // Accept/decline lives in the account notifications list, not on the campaign page.
    ctaPath: '/account',
  },
  // A gang was challenged in a campaign battle; answered from the battle log's edit modal.
  campaign_challenge: {
    label: 'Campaign challenges',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} has challenged your gang',
  },
  // Munda Manager news, general announcements, and feature announcements.
  // The in-app list shows a fixed From line (MM_ANNOUNCEMENT_FROM) linking to the contributors page.
  mm_announcement: {
    label: 'Munda Manager announcements',
    supportsEmail: true,
    defaultEnabled: true,
    subject: 'An announcement from Munda Manager',
    ctaPath: '/account',
  },
  // A user sends a message to another user. Read from the account notifications list.
  user_message: {
    label: 'Direct messages',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} sent you a message',
    ctaPath: '/account',
  },
  // A campaign arbitrator messages one or more people in their campaign.
  campaign_message: {
    label: 'Campaign messages',
    supportsEmail: true,
    defaultEnabled: true,
    subject: '{sender} sent a campaign message',
  },
  // Munda Manager staff messages to users.
  mm_staff_message: {
    label: 'Munda Manager messages',
    supportsEmail: true,
    defaultEnabled: true,
    subject: 'A message from Munda Manager',
    ctaPath: '/account',
  },
  // Not email-eligible (in-app only) — kept here so the type union is exhaustive.
  info: { label: 'Account & campaign updates', supportsEmail: false, defaultEnabled: false, subject: '' },
  warning: { label: 'Warnings', supportsEmail: false, defaultEnabled: false, subject: '' },
  error: { label: 'Errors', supportsEmail: false, defaultEnabled: false, subject: '' },
  // Battle-session invitations — in-app only (deliberately not emailed).
  battle_invite: { label: 'Battle session invitations', supportsEmail: false, defaultEnabled: false, subject: '' },
  // Forum replies to your thread and @mentions — in-app only.
  forum_reply: { label: 'Forum replies', supportsEmail: false, defaultEnabled: false, subject: '' },
  forum_mention: { label: 'Forum mentions', supportsEmail: false, defaultEnabled: false, subject: '' },
  // A reviewer published your thread as an article, asked for changes or declined it — in-app only.
  forum_article: { label: 'Article reviews', supportsEmail: false, defaultEnabled: false, subject: '' },
};

/**
 * Reserved pseudo-category stored as a `notification_type` in
 * user_notification_preferences that acts as the master email kill-switch.
 * Absent row (or enabled=true) means "master on".
 */
export const MASTER_PREF_KEY = 'all';

/** Types the admin composer may send. */
export const ADMIN_NOTIFICATION_TYPES = ['mm_announcement', 'mm_staff_message'] as const;
export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

export const adminNotificationTypeLabel: Record<AdminNotificationType, string> = {
  mm_announcement: 'Munda Manager Announcement',
  mm_staff_message: 'Munda Manager Staff Message',
};

export function isAdminNotificationType(value: string): value is AdminNotificationType {
  return (ADMIN_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** From line for mm_announcement. Links to the contributors page, not a user profile. */
export const MM_ANNOUNCEMENT_FROM = 'Munda Manager Team';
export const MM_ANNOUNCEMENT_FROM_PATH = '/contributors';

/** Visible-text cap for an admin broadcast. Each recipient stores their own row. */
export const NOTIFICATION_BROADCAST_MAX_LENGTH = 1000;

/** How long a composed notification may stay before the expiry job deletes the recipient rows. */
export const NOTIFICATION_EXPIRES_MIN_DAYS = 1;
export const NOTIFICATION_EXPIRES_MAX_DAYS = 365;

/** Campaign message sends allowed per campaign per UTC day. */
export const CAMPAIGN_MESSAGE_DAILY_CAP = 5;

/** Campaign message sends allowed per sender per UTC day, across every campaign they run. */
export const CAMPAIGN_MESSAGE_SENDER_DAILY_CAP = 10;

/** Sent history window. The fighter and gang log routes use the same cap. */
export const SENT_NOTIFICATIONS_FETCH_LIMIT = 100;

const NOTIFICATION_PREVIEW_LENGTH = 60;

export function notificationPlainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').length;
}

/** Integer day count in the allowed range, or null. */
export function parseExpiresInDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const days = Math.floor(value);
  if (days < NOTIFICATION_EXPIRES_MIN_DAYS || days > NOTIFICATION_EXPIRES_MAX_DAYS) return null;
  return days;
}

const LOGGED_IN_ON_OR_AFTER_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date that many months before today, as YYYY-MM-DD. Clamps short months. */
export function loggedInOnOrAfterMonthsAgo(months: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(now.getDate(), lastDay));
  return formatLocalDate(target);
}

/** Local calendar date that many days before today, as YYYY-MM-DD. */
export function loggedInOnOrAfterDaysAgo(days: number): string {
  const now = new Date();
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

/** Local calendar date two months before today, as YYYY-MM-DD. */
export function defaultLoggedInOnOrAfter(): string {
  return loggedInOnOrAfterMonthsAgo(2);
}

/** Start of that local calendar day, or null when the day is impossible or in the future. */
export function loggedInOnOrAfterInstant(value: string): string | null {
  const match = LOGGED_IN_ON_OR_AFTER_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  if (value > formatLocalDate(new Date())) return null;
  return new Date(year, month - 1, day).toISOString();
}

const LOGGED_IN_SINCE_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * A real instant that is not after now and not before year 1, or null.
 * Date-only strings are rejected so a calendar day is not read as UTC midnight.
 */
export function parseLoggedInSince(value: unknown): string | null {
  if (typeof value !== 'string' || !LOGGED_IN_SINCE_INSTANT_PATTERN.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1) return null;
  if (parsed.getTime() > Date.now()) return null;
  return parsed.toISOString();
}

export function prepareNotificationHtml(
  raw: unknown
): { ok: true; text: string } | { ok: false; error: string } {
  const text = sanitizeNotificationHtml(typeof raw === 'string' ? raw.trim() : '').trim();
  if (!text || isHtmlEffectivelyEmpty(text)) {
    return { ok: false, error: 'Message text is required' };
  }
  if (notificationPlainTextLength(text) > NOTIFICATION_BROADCAST_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be at most ${NOTIFICATION_BROADCAST_MAX_LENGTH} characters`,
    };
  }
  return { ok: true, text };
}

export function notificationPreview(html: string): string {
  const plain = decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  if (plain.length <= NOTIFICATION_PREVIEW_LENGTH) return plain;
  return `${plain.slice(0, NOTIFICATION_PREVIEW_LENGTH).trimEnd()}…`;
}

const MESSAGE_NOTIFICATION_TYPES = new Set<NotificationType>([
  'user_message',
  'campaign_message',
  'mm_staff_message',
]);

/** Direct, campaign, and staff messages, as opposed to event notifications. */
export function isMessageNotificationType(type: NotificationType): boolean {
  return MESSAGE_NOTIFICATION_TYPES.has(type);
}

/** The categories a user can toggle email for (the email-eligible ones). */
export function emailEligibleTypes(): NotificationType[] {
  return (Object.keys(notificationEmailConfig) as NotificationType[]).filter(
    (t) => notificationEmailConfig[t].supportsEmail,
  );
}

/**
 * Resolve whether an email should be sent for a category given the user's stored
 * rows. `master` = the 'all' pref (defaults to on); per-category defaults to the
 * config's defaultEnabled. Used by the worker at send time.
 */
export function isEmailEnabled(
  type: NotificationType,
  prefs: { notification_type: string; enabled: boolean }[],
): boolean {
  const cfg = notificationEmailConfig[type];
  if (!cfg || !cfg.supportsEmail) return false;

  const master = prefs.find((p) => p.notification_type === MASTER_PREF_KEY);
  if (master && master.enabled === false) return false;

  const perType = prefs.find((p) => p.notification_type === type);
  return perType ? perType.enabled : cfg.defaultEnabled;
}

// Shared renderer for notification `text`: escapes HTML then applies the `**bold**`
// convention. Used by the in-app notification list (the email worker keeps its own copy).
// Line breaks are intentionally left as literal `\n` — the in-app list renders with the
// CSS `whitespace-pre-line`; the worker converts `\n` → `<br>` itself for email HTML.
export function notificationTextToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const APP_HOSTNAMES = new Set(['www.mundamanager.com', 'mundamanager.com', 'localhost']);
const UNSAFE_LINK_SCHEME = /^(javascript|data|vbscript|file):/i;

export function isSafeNotificationLink(link: string | null | undefined): link is string {
  if (typeof link !== 'string') {
    return false;
  }

  const trimmed = link.trim();
  if (!trimmed) {
    return false;
  }

  if (UNSAFE_LINK_SCHEME.test(trimmed)) {
    return false;
  }

  if (trimmed.startsWith('//')) {
    return false;
  }

  if (trimmed.startsWith('/')) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && url.hostname === 'localhost';
  } catch {
    if (trimmed.includes(':')) {
      return false;
    }

    return true;
  }
}

export function resolveNotificationLink(
  link: string
): { href: string; isExternal: boolean } | null {
  if (!isSafeNotificationLink(link)) {
    return null;
  }

  const trimmed = link.trim();

  if (trimmed.startsWith('/')) {
    return { href: trimmed, isExternal: false };
  }

  try {
    const url = new URL(trimmed);

    const localhostHttp = url.protocol === 'http:' && url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !localhostHttp) {
      return null;
    }

    if (localhostHttp || APP_HOSTNAMES.has(url.hostname)) {
      return {
        href: `${url.pathname}${url.search}${url.hash}`,
        isExternal: false,
      };
    }

    return { href: trimmed, isExternal: true };
  } catch {
    if (trimmed.includes(':')) {
      return null;
    }

    return { href: `/${trimmed}`, isExternal: false };
  }
}

const CAMPAIGN_LINK_ID = /^\/campaigns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Path only, so a query or hash does not hide a campaign link. External URLs stay whole. */
function notificationPathname(href: string): string {
  if (!href.startsWith('/')) {
    return href.split(/[?#]/)[0] ?? href;
  }
  try {
    return new URL(href, 'http://localhost').pathname;
  } catch {
    return href.split(/[?#]/)[0] ?? href;
  }
}

export function campaignIdFromNotificationLink(link: string): string | null {
  const resolved = resolveNotificationLink(link);
  if (!resolved) return null;
  const match = notificationPathname(resolved.href).match(CAMPAIGN_LINK_ID);
  return match?.[1] ?? null;
}

export function getNotificationLinkLabel(link: string, campaignName?: string | null): string {
  const resolved = resolveNotificationLink(link);
  if (!resolved) {
    return 'Open link';
  }

  const { href } = resolved;
  const pathname = notificationPathname(href);

  if (CAMPAIGN_LINK_ID.test(pathname)) {
    const name = campaignName?.trim();
    return name ? `View campaign: ${name}` : 'View campaign';
  }

  if (pathname.includes('/battle-session/')) {
    return 'View battle session';
  }

  if (pathname.startsWith('/gang/')) {
    return 'View gang';
  }

  if (pathname.startsWith('/forum/')) {
    return 'View post';
  }

  if (pathname.startsWith('/account')) {
    return 'View account';
  }

  if (href.startsWith('http')) {
    try {
      return new URL(href).hostname;
    } catch {
      return 'Open link';
    }
  }

  return 'Open link';
}

export function getNotificationLinkDescription(link: string): string {
  const resolved = resolveNotificationLink(link);
  return resolved?.href ?? link.trim();
}
