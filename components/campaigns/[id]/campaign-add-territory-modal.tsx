'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import Modal from "@/components/ui/modal"
import TerritoryList from "@/components/campaigns/[id]/campaign-add-territory-list"

interface Territory {
  id: string;
  territory_name: string;
  campaign_type_id: string | null;
  is_custom?: boolean;
  territory_id?: string | null;
  custom_territory_id?: string | null;
}

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface CampaignTerritory {
  territory_id: string | null;
  territory_name: string;
}

interface CampaignAddTerritoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignTypeId: string;
  campaignTypes: CampaignType[];
  allTerritories: Territory[];
  existingCampaignTerritories: CampaignTerritory[];
  onTerritoryAdd: () => void;
  isAdmin: boolean;
}

export default function CampaignAddTerritoryModal({
  isOpen,
  onClose,
  campaignId,
  campaignTypeId,
  campaignTypes,
  allTerritories,
  existingCampaignTerritories,
  onTerritoryAdd,
  isAdmin
}: CampaignAddTerritoryModalProps) {
  const [isAdding, setIsAdding] = useState(false);

  const handleTerritoryAdd = () => {
    setIsAdding(true);
    // Call the parent's refresh function
    onTerritoryAdd();
    // Reset the adding state after a short delay
    setTimeout(() => {
      setIsAdding(false);
    }, 500);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Add Territories"
      content={
        <div className="max-h-[70vh] overflow-y-auto">
          <TerritoryList
            isAdmin={isAdmin}
            campaignId={campaignId}
            campaignTypeId={campaignTypeId}
            campaignTypes={campaignTypes}
            allTerritories={allTerritories}
            existingCampaignTerritories={existingCampaignTerritories}
            onTerritoryAdd={handleTerritoryAdd}
          />
        </div>
      }
      onClose={onClose}
      onConfirm={onClose}
      confirmText="Close"
      hideCancel
      width="lg"
    />
  );
}
