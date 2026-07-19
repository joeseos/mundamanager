// Central definition of notification categories, their email behaviour, and the shared
// notification-text renderer.
//
// This is the Next.js-side single source of truth: the account settings UI (labels +
// which categories are toggleable), the preference server action, the unsubscribe route,
// and the in-app notification list all read from here. The Deno email worker keeps a
// small mirror of the email-eligible subset (Deno requires .ts import extensions the Next
// files don't use), and the DB knows nothing about these types — the enqueue trigger gates
// on a coarse capability list and the worker resolves preferences at send time.

import { escapeHtml } from './html';

export type NotificationType =
  | 'info'
  | 'warning'
  | 'error'
  | 'invite'
  | 'campaign_invite'
  | 'friend_request'
  | 'battle_invite'
  | 'gang_invite'
  | 'campaign_join_request';

export interface NotificationEmailConfig {
  /** Human label shown on the preferences screen. */
  label: string;
  /** Whether this category can be delivered by email at all (non-suppressible if false). */
  supportsEmail: boolean;
  /** Default email opt-in used when the user has no preference row for this category. */
  defaultEnabled: boolean;
  /** Email subject line for this category. */
  subject: string;
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
    subject: 'Someone wants to add your gang to a campaign',
  },
  friend_request: {
    label: 'Friend requests',
    supportsEmail: true,
    defaultEnabled: true,
    subject: 'You have a new friend request on Munda Manager',
  },
  // Not email-eligible (in-app only) — kept here so the type union is exhaustive.
  info: { label: 'Account & campaign updates', supportsEmail: false, defaultEnabled: false, subject: '' },
  warning: { label: 'Warnings', supportsEmail: false, defaultEnabled: false, subject: '' },
  error: { label: 'Errors', supportsEmail: false, defaultEnabled: false, subject: '' },
  // Battle-session invitations — in-app only (deliberately not emailed).
  battle_invite: { label: 'Battle session invitations', supportsEmail: false, defaultEnabled: false, subject: '' },
  // Requests to join a campaign (sent to OWNER/ARBITRATOR members) — in-app only.
  campaign_join_request: { label: 'Campaign join requests', supportsEmail: false, defaultEnabled: false, subject: '' },
  // Legacy type: campaign AND battle invites both used 'invite' before they were split
  // into campaign_invite / battle_invite. Retained (in-app only) so historical rows still
  // render; no new producer emits it. Safe to remove once all such rows have expired.
  invite: { label: 'Invitations', supportsEmail: false, defaultEnabled: false, subject: '' },
};

/**
 * Reserved pseudo-category stored as a `notification_type` in
 * user_notification_preferences that acts as the master email kill-switch.
 * Absent row (or enabled=true) means "master on".
 */
export const MASTER_PREF_KEY = 'all';

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
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    if (trimmed.includes(':')) {
      return false;
    }

    return true;
  }
}

export function shouldShowNotificationLinkAttachment(
  type: NotificationType,
  link: string | null | undefined
): link is string {
  if (type === 'friend_request' || type === 'gang_invite' || type === 'campaign_join_request') {
    return false;
  }

  return isSafeNotificationLink(link);
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

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (APP_HOSTNAMES.has(url.hostname)) {
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

export function getNotificationLinkLabel(link: string): string {
  const resolved = resolveNotificationLink(link);
  if (!resolved) {
    return 'Open link';
  }

  const { href } = resolved;
  const pathname = href.split('?')[0];

  if (/^\/campaigns\/[^/]+$/.test(pathname)) {
    return 'View campaign';
  }

  if (pathname.includes('/battle-session/')) {
    return 'View battle session';
  }

  if (pathname.startsWith('/gang/')) {
    return 'View gang';
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
