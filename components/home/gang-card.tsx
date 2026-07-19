"use client"

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Gang } from '@/app/lib/get-user-gangs'
import { useSortable } from '@dnd-kit/react/sortable'
import { closestCenter } from '@dnd-kit/collision'
import { FiStar } from 'react-icons/fi'
import { AiFillStar } from 'react-icons/ai'

export interface GangCardProps {
  gang: Gang;
  onToggleFavourite: (gangId: string, isFavourite: boolean) => void;
  draggable?: boolean;
  isDragging?: boolean;
  disableLink?: boolean;
}

export function GangCardContent({ gang, onToggleFavourite, draggable = false, isDragging, disableLink = false }: GangCardProps) {
  let imageUrl: string | null = null;

  if (gang.image_url) {
    imageUrl = gang.image_url;
  } else if (
    gang.default_gang_image !== null &&
    gang.default_gang_image !== undefined &&
    gang.gang_type_default_image_urls &&
    Array.isArray(gang.gang_type_default_image_urls) &&
    gang.default_gang_image >= 0 &&
    gang.default_gang_image < gang.gang_type_default_image_urls.length
  ) {
    imageUrl = gang.gang_type_default_image_urls[gang.default_gang_image].url;
  }

  const innerContent = (
    <>
      <div className="relative w-[80px] md:w-20 h-[80px] md:h-20 mr-3 md:mr-4 shrink-0 flex items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={gang.name}
            width={60}
            height={60}
            className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90"
            priority={false}
            onError={(e) => {
              console.error('Failed to load image:', e.currentTarget.src);
              e.currentTarget.src = "https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/unknown_gang_cropped_web.webp";
            }}
          />
        ) : (
          <div className="absolute w-[60px] h-[60px] rounded-full bg-secondary z-10 flex items-center justify-center">
            {gang.name.charAt(0)}
          </div>
        )}
        <Image
          src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp"
          alt=""
          width={80}
          height={80}
          className="absolute z-20 scale-110"
          priority
          sizes="80px, 80px"
        />
      </div>
      <div className="grow min-w-0">
        <h3 className="text-lg md:text-xl font-medium text-foreground truncate">{gang.name}</h3>
        <div className="text-sm md:text-base text-muted-foreground">
          <span className="truncate block">
            {gang.gang_type}
            {gang.gang_variants && gang.gang_variants.length > 0
              ? ` (${gang.gang_variants.map(v => v.variant).join(', ')})`
              : ''}
          </span>
          <span>Rating: {gang.rating ?? 0}</span>
          {gang.campaigns && gang.campaigns.length > 0 && (
            <span className="block">Campaign: {gang.campaigns[0].campaign_name}</span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`flex items-center p-2 md:p-4 rounded-md hover:bg-muted transition-colors duration-200 ${isDragging ? 'border-[3px] border-rose-700 bg-card shadow-lg' : ''} ${draggable ? 'cursor-grab select-none' : ''}`}
      style={draggable ? { touchAction: 'manipulation', WebkitTouchCallout: 'none' } : undefined}
    >
      {disableLink ? (
        <div className="flex items-center grow min-w-0">
          {innerContent}
        </div>
      ) : (
        <Link href={`/gang/${gang.id}`} prefetch={false} className="flex items-center grow min-w-0">
          {innerContent}
        </Link>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavourite(gang.id, !gang.is_favourite);
        }}
        className="mr-2 shrink-0 hover:scale-110 transition-transform"
        aria-label={gang.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        {gang.is_favourite ? <AiFillStar className="text-yellow-500" size={22} /> : <FiStar className="text-neutral-300 dark:text-neutral-700" size={22} />}
      </button>
    </div>
  );
}

interface SortableGangCardProps {
  gang: Gang;
  index: number;
  onToggleFavourite: (gangId: string, isFavourite: boolean) => void;
}

export function SortableGangCard({ gang, index, onToggleFavourite }: SortableGangCardProps) {
  const { ref, isDragging } = useSortable({
    id: gang.id,
    index,
    // Same collision strategy as the legacy DndContext used (closestCenter)
    collisionDetector: closestCenter,
  });

  useEffect(() => {
    if (!isDragging) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [isDragging]);

  return (
    // Touch-suppression must sit on the sortable SOURCE element itself (not just
    // a child) to make touch drag work on Android — this matches the working
    // gang-page fighter cards, whose ref element carries the same properties.
    <li
      ref={ref}
      style={{
        position: 'relative',
        zIndex: isDragging ? 50 : undefined,
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <GangCardContent
        gang={gang}
        onToggleFavourite={onToggleFavourite}
        draggable
        isDragging={isDragging}
        disableLink={isDragging}
      />
    </li>
  );
}
