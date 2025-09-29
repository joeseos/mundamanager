'use client';

import { useState, useEffect, useMemo } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { X } from "lucide-react";
import { gangOriginRank } from "@/utils/gangOriginRank";

interface AdminEditVehicleTypeModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const numericInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const regularInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2";

export function AdminEditVehicleTypeModal({ onClose, onSubmit }: AdminEditVehicleTypeModalProps) {
  const { toast } = useToast();
  const [gangTypes, setGangTypes] = useState<{ gang_type_id: number; gang_type: string }[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<{ id: number; vehicle_type: string }[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [equipment, setEquipment] = useState<Array<{ id: string; equipment_name: string }>>([]);
  const [equipmentListSelections, setEquipmentListSelections] = useState<string[]>([]);
  const [gangOrigins, setGangOrigins] = useState<Array<{ id: string; origin_name: string; category_name: string }>>([]);
  const [gangOriginEquipment, setGangOriginEquipment] = useState<Array<{ id?: string; gang_origin_id: string; origin_name: string; equipment_id: string; equipment_name: string }>>([]);
  const [showGangOriginModal, setShowGangOriginModal] = useState(false);
  const [gangTypeEquipment, setGangTypeEquipment] = useState<Array<{ id?: string; gang_type_id: string; gang_type_name: string; equipment_id: string; equipment_name: string }>>([]);
  const [showGangTypeModal, setShowGangTypeModal] = useState(false);

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

  const fetchEquipment = async () => {
    try {
      const response = await fetch('/api/admin/equipment');
      if (!response.ok) throw new Error('Failed to fetch equipment');
      const data = await response.json();
      setEquipment(data);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      toast({
        description: 'Failed to load equipment',
        variant: "destructive"
      });
    }
  };

  const fetchGangOrigins = async () => {
    try {
      const response = await fetch('/api/admin/gang-origins');
      if (!response.ok) throw new Error('Failed to fetch gang origins');
      const data = await response.json();
      setGangOrigins(data);
    } catch (error) {
      console.error('Error fetching gang origins:', error);
      toast({
        description: 'Failed to load gang origins',
        variant: "destructive"
      });
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

      if (vehicleData.equipment_list) {
        setEquipmentListSelections(vehicleData.equipment_list);
      }

      if (vehicleData.gang_origin_equipment) {
        setGangOriginEquipment(vehicleData.gang_origin_equipment);
      }

      if (vehicleData.gang_type_equipment) {
        setGangTypeEquipment(vehicleData.gang_type_equipment);
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
    setSelectedVehicle('');
    setEquipmentListSelections([]);
    setGangOriginEquipment([]);
    setGangTypeEquipment([]);
  };

  useEffect(() => {
    fetchVehicleTypes();
    fetchGangTypes();
    fetchEquipment();
    fetchGangOrigins();
  }, []);

  const handleSubmit = async () => {
    try {
      const response = await fetch(`/api/admin/vehicles?id=${selectedVehicle}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...vehicleForm,
          special_rules: vehicleForm.special_rules
            .split(',')
            .map(rule => rule.trim())
            .filter(rule => rule.length > 0),
          equipment_list: equipmentListSelections,
          gang_origin_equipment: gangOriginEquipment,
          gang_type_equipment: gangTypeEquipment
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update vehicle type');
      }

      toast({
        title: "Success",
        description: "Vehicle type has been updated successfully",
      });

      // Refresh the vehicle details to get updated data with real database IDs
      if (selectedVehicle) {
        await fetchVehicleDetails(selectedVehicle);
      }

      resetVehicleForm();
      if (onSubmit) {
        onSubmit();
      }
      onClose();
      return true;
    } catch (error) {
      console.error('Error updating vehicle type:', error);
      toast({
        title: "Error",
        description: "Failed to update vehicle type",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleClose = () => {
    resetVehicleForm();
    onClose();
  };

  // Gang Origin Equipment Modal Component
  const GangOriginEquipmentModal = () => {
    const [selectedOrigin, setSelectedOrigin] = useState('');
    const [selectedEquipment, setSelectedEquipment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
      if (!selectedOrigin || !selectedEquipment) {
        toast({
          title: "Validation Error",
          description: "Please select both a gang origin and equipment",
          variant: "destructive",
        });
        return;
      }

      const origin = gangOrigins.find(o => o.id === selectedOrigin);
      const equipmentItem = equipment.find(e => e.id === selectedEquipment);
      
      if (!origin || !equipmentItem) {
        toast({
          title: "Error",
          description: "Selected origin or equipment not found",
          variant: "destructive",
        });
        return;
      }

      // Check if this combination already exists
      const exists = gangOriginEquipment.some(
        item => item.gang_origin_id === selectedOrigin && item.equipment_id === selectedEquipment
      );

      if (exists) {
        toast({
          title: "Duplicate Entry",
          description: "This gang origin and equipment combination already exists",
          variant: "destructive",
        });
        return;
      }

      setIsSaving(true);
      try {
        setGangOriginEquipment(prev => [...prev, {
          gang_origin_id: selectedOrigin,
          origin_name: origin.origin_name,
          equipment_id: selectedEquipment,
          equipment_name: equipmentItem.equipment_name
        }]);

        // Close modal and reset selections
        setShowGangOriginModal(false);
        setSelectedOrigin('');
        setSelectedEquipment('');
        
        toast({
          title: "Success",
          description: "Gang origin equipment added successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add gang origin equipment",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Modal
        title="Gang Origin Equipment"
        content={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Gang Origin
              </label>
              <select
                value={selectedOrigin}
                onChange={(e) => {
                  setSelectedOrigin(e.target.value);
                  setSelectedEquipment(''); // Reset equipment when origin changes
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a gang origin</option>
                {Object.entries(
                  gangOrigins
                    .sort((a, b) => {
                      const rankA = gangOriginRank[a.origin_name.toLowerCase()] ?? Infinity;
                      const rankB = gangOriginRank[b.origin_name.toLowerCase()] ?? Infinity;
                      return rankA - rankB;
                    })
                    .reduce((groups, origin) => {
                      const rank = gangOriginRank[origin.origin_name.toLowerCase()] ?? Infinity;
                      let groupLabel = "Misc."; // Default category for unlisted origins

                      if (rank <= 19) groupLabel = "Prefecture";
                      else if (rank <= 39) groupLabel = "Ancestry";
                      else if (rank <= 59) groupLabel = "Tribe";

                      if (!groups[groupLabel]) groups[groupLabel] = [];
                      groups[groupLabel].push(origin);
                      return groups;
                    }, {} as Record<string, typeof gangOrigins>)
                ).map(([groupLabel, origins]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {origins.map((origin) => (
                      <option key={origin.id} value={origin.id}>
                        {origin.origin_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Equipment
              </label>
              <select
                value={selectedEquipment}
                onChange={(e) => setSelectedEquipment(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={!selectedOrigin}
              >
                <option value="">Select equipment</option>
                {equipment
                  .filter(item => !gangOriginEquipment.some(
                    existing => existing.gang_origin_id === selectedOrigin && existing.equipment_id === item.id
                  ))
                  .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>
            </div>

          </div>
        }
        onClose={() => {
          setShowGangOriginModal(false);
          setSelectedOrigin('');
          setSelectedEquipment('');
        }}
        confirmText={isSaving ? "Saving..." : "Save"}
        onConfirm={handleSave}
        confirmDisabled={!selectedOrigin || !selectedEquipment || isSaving}
        hideCancel={false}
        width="lg"
      />
    );
  };

  // Gang Type Equipment Modal Component
  const GangTypeEquipmentModal = () => {
    const [selectedGangType, setSelectedGangType] = useState('');
    const [selectedEquipment, setSelectedEquipment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Memoize sorted gang types to prevent re-sorting on every render
    const sortedGangTypes = useMemo(() =>
      [...gangTypes].sort((a, b) => a.gang_type.localeCompare(b.gang_type)),
      [gangTypes]
    );

    const handleSave = async () => {
      if (!selectedGangType || !selectedEquipment) {
        toast({
          title: "Validation Error",
          description: "Please select both a gang type and equipment",
          variant: "destructive",
        });
        return;
      }

      const gangType = gangTypes.find(g => g.gang_type_id.toString() === selectedGangType);
      const equipmentItem = equipment.find(e => e.id === selectedEquipment);

      if (!gangType || !equipmentItem) {
        toast({
          title: "Error",
          description: "Selected gang type or equipment not found",
          variant: "destructive",
        });
        return;
      }

      // Check if this combination already exists
      const exists = gangTypeEquipment.some(
        item => item.gang_type_id === selectedGangType && item.equipment_id === selectedEquipment
      );

      if (exists) {
        toast({
          title: "Duplicate Entry",
          description: "This gang type and equipment combination already exists",
          variant: "destructive",
        });
        return;
      }

      setIsSaving(true);
      try {
        setGangTypeEquipment(prev => [...prev, {
          gang_type_id: selectedGangType,
          gang_type_name: gangType.gang_type,
          equipment_id: selectedEquipment,
          equipment_name: equipmentItem.equipment_name
        }]);

        // Close modal and reset selections
        setShowGangTypeModal(false);
        setSelectedGangType('');
        setSelectedEquipment('');

        toast({
          title: "Success",
          description: "Gang type equipment added successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add gang type equipment",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Modal
        title="Gang Type Equipment"
        content={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Gang Type
              </label>
              <select
                value={selectedGangType}
                onChange={(e) => {
                  setSelectedGangType(e.target.value);
                  setSelectedEquipment(''); // Reset equipment when gang type changes
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a gang type</option>
                {sortedGangTypes.map((gangType) => (
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id.toString()}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Equipment
              </label>
              <select
                value={selectedEquipment}
                onChange={(e) => setSelectedEquipment(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={!selectedGangType}
              >
                <option value="">Select equipment</option>
                {equipment
                  .filter(item => !gangTypeEquipment.some(
                    existing => existing.gang_type_id === selectedGangType && existing.equipment_id === item.id
                  ))
                  .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>
            </div>

          </div>
        }
        onClose={() => {
          setShowGangTypeModal(false);
          setSelectedGangType('');
          setSelectedEquipment('');
        }}
        confirmText={isSaving ? "Saving..." : "Save"}
        onConfirm={handleSave}
        confirmDisabled={!selectedGangType || !selectedEquipment || isSaving}
        hideCancel={false}
        width="lg"
      />
    );
  };

  return (
    <>
      <Modal
        title="Edit Vehicle Type"
        content={
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
            {/* Vehicle Type Selection Dropdown */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Select Vehicle Type <span className="text-muted-foreground">*</span>
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
              <label className="block text-sm font-medium text-muted-foreground">
                Vehicle Type Name <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="vehicle_type"
                value={vehicleForm.vehicle_type}
                onChange={handleVehicleFormChange}
                className={`${regularInputClass} ${!selectedVehicle && 'bg-muted'}`}
                placeholder="e.g. Rockgrinder"
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Gang Type */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Gang Type <span className="text-muted-foreground">*</span>
              </label>
              <select
                name="gang_type_id"
                value={vehicleForm.gang_type_id}
                onChange={handleVehicleFormChange}
                className={`${regularInputClass} ${!selectedVehicle && 'bg-muted'}`}
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
              <label className="block text-sm font-medium text-muted-foreground">
                Cost <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="cost"
                value={vehicleForm.cost}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                min="0"
                disabled={!selectedVehicle}
              />
            </div>

            {/* Movement */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Movement <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="movement"
                value={vehicleForm.movement}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                min="0"
                disabled={!selectedVehicle}
              />
            </div>

            {/* Front Armor */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Front Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="front"
                value={vehicleForm.front}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Side Armor */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Side Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="side"
                value={vehicleForm.side}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Rear Armor */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Rear Armor <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="rear"
                value={vehicleForm.rear}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Hull Points */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Hull Points <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="hull_points"
                value={vehicleForm.hull_points}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Handling */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Handling <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="handling"
                value={vehicleForm.handling}
                onChange={handleVehicleFormChange}
                className={`${regularInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Save */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Save <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="text"
                name="save"
                value={vehicleForm.save}
                onChange={handleVehicleFormChange}
                className={`${regularInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Body Slots */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Body Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="body_slots"
                value={vehicleForm.body_slots}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Drive Slots */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Drive Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="drive_slots"
                value={vehicleForm.drive_slots}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

            {/* Engine Slots */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground">
                Engine Slots <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                name="engine_slots"
                value={vehicleForm.engine_slots}
                onChange={handleVehicleFormChange}
                className={`${numericInputClass} ${!selectedVehicle && 'bg-muted'}`}
                required
                disabled={!selectedVehicle}
              />
            </div>

              {/* Equipment List */}
              <div className="col-span-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment List
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && !equipmentListSelections.includes(value)) {
                      setEquipmentListSelections(prev => [...prev, value]);
                    }
                    e.target.value = "";
                  }}
                  className="w-full p-2 border rounded-md"
                  disabled={!selectedVehicle}
                >
                  <option value="">Available equipment</option>
                  {equipment
                    .filter(item => !equipmentListSelections.includes(item.id))
                    .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.equipment_name}
                      </option>
                    ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-2">
                  {equipmentListSelections.map((equipId, index) => {
                    const item = equipment.find(e => e.id === equipId);
                    if (!item) return null;

                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                      >
                        <span>{item.equipment_name}</span>
                        <button
                          type="button"
                          onClick={() => setEquipmentListSelections(equipmentListSelections.filter((_, i) => i !== index))}
                          className="hover:text-red-500 focus:outline-none"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gang Origin Equipment */}
              <div className="col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Gang Origin Equipment
                  </label>
                  <Button
                    onClick={() => setShowGangOriginModal(true)}
                    variant="outline"
                    size="sm"
                    disabled={!selectedVehicle}
                  >
                    Add Equipment
                  </Button>
                </div>

                {gangOriginEquipment.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {gangOriginEquipment.map((item, index) => (
                      <div
                        key={item.id || `${item.gang_origin_id}-${item.equipment_id}-${index}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                      >
                        <span>
                          <strong>{item.origin_name}</strong> - {item.equipment_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGangOriginEquipment(prev => 
                            prev.filter((existing, idx) => {
                              // For items with IDs, use ID comparison
                              if (item.id && existing.id) {
                                return existing.id !== item.id;
                              }
                              // For items without IDs, use index comparison
                              return idx !== index;
                            })
                          )}
                          className="hover:text-red-500 focus:outline-none"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gang Type Equipment */}
              <div className="col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Gang Type Equipment
                  </label>
                  <Button
                    onClick={() => setShowGangTypeModal(true)}
                    variant="outline"
                    size="sm"
                    disabled={!selectedVehicle}
                  >
                    Add Equipment
                  </Button>
                </div>

                {gangTypeEquipment.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {gangTypeEquipment.map((item, index) => (
                      <div
                        key={item.id || `${item.gang_type_id}-${item.equipment_id}-${index}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                      >
                        <span>
                          <strong>{item.gang_type_name}</strong> - {item.equipment_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGangTypeEquipment(prev =>
                            prev.filter((existing, idx) => {
                              // For items with IDs, use ID comparison
                              if (item.id && existing.id) {
                                return existing.id !== item.id;
                              }
                              // For items without IDs, use index comparison
                              return idx !== index;
                            })
                          )}
                          className="hover:text-red-500 focus:outline-none"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            {/* Special Rules */}
            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Special Rules <span className="text-muted-foreground">*</span>
              </label>
              <Input
                type="text"
                name="special_rules"
                value={vehicleForm.special_rules}
                onChange={handleVehicleFormChange}
                className="bg-card"
                placeholder="Enter special rules, separated by commas (e.g. Agile, Wheeled)"
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                Separate multiple rules with commas
              </p>
            </div>
          </div>
        </div>
        }
        onClose={handleClose}
        onConfirm={handleSubmit}
        confirmText="Update Vehicle Type"
      />

      {showGangOriginModal && <GangOriginEquipmentModal />}
      {showGangTypeModal && <GangTypeEquipmentModal />}
    </>
  );
}