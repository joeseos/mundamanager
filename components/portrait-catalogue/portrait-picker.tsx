'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Modal from '@/components/ui/modal';
import { DefaultImageCreditLine } from '@/components/ui/default-image-credit-line';
import type { DefaultImageCredit } from '@/types/gang';
import {
  alternativePortraits,
  gallerySections,
  portraitCaption,
  PORTRAIT_COGWHEEL_URL,
  type CatalogueSlot,
  type Portrait,
} from '@/utils/portrait-catalogue';

export interface PortraitAlternateOption {
  heading: string;
  label: string;
  imageUrl?: string | null;
  selected: boolean;
  onSelect: () => void;
}

interface PortraitPickerProps {
  portraits: Portrait[];
  catalogueSlot: CatalogueSlot | null;
  selectedPortraitId: string | null;
  subjectName: string;
  onSelect: (portraitId: string) => void;
  imageUrl: (storagePath: string) => string | undefined;
  fallbackImageUrl?: string | null;
  fallbackCredit?: DefaultImageCredit | null;
  /** Shown when a portrait has no image, or when an image fails and imageErrorUrl is unset. */
  emptyFallback: ReactNode;
  /** Replaces a broken image. Gangs use the silhouette. */
  imageErrorUrl?: string;
  galleryTitle: string;
  galleryHelper: string;
  alternateOption?: PortraitAlternateOption;
  catalogueLoadFailed?: boolean;
  onRetryCatalogue?: () => void;
}

function CatalogueImage({
  src,
  alt,
  className,
  sizes,
  quality,
  priority,
  fill,
  width,
  height,
  imageErrorUrl,
  emptyFallback,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  quality?: number;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  imageErrorUrl?: string;
  emptyFallback: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (failed && !imageErrorUrl) {
    return (
      <span className={`flex items-center justify-center bg-secondary text-muted-foreground ${fill ? 'absolute inset-0' : className ?? ''}`}>
        {emptyFallback}
      </span>
    );
  }

  return (
    <Image
      src={failed && imageErrorUrl ? imageErrorUrl : src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      priority={priority}
      quality={quality}
      onError={() => {
        console.error('Failed to load image:', src);
        setFailedSrc(src);
      }}
    />
  );
}

export function PortraitPicker({
  portraits,
  catalogueSlot,
  selectedPortraitId,
  subjectName,
  onSelect,
  imageUrl,
  fallbackImageUrl,
  fallbackCredit,
  emptyFallback,
  imageErrorUrl,
  galleryTitle,
  galleryHelper,
  alternateOption,
  catalogueLoadFailed,
  onRetryCatalogue,
}: PortraitPickerProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const selected = portraits.find((portrait) => portrait.id === selectedPortraitId) ?? null;
  const alternatives = alternativePortraits(portraits, selected, catalogueSlot);
  const selectedUrl = selected
    ? imageUrl(selected.storage_path)
    : fallbackImageUrl || undefined;
  const displayCredit = selected?.credit ?? (selected ? null : fallbackCredit);
  const currentSectionKey =
    selected?.campaign_type_id
    || catalogueSlot?.campaignTypeId
    || selected?.group_label
    || catalogueSlot?.groupLabel
    || null;

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
            {selectedUrl ? (
              <CatalogueImage
                src={selectedUrl}
                alt={subjectName || 'Portrait'}
                width={180}
                height={180}
                className="absolute z-10 mt-1 size-[145px] rounded-full object-cover md:size-[180px]"
                priority={false}
                quality={100}
                imageErrorUrl={imageErrorUrl}
                emptyFallback={emptyFallback}
              />
            ) : (
              <div className="absolute z-10 flex size-[180px] items-center justify-center rounded-full bg-secondary text-muted-foreground">
                {emptyFallback}
              </div>
            )}
            <div className="pointer-events-none absolute z-20 size-[200px] md:size-[250px]">
              <Image
                src={PORTRAIT_COGWHEEL_URL}
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
            const url = imageUrl(portrait.storage_path);
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
                  <CatalogueImage
                    src={url}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                    quality={75}
                    imageErrorUrl={imageErrorUrl}
                    emptyFallback={emptyFallback}
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
          <PortraitGallery
            portraits={portraits}
            currentSectionKey={currentSectionKey}
            selectedPortraitId={selectedPortraitId}
            imageUrl={imageUrl}
            emptyFallback={emptyFallback}
            imageErrorUrl={imageErrorUrl}
            galleryTitle={galleryTitle}
            galleryHelper={galleryHelper}
            alternateOption={
              alternateOption
                ? {
                    ...alternateOption,
                    onSelect: () => {
                      alternateOption.onSelect();
                      setGalleryOpen(false);
                    },
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

function PortraitGallery({
  portraits,
  currentSectionKey,
  selectedPortraitId,
  imageUrl,
  emptyFallback,
  imageErrorUrl,
  galleryTitle,
  galleryHelper,
  alternateOption,
  onSelect,
  onClose,
}: {
  portraits: Portrait[];
  currentSectionKey: string | null;
  selectedPortraitId: string | null;
  imageUrl: (storagePath: string) => string | undefined;
  emptyFallback: ReactNode;
  imageErrorUrl?: string;
  galleryTitle: string;
  galleryHelper: string;
  alternateOption?: PortraitAlternateOption;
  onSelect: (portraitId: string) => void;
  onClose: () => void;
}) {
  const sections = gallerySections(portraits, currentSectionKey);

  return (
    <Modal
      title={galleryTitle}
      helper={galleryHelper}
      onClose={onClose}
      width="4xl"
    >
      {sections.length === 0 && !alternateOption ? (
        <p className="text-sm text-muted-foreground">No portraits are available yet.</p>
      ) : (
        <div className="space-y-6">
          {sections.map((section, index) => (
            <section
              key={section.key}
              className={index === 1 ? 'border-t border-border pt-6' : undefined}
            >
              <h4 className="text-xl font-semibold mb-3">{section.groupLabel}</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                {section.portraits.map((portrait) => {
                  const url = imageUrl(portrait.storage_path);
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
                          <CatalogueImage
                            src={url}
                            alt=""
                            fill
                            sizes="128px"
                            className="object-cover"
                            quality={75}
                            imageErrorUrl={imageErrorUrl}
                            emptyFallback={emptyFallback}
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center text-muted-foreground">
                            {emptyFallback}
                          </span>
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
          {alternateOption && (
            <section className={sections.length > 0 ? 'border-t border-border pt-6' : undefined}>
              <h4 className="text-xl font-semibold mb-3">{alternateOption.heading}</h4>
              <button
                type="button"
                onClick={alternateOption.onSelect}
                className={`flex flex-col items-center gap-1 rounded-md p-1 hover:bg-muted ${
                  alternateOption.selected ? 'ring-2 ring-foreground' : ''
                }`}
                aria-label={alternateOption.label}
                aria-pressed={alternateOption.selected}
              >
                <span className="relative flex size-24 sm:size-32 items-center justify-center overflow-hidden rounded-full bg-secondary text-muted-foreground">
                  {alternateOption.imageUrl ? (
                    <CatalogueImage
                      src={alternateOption.imageUrl}
                      alt=""
                      fill
                      sizes="128px"
                      className="object-cover"
                      quality={75}
                      imageErrorUrl={imageErrorUrl}
                      emptyFallback={emptyFallback}
                    />
                  ) : (
                    emptyFallback
                  )}
                </span>
                <span className="text-xs text-center leading-tight">{alternateOption.label}</span>
              </button>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
