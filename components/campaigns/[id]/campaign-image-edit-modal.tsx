'use client';

import React, { useState } from 'react';
import { updateCampaignImage } from '@/app/actions/campaigns/[id]/update-campaign-image';
import { CreateCampaignPortraitPicker } from '@/components/campaigns/create-campaign-portrait-picker';
import { ImageEditModal } from '@/components/ui/image-edit-modal';
import { useCampaignPortraits } from '@/hooks/use-campaign-portraits';
import { campaignPortraitPublicUrl } from '@/utils/campaign-image';
import { catalogueSlotForCampaignType } from '@/utils/campaign-portraits';

interface CampaignImageEditModalProps {
  onClose: () => void;
  currentImageUrl?: string;
  campaignId: string;
  campaignTypeName: string;
  campaignPortraitId?: string | null;
  currentPortraitUrl?: string | null;
  typeImageUrl?: string | null;
  onImageUpdate: (newImageUrl: string, options?: { clearPortrait?: boolean }) => void;
  onPortraitUpdate: (portraitId: string, portraitUrl: string) => void;
}

export const CampaignImageEditModal: React.FC<CampaignImageEditModalProps> = ({
  onClose,
  currentImageUrl,
  campaignId,
  campaignTypeName,
  campaignPortraitId,
  currentPortraitUrl,
  typeImageUrl,
  onImageUpdate,
  onPortraitUpdate,
}) => {
  const { portraits, status: portraitsStatus } = useCampaignPortraits();
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(campaignPortraitId ?? null);
  const [clearedPortrait, setClearedPortrait] = useState(false);

  const catalogueSlot = catalogueSlotForCampaignType(campaignTypeName);
  const savedPortraitId = campaignPortraitId ?? null;
  const alreadyOnTypeImage = savedPortraitId === null && !currentImageUrl;
  const portraitChanged =
    portraitsStatus !== 'error' &&
    !currentImageUrl &&
    ((selectedPortraitId !== null && selectedPortraitId !== savedPortraitId) ||
      (clearedPortrait && !alreadyOnTypeImage));
  const selectedInList = portraits.some((portrait) => portrait.id === selectedPortraitId);
  const fallbackImageUrl = selectedInList
    ? undefined
    : selectedPortraitId
      ? currentPortraitUrl
      : typeImageUrl;

  const handleSavePortrait = async () => {
    if (clearedPortrait && !selectedPortraitId) {
      const result = await updateCampaignImage(campaignId, null, null);
      if (result.success) {
        onImageUpdate('', { clearPortrait: true });
      }
      return result;
    }
    if (!selectedPortraitId) return { success: false, error: 'No portrait selected' };
    const selected = portraits.find((portrait) => portrait.id === selectedPortraitId);
    const portraitUrl = selected ? campaignPortraitPublicUrl(selected.storage_path) : undefined;
    if (!portraitUrl) return { success: false, error: 'Portrait image is missing' };

    const result = await updateCampaignImage(campaignId, undefined, selectedPortraitId);
    if (result.success) {
      onPortraitUpdate(selectedPortraitId, portraitUrl);
    }
    return result;
  };

  return (
    <ImageEditModal
      onClose={onClose}
      currentImageUrl={currentImageUrl}
      title="Edit Campaign Image"
      onImageUpdate={onImageUpdate}
      portraitPicker={
        <CreateCampaignPortraitPicker
          portraits={portraits}
          catalogueSlot={catalogueSlot}
          selectedPortraitId={selectedPortraitId}
          campaignTypeName={campaignTypeName}
          onSelect={(portraitId) => {
            setClearedPortrait(false);
            setSelectedPortraitId(portraitId);
          }}
          fallbackImageUrl={fallbackImageUrl}
          typeImageUrl={typeImageUrl}
          typeImageSelected={selectedPortraitId === null && (clearedPortrait || alreadyOnTypeImage)}
          onUseTypeImage={() => {
            setClearedPortrait(true);
            setSelectedPortraitId(null);
          }}
        />
      }
      portraitChanged={portraitChanged}
      onSavePortrait={handleSavePortrait}
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
