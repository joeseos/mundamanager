'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomEquipment } from '@/app/lib/custom-equipment';
import { updateCustomEquipment, deleteCustomEquipment, createCustomEquipment } from '@/app/actions/custom-equipment';
import { saveCustomWeaponProfiles, getCustomWeaponProfiles } from '@/app/actions/custom-weapon-profiles';
import { CustomWeaponProfiles, CustomWeaponProfile } from './custom-weapon-profiles';
import Modal from '@/components/modal';
import { useToast } from '@/components/ui/use-toast';

interface CustomiseEquipmentProps {
  className?: string;
  initialEquipment?: CustomEquipment[];
}

interface EquipmentCategory {
  id: string;
  category_name: string;
}

export function CustomiseEquipment({ className, initialEquipment = [] }: CustomiseEquipmentProps) {
  const [equipment, setEquipment] = useState<CustomEquipment[]>(initialEquipment);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomEquipment | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomEquipment | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [editForm, setEditForm] = useState({
    equipment_name: '',
    cost: 0,
    equipment_category: '',
    equipment_type: 'wargear' as 'wargear' | 'weapon',
    availability_letter: 'C' as 'C' | 'R' | 'E' | 'I',
    availability_number: 1
  });
  const [createForm, setCreateForm] = useState({
    equipment_name: '',
    availability_letter: 'C' as 'C' | 'R' | 'E' | 'I',
    availability_number: 1,
    cost: 0,
    equipment_category: '',
    equipment_type: 'wargear' as 'wargear' | 'weapon'
  });
  const [createWeaponProfiles, setCreateWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [editWeaponProfiles, setEditWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [originalEditWeaponProfiles, setOriginalEditWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [weaponProfilesModified, setWeaponProfilesModified] = useState(false);
  const { toast } = useToast();

  // Helper functions for availability
  const combineAvailability = (letter: 'C' | 'R' | 'E' | 'I', number: number): string => {
    if (letter === 'C' || letter === 'E') {
      return letter;
    }
    return `${letter}${number}`;
  };

  const parseAvailability = (availability: string): { letter: 'C' | 'R' | 'E' | 'I', number: number } => {
    if (availability === 'C' || availability === 'E') {
      return { letter: availability, number: 1 };
    }
    if (availability === 'I') {
      return { letter: 'I', number: 1 };
    }
    // Parse R12, R1, etc.
    const match = availability.match(/^([CREI])(\d+)$/);
    if (match) {
      const letter = match[1] as 'C' | 'R' | 'E' | 'I';
      const number = parseInt(match[2]);
      return { letter, number: Math.min(Math.max(number, 1), 20) }; // Clamp between 1-20
    }
    // Default fallback
    return { letter: 'C', number: 1 };
  };

  // Handle opening the add equipment modal
  const handleAddEquipment = () => {
    setCreateModalOpen(true);
    if (categories.length === 0) {
      fetchCategories();
    }
  };

  // Fetch equipment categories
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/equipment/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({
        title: "Error",
        description: "Failed to load equipment categories",
        variant: "destructive",
      });
    }
  };

  // Handle create modal close
  const handleCreateModalClose = () => {
    setCreateModalOpen(false);
    setCreateForm({
      equipment_name: '',
      availability_letter: 'C',
      availability_number: 1,
      cost: 0,
      equipment_category: '',
      equipment_type: 'wargear'
    });
    setCreateWeaponProfiles([]);
  };

  // Handle create form changes
  const handleCreateFormChange = (field: string, value: string | number) => {
    setCreateForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle create modal confirm
  const handleCreateModalConfirm = async () => {
    try {
      setIsLoading(true);

      const newEquipment = await createCustomEquipment({
        ...createForm,
        availability: combineAvailability(createForm.availability_letter, createForm.availability_number)
      });

      // Save weapon profiles if this is a weapon and there are profiles
      if (createForm.equipment_type === 'weapon' && createWeaponProfiles.length > 0) {
        await saveCustomWeaponProfiles(newEquipment.id, createWeaponProfiles);
      }
      
      // Add to local state
      setEquipment(prev => [...prev, newEquipment]);

      toast({
        title: "Success",
        description: "Custom equipment created successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error creating equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create equipment",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  // Check if create form is valid
  const isCreateFormValid = () => {
    return createForm.equipment_name.trim() !== '' &&
           createForm.cost >= 0 &&
           createForm.equipment_category !== '';
  };

  // Define columns for the equipment list
  const columns: ListColumn[] = [
    {
      key: 'equipment_name',
      label: 'Name',
      width: '30%'
    },
    {
      key: 'equipment_category',
      label: 'Category',
      width: '20%'
    },
    {
      key: 'equipment_type',
      label: 'Type',
      width: '15%',
      render: (value) => value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '-'
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      width: '10%',
      render: (value) => value ? String(value) : '-'
    },
    {
      key: 'availability',
      label: 'Availability',
      width: '15%'
    }
  ];

  // Define actions for each equipment item
  const actions: ListAction[] = [
    {
      label: 'Edit',
      onClick: (item: CustomEquipment) => handleEditEquipment(item),
      variant: 'outline',
      size: 'sm'
    },
    {
      label: 'Delete',
      onClick: (item: CustomEquipment) => handleDeleteEquipment(item),
      variant: 'destructive',
      size: 'sm'
    }
  ];

  const handleEditEquipment = async (equipment: CustomEquipment) => {
    setEditModalData(equipment);
    const parsed = parseAvailability(equipment.availability || 'C');
    setEditForm({
      equipment_name: equipment.equipment_name || '',
      cost: equipment.cost || 0,
      equipment_category: equipment.equipment_category || '',
      equipment_type: (equipment.equipment_type as 'wargear' | 'weapon') || 'wargear',
      availability_letter: parsed.letter,
      availability_number: parsed.number
    });
    
    // Reset weapon profiles modification flag
    setWeaponProfilesModified(false);
    
    // Fetch categories if not already loaded
    if (categories.length === 0) {
      fetchCategories();
    }

    // Load weapon profiles if this is a weapon
    if (equipment.equipment_type === 'weapon' && equipment.id) {
      try {
        const profiles = await getCustomWeaponProfiles(equipment.id);
        setEditWeaponProfiles(profiles);
        setOriginalEditWeaponProfiles(profiles);
      } catch (error) {
        console.error('Error loading weapon profiles:', error);
        setEditWeaponProfiles([]);
        setOriginalEditWeaponProfiles([]);
      }
    } else {
      setEditWeaponProfiles([]);
      setOriginalEditWeaponProfiles([]);
    }
  };

  const handleDeleteEquipment = (equipment: CustomEquipment) => {
    setDeleteModalData(equipment);
  };

  const handleEditModalClose = () => {
    setEditModalData(null);
    setEditForm({
      equipment_name: '',
      cost: 0,
      equipment_category: '',
      equipment_type: 'wargear',
      availability_letter: 'C',
      availability_number: 1
    });
    setEditWeaponProfiles([]);
    setOriginalEditWeaponProfiles([]);
    setWeaponProfilesModified(false);
  };

  const handleEditWeaponProfilesChange = (profiles: CustomWeaponProfile[]) => {
    setEditWeaponProfiles(profiles);
    setWeaponProfilesModified(true);
  };

  const handleDeleteModalClose = () => {
    setDeleteModalData(null);
  };

  const handleEditModalConfirm = async () => {
    if (!editModalData) return false;

    try {
      setIsLoading(true);
      
      // Call the server action to update the equipment
      const updatedEquipment = await updateCustomEquipment(editModalData.id, {
        equipment_name: editForm.equipment_name,
        cost: editForm.cost,
        equipment_category: editForm.equipment_category,
        equipment_type: editForm.equipment_type,
        availability: combineAvailability(editForm.availability_letter, editForm.availability_number)
      });

      // Handle weapon profiles based on equipment type
      if (editForm.equipment_type === 'weapon') {
        // Save weapon profiles if this is a weapon and they were modified
        const equipmentIdToUse = updatedEquipment?.id || editModalData.id;
        if (weaponProfilesModified) {
          await saveCustomWeaponProfiles(equipmentIdToUse, editWeaponProfiles);
        }
      } else if (editModalData.equipment_type === 'weapon' && editForm.equipment_type === 'wargear') {
        // Delete weapon profiles if changing from weapon to wargear
        const equipmentIdToUse = updatedEquipment?.id || editModalData.id;
        await saveCustomWeaponProfiles(equipmentIdToUse, []); // Save empty array to delete all profiles
      }

      // Update the local state with the updated equipment
      setEquipment(prev => 
        prev.map(item => 
          item.id === editModalData.id 
            ? { ...item, ...updatedEquipment }
            : item
        )
      );

      toast({
        title: "Success",
        description: "Equipment updated successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update equipment",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModalConfirm = async () => {
    if (!deleteModalData) return false;

    try {
      setIsLoading(true);
      
      // Call the server action to delete the equipment
      await deleteCustomEquipment(deleteModalData.id);

      // Update the local state by removing the deleted equipment
      setEquipment(prev => 
        prev.filter(item => item.id !== deleteModalData.id)
      );

      toast({
        title: "Success",
        description: "Equipment deleted successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete equipment",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = async (field: string, value: string | number) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));

    // If equipment type is changed to weapon, load weapon profiles
    if (field === 'equipment_type' && value === 'weapon' && editModalData?.id) {
      try {
        const profiles = await getCustomWeaponProfiles(editModalData.id);
        setEditWeaponProfiles(profiles);
        setWeaponProfilesModified(true);
      } catch (error) {
        console.error('Error loading weapon profiles:', error);
        setEditWeaponProfiles([]);
        setWeaponProfilesModified(true);
      }
    } else if (field === 'equipment_type' && value === 'wargear') {
      // Clear weapon profiles when switching to wargear
      setEditWeaponProfiles([]);
      setWeaponProfilesModified(true);
    }
  };

  // Sort equipment by name alphabetically
  const sortEquipment = (a: CustomEquipment, b: CustomEquipment) => {
    return a.equipment_name.localeCompare(b.equipment_name);
  };

  return (
    <div className={className}>
      <List<CustomEquipment>
        title="Equipment"
        items={equipment}
        columns={columns}
        actions={actions}
        onAdd={handleAddEquipment}
        addButtonText="Add"
        emptyMessage="No custom equipment created yet."
        isLoading={isLoading}
        sortBy={sortEquipment}
      />

      {editModalData && (
        <Modal
          title="Edit Equipment"
          width="2xl"
          content={
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Name *
                  </label>
                  <input
                    type="text"
                    value={editForm.equipment_name}
                    onChange={(e) => handleFormChange('equipment_name', e.target.value)}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter equipment name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Type *
                  </label>
                  <select
                    value={editForm.equipment_type}
                    onChange={(e) => handleFormChange('equipment_type', e.target.value as 'wargear' | 'weapon')}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="wargear">Wargear</option>
                    <option value="weapon">Weapon</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={editForm.equipment_category}
                    onChange={(e) => handleFormChange('equipment_category', e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.category_name}>
                        {category.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Availability *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.availability_letter}
                      onChange={(e) => handleFormChange('availability_letter', e.target.value as 'C' | 'R' | 'E' | 'I')}
                      className="p-2 border rounded-md"
                    >
                      <option value="C">C</option>
                      <option value="R">R</option>
                      <option value="E">E</option>
                      <option value="I">I</option>
                    </select>
                    <input
                      type="number"
                      value={editForm.availability_letter === 'C' || editForm.availability_letter === 'E' ? '' : (editForm.availability_number === 1 ? '' : editForm.availability_number)}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          handleFormChange('availability_number', 1);
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
                            handleFormChange('availability_number', numValue);
                          }
                        }
                      }}
                      disabled={editForm.availability_letter === 'C' || editForm.availability_letter === 'E'}
                      className="flex-1 p-2 border rounded-md disabled:bg-gray-100 disabled:text-gray-400"
                      placeholder="1-20"
                      min="1"
                      max="20"
                    />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost *
                  </label>
                  <input
                    type="number"
                    value={editForm.cost}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        handleFormChange('cost', 0);
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          handleFormChange('cost', numValue);
                        }
                      }
                    }}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter cost"
                    min="0"
                  />
                </div>

                {/* Weapon Profiles Section */}
                {editForm.equipment_type === 'weapon' && (
                  <div className="col-span-1 md:col-span-2 pt-4 border-t">
                    <CustomWeaponProfiles
                      profiles={editWeaponProfiles}
                      onProfilesChange={handleEditWeaponProfilesChange}
                    />
                  </div>
                )}
              </div>
            </div>
          }
          onClose={handleEditModalClose}
          onConfirm={handleEditModalConfirm}
          confirmText="Save Changes"
          confirmDisabled={!editForm.equipment_name.trim()}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Equipment"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete <strong>{deleteModalData.equipment_name}</strong>?</p>
              <p className="text-sm text-gray-600">
                <strong>Warning:</strong> This equipment will be removed from all fighters that currently have it equipped.
              </p>
            </div>
          }
          onClose={handleDeleteModalClose}
          onConfirm={handleDeleteModalConfirm}
          confirmText="Delete"
        />
      )}

      {createModalOpen && (
        <Modal
          title="Create Custom Equipment"
          width="2xl"
          content={
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Name *
                  </label>
                  <input
                    type="text"
                    value={createForm.equipment_name}
                    onChange={(e) => handleCreateFormChange('equipment_name', e.target.value)}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter equipment name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Type *
                  </label>
                  <select
                    value={createForm.equipment_type}
                    onChange={(e) => handleCreateFormChange('equipment_type', e.target.value as 'wargear' | 'weapon')}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="wargear">Wargear</option>
                    <option value="weapon">Weapon</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={createForm.equipment_category}
                    onChange={(e) => handleCreateFormChange('equipment_category', e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.category_name}>
                        {category.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Availability *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={createForm.availability_letter}
                      onChange={(e) => handleCreateFormChange('availability_letter', e.target.value as 'C' | 'R' | 'E' | 'I')}
                      className="p-2 border rounded-md"
                    >
                      <option value="C">C</option>
                      <option value="R">R</option>
                      <option value="E">E</option>
                      <option value="I">I</option>
                    </select>
                    <input
                      type="number"
                      value={createForm.availability_letter === 'C' || createForm.availability_letter === 'E' ? '' : (createForm.availability_number === 1 ? '' : createForm.availability_number)}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          handleCreateFormChange('availability_number', 1);
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
                            handleCreateFormChange('availability_number', numValue);
                          }
                        }
                      }}
                      disabled={createForm.availability_letter === 'C' || createForm.availability_letter === 'E'}
                      className="flex-1 p-2 border rounded-md disabled:bg-gray-100 disabled:text-gray-400"
                      placeholder="1-20"
                      min="1"
                      max="20"
                    />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost *
                  </label>
                  <input
                    type="number"
                    value={createForm.cost}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        handleCreateFormChange('cost', 0);
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          handleCreateFormChange('cost', numValue);
                        }
                      }
                    }}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter cost"
                    min="0"
                  />
                </div>

                {/* Weapon Profiles Section */}
                {createForm.equipment_type === 'weapon' && (
                  <div className="col-span-1 md:col-span-2 pt-4 border-t">
                    <CustomWeaponProfiles
                      profiles={createWeaponProfiles}
                      onProfilesChange={setCreateWeaponProfiles}
                    />
                  </div>
                )}
              </div>
            </div>
          }
          onClose={handleCreateModalClose}
          onConfirm={handleCreateModalConfirm}
          confirmText="Create Equipment"
          confirmDisabled={!isCreateFormValid() || isLoading}
        />
      )}
    </div>
  );
} 