'use client';

import React from 'react';
import { updateGangImage } from '@/app/actions/update-gang-image';
import { ImageEditModal } from '@/components/ui/image-edit-modal';

interface GangImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  gangId: string;
  onImageUpdate: (newImageUrl: string, newDefaultImageIndex?: number | null) => void;
  defaultImageUrl?: string;
  defaultImageUrls?: string[];
  currentDefaultImageIndex?: number | null;
}

export const GangImageEditModal: React.FC<GangImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  gangId,
  onImageUpdate,
  defaultImageUrl,
  defaultImageUrls,
  currentDefaultImageIndex,
}) => {
  const handleDefaultImageIndexChange = async (index: number) => {
    // Only update defaultGangImage, don't modify imageUrl
    const result = await updateGangImage(gangId, undefined, index);
    if (result.success && defaultImageUrls && index >= 0 && index < defaultImageUrls.length) {
      // Update the UI optimistically with the new default image index
      // Pass empty string for imageUrl and the new index
      onImageUpdate('', index);
    }
    return result;
  };

  return (
    <ImageEditModal
      isOpen={isOpen}
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Gang Image"
      onImageUpdate={onImageUpdate}
      defaultImageUrl={defaultImageUrl}
      defaultImageUrls={defaultImageUrls}
      currentDefaultImageIndex={currentDefaultImageIndex}
      onDefaultImageIndexChange={handleDefaultImageIndexChange}
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
