'use client';

import React from 'react';
import { updateCampaignImage } from '@/app/actions/campaigns/[id]/update-campaign-image';
import { ImageEditModal } from '@/components/ui/image-edit-modal';

interface CampaignImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  campaignId: string;
  onImageUpdate: (newImageUrl: string) => void;
  defaultImageUrl?: string;
}

export const CampaignImageEditModal: React.FC<CampaignImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  campaignId,
  onImageUpdate,
  defaultImageUrl,
}) => {
  return (
    <ImageEditModal
      isOpen={isOpen}
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Campaign Image"
      onImageUpdate={onImageUpdate}
      defaultImageUrl={defaultImageUrl}
      uploadConfig={{
        entityId: campaignId,
        storagePath: `campaigns/${campaignId}`,
        fileNamePattern: (id: string, timestamp: number) => `${id}_${timestamp}.webp`,
        listPath: `campaigns/${campaignId}/`,
        updateAction: (imageUrl: string | null) => updateCampaignImage(campaignId, imageUrl),
        successMessage: 'Campaign image updated successfully',
        removeSuccessMessage: 'Campaign image removed successfully',
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


