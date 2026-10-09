'use client';

import React, { useEffect, useState } from 'react';
import { updateGangImage } from '@/app/actions/update-gang-image';
import { CreateGangPortraitPicker } from '@/components/gang/create-gang-portrait-picker';
import { ImageEditModal } from '@/components/ui/image-edit-modal';
import { useGangPortraits } from '@/hooks/use-gang-portraits';
import {
  gangPortraitPublicUrl,
  UNKNOWN_GANG_IMAGE_URL,
  type DefaultImageEntry,
} from '@/types/gang';
import { createClient } from '@/utils/supabase/client';
import {
  catalogueSlotForGangType,
  defaultPortraitForSlot,
  type CatalogueSlot,
  type GangPortrait,
} from '@/utils/gang-portraits';

interface GangImageEditModalProps {
  onClose: () => void;
  currentImageUrl?: string;
  gangId: string;
  gangType: string;
  gangTypeId?: string | null;
  isCustomGangType: boolean;
  gangPortraitId?: string | null;
  currentPortraitUrl?: string | null;
  onImageUpdate: (newImageUrl: string, newDefaultImageIndex?: number | null) => void;
  onPortraitUpdate: (portraitId: string, portraitUrl: string) => void;
  defaultImageUrls?: DefaultImageEntry[];
  currentDefaultImageIndex?: number | null;
}

function portraitIdForImageUrl(portraits: GangPortrait[], imageUrl?: string): string | null {
  if (!imageUrl) return null;
  const match = portraits.find((portrait) => {
    const publicUrl = gangPortraitPublicUrl(portrait.storage_path);
    return publicUrl === imageUrl || imageUrl.endsWith(`/${portrait.storage_path}`);
  });
  return match?.id ?? null;
}

function indexedDefaultImage(
  defaultImageUrls: DefaultImageEntry[] | undefined,
  currentDefaultImageIndex: number | null | undefined
): DefaultImageEntry | undefined {
  if (
    !defaultImageUrls ||
    currentDefaultImageIndex === null ||
    currentDefaultImageIndex === undefined ||
    currentDefaultImageIndex < 0 ||
    currentDefaultImageIndex >= defaultImageUrls.length
  ) {
    return undefined;
  }
  return defaultImageUrls[currentDefaultImageIndex];
}

function startingPortraitId(
  portraits: GangPortrait[],
  slot: CatalogueSlot | null,
  savedPortraitId: string | null,
  isCustomGangType: boolean,
  indexedImage: DefaultImageEntry | undefined
): string | null {
  if (savedPortraitId && portraits.some((portrait) => portrait.id === savedPortraitId)) {
    return savedPortraitId;
  }
  if (isCustomGangType) return null;
  const matchedId = portraitIdForImageUrl(portraits, indexedImage?.url);
  if (matchedId) return matchedId;
  // An index that is not a catalogue file stays as-is until the user picks a portrait.
  if (indexedImage?.url) return null;
  return defaultPortraitForSlot(portraits, slot)?.id ?? null;
}

export const GangImageEditModal: React.FC<GangImageEditModalProps> = ({
  onClose,
  currentImageUrl,
  gangId,
  gangType,
  gangTypeId,
  isCustomGangType,
  gangPortraitId,
  currentPortraitUrl,
  onImageUpdate,
  onPortraitUpdate,
  defaultImageUrls,
  currentDefaultImageIndex,
}) => {
  const { portraits, status: portraitsStatus } = useGangPortraits();
  const [catalogueSlot, setCatalogueSlot] = useState<CatalogueSlot | null>(null);
  const [catalogueReady, setCatalogueReady] = useState(isCustomGangType || !gangTypeId);
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(gangPortraitId ?? null);
  const [appliedStartingSelection, setAppliedStartingSelection] = useState(false);
  const [clearedPortrait, setClearedPortrait] = useState(false);

  useEffect(() => {
    if (isCustomGangType || !gangTypeId) return;
    let cancelled = false;
    const supabase = createClient();

    const fetchGangType = async () => {
      const { data: typeRow, error } = await supabase
        .from('gang_types')
        .select('gang_type, parent_gang_type_id')
        .eq('id', gangTypeId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !typeRow) {
        console.error('Error fetching gang type for portrait slot:', error);
        setCatalogueSlot(catalogueSlotForGangType({ gang_type: gangType }, null));
        setCatalogueReady(true);
        return;
      }

      let parentName: string | null = null;
      if (typeRow.parent_gang_type_id) {
        const { data: parent } = await supabase
          .from('gang_types')
          .select('gang_type')
          .eq('id', typeRow.parent_gang_type_id)
          .maybeSingle();
        parentName = parent?.gang_type ?? null;
      }

      if (cancelled) return;
      setCatalogueSlot(
        catalogueSlotForGangType(
          {
            gang_type: typeRow.gang_type,
            parent_gang_type_id: typeRow.parent_gang_type_id,
          },
          parentName
        )
      );
      setCatalogueReady(true);
    };

    fetchGangType();
    return () => {
      cancelled = true;
    };
  }, [gangType, gangTypeId, isCustomGangType]);

  const indexedImage = indexedDefaultImage(defaultImageUrls, currentDefaultImageIndex);

  if (portraitsStatus === 'ready' && catalogueReady && !appliedStartingSelection) {
    setAppliedStartingSelection(true);
    if (!clearedPortrait) {
      setSelectedPortraitId(
        startingPortraitId(
          portraits,
          isCustomGangType ? null : catalogueSlot,
          gangPortraitId ?? null,
          isCustomGangType,
          indexedImage
        )
      );
    }
  }

  const savedPortraitId = gangPortraitId ?? null;
  const silhouetteIndex = defaultImageUrls && defaultImageUrls.length > 0 ? 0 : null;
  const silhouetteImageUrl = defaultImageUrls?.[0]?.url || UNKNOWN_GANG_IMAGE_URL;
  const alreadyOnSilhouette =
    savedPortraitId === null &&
    (silhouetteIndex === null ? currentDefaultImageIndex == null : currentDefaultImageIndex === 0);
  const portraitChanged =
    portraitsStatus !== 'error' &&
    appliedStartingSelection &&
    !currentImageUrl &&
    ((selectedPortraitId !== null && selectedPortraitId !== savedPortraitId) ||
      (clearedPortrait && !alreadyOnSilhouette));
  const selectedInList = portraits.some((portrait) => portrait.id === selectedPortraitId);
  const fallbackImageUrl = selectedInList
    ? undefined
    : selectedPortraitId
      ? currentPortraitUrl
      : clearedPortrait
        ? silhouetteImageUrl
        : !isCustomGangType && appliedStartingSelection
          ? indexedImage?.url
          : undefined;
  const fallbackCredit = clearedPortrait
    ? defaultImageUrls?.[0]?.credit
    : !selectedPortraitId && fallbackImageUrl === indexedImage?.url
      ? indexedImage?.credit
      : undefined;

  const handleSavePortrait = async () => {
    if (clearedPortrait && !selectedPortraitId) {
      const result = await updateGangImage(gangId, undefined, silhouetteIndex);
      if (result.success) {
        onImageUpdate('', silhouetteIndex);
      }
      return result;
    }
    if (!selectedPortraitId) return { success: false, error: 'No portrait selected' };
    const selected = portraits.find((portrait) => portrait.id === selectedPortraitId);
    const portraitUrl = selected ? gangPortraitPublicUrl(selected.storage_path) : undefined;
    if (!portraitUrl) return { success: false, error: 'Portrait image is missing' };

    const result = await updateGangImage(gangId, undefined, undefined, selectedPortraitId);
    if (result.success) {
      onPortraitUpdate(selectedPortraitId, portraitUrl);
    }
    return result;
  };

  return (
    <ImageEditModal
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Gang Image"
      onImageUpdate={onImageUpdate}
      portraitPicker={
        <CreateGangPortraitPicker
          portraits={portraits}
          catalogueSlot={isCustomGangType ? null : catalogueSlot}
          selectedPortraitId={selectedPortraitId}
          gangTypeName={gangType}
          onSelect={(portraitId) => {
            setClearedPortrait(false);
            setSelectedPortraitId(portraitId);
          }}
          fallbackImageUrl={fallbackImageUrl}
          fallbackCredit={fallbackCredit}
          silhouetteImageUrl={silhouetteImageUrl}
          onUseSilhouette={() => {
            setClearedPortrait(true);
            setSelectedPortraitId(null);
          }}
        />
      }
      portraitChanged={portraitChanged}
      onSavePortrait={handleSavePortrait}
      uploadConfig={{
        entityId: gangId,
        storagePath: `gangs/${gangId}`,
        fileNamePattern: (id: string, timestamp: number) => `${id}_${timestamp}.webp`,
        listPath: `gangs/${gangId}/`,
        updateAction: (imageUrl: string | null) => updateGangImage(gangId, imageUrl),
        successMessage: 'Gang image updated successfully',
        removeSuccessMessage: 'Gang image removed successfully',
      }}
      imageConfig={{
        crop: true,
        width: 200,
        height: 200,
        targetSizeBytes: 16 * 1024,
      }}
    />
  );
};
