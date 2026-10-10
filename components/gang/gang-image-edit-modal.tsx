'use client';

import React, { useState } from 'react';
import { updateGangImage } from '@/app/actions/update-gang-image';
import { CreateGangPortraitPicker } from '@/components/gang/create-gang-portrait-picker';
import { ImageEditModal } from '@/components/ui/image-edit-modal';
import { useGangPortraits } from '@/hooks/use-gang-portraits';
import { gangPortraitPublicUrl, type DefaultImageEntry } from '@/types/gang';
import { catalogueSlotForGangType } from '@/utils/gang-portraits';

interface GangImageEditModalProps {
  onClose: () => void;
  currentImageUrl?: string;
  gangId: string;
  gangType: string;
  gangTypeId?: string | null;
  isCustomGangType: boolean;
  parentGangTypeName?: string | null;
  gangPortraitId?: string | null;
  currentPortraitUrl?: string | null;
  onImageUpdate: (newImageUrl: string, newDefaultImageIndex?: number | null) => void;
  onPortraitUpdate: (portraitId: string, portraitUrl: string) => void;
  defaultImageUrls?: DefaultImageEntry[];
  currentDefaultImageIndex?: number | null;
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

export const GangImageEditModal: React.FC<GangImageEditModalProps> = ({
  onClose,
  currentImageUrl,
  gangId,
  gangType,
  isCustomGangType,
  parentGangTypeName,
  gangPortraitId,
  currentPortraitUrl,
  onImageUpdate,
  onPortraitUpdate,
  defaultImageUrls,
  currentDefaultImageIndex,
}) => {
  const { portraits, status: portraitsStatus } = useGangPortraits();
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(gangPortraitId ?? null);
  const [clearedPortrait, setClearedPortrait] = useState(false);

  const catalogueSlot = isCustomGangType
    ? null
    : catalogueSlotForGangType(
        {
          gang_type: gangType,
          parent_gang_type_id: parentGangTypeName ? 'parent' : null,
        },
        parentGangTypeName ?? null
      );

  const indexedImage = indexedDefaultImage(defaultImageUrls, currentDefaultImageIndex);
  const savedPortraitId = gangPortraitId ?? null;
  const silhouetteIndex = defaultImageUrls && defaultImageUrls.length > 0 ? 0 : null;
  const silhouetteImageUrl = defaultImageUrls?.[0]?.url ?? null;
  const alreadyOnSilhouette =
    savedPortraitId === null &&
    (silhouetteIndex === null ? currentDefaultImageIndex == null : currentDefaultImageIndex === 0);
  const portraitChanged =
    portraitsStatus !== 'error' &&
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
        : indexedImage?.url;
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
          catalogueSlot={catalogueSlot}
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
