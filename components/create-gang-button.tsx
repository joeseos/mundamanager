"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import CreateGangModal from "./create-gang-modal";

export default function CreateGangButton() {
  const [showModal, setShowModal] = useState(false);

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
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
} 