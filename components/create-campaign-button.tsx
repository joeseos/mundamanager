"use client"

import { useState, type ComponentProps } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import ModalLoading from "@/components/ui/modal-loading"
import type { CreateCampaignModal as CreateCampaignModalType } from "@/components/create-campaign"

// Loads its code on first open, not with the page
const CreateCampaignModal = dynamic(
  () => import("@/components/create-campaign").then((mod) => mod.CreateCampaignModal),
  { ssr: false, loading: ModalLoading }
)

type CreateCampaignButtonProps = Omit<ComponentProps<typeof CreateCampaignModalType>, "onClose">;

export function CreateCampaignButton({ initialCampaignTypes, initialTradingPostTypes, userId }: CreateCampaignButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        className="w-full"
      >
        Create Campaign
      </Button>

      {showModal && (
        <CreateCampaignModal
          onClose={() => setShowModal(false)}
          initialCampaignTypes={initialCampaignTypes}
          initialTradingPostTypes={initialTradingPostTypes}
          userId={userId}
        />
      )}
    </>
  );
}
