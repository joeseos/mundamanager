'use client';

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Edit, Sword, Car } from "lucide-react";
import { useState } from "react";
import { AdminCreateFighterTypeModal } from "@/components/ui/admin-create-fighter-type";
import { AdminEditFighterTypeModal } from "@/components/ui/admin-edit-fighter-type";
import { AdminCreateEquipmentModal } from "@/components/ui/admin-create-equipment";
import { AdminEditEquipmentModal } from "@/components/ui/admin-edit-equipment";
import { AdminCreateSkillModal } from "@/components/ui/admin-create-skill";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { ToastProvider } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";

// Add this CSS class to remove arrows from number inputs while keeping numeric validation
const numericInputClass = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const regularInputClass = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2";

export default function AdminPage() {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showEditFighterType, setShowEditFighterType] = useState(false);
  const [showCreateEquipment, setShowCreateEquipment] = useState(false);
  const [showEditEquipment, setShowEditEquipment] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [gangTypes, setGangTypes] = useState<{ gang_type_id: number; gang_type: string }[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<{ id: number; vehicle_type: string }[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');

  const [vehicleForm, setVehicleForm] = useState({
    cost: '',
    movement: '',
    front: '',
    side: '',
    rear: '',
    hull_points: '',
    handling: '',
    save: '',
    body_slots: '',
    drive_slots: '',
    engine_slots: '',
    special_rules: '',
    vehicle_type: '',
    gang_type_id: ''
  });

  const handleVehicleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setVehicleForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSpecialRulesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Split by commas, trim whitespace, and filter out empty strings
    const rulesArray = e.target.value
      .split(',')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0);

    setVehicleForm(prev => ({
      ...prev,
      special_rules: rulesArray.join(',')
    }));
  };

  const fetchGangTypes = async () => {
    try {
      const response = await fetch('/api/admin/vehicles');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      const data = await response.json();
      setGangTypes(data);
    } catch (error) {
      console.error('Error fetching gang types:', error);
    }
  };

  const fetchVehicleTypes = async () => {
    try {
      const response = await fetch('/api/admin/vehicles?fetch_type=vehicle_types');
      if (!response.ok) throw new Error('Failed to fetch vehicle types');
      const data = await response.json();
      setVehicleTypes(data);
    } catch (error) {
      console.error('Error fetching vehicle types:', error);
    }
  };

  const fetchVehicleDetails = async (vehicleId: string) => {
    try {
      // First fetch gang types
      const gangResponse = await fetch('/api/admin/vehicles');
      if (!gangResponse.ok) throw new Error('Failed to fetch gang types');
      const gangData = await gangResponse.json();
      setGangTypes(gangData);

      // Then fetch vehicle details
      const vehicleResponse = await fetch(`/api/admin/vehicles?vehicle_id=${vehicleId}`);
      if (!vehicleResponse.ok) throw new Error('Failed to fetch vehicle details');
      const vehicleData = await vehicleResponse.json();

      if (!vehicleData) {
        throw new Error('No vehicle data received');
      }

      // Set the form data with the correct gang type ID
      setVehicleForm({
        cost: vehicleData.cost?.toString() || '',
        movement: vehicleData.movement?.toString() || '',
        front: vehicleData.front?.toString() || '',
        side: vehicleData.side?.toString() || '',
        rear: vehicleData.rear?.toString() || '',
        hull_points: vehicleData.hull_points?.toString() || '',
        handling: vehicleData.handling || '',
        save: vehicleData.save || '',
        body_slots: vehicleData.body_slots?.toString() || '',
        drive_slots: vehicleData.drive_slots?.toString() || '',
        engine_slots: vehicleData.engine_slots?.toString() || '',
        special_rules: Array.isArray(vehicleData.special_rules) 
          ? vehicleData.special_rules.join(', ') 
          : '',
        vehicle_type: vehicleData.vehicle_type || '',
        gang_type_id: vehicleData.gang_type_id ? vehicleData.gang_type_id.toString() : "0"
      });

    } catch (error) {
      console.error('Error fetching vehicle details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch vehicle details",
        variant: "destructive",
      });
    }
  };

  // Add a reset function for the vehicle form
  const resetVehicleForm = () => {
    setVehicleForm({
      cost: '',
      movement: '',
      front: '',
      side: '',
      rear: '',
      hull_points: '',
      handling: '',
      save: '',
      body_slots: '',
      drive_slots: '',
      engine_slots: '',
      special_rules: '',
      vehicle_type: '',
      gang_type_id: ''
    });
    setSelectedVehicle(''); // Also reset the selected vehicle
  };

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
      action: () => {
        setShowAddVehicle(true);
        fetchGangTypes();
      },
      icon: Car
    },
    {
      title: "Edit Vehicle Type",
      description: "Modify existing vehicle types",
      action: () => {
        setShowEditVehicle(true);
        fetchVehicleTypes();
        fetchGangTypes();
      },
      icon: Edit
    },
    {
      title: "Add Skill",
      description: "Add a new skill",
      action: () => setShowCreateSkill(true),
      icon: Sword
    }
  ];

  return (
    <>
      <ToastProvider>
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

          {showCreateSkill && (
            <AdminCreateSkillModal
              onClose={() => setShowCreateSkill(false)}
              onSubmit={() => setShowCreateSkill(false)}
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
            <Modal
              title="Add New Vehicle Type"
              content={
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Vehicle Type - regular input */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Vehicle Type <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="vehicle_type"
                        value={vehicleForm.vehicle_type}
                        onChange={handleVehicleFormChange}
                        className={regularInputClass}
                        placeholder="e.g. Buggy, Truck"
                        required
                      />
                    </div>

                    {/* Gang Type */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Gang Type <span className="text-gray-700">*</span>
                      </label>
                      <select
                        name="gang_type_id"
                        value={vehicleForm.gang_type_id}
                        onChange={handleVehicleFormChange}
                        className={regularInputClass}
                        required
                      >
                        <option value="">Select a gang type</option>
                        <option value="0">Generic</option>
                        {gangTypes.map((gangType) => (
                          <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                            {gangType.gang_type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Numeric inputs */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Cost <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="cost"
                        value={vehicleForm.cost}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                        min="0"
                      />
                    </div>

                    {/* Movement */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Movement <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="movement"
                        value={vehicleForm.movement}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                        min="0"
                      />
                    </div>

                    {/* Armor Values */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Front Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="front"
                        value={vehicleForm.front}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Side Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="side"
                        value={vehicleForm.side}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Rear Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="rear"
                        value={vehicleForm.rear}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    {/* Vehicle Stats */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Hull Points <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="hull_points"
                        value={vehicleForm.hull_points}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Handling <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="handling"
                        value={vehicleForm.handling}
                        onChange={handleVehicleFormChange}
                        className={regularInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Save <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="save"
                        value={vehicleForm.save}
                        onChange={handleVehicleFormChange}
                        className={regularInputClass}
                        required
                      />
                    </div>

                    {/* Slots */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Body Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="body_slots"
                        value={vehicleForm.body_slots}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Drive Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="drive_slots"
                        value={vehicleForm.drive_slots}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Engine Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="engine_slots"
                        value={vehicleForm.engine_slots}
                        onChange={handleVehicleFormChange}
                        className={numericInputClass}
                        required
                      />
                    </div>

                    {/* Special Rules - Input component */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Special Rules <span className="text-gray-700">*</span>
                      </label>
                      <Input
                        type="text"
                        name="special_rules"
                        value={vehicleForm.special_rules}
                        onChange={handleVehicleFormChange}
                        className="bg-white"
                        placeholder="Enter special rules, separated by commas (e.g. Agile, Wheeled)"
                        required
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Separate multiple rules with commas
                      </p>
                    </div>
                  </div>
                </div>
              }
              onClose={() => {
                setShowAddVehicle(false);
                resetVehicleForm();
              }}
              onConfirm={async () => {
                try {
                  const response = await fetch('/api/admin/vehicles', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      ...vehicleForm,
                      gang_type_id: vehicleForm.gang_type_id === "0" ? null : parseInt(vehicleForm.gang_type_id),
                      cost: parseInt(vehicleForm.cost),
                      movement: parseInt(vehicleForm.movement),
                      front: parseInt(vehicleForm.front),
                      side: parseInt(vehicleForm.side),
                      rear: parseInt(vehicleForm.rear),
                      hull_points: parseInt(vehicleForm.hull_points),
                      body_slots: parseInt(vehicleForm.body_slots),
                      drive_slots: parseInt(vehicleForm.drive_slots),
                      engine_slots: parseInt(vehicleForm.engine_slots),
                      special_rules: vehicleForm.special_rules
                        .split(',')
                        .map(rule => rule.trim())
                        .filter(rule => rule.length > 0),
                    }),
                  });

                  if (!response.ok) {
                    throw new Error('Failed to create vehicle type');
                  }

                  toast({
                    title: "Success",
                    description: "Vehicle type has been created successfully",
                  });

                  resetVehicleForm();
                  return true; // Close modal
                } catch (error) {
                  console.error('Error submitting vehicle type:', error);
                  toast({
                    title: "Error",
                    description: "Failed to create vehicle type",
                    variant: "destructive",
                  });
                  return false; // Keep modal open
                }
              }}
              confirmText="Add Vehicle Type"
            />
          )}

          {showEditVehicle && (
            <Modal
              title="Edit Vehicle Type"
              content={
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Vehicle Type Selection Dropdown */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Select Vehicle Type <span className="text-gray-700">*</span>
                      </label>
                      <select
                        value={selectedVehicle}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSelectedVehicle(newValue);
                          if (newValue) {
                            fetchVehicleDetails(newValue);
                          }
                        }}
                        className={regularInputClass}
                        required
                      >
                        <option value="">Select a vehicle type to edit</option>
                        {vehicleTypes.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.vehicle_type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Add Vehicle Type Name Input */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Vehicle Type Name <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="vehicle_type"
                        value={vehicleForm.vehicle_type}
                        onChange={handleVehicleFormChange}
                        className={`${regularInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        placeholder="e.g. Rockgrinder"
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Gang Type */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Gang Type <span className="text-gray-700">*</span>
                      </label>
                      <select
                        name="gang_type_id"
                        value={vehicleForm.gang_type_id}
                        onChange={handleVehicleFormChange}
                        className={`${regularInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      >
                        <option value="">Select a gang type</option>
                        <option value="0">Generic</option>
                        {gangTypes.map((gangType) => (
                          <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                            {gangType.gang_type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cost */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Cost <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="cost"
                        value={vehicleForm.cost}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        min="0"
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Movement */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Movement <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="movement"
                        value={vehicleForm.movement}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        min="0"
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Front Armor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Front Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="front"
                        value={vehicleForm.front}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Side Armor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Side Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="side"
                        value={vehicleForm.side}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Rear Armor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Rear Armor <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="rear"
                        value={vehicleForm.rear}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Hull Points */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Hull Points <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="hull_points"
                        value={vehicleForm.hull_points}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Handling */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Handling <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="handling"
                        value={vehicleForm.handling}
                        onChange={handleVehicleFormChange}
                        className={`${regularInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Save */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Save <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="text"
                        name="save"
                        value={vehicleForm.save}
                        onChange={handleVehicleFormChange}
                        className={`${regularInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Body Slots */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Body Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="body_slots"
                        value={vehicleForm.body_slots}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Drive Slots */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Drive Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="drive_slots"
                        value={vehicleForm.drive_slots}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Engine Slots */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Engine Slots <span className="text-gray-700">*</span>
                      </label>
                      <input
                        type="number"
                        name="engine_slots"
                        value={vehicleForm.engine_slots}
                        onChange={handleVehicleFormChange}
                        className={`${numericInputClass} ${!selectedVehicle && 'bg-gray-100'}`}
                        required
                        disabled={!selectedVehicle}
                      />
                    </div>

                    {/* Special Rules */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Special Rules <span className="text-gray-700">*</span>
                      </label>
                      <Input
                        type="text"
                        name="special_rules"
                        value={vehicleForm.special_rules}
                        onChange={handleVehicleFormChange}
                        className="bg-white"
                        placeholder="Enter special rules, separated by commas (e.g. Agile, Wheeled)"
                        required
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Separate multiple rules with commas
                      </p>
                    </div>
                  </div>
                </div>
              }
              onClose={() => {
                setShowEditVehicle(false);
                resetVehicleForm();
              }}
              onConfirm={async () => {
                try {
                  const response = await fetch('/api/admin/vehicles', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      ...vehicleForm,
                      special_rules: vehicleForm.special_rules
                        .split(',')
                        .map(rule => rule.trim())
                        .filter(rule => rule.length > 0),
                      id: selectedVehicle
                    }),
                  });

                  if (!response.ok) {
                    throw new Error('Failed to update vehicle type');
                  }

                  toast({
                    title: "Success",
                    description: "Vehicle type has been updated successfully",
                  });

                  resetVehicleForm();
                  return true; // Close modal
                } catch (error) {
                  console.error('Error updating vehicle type:', error);
                  toast({
                    title: "Error",
                    description: "Failed to update vehicle type",
                    variant: "destructive",
                  });
                  return false; // Keep modal open
                }
              }}
              confirmText="Update Vehicle Type"
            />
          )}
        </main>
      </ToastProvider>
    </>
  );
} 