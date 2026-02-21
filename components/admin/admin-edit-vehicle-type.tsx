'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/ui/modal";
import { HiX } from "react-icons/hi";
import { gangOriginRank } from "@/utils/gangOriginRank";

interface AdminEditVehicleTypeModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const numericInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const regularInputClass = "mt-1 block w-full rounded-md border border-border px-3 py-2";

const VALID_ARCS = ['Front', 'Left', 'Right', 'Rear'] as const;

interface HardpointTemplate {
  operated_by: 'crew' | 'passenger' | '';
  arcs: string[];
  location: string;
}

interface GangOriginEquipmentModalProps {
  gangOrigins: Array<{ id: string; origin_name: string; category_name: string }>;
  equipment: Array<{ id: string; equipment_name: string }>;
  gangOriginEquipment: Array<{ id?: string; gang_origin_id: string; origin_name: string; equipment_id: string; equipment_name: string }>;
  onAdd: (item: { gang_origin_id: string; origin_name: string; equipment_id: string; equipment_name: string }) => void;
  onClose: () => void;
}

const GangOriginEquipmentModal: React.FC<GangOriginEquipmentModalProps> = ({
  gangOrigins,
  equipment,
  gangOriginEquipment,
  onAdd,
  onClose,
}) => {
  
  const [selectedOrigin, setSelectedOrigin] = useState("");
  const [equipmentSelections, setEquipmentSelections] = useState<string[]>([]);
  const [equipmentSelectValue, setEquipmentSelectValue] = useState("");

  const groupedGangOrigins = useMemo(() => {
    return Object.entries(
      gangOrigins
        .sort((a, b) => {
          const rankA = gangOriginRank[a.origin_name.toLowerCase()] ?? Infinity;
          const rankB = gangOriginRank[b.origin_name.toLowerCase()] ?? Infinity;
          return rankA - rankB;
        })
        .reduce((groups, origin) => {
          const rank = gangOriginRank[origin.origin_name.toLowerCase()] ?? Infinity;
          let groupLabel = "Misc.";
          if (rank <= 19) groupLabel = "Prefecture";
          else if (rank <= 39) groupLabel = "Ancestry";
          else if (rank <= 59) groupLabel = "Tribe";
          if (!groups[groupLabel]) groups[groupLabel] = [];
          groups[groupLabel].push(origin);
          return groups;
        }, {} as Record<string, typeof gangOrigins>)
    );
  }, [gangOrigins]);

  const availableEquipment = useMemo(() => {
    return equipment
      .filter((item) =>
        !gangOriginEquipment.some(
          (existing) => existing.gang_origin_id === selectedOrigin && existing.equipment_id === item.id
        ) && !equipmentSelections.includes(item.id)
      )
      .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
  }, [equipment, gangOriginEquipment, selectedOrigin, equipmentSelections]);

  const handleSave = () => {
    if (!selectedOrigin || equipmentSelections.length === 0) {
      toast.error("Validation Error", { description: "Please select a gang origin and at least one equipment item" });
      return;
    }

    const origin = gangOrigins.find((o) => o.id === selectedOrigin);

    if (!origin) {
      toast.error("Error", { description: "Selected origin not found" });
      return;
    }

    // Process each equipment selection
    let addedCount = 0;
    for (const equipmentId of equipmentSelections) {
      const equipmentItem = equipment.find((e) => e.id === equipmentId);

      if (!equipmentItem) {
        console.warn(`Equipment with ID ${equipmentId} not found`);
        continue;
      }

      // Check if this combination already exists
      const exists = gangOriginEquipment.some(
        (item) => item.gang_origin_id === selectedOrigin && item.equipment_id === equipmentId
      );

      if (exists) {
        console.warn(`Gang origin ${origin.origin_name} and equipment ${equipmentItem.equipment_name} combination already exists`);
        continue;
      }

      onAdd({
        gang_origin_id: selectedOrigin,
        origin_name: origin.origin_name,
        equipment_id: equipmentId,
        equipment_name: equipmentItem.equipment_name,
      });

      addedCount++;
    }

    // Reset local state and close
    setSelectedOrigin("");
    setEquipmentSelections([]);
    setEquipmentSelectValue("");
    onClose();

    toast.success("Success", { description: `${addedCount} equipment item${addedCount !== 1 ? 's' : ''} added successfully` });
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
                setEquipmentSelections([]); // Reset equipment selections when origin changes
                setEquipmentSelectValue("");
              }}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Select a gang origin</option>
              {groupedGangOrigins.map(([groupLabel, origins]) => (
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
              value={equipmentSelectValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value && !equipmentSelections.includes(value)) {
                  setEquipmentSelections(prev => [...prev, value]);
                }
                setEquipmentSelectValue("");
              }}
              className="w-full p-2 border rounded-md"
              disabled={!selectedOrigin}
            >
              <option value="">Select equipment</option>
              {availableEquipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_name}
                </option>
              ))}
            </select>

            <div className="mt-2 flex flex-wrap gap-2">
              {equipmentSelections.map((equipId, index) => {
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
                      onClick={() => setEquipmentSelections(equipmentSelections.filter((_, i) => i !== index))}
                      className="hover:text-red-500 focus:outline-none"
                    >
                      <HiX className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      }
      onClose={() => {
        setSelectedOrigin("");
        setEquipmentSelections([]);
        setEquipmentSelectValue("");
        onClose();
      }}
      confirmText="Add"
      onConfirm={handleSave}
      confirmDisabled={!selectedOrigin || equipmentSelections.length === 0}
      hideCancel={false}
      width="lg"
    />
  );
};

interface GangTypeEquipmentModalProps {
  gangTypes: { gang_type_id: number; gang_type: string }[];
  equipment: Array<{ id: string; equipment_name: string }>;
  gangTypeEquipment: Array<{
    id?: string;
    gang_type_id: string;
    gang_type_name: string;
    equipment_id: string;
    equipment_name: string;
  }>;
  onAdd: (item: {
    gang_type_id: string;
    gang_type_name: string;
    equipment_id: string;
    equipment_name: string;
  }) => void;
  onClose: () => void;
}

const GangTypeEquipmentModal: React.FC<GangTypeEquipmentModalProps> = ({
  gangTypes,
  equipment,
  gangTypeEquipment,
  onAdd,
  onClose,
}) => {
  
  const [selectedGangType, setSelectedGangType] = useState("");
  const [equipmentSelections, setEquipmentSelections] = useState<string[]>([]);
  const [equipmentSelectValue, setEquipmentSelectValue] = useState("");

  const sortedGangTypes = useMemo(
    () => [...gangTypes].sort((a, b) => a.gang_type.localeCompare(b.gang_type)),
    [gangTypes]
  );

  const availableEquipment = useMemo(() => {
    return equipment
      .filter((item) =>
        !gangTypeEquipment.some(
          (existing) => existing.gang_type_id.toString() === selectedGangType && existing.equipment_id === item.id
        ) && !equipmentSelections.includes(item.id)
      )
      .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
  }, [equipment, gangTypeEquipment, selectedGangType, equipmentSelections]);

  const handleSave = () => {
    if (!selectedGangType || equipmentSelections.length === 0) {
      toast.error("Validation Error", { description: "Please select a gang type and at least one equipment item" });
      return;
    }

    const gangType = gangTypes.find((g) => g.gang_type_id.toString() === selectedGangType);

    if (!gangType) {
      toast.error("Error", { description: "Selected gang type not found" });
      return;
    }

    // Process each equipment selection
    let addedCount = 0;
    for (const equipmentId of equipmentSelections) {
      const equipmentItem = equipment.find((e) => e.id === equipmentId);

      if (!equipmentItem) {
        console.warn(`Equipment with ID ${equipmentId} not found`);
        continue;
      }

      // Check if this combination already exists
      const exists = gangTypeEquipment.some(
        (item) => item.gang_type_id.toString() === selectedGangType && item.equipment_id === equipmentId
      );

      if (exists) {
        console.warn(`Gang type ${gangType.gang_type} and equipment ${equipmentItem.equipment_name} combination already exists`);
        continue;
      }

      onAdd({
        gang_type_id: selectedGangType,
        gang_type_name: gangType.gang_type,
        equipment_id: equipmentId,
        equipment_name: equipmentItem.equipment_name,
      });

      addedCount++;
    }

    // Reset local state and close
    setSelectedGangType("");
    setEquipmentSelections([]);
    setEquipmentSelectValue("");
    onClose();

    toast.success("Success", { description: `${addedCount} equipment item${addedCount !== 1 ? 's' : ''} added successfully` });
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
                setEquipmentSelections([]); // Reset equipment selections when gang type changes
                setEquipmentSelectValue("");
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
              value={equipmentSelectValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value && !equipmentSelections.includes(value)) {
                  setEquipmentSelections(prev => [...prev, value]);
                }
                setEquipmentSelectValue("");
              }}
              className="w-full p-2 border rounded-md"
              disabled={!selectedGangType}
            >
              <option value="">Select equipment</option>
              {availableEquipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_name}
                </option>
              ))}
            </select>

            <div className="mt-2 flex flex-wrap gap-2">
              {equipmentSelections.map((equipId, index) => {
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
                      onClick={() => setEquipmentSelections(equipmentSelections.filter((_, i) => i !== index))}
                      className="hover:text-red-500 focus:outline-none"
                    >
                      <HiX className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      }
      onClose={() => {
        setSelectedGangType("");
        setEquipmentSelections([]);
        setEquipmentSelectValue("");
        onClose();
      }}
      confirmText="Add"
      onConfirm={handleSave}
      confirmDisabled={!selectedGangType || equipmentSelections.length === 0}
      hideCancel={false}
      width="lg"
    />
  );
};

export function AdminEditVehicleTypeModal({ onClose, onSubmit }: AdminEditVehicleTypeModalProps) {
  
  const [gangTypes, setGangTypes] = useState<{ gang_type_id: number; gang_type: string }[]>([]);
  const [gangTypesFetched, setGangTypesFetched] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<{ id: number; vehicle_type: string }[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [equipment, setEquipment] = useState<Array<{ id: string; equipment_name: string }>>([]);
  const [equipmentListSelections, setEquipmentListSelections] = useState<string[]>([]);
  const [equipmentSelectValue, setEquipmentSelectValue] = useState("");
  const [gangOrigins, setGangOrigins] = useState<Array<{ id: string; origin_name: string; category_name: string }>>([]);
  const [gangOriginEquipment, setGangOriginEquipment] = useState<Array<{ id?: string; gang_origin_id: string; origin_name: string; equipment_id: string; equipment_name: string }>>([]);
  const [showGangOriginModal, setShowGangOriginModal] = useState(false);
  const [gangTypeEquipment, setGangTypeEquipment] = useState<Array<{ id?: string; gang_type_id: string; gang_type_name: string; equipment_id: string; equipment_name: string }>>([]);
  const [showGangTypeModal, setShowGangTypeModal] = useState(false);
  const [hardpoints, setHardpoints] = useState<HardpointTemplate[]>([]);

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
      setGangTypesFetched(true);
    } catch (error) {
      console.error('Error fetching gang types:', error);
      setGangTypesFetched(true);
      toast.error('Failed to load gang types');
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
      toast.error('Failed to load vehicle types');
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
      toast.error('Failed to load equipment');
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
      toast.error('Failed to load gang origins');
    }
  };

  const fetchVehicleDetails = async (vehicleId: string) => {
    try {
      // First fetch gang types if not already loaded
      if (!gangTypesFetched) {
        const gangResponse = await fetch('/api/admin/vehicles');
        if (!gangResponse.ok) throw new Error('Failed to fetch gang types');
        const gangData = await gangResponse.json();
        setGangTypes(gangData);
        setGangTypesFetched(true);
      }

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

      if (vehicleData.hardpoints) {
        setHardpoints(vehicleData.hardpoints);
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
      toast.error("Error", { description: "Failed to fetch vehicle details" });
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
    setEquipmentSelectValue("");
    setGangOriginEquipment([]);
    setGangTypeEquipment([]);
    setHardpoints([]);
  };

  useEffect(() => {
    fetchVehicleTypes();
    fetchGangTypes();
    fetchEquipment();
    fetchGangOrigins();
  }, []);

  const handleAddGangOriginEquipment = (item: { gang_origin_id: string; origin_name: string; equipment_id: string; equipment_name: string }) => {
    setGangOriginEquipment((prev) => [...prev, item]);
  };

  const handleCloseGangOriginModal = () => setShowGangOriginModal(false);

  const handleAddGangTypeEquipment = (item: { gang_type_id: string; gang_type_name: string; equipment_id: string; equipment_name: string }) => {
    setGangTypeEquipment((prev) => [...prev, item]);
  };

  const handleCloseGangTypeModal = () => setShowGangTypeModal(false);

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
          gang_type_equipment: gangTypeEquipment,
          hardpoints
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update vehicle type');
      }

      toast.success("Success", { description: "Vehicle type has been updated successfully" });

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
      toast.error("Error", { description: "Failed to update vehicle type" });
      return false;
    }
  };

  const handleClose = () => {
    resetVehicleForm();
    onClose();
  };

  return (
    <>
      <Modal
        title="Edit Vehicle Type"
        width="4xl"
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
                  value={equipmentSelectValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && !equipmentListSelections.includes(value)) {
                      setEquipmentListSelections(prev => [...prev, value]);
                    }
                    setEquipmentSelectValue("");
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
                          <HiX className="h-4 w-4" />
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
                          <HiX className="h-4 w-4" />
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
                          <HiX className="h-4 w-4" />
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

            {/* Hardpoints */}
            <div className="col-span-3">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-muted-foreground">
                  Hardpoints
                </label>
                <Button
                  onClick={() => setHardpoints(prev => [...prev, { operated_by: '', arcs: [], location: '' }])}
                  variant="outline"
                  size="sm"
                  disabled={!selectedVehicle}
                >
                  Add Hardpoint
                </Button>
              </div>

              {hardpoints.length > 0 && (
                <div className="space-y-4">
                  {hardpoints.map((hardpoint, index) => (
                    <div
                      key={index}
                      className="border rounded-md p-4"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="default">
                              Hardpoint {index + 1}
                            </Badge>
                            {hardpoint.operated_by && (
                              <Badge variant="secondary">
                                {hardpoint.operated_by === 'crew' ? 'Crew Operated' : 'Passenger Operated'}
                              </Badge>
                            )}
                            {hardpoint.arcs.length > 0 && (
                              <Badge variant="outline" className="border-blue-500 text-blue-600">
                                {hardpoint.arcs.length} Arc{hardpoint.arcs.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {hardpoint.location && (
                              <Badge variant="outline" className="border-green-500 text-green-600">
                                {hardpoint.location}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => setHardpoints(prev => prev.filter((_, i) => i !== index))}
                          variant="destructive"
                          size="sm"
                          disabled={!selectedVehicle}
                        >
                          Delete
                        </Button>
                      </div>

                      <div className="flex gap-8">
                        <div className="w-64 shrink-0">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Operated By
                          </label>
                          <select
                            value={hardpoint.operated_by}
                            onChange={(e) => {
                              const newHardpoints = [...hardpoints];
                              newHardpoints[index] = {
                                ...newHardpoints[index],
                                operated_by: e.target.value as 'crew' | 'passenger' | ''
                              };
                              setHardpoints(newHardpoints);
                            }}
                            className="w-full p-2 border rounded-md text-sm"
                          >
                            <option value="">Not specified</option>
                            <option value="crew">Crew</option>
                            <option value="passenger">Passenger</option>
                          </select>
                        </div>

                        <div className="w-48 shrink-0">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Location
                          </label>
                          <input
                            type="text"
                            value={hardpoint.location || ''}
                            onChange={(e) => {
                              const newHardpoints = [...hardpoints];
                              newHardpoints[index] = {
                                ...newHardpoints[index],
                                location: e.target.value
                              };
                              setHardpoints(newHardpoints);
                            }}
                            className="w-full p-2 border rounded-md text-sm"
                            placeholder="e.g. hull, rear platform"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Fire Arcs
                          </label>
                          <div className="flex flex-wrap gap-3 h-[42px] items-center">
                            {VALID_ARCS.map((arc) => (
                              <label key={arc} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={hardpoint.arcs.includes(arc)}
                                  onCheckedChange={(checked) => {
                                    const newHardpoints = [...hardpoints];
                                    const currentArcs = newHardpoints[index].arcs;
                                    if (checked) {
                                      newHardpoints[index] = {
                                        ...newHardpoints[index],
                                        arcs: [...currentArcs, arc]
                                      };
                                    } else {
                                      newHardpoints[index] = {
                                        ...newHardpoints[index],
                                        arcs: currentArcs.filter(a => a !== arc)
                                      };
                                    }
                                    setHardpoints(newHardpoints);
                                  }}
                                />
                                {arc}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hardpoints.length === 0 && selectedVehicle && (
                <p className="text-sm text-muted-foreground italic py-4">No hardpoints configured</p>
              )}
            </div>
          </div>
        </div>
        }
        onClose={handleClose}
        onConfirm={handleSubmit}
        confirmText="Update Vehicle Type"
      />

      {showGangOriginModal && (
        <GangOriginEquipmentModal
          gangOrigins={gangOrigins}
          equipment={equipment}
          gangOriginEquipment={gangOriginEquipment}
          onAdd={handleAddGangOriginEquipment}
          onClose={handleCloseGangOriginModal}
        />
      )}
      {showGangTypeModal && (
        <GangTypeEquipmentModal
          gangTypes={gangTypes}
          equipment={equipment}
          gangTypeEquipment={gangTypeEquipment}
          onAdd={handleAddGangTypeEquipment}
          onClose={handleCloseGangTypeModal}
        />
      )}
    </>
  );
}