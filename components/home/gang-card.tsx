"use client"

import { useState, useEffect } from 'react'
import Image from 'next/image'
import type { Gang } from '@/app/lib/get-user-gangs'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FiStar } from 'react-icons/fi'
import { AiFillStar } from 'react-icons/ai'

export interface GangCardProps {
  gang: Gang;
  onToggleFavourite: (gangId: string, isFavourite: boolean) => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
  isDragging?: boolean;
  disableLink?: boolean;
}

export function GangCardContent({ gang, onToggleFavourite, dragListeners, dragAttributes, isDragging, disableLink = false }: GangCardProps) {
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
      <div className="flex-grow min-w-0">
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
      className={`flex items-center p-2 md:p-4 rounded-md hover:bg-muted transition-colors duration-200 ${isDragging ? 'border-[3px] border-rose-700' : ''} ${dragListeners ? 'cursor-grab' : ''}`}
      {...(dragListeners || {})}
      {...(dragAttributes || {})}
    >
      {disableLink ? (
        <div className="flex items-center flex-grow min-w-0">
          {innerContent}
        </div>
      ) : (
        <a href={`/gang/${gang.id}`} className="flex items-center flex-grow min-w-0">
          {innerContent}
        </a>
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
  onToggleFavourite: (gangId: string, isFavourite: boolean) => void;
}

export function SortableGangCard({ gang, onToggleFavourite }: SortableGangCardProps) {
  const [isDraggingState, setIsDraggingState] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: dndKitIsDragging,
  } = useSortable({
    id: gang.id,
    animateLayoutChanges: () => false,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: dndKitIsDragging ? 50 : 'auto',
    position: 'relative',
    pointerEvents: 'auto',
  } as const;

  useEffect(() => {
    setIsDraggingState(dndKitIsDragging);
  }, [dndKitIsDragging]);

  useEffect(() => {
    if (!dndKitIsDragging) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [dndKitIsDragging]);

  return (
    <li ref={setNodeRef} style={style}>
      <GangCardContent
        gang={gang}
        onToggleFavourite={onToggleFavourite}
        dragListeners={listeners as unknown as Record<string, unknown>}
        dragAttributes={attributes as unknown as Record<string, unknown>}
        isDragging={dndKitIsDragging}
        disableLink={isDraggingState}
      />
    </li>
  );
}
