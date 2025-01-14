"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import CreateGangModal from "./create-gang-modal";

interface CreateGangButtonProps {
  onGangCreate?: () => void;
}

export default function CreateGangButton({ onGangCreate }: CreateGangButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const handleClose = () => {
    setShowModal(false);
    onGangCreate?.(); // Trigger refresh of parent data
  };

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)}
        className="w-full"
      >
        Create New Gang
      </Button>

      {showModal && (
        <CreateGangModal
          onClose={handleClose}
        />
      )}
    </>
  );
} 