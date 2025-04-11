'use client';

import { useState } from "react";
import { AdminCreateFighterTypeModal } from "@/components/ui/admin-create-fighter-type";
import { AdminEditFighterTypeModal } from "@/components/ui/admin-edit-fighter-type";

export default function FighterTypesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Fighter Types Management</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold mb-2">Add Fighter Type</h2>
          <p className="text-gray-600">Create a new fighter type</p>
        </button>
        <button
          onClick={() => setShowEditModal(true)}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold mb-2">Edit Fighter Type</h2>
          <p className="text-gray-600">Modify existing fighter types</p>
        </button>
      </div>

      {showCreateModal && (
        <AdminCreateFighterTypeModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={() => setShowCreateModal(false)}
        />
      )}

      {showEditModal && (
        <AdminEditFighterTypeModal
          onClose={() => setShowEditModal(false)}
          onSubmit={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
} 