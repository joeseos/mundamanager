'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { decodeUnsubscribeType } from '@/utils/notifications/unsubscribe-token';
import {
  notificationEmailConfig,
  MASTER_PREF_KEY,
  type NotificationType,
} from '@/utils/notifications/email-config';

type State =
  | { status: 'confirm' }
  | { status: 'submitting' }
  | { status: 'done'; ok: boolean; message: string }
  | { status: 'error'; message: string };

// Human-facing unsubscribe confirmation. The mutation is fired ONLY from the button's
// click handler — never on mount — so email security scanners that prefetch/render the
// link (Defender SafeLinks, Proofpoint, etc.) cannot silently unsubscribe the user. The
// RFC 8058 one-click path (List-Unsubscribe-Post → the API route) is separate and stays
// automatic, because that request is genuinely user-initiated by the mail client.
export default function UnsubscribeClient() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(
    token ? { status: 'confirm' } : { status: 'error', message: 'Missing unsubscribe token.' },
  );

  // Display-only label for what's being unsubscribed (signature verified server-side).
  const type = token ? decodeUnsubscribeType(token) : null;
  const label =
    type === MASTER_PREF_KEY
      ? 'all notification emails'
      : (type && notificationEmailConfig[type as NotificationType]?.label) ||
        'these notification emails';

  const onConfirm = async () => {
    if (!token) return;
    setState({ status: 'submitting' });
    try {
      const res = await fetch(
        `/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      const data = await res.json().catch(() => ({}));
      setState({
        status: 'done',
        ok: res.ok && data.ok !== false,
        message:
          data.message ??
          (res.ok
            ? 'You have been unsubscribed.'
            : 'Could not update your preferences. Please try again.'),
      });
    } catch {
      setState({
        status: 'error',
        message: 'Could not reach the server. Please try again.',
      });
    }
  };

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <p className="text-sm">{state.message}</p>
        <Link href="/account" className="text-sm text-primary underline">
          Manage email preferences
        </Link>
      </div>
    );
  }

  if (state.status === 'done') {
    return (
      <div className="space-y-4">
        <p className="text-sm">{state.message}</p>
        <Link href="/account" className="text-sm text-primary underline">
          Manage email preferences
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        You&apos;re about to unsubscribe from <strong>{label}</strong>. You can re-enable
        emails anytime in your account settings.
      </p>
      <Button onClick={onConfirm} disabled={state.status === 'submitting'}>
        {state.status === 'submitting' ? 'Unsubscribing…' : 'Unsubscribe'}
      </Button>
    </div>
  );
}
