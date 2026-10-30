'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@/app/lib/utils';

export const COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';

interface CogwheelPortraitProps {
  src: string | null | undefined;
  alt?: string;
  /** Its first letter is the fallback when there is no image. */
  name?: string | null;
  /** Shown in the circle when there is no image, or it and errorSrc both fail to load. */
  fallback?: ReactNode;
  /** Shown instead of src when src fails to load. */
  errorSrc?: string;
  /** The big portrait at the top of the gang and campaign pages and in the portrait pickers. */
  large?: boolean;
  /** Sizes the cogwheel frame. */
  className?: string;
  /** Sizes the round image inside the frame. */
  imageClassName?: string;
}

/** A round image in the cogwheel frame, or a fallback such as an initial when there is none. */
export function CogwheelPortrait({
  src,
  alt = '',
  name,
  fallback = name?.charAt(0) || '?',
  errorSrc,
  large = false,
  className,
  imageClassName = large ? 'size-[145px] md:size-[180px] mt-1' : 'size-[76%]',
}: CogwheelPortraitProps) {
  // Cached pages can still point at an image its owner just replaced, and the old file is deleted on upload
  const [failed, setFailed] = useState<string[]>([]);
  const shown = src ? [src, errorSrc].find((url): url is string => !!url && !failed.includes(url)) : undefined;

  return (
    <span
      className={cn(
        'relative size-12 shrink-0 flex items-center justify-center',
        large && 'size-[200px] md:size-[250px]',
        className
      )}
    >
      <span
        aria-hidden={!shown}
        className={cn(
          'relative rounded-full overflow-hidden bg-muted text-muted-foreground font-semibold uppercase flex items-center justify-center select-none',
          imageClassName
        )}
      >
        {shown ? (
          <Image
            src={shown}
            alt={alt}
            fill
            sizes="250px"
            onError={() => setFailed((urls) => [...urls, shown])}
            className="object-cover"
          />
        ) : (
          fallback
        )}
      </span>
      <Image src={COGWHEEL_URL} alt="" fill sizes="250px" className="pointer-events-none" />
    </span>
  );
}
