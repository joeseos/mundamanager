'use client';

import { useSyncExternalStore } from 'react';

const RELATIVE = new Intl.RelativeTimeFormat('en-GB');
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' };

// Re-renders each minute in the browser. Null on the server and while hydrating, so cached HTML keeps the fixed date
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 60_000);
  return () => window.clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

function relativeLabel(date: Date, fixed: string): string {
  const now = Date.now();
  const days = Math.floor(now / 86_400_000) - Math.floor(date.getTime() / 86_400_000);
  if (days === 1) return `Yesterday, ${date.toLocaleTimeString('en-GB', TIME)}`;
  if (days !== 0) return fixed;
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return 'Today, just now';
  return `Today, ${minutes < 60 ? RELATIVE.format(-minutes, 'minute') : RELATIVE.format(-Math.floor(minutes / 60), 'hour')}`;
}

/** "Today, 32 minutes ago" or "Yesterday, 14:05" in the browser, otherwise the fixed date the server rendered. UTC, like the other forum times. */
export function ForumRelativeTime({ date, children }: { date: string; children: string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  return (
    <time dateTime={new Date(date).toISOString()} title={children} className="whitespace-nowrap">
      {minute === null ? children : relativeLabel(new Date(date), children)}
    </time>
  );
}
