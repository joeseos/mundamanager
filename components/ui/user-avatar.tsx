'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/app/lib/utils';

const COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';

interface UserAvatarProps {
  username: string | null;
  avatarUrl: string | null;
  /** Sizes the cogwheel frame; the avatar fills its centre. */
  className?: string;
}

/** A user's avatar in the cogwheel frame, or the first letter of their username when they have none. */
export function UserAvatar({ username, avatarUrl, className }: UserAvatarProps) {
  // Cached pages can still point at an avatar its owner just replaced, and the old file is deleted on upload
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span className={cn('relative size-12 shrink-0 flex items-center justify-center', className)}>
      {avatarUrl && avatarUrl !== failedUrl ? (
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
          className="size-[76%] rounded-full object-cover bg-muted"
        />
      ) : (
        <span
          aria-hidden
          className="size-[76%] rounded-full bg-muted text-muted-foreground font-semibold uppercase flex items-center justify-center select-none"
        >
          {username?.charAt(0) || '?'}
        </span>
      )}
      <Image src={COGWHEEL_URL} alt="" fill sizes="80px" className="pointer-events-none" />
    </span>
  );
}
