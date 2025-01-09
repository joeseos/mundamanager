'use client';

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Edit, Sword } from "lucide-react";
import { useState } from "react";
import { AdminCreateFighterTypeModal } from "@/components/ui/admin-create-fighter-type";
import { AdminEditFighterTypeModal } from "@/components/ui/admin-edit-fighter-type";
import { AdminCreateEquipmentModal } from "@/components/ui/admin-create-equipment";
import { AdminEditEquipmentModal } from "@/components/ui/admin-edit-equipment";

export default function AdminPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEditFighterType, setShowEditFighterType] = useState(false);
  const [showCreateEquipment, setShowCreateEquipment] = useState(false);
  const [showEditEquipment, setShowEditEquipment] = useState(false);

  const adminSections = [
    {
      title: "Add Fighter Type",
      description: "Add a new fighter type",
      action: () => setIsModalOpen(true),
      icon: Users
    },
    {
      title: "Edit Fighter Type",
      description: "Modify existing fighter types",
      action: () => setShowEditFighterType(true),
      icon: Edit
    },
    {
      title: "Add Equipment",
      description: "Add new equipment and weapons",
      action: () => setShowCreateEquipment(true),
      icon: Sword
    },
    {
      title: "Edit Equipment",
      description: "Modify existing equipment",
      action: () => setShowEditEquipment(true),
      icon: Edit
    }
  ];

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adminSections.map((section) => (
              <button
                key={section.title}
                onClick={section.action}
                className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
              >
                <div className="flex items-start space-x-3">
                  <section.icon className="h-6 w-6 text-gray-500 shrink-0" />
                  <div>
                    <h2 className="text-xl font-semibold mb-2">
                      {section.title}
                    </h2>
                    <p className="text-gray-600">{section.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <AdminCreateFighterTypeModal
          onClose={() => setIsModalOpen(false)}
          onSubmit={() => setIsModalOpen(false)}
        />
      )}

      {showEditFighterType && (
        <AdminEditFighterTypeModal
          onClose={() => setShowEditFighterType(false)}
          onSubmit={() => setShowEditFighterType(false)}
        />
      )}

      {showCreateEquipment && (
        <AdminCreateEquipmentModal
          onClose={() => setShowCreateEquipment(false)}
          onSubmit={() => setShowCreateEquipment(false)}
        />
      )}

      {showEditEquipment && (
        <AdminEditEquipmentModal
          onClose={() => setShowEditEquipment(false)}
          onSubmit={() => setShowEditEquipment(false)}
        />
      )}
    </main>
  );
} 