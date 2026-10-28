'use client';

import { useEffect, useState } from 'react';

const TIME: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
};

/** "32 minutes ago", "2 hours ago", up to "23 hours ago". */
function formatSameDayAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.min(23, Math.floor(minutes / 60));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

/** "Today, 32 minutes ago", "Yesterday, 14:05", or "23 Oct 2026, 14:05". UTC, matching the other forum times. */
export function formatForumActivityDate(date: string, now = new Date()): string {
  const parsed = new Date(date);
  const day = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = (today - day) / 86_400_000;
  if (diffDays === 0) return `Today, ${formatSameDayAgo(parsed, now)}`;
  const time = parsed.toLocaleTimeString('en-GB', TIME);
  if (diffDays === 1) return `Yesterday, ${time}`;
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
    ...TIME,
  });
}

/** Last activity on a category list. Resolved in the browser so a cached page still says Today or Yesterday on the right day. */
export function ForumLastActivityDate({ date }: { date: string }) {
  const [label, setLabel] = useState(() => formatForumActivityDate(date));

  useEffect(() => {
    const update = () => {
      const next = formatForumActivityDate(date);
      setLabel((current) => (current === next ? current : next));
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [date]);

  return (
    <span className="whitespace-nowrap" suppressHydrationWarning>
      {label}
    </span>
  );
}
