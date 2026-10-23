'use client';

import { useState } from 'react';
import { cn } from '@/app/lib/utils';

interface UserAvatarProps {
  username: string | null;
  avatarUrl: string | null;
  className?: string;
}

/** A user's round avatar, or the first letter of their username when they have none. */
export function UserAvatar({ username, avatarUrl, className }: UserAvatarProps) {
  // Cached pages can still point at an avatar its owner just replaced, and the old file is deleted on upload
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (avatarUrl && avatarUrl !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        onError={() => setFailedUrl(avatarUrl)}
        // An image that failed before hydration fired its error event too early for onError
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailedUrl(avatarUrl);
        }}
        className={cn('size-10 shrink-0 rounded-full object-cover bg-muted', className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'size-10 shrink-0 rounded-full bg-muted text-muted-foreground font-semibold uppercase flex items-center justify-center select-none',
        className
      )}
    >
      {username?.charAt(0) || '?'}
    </span>
  );
}
