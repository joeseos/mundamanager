'use client';

import { Users, Edit, Sword, Car, BookOpen } from "lucide-react";
import { useState } from "react";
import { AdminCreateFighterTypeModal } from "@/components/admin/admin-create-fighter-type";
import { AdminEditFighterTypeModal } from "@/components/admin/admin-edit-fighter-type";
import { AdminCreateEquipmentModal } from "@/components/admin/admin-create-equipment";
import { AdminEditEquipmentModal } from "@/components/admin/admin-edit-equipment";
import { AdminCreateSkillModal } from "@/components/admin/admin-create-skill";
import { AdminEditSkillModal } from "@/components/admin/admin-edit-skill";
import { AdminGangLineageModal } from "@/components/admin/admin-gang-lineage";
import { AdminCreateVehicleTypeModal } from "@/components/admin/admin-create-vehicle-type";
import { AdminEditVehicleTypeModal } from "@/components/admin/admin-edit-vehicle-type";
import { ToastProvider } from "@/components/ui/toast";

export default function AdminPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showEditSkill, setShowEditSkill] = useState(false);
  const [showEditFighterType, setShowEditFighterType] = useState(false);
  const [showCreateEquipment, setShowCreateEquipment] = useState(false);
  const [showEditEquipment, setShowEditEquipment] = useState(false);
  const [showGangLineages, setShowGangLineages] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);

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
    },
    {
      title: "Add Vehicle Type",
      description: "Add a new vehicle type",
      action: () => setShowAddVehicle(true),
      icon: Car
    },
    {
      title: "Edit Vehicle Type",
      description: "Modify existing vehicle types",
      action: () => setShowEditVehicle(true),
      icon: Edit
    },
    {
      title: "Add Skill",
      description: "Add a new skill or skill set",
      action: () => setShowCreateSkill(true),
      icon: BookOpen
    },
    {
      title: "Edit Skill",
      description:"Edit a skill or skill set",
      action: () => setShowEditSkill(true),
      icon: Edit
    },
    {
      title: "Affiliations & Legacies",
      description: "Manage gang affiliation & legacies",
      action: () => setShowGangLineages(true),
      icon: Users
    }
  ];

  return (
    <>
      <ToastProvider>
        <main className="flex min-h-screen flex-col items-center">
          <div className="container mx-auto max-w-4xl w-full space-y-4">
            <div className="bg-card shadow-md rounded-lg p-4">
              <h1 className="text-xl md:text-2xl font-bold mb-4">Admin Dashboard</h1>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {adminSections.map((section) => (
                  <button
                    key={section.title}
                    onClick={section.action}
                    className="p-4 bg-card rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="flex items-start space-x-3">
                      <section.icon className="h-6 w-6 text-muted-foreground shrink-0" />
                      <div>
                        <h2 className="text-lg md:text-xl font-semibold mb-2">
                          {section.title}
                        </h2>
                        <p className="text-muted-foreground">{section.description}</p>
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

          {showCreateSkill && (
            <AdminCreateSkillModal
              onClose={() => setShowCreateSkill(false)}
              onSubmit={() => setShowCreateSkill(false)}
            />
          )}

          {showEditSkill && (
            <AdminEditSkillModal
              onClose={() => setShowEditSkill(false)}
              onSubmit={() => setShowEditSkill(false)}
            />
          )}

          {showGangLineages && (
            <AdminGangLineageModal
              onClose={() => setShowGangLineages(false)}
              onSubmit={() => setShowGangLineages(false)}
            />
          )}

          {showEditFighterType && (
            <AdminEditFighterTypeModal
              onClose={() => {
                setShowEditFighterType(false);
                console.log('Closing edit fighter type modal');
              }}
              onSubmit={() => {
                setShowEditFighterType(false);
                console.log('Submitting edit fighter type modal');
              }}
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

          {showAddVehicle && (
            <AdminCreateVehicleTypeModal
              onClose={() => setShowAddVehicle(false)}
              onSubmit={() => setShowAddVehicle(false)}
            />
          )}

          {showEditVehicle && (
            <AdminEditVehicleTypeModal
              onClose={() => setShowEditVehicle(false)}
              onSubmit={() => setShowEditVehicle(false)}
            />
          )}
        </main>
      </ToastProvider>
    </>
  );
} 