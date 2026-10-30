'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Modal from '@/components/ui/modal';
import { CogwheelPortrait } from '@/components/ui/cogwheel-portrait';
import { DefaultImageCreditLine } from '@/components/ui/default-image-credit-line';
import { gangPortraitPublicUrl, UNKNOWN_GANG_IMAGE_URL, type DefaultImageCredit } from '@/types/gang';
import {
  alternativePortraits,
  gallerySections,
  portraitCaption,
  type CatalogueSlot,
  type GangPortrait,
} from '@/utils/gang-portraits';

interface CreateGangPortraitPickerProps {
  portraits: GangPortrait[];
  catalogueSlot: CatalogueSlot | null;
  selectedPortraitId: string | null;
  gangTypeName: string;
  onSelect: (portraitId: string) => void;
  /** Shown when no catalogue portrait is selected, such as the gang's current index image. */
  fallbackImageUrl?: string | null;
  fallbackCredit?: DefaultImageCredit | null;
  /** Edit flow: replace the catalogue portrait with the gang type's silhouette. */
  silhouetteImageUrl?: string | null;
  onUseSilhouette?: () => void;
  silhouetteSelected?: boolean;
  catalogueLoadFailed?: boolean;
  onRetryCatalogue?: () => void;
}

function handleImageError(event: SyntheticEvent<HTMLImageElement, Event>) {
  event.currentTarget.src = UNKNOWN_GANG_IMAGE_URL;
}

export function CreateGangPortraitPicker({
  portraits,
  catalogueSlot,
  selectedPortraitId,
  gangTypeName,
  onSelect,
  fallbackImageUrl,
  fallbackCredit,
  silhouetteImageUrl,
  onUseSilhouette,
  silhouetteSelected = false,
  catalogueLoadFailed,
  onRetryCatalogue,
}: CreateGangPortraitPickerProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const selected = portraits.find((portrait) => portrait.id === selectedPortraitId) ?? null;
  const alternatives = alternativePortraits(portraits, selected, catalogueSlot);
  const selectedUrl = selected
    ? gangPortraitPublicUrl(selected.storage_path)
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
          <CogwheelPortrait
            src={selectedUrl}
            alt={gangTypeName || 'Gang portrait'}
            name={gangTypeName}
            errorSrc={UNKNOWN_GANG_IMAGE_URL}
            preload
            large
            className="text-2xl"
          />
          <DefaultImageCreditLine credit={displayCredit} />
        </div>

        <div className="flex h-[200px] md:h-[250px] shrink-0 flex-col justify-center gap-1">
          {alternatives.map((portrait) => {
            const url = gangPortraitPublicUrl(portrait.storage_path);
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
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                    quality={75}
                    onError={handleImageError}
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
          <GangPortraitGallery
            portraits={portraits}
            currentGroupLabel={currentGroupLabel}
            selectedPortraitId={selectedPortraitId}
            gangTypeName={gangTypeName}
            silhouetteImageUrl={onUseSilhouette ? silhouetteImageUrl : undefined}
            silhouetteSelected={silhouetteSelected}
            onUseSilhouette={
              onUseSilhouette
                ? () => {
                    onUseSilhouette();
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

function GangPortraitGallery({
  portraits,
  currentGroupLabel,
  selectedPortraitId,
  gangTypeName,
  silhouetteImageUrl,
  silhouetteSelected = false,
  onUseSilhouette,
  onSelect,
  onClose,
}: {
  portraits: GangPortrait[];
  currentGroupLabel: string | null;
  selectedPortraitId: string | null;
  gangTypeName: string;
  silhouetteImageUrl?: string | null;
  silhouetteSelected?: boolean;
  onUseSilhouette?: () => void;
  onSelect: (portraitId: string) => void;
  onClose: () => void;
}) {
  const sections = gallerySections(portraits, currentGroupLabel);

  return (
    <Modal
      title="Gang Portraits"
      helper="Choose a portrait for this gang."
      onClose={onClose}
      width="4xl"
    >
      {sections.length === 0 && !onUseSilhouette ? (
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
                  const url = gangPortraitPublicUrl(portrait.storage_path);
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
                        {url && (
                          <Image
                            src={url}
                            alt=""
                            fill
                            sizes="128px"
                            className="object-cover"
                            quality={75}
                            onError={handleImageError}
                          />
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
          {onUseSilhouette && (
            <section className={sections.length > 0 ? 'border-t border-border pt-6' : undefined}>
              <h4 className="text-xl font-semibold mb-3">Silhouette</h4>
              <button
                type="button"
                onClick={onUseSilhouette}
                className={`flex flex-col items-center gap-1 rounded-md p-1 hover:bg-muted ${
                  silhouetteSelected ? 'ring-2 ring-foreground' : ''
                }`}
                aria-label="Use silhouette"
                aria-pressed={silhouetteSelected}
              >
                <span className="relative flex size-24 sm:size-32 items-center justify-center rounded-full overflow-hidden bg-secondary">
                  {silhouetteImageUrl ? (
                    <Image
                      src={silhouetteImageUrl}
                      alt=""
                      fill
                      sizes="128px"
                      className="object-cover"
                      quality={75}
                      onError={handleImageError}
                    />
                  ) : (
                    <span className="text-2xl">{gangTypeName.charAt(0)}</span>
                  )}
                </span>
                <span className="text-xs text-center leading-tight">Silhouette</span>
              </button>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
