'use client';

import React from 'react';
import { updateFighterImage } from '@/app/actions/update-fighter-image';
import { ImageEditModal } from '@/components/ui/image-edit-modal';

interface FighterImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  fighterId: string;
  gangId: string;
  onImageUpdate: (newImageUrl: string) => void;
}

export const FighterImageEditModal: React.FC<FighterImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  fighterId,
  gangId,
  onImageUpdate,
}) => {
  return (
    <ImageEditModal
      isOpen={isOpen}
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Fighter Image"
      onImageUpdate={onImageUpdate}
      uploadConfig={{
        entityId: fighterId,
        storagePath: `gangs/${gangId}/fighters`,
        fileNamePattern: (id: string, timestamp: number) => `${id}_${timestamp}.webp`,
        listPath: `gangs/${gangId}/fighters/`,
        updateAction: (imageUrl: string | null) => updateFighterImage(fighterId, gangId, imageUrl),
        successMessage: 'Fighter image updated successfully',
        removeSuccessMessage: 'Fighter image removed successfully',
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
