"use client"

import { CogwheelPortrait } from '@/components/ui/cogwheel-portrait'
import Link from 'next/link'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import { useSortable } from '@dnd-kit/react/sortable'
import { FiStar } from 'react-icons/fi'
import { AiFillStar } from 'react-icons/ai'
import { dragSurfaceProps } from '@/hooks/use-dnd-sensors'
import { resolveCampaignImageUrl } from '@/utils/campaign-image'

export interface CampaignCardProps {
  campaign: Campaign;
  onToggleFavourite: (campaignMemberId: string, isFavourite: boolean) => void;
  /** Set only on a sortable favourite: the card's drag handle ref. */
  drag?: { handleRef: (element: Element | null) => void };
  isDragging?: boolean;
  disableLink?: boolean;
}

export function CampaignCardContent({ campaign, onToggleFavourite, drag, isDragging, disableLink = false }: CampaignCardProps) {
  const isDraggable = Boolean(drag);
  const imageUrl = resolveCampaignImageUrl({
    imageUrl: campaign.image_url,
    portraitUrl: campaign.campaign_portrait_url,
    typeImageUrl: campaign.campaign_type_image_url,
  });

  const innerContent = (
    <>
      <CogwheelPortrait
        src={imageUrl}
        alt={campaign.campaign_name ?? ''}
        name={campaign.campaign_name}
        errorSrc="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/underhive-gang-badzone-enforcers_ntnpzu.jpg"
        className="size-20 mr-3 md:mr-4 scale-110"
        imageClassName="size-[82%]"
      />
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
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
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
      className={`flex items-center p-2 md:p-4 rounded-md hover:bg-muted transition-colors duration-200 ${isDragging ? 'border-[3px] border-rose-700 bg-card' : ''} ${isDraggable ? 'cursor-grab' : ''}`}
      ref={drag?.handleRef}
      {...dragSurfaceProps(isDraggable)}
    >
      {/* Always rendered — never swapped for a bare div when `disableLink` flips on drag start,
          so the touch target stays stable for the whole gesture. Next's Link skips navigating
          when a click handler calls preventDefault, so soft navigation is preserved. */}
      <Link
        href={`/campaigns/${campaign.id}`}
        prefetch={false}
        onClick={(e) => { if (disableLink) e.preventDefault(); }}
        tabIndex={disableLink ? -1 : undefined}
        aria-hidden={disableLink || undefined}
        className={`flex items-center grow min-w-0${isDraggable ? ' home-favourite-card-link' : ''}`}
      >
        {innerContent}
      </Link>
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
  const { ref, handleRef, isDragging } = useSortable({ id: campaign.campaign_member_id, index });

  return (
    <li ref={ref} style={{ position: 'relative', zIndex: isDragging ? 50 : undefined }}>
      <CampaignCardContent
        campaign={campaign}
        onToggleFavourite={onToggleFavourite}
        drag={{ handleRef }}
        isDragging={isDragging}
        disableLink={isDragging}
      />
    </li>
  );
}
