'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Modal from '@/components/ui/modal';
import { DefaultImageCreditLine } from '@/components/ui/default-image-credit-line';
import { gangPortraitPublicUrl, UNKNOWN_GANG_IMAGE_URL, type DefaultImageCredit } from '@/types/gang';
import {
  alternativePortraits,
  gallerySections,
  portraitCaption,
  type CatalogueSlot,
  type GangPortrait,
} from '@/utils/gang-portraits';

const COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';

interface CreateGangPortraitPickerProps {
  portraits: GangPortrait[];
  catalogueSlot: CatalogueSlot | null;
  selectedPortraitId: string | null;
  gangTypeName: string;
  onSelect: (portraitId: string) => void;
  /** Shown when no catalogue portrait is selected, such as the gang's current index image. */
  fallbackImageUrl?: string | null;
  fallbackCredit?: DefaultImageCredit | null;
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
          <div className="relative flex size-[200px] md:size-[250px] items-center justify-center">
            {selectedUrl ? (
              <Image
                src={selectedUrl}
                alt={gangTypeName || 'Gang portrait'}
                width={180}
                height={180}
                className="absolute z-10 mt-1 size-[145px] rounded-full object-cover md:size-[180px]"
                priority={false}
                quality={100}
                onError={handleImageError}
              />
            ) : (
              <div className="absolute z-10 flex size-[180px] items-center justify-center rounded-full bg-secondary text-2xl">
                {gangTypeName.charAt(0)}
              </div>
            )}
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

      {galleryOpen &&
        createPortal(
          <GangPortraitGallery
            portraits={portraits}
            currentGroupLabel={currentGroupLabel}
            selectedPortraitId={selectedPortraitId}
            onSelect={(portraitId) => {
              onSelect(portraitId);
              setGalleryOpen(false);
            }}
            onClose={() => setGalleryOpen(false)}
          />,
          document.body
        )}
    </div>
  );
}

function GangPortraitGallery({
  portraits,
  currentGroupLabel,
  selectedPortraitId,
  onSelect,
  onClose,
}: {
  portraits: GangPortrait[];
  currentGroupLabel: string | null;
  selectedPortraitId: string | null;
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
      {sections.length === 0 ? (
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
        </div>
      )}
    </Modal>
  );
}
