'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { PiFlagBannerFoldBold } from 'react-icons/pi';
import Modal from '@/components/ui/modal';
import { DefaultImageCreditLine } from '@/components/ui/default-image-credit-line';
import { campaignPortraitPublicUrl } from '@/utils/campaign-image';
import type { DefaultImageCredit } from '@/types/gang';
import {
  alternativePortraits,
  gallerySections,
  portraitCaption,
  type CampaignPortrait,
  type CatalogueSlot,
} from '@/utils/campaign-portraits';

const COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';

interface CreateCampaignPortraitPickerProps {
  portraits: CampaignPortrait[];
  catalogueSlot: CatalogueSlot | null;
  selectedPortraitId: string | null;
  campaignTypeName: string;
  onSelect: (portraitId: string) => void;
  /** Shown when no catalogue portrait is selected, such as the campaign type image. */
  fallbackImageUrl?: string | null;
  fallbackCredit?: DefaultImageCredit | null;
  /** Edit flow: clear the catalogue portrait and show the campaign type image. */
  typeImageUrl?: string | null;
  onUseTypeImage?: () => void;
  typeImageSelected?: boolean;
  catalogueLoadFailed?: boolean;
  onRetryCatalogue?: () => void;
}

function PortraitFallback() {
  return (
    <span className="flex size-full items-center justify-center bg-secondary text-muted-foreground">
      <PiFlagBannerFoldBold className="size-1/2" />
    </span>
  );
}

function PortraitImage({
  src,
  alt,
  sizes,
  className,
  priority,
  quality,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  quality?: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <PortraitFallback />;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      quality={quality}
      onError={(event: SyntheticEvent<HTMLImageElement, Event>) => {
        console.error('Failed to load image:', event.currentTarget.src);
        setFailedSrc(src);
      }}
    />
  );
}

export function CreateCampaignPortraitPicker({
  portraits,
  catalogueSlot,
  selectedPortraitId,
  campaignTypeName,
  onSelect,
  fallbackImageUrl,
  fallbackCredit,
  typeImageUrl,
  onUseTypeImage,
  typeImageSelected = false,
  catalogueLoadFailed,
  onRetryCatalogue,
}: CreateCampaignPortraitPickerProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const selected = portraits.find((portrait) => portrait.id === selectedPortraitId) ?? null;
  const alternatives = alternativePortraits(portraits, selected, catalogueSlot);
  const selectedUrl = selected
    ? campaignPortraitPublicUrl(selected.storage_path)
    : fallbackImageUrl || undefined;
  const displayCredit = selected?.credit ?? (selected ? null : fallbackCredit);
  const currentGroupLabel = selected?.group_label ?? catalogueSlot?.groupLabel ?? null;

  useEffect(() => {
    if (!galleryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setGalleryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [galleryOpen]);

  return (
    <div className="my-4" data-portrait-picker>
      <div className="flex items-start justify-center gap-6 md:gap-10">
        <div className="flex flex-col items-center shrink-0">
          <div className="relative flex size-[200px] md:size-[250px] items-center justify-center">
            <div className="absolute z-10 mt-1 size-[145px] overflow-hidden rounded-full md:size-[180px]">
              {selectedUrl ? (
                <PortraitImage
                  src={selectedUrl}
                  alt={campaignTypeName || 'Campaign portrait'}
                  sizes="180px"
                  className="object-cover"
                  priority={false}
                  quality={100}
                />
              ) : (
                <PortraitFallback />
              )}
            </div>
            <div className="pointer-events-none absolute z-20 size-[200px] md:size-[250px]">
              <Image
                src={COGWHEEL_URL}
                alt=""
                width={250}
                height={250}
                className="absolute z-20"
                priority
                quality={100}
              />
            </div>
          </div>
          <DefaultImageCreditLine credit={displayCredit} />
        </div>

        <div className="flex h-[200px] md:h-[250px] shrink-0 flex-col justify-center gap-1">
          {alternatives.map((portrait) => {
            const url = campaignPortraitPublicUrl(portrait.storage_path);
            const caption = portraitCaption(portrait);
            return (
              <button
                key={portrait.id}
                type="button"
                onClick={() => onSelect(portrait.id)}
                className="relative size-14 md:size-[4.5rem] rounded-full overflow-hidden border-2 border-muted-foreground bg-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                aria-label={caption}
              >
                {url && (
                  <PortraitImage
                    src={url}
                    alt=""
                    sizes="72px"
                    className="object-cover"
                    quality={75}
                  />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="size-14 md:size-[4.5rem] rounded-full border-2 border-muted-foreground bg-card text-xs font-medium opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            More...
          </button>
        </div>
      </div>

      {catalogueLoadFailed && onRetryCatalogue && (
        <p className="mt-3 text-sm text-center text-destructive">
          Portraits could not be loaded.{' '}
          <button type="button" onClick={onRetryCatalogue} className="underline">
            Try again
          </button>
        </p>
      )}

      {galleryOpen &&
        createPortal(
          <div
            data-portrait-picker
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.stopPropagation();
            }}
          >
          <CampaignPortraitGallery
            portraits={portraits}
            currentGroupLabel={currentGroupLabel}
            selectedPortraitId={selectedPortraitId}
            typeImageUrl={onUseTypeImage ? typeImageUrl : undefined}
            typeImageSelected={typeImageSelected}
            onUseTypeImage={
              onUseTypeImage
                ? () => {
                    onUseTypeImage();
                    setGalleryOpen(false);
                  }
                : undefined
            }
            onSelect={(portraitId) => {
              onSelect(portraitId);
              setGalleryOpen(false);
            }}
            onClose={() => setGalleryOpen(false)}
          />
          </div>,
          document.body
        )}
    </div>
  );
}

function CampaignPortraitGallery({
  portraits,
  currentGroupLabel,
  selectedPortraitId,
  typeImageUrl,
  typeImageSelected = false,
  onUseTypeImage,
  onSelect,
  onClose,
}: {
  portraits: CampaignPortrait[];
  currentGroupLabel: string | null;
  selectedPortraitId: string | null;
  typeImageUrl?: string | null;
  typeImageSelected?: boolean;
  onUseTypeImage?: () => void;
  onSelect: (portraitId: string) => void;
  onClose: () => void;
}) {
  const sections = gallerySections(portraits, currentGroupLabel);

  return (
    <Modal
      title="Campaign Portraits"
      helper="Choose a portrait for this campaign."
      onClose={onClose}
      width="4xl"
    >
      {sections.length === 0 && !onUseTypeImage ? (
        <p className="text-sm text-muted-foreground">No portraits are available yet.</p>
      ) : (
        <div className="space-y-6">
          {sections.map((section, index) => (
            <section
              key={section.groupLabel}
              className={index === 1 ? 'border-t border-border pt-6' : undefined}
            >
              <h4 className="text-xl font-semibold mb-3">{section.groupLabel}</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                {section.portraits.map((portrait) => {
                  const url = campaignPortraitPublicUrl(portrait.storage_path);
                  const authorName = portrait.credit?.name?.trim();
                  const isSelected = portrait.id === selectedPortraitId;
                  return (
                    <button
                      key={portrait.id}
                      type="button"
                      onClick={() => onSelect(portrait.id)}
                      className={`flex flex-col items-center gap-1 rounded-md p-1 hover:bg-muted ${
                        isSelected ? 'ring-2 ring-foreground' : ''
                      }`}
                      aria-label={[portrait.label, authorName].filter(Boolean).join(', ') || section.groupLabel}
                      aria-pressed={isSelected}
                    >
                      <span className="relative size-24 sm:size-32 rounded-full overflow-hidden bg-secondary">
                        {url ? (
                          <PortraitImage
                            src={url}
                            alt=""
                            sizes="128px"
                            className="object-cover"
                            quality={75}
                          />
                        ) : (
                          <PortraitFallback />
                        )}
                      </span>
                      <span className="text-xs text-center leading-tight">
                        {portrait.label && <span className="block">{portrait.label}</span>}
                        {authorName && (
                          <span className="block text-muted-foreground">{authorName}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {onUseTypeImage && (
            <section className={sections.length > 0 ? 'border-t border-border pt-6' : undefined}>
              <h4 className="text-xl font-semibold mb-3">Campaign type image</h4>
              <button
                type="button"
                onClick={onUseTypeImage}
                className={`flex flex-col items-center gap-1 rounded-md p-1 hover:bg-muted ${
                  typeImageSelected ? 'ring-2 ring-foreground' : ''
                }`}
                aria-label="Use campaign type image"
                aria-pressed={typeImageSelected}
              >
                <span className="relative flex size-24 sm:size-32 items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {typeImageUrl ? (
                    <PortraitImage
                      src={typeImageUrl}
                      alt=""
                      sizes="128px"
                      className="object-cover"
                      quality={75}
                    />
                  ) : (
                    <PortraitFallback />
                  )}
                </span>
                <span className="text-xs text-center leading-tight">Campaign type</span>
              </button>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
