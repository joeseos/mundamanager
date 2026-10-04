"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"

// Loads its code on first open, not with the page
const CreateGangModal = dynamic(
  () => import("@/components/create-gang-modal").then((mod) => mod.CreateGangModal),
  { ssr: false }
)

export function CreateGangButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        className="w-full"
      >
        Create Gang
      </Button>

      {showModal && (
        <CreateGangModal
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
