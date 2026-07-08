"use client"

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import { useSortable } from '@dnd-kit/react/sortable'
import { closestCenter } from '@dnd-kit/collision'
import { FiStar } from 'react-icons/fi'
import { AiFillStar } from 'react-icons/ai'

export interface CampaignCardProps {
  campaign: Campaign;
  onToggleFavourite: (campaignMemberId: string, isFavourite: boolean) => void;
  draggable?: boolean;
  isDragging?: boolean;
  disableLink?: boolean;
}

export function CampaignCardContent({ campaign, onToggleFavourite, draggable = false, isDragging, disableLink = false }: CampaignCardProps) {
  const innerContent = (
    <>
      <div className="relative w-[80px] md:w-20 h-[80px] md:h-20 mr-3 md:mr-4 shrink-0 flex items-center justify-center">
        {campaign.image_url || campaign.campaign_type_image_url ? (
          <Image
            src={campaign.image_url || campaign.campaign_type_image_url}
            alt={campaign.campaign_name}
            width={60}
            height={60}
            className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90"
            priority={false}
            onError={(e) => {
              console.error('Failed to load image:', e.currentTarget.src);
              e.currentTarget.src = "https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/underhive-gang-badzone-enforcers_ntnpzu.jpg";
            }}
          />
        ) : (
          <div className="absolute w-[60px] h-[60px] rounded-full bg-secondary z-10 flex items-center justify-center">
            {campaign.campaign_name.charAt(0)}
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
        <h3 className="text-lg md:text-xl font-medium text-foreground truncate">{campaign.campaign_name}</h3>
        <div className="text-sm md:text-base text-muted-foreground">
          <span className="truncate block">{campaign.campaign_type}</span>
          {campaign.user_gangs && campaign.user_gangs.length > 0 && (
            <span>
              {campaign.user_gangs.length === 1
                ? 'Your Gang: '
                : 'Your Gangs: '}
              {campaign.user_gangs
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(gang => gang.name)
                .join(', ')}
            </span>
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
        <Link href={`/campaigns/${campaign.id}`} prefetch={false} className="flex items-center grow min-w-0">
          {innerContent}
        </Link>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavourite(campaign.campaign_member_id, !campaign.is_favourite);
        }}
        className="mr-2 shrink-0 hover:scale-110 transition-transform"
        aria-label={campaign.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        {campaign.is_favourite ? <AiFillStar className="text-yellow-500" size={22} /> : <FiStar className="text-neutral-300 dark:text-neutral-700" size={22} />}
      </button>
    </div>
  );
}

interface SortableCampaignCardProps {
  campaign: Campaign;
  index: number;
  onToggleFavourite: (campaignMemberId: string, isFavourite: boolean) => void;
}

export function SortableCampaignCard({ campaign, index, onToggleFavourite }: SortableCampaignCardProps) {
  const { ref, isDragging } = useSortable({
    id: campaign.campaign_member_id,
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
    <li ref={ref} style={{ position: 'relative', zIndex: isDragging ? 50 : undefined }}>
      <CampaignCardContent
        campaign={campaign}
        onToggleFavourite={onToggleFavourite}
        draggable
        isDragging={isDragging}
        disableLink={isDragging}
      />
    </li>
  );
}
