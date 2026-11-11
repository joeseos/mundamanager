'use client';

import React, { useState } from 'react';
import { updateGangImage } from '@/app/actions/update-gang-image';
import { PortraitPicker } from '@/components/portrait-catalogue/portrait-picker';
import { ImageEditModal } from '@/components/ui/image-edit-modal';
import { usePortraitCatalogue } from '@/hooks/use-portrait-catalogue';
import { UNKNOWN_GANG_IMAGE_URL } from '@/types/gang';
import { catalogueSlotForGangType } from '@/utils/gang-portraits';
import { portraitPublicUrl, PORTRAIT_CATALOGUES } from '@/utils/portrait-catalogue';

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
  onImageUpdate: (newImageUrl: string, options?: { clearPortrait?: boolean }) => void;
  onPortraitUpdate: (portraitId: string, portraitUrl: string) => void;
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
}) => {
  const { portraits, status: portraitsStatus, retry: retryPortraits } = usePortraitCatalogue('gang');
  const gangPortraitUrl = (storagePath: string) =>
    portraitPublicUrl(PORTRAIT_CATALOGUES.gang.publicBase, storagePath);
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

  const savedPortraitId = gangPortraitId ?? null;
  const alreadyOnSilhouette = savedPortraitId === null && !currentImageUrl;
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
      : UNKNOWN_GANG_IMAGE_URL;

  const handleSavePortrait = async () => {
    if (clearedPortrait && !selectedPortraitId) {
      const result = await updateGangImage(gangId, null, null);
      if (result.success) {
        onImageUpdate('', { clearPortrait: true });
      }
      return result;
    }
    if (!selectedPortraitId) return { success: false, error: 'No portrait selected' };
    const selected = portraits.find((portrait) => portrait.id === selectedPortraitId);
    const portraitUrl = selected ? gangPortraitUrl(selected.storage_path) : undefined;
    if (!portraitUrl) return { success: false, error: 'Portrait image is missing' };

    const result = await updateGangImage(gangId, undefined, selectedPortraitId);
    if (result.success) {
      onPortraitUpdate(selectedPortraitId, portraitUrl);
    }
    return result;
  };

  return (
    <ImageEditModal
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Gang Portrait"
      onImageUpdate={onImageUpdate}
      portraitPicker={
        <PortraitPicker
          portraits={portraits}
          catalogueSlot={catalogueSlot}
          selectedPortraitId={selectedPortraitId}
          subjectName={gangType}
          onSelect={(portraitId) => {
            setClearedPortrait(false);
            setSelectedPortraitId(portraitId);
          }}
          imageUrl={gangPortraitUrl}
          fallbackImageUrl={fallbackImageUrl}
          emptyFallback={<span className="text-2xl">{gangType.charAt(0)}</span>}
          imageErrorUrl={UNKNOWN_GANG_IMAGE_URL}
          galleryTitle="Gang Portraits"
          galleryHelper="Choose a portrait for this gang."
          alternateOption={{
            heading: 'Silhouette',
            label: 'Silhouette',
            imageUrl: UNKNOWN_GANG_IMAGE_URL,
            selected: selectedPortraitId === null && (clearedPortrait || alreadyOnSilhouette),
            onSelect: () => {
              setClearedPortrait(true);
              setSelectedPortraitId(null);
            },
          }}
          catalogueLoadFailed={portraitsStatus === 'error'}
          onRetryCatalogue={retryPortraits}
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
