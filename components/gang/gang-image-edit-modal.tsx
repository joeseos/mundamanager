'use client';

import React from 'react';
import { updateGangImage } from '@/app/actions/update-gang-image';
import { ImageEditModal } from '@/components/ui/image-edit-modal';

interface GangImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  gangId: string;
  onImageUpdate: (newImageUrl: string) => void;
}

export const GangImageEditModal: React.FC<GangImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  gangId,
  onImageUpdate,
}) => {
  return (
    <ImageEditModal
      isOpen={isOpen}
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Gang Image"
      onImageUpdate={onImageUpdate}
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
