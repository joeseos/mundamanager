'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type State =
  | { status: 'loading' }
  | { status: 'done'; ok: boolean; message: string };

// Reads the signed token from the URL (client-side, so the page stays static/ISR) and
// performs the unsubscribe via the API route. The token carries the user + category, so
// no session is needed.
export default function UnsubscribeClient() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(() =>
    token
      ? { status: 'loading' }
      : { status: 'done', ok: false, message: 'Missing unsubscribe token.' },
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
          { method: 'POST' },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
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
        if (!cancelled) {
          setState({
            status: 'done',
            ok: false,
            message: 'Could not reach the server. Please try again.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === 'loading') {
    return (
      <p className="text-sm text-muted-foreground">Updating your preferences…</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">{state.message}</p>
      <Link href="/account" className="text-sm text-primary underline">
        Manage email preferences
      </Link>
    </div>
  );
}
