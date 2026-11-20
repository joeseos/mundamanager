'use client'

import type { ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import Modal from "@/components/ui/modal"
import TerritoryList from "@/components/campaigns/[id]/campaign-add-territory-list"

type CampaignAddTerritoryModalProps = ComponentProps<typeof TerritoryList> & {
  isOpen: boolean;
  onClose: () => void;
};

export default function CampaignAddTerritoryModal({
  isOpen,
  onClose,
  campaignId,
  campaignTypeId,
  editionSlug,
  campaignTypes,
  allTerritories,
  existingCampaignTerritories,
  onTerritoryAdd,
  isAdmin
}: CampaignAddTerritoryModalProps) {
  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <Modal
      title="Add Territories"
      content={
        <TerritoryList
          isAdmin={isAdmin}
          campaignId={campaignId}
          campaignTypeId={campaignTypeId}
          editionSlug={editionSlug}
          campaignTypes={campaignTypes}
          allTerritories={allTerritories}
          existingCampaignTerritories={existingCampaignTerritories}
          onTerritoryAdd={onTerritoryAdd}
        />
      }
      onClose={onClose}
      onConfirm={onClose}
      confirmText="Close"
      hideCancel
      width="lg"
    />
  );

  return createPortal(modalContent, document.body);
}
