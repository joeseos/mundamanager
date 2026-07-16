// Central definition of notification categories, their email behaviour, and the shared
// notification-text renderer.
//
// This is the Next.js-side single source of truth: the account settings UI (labels +
// which categories are toggleable), the preference server action, the unsubscribe route,
// and the in-app notification list all read from here. The Deno email worker keeps a
// small mirror of the email-eligible subset (Deno requires .ts import extensions the Next
// files don't use), and the DB knows nothing about these types — the enqueue trigger gates
// on a coarse capability list and the worker resolves preferences at send time.

import { escapeHtml } from '../html';

export type NotificationType =
  | 'info'
  | 'warning'
  | 'error'
  | 'invite'
  | 'friend_request'
  | 'battle_invite'
  | 'gang_invite';

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
  // Campaign-member and battle-session invites (both use type 'invite' today).
  invite: {
    label: 'Campaign & battle invitations',
    supportsEmail: true,
    defaultEnabled: true,
    subject: 'You have a new invitation on Munda Manager',
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
  battle_invite: { label: 'Battle invitations', supportsEmail: false, defaultEnabled: false, subject: '' },
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
