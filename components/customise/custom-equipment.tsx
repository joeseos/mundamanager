'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomEquipment } from '@/app/lib/customise/custom-equipment';
import { updateCustomEquipment, deleteCustomEquipment, createCustomEquipment } from '@/app/actions/customise/custom-equipment';
import { saveCustomWeaponProfiles, getCustomWeaponProfiles } from '@/app/actions/customise/custom-weapon-profiles';
import { CustomWeaponProfiles, CustomWeaponProfile } from './custom-weapon-profiles';
import Modal from '@/components/ui/modal';
import { toast } from 'sonner';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FaRegCopy } from 'react-icons/fa';
import { FiShare2 } from 'react-icons/fi';
import { createClient } from '@/utils/supabase/client';
import { ShareCustomEquipmentModal, UserCampaign } from './custom-shared';

interface CustomiseEquipmentProps {
  className?: string;
  initialEquipment?: CustomEquipment[];
  readOnly?: boolean;
  userId?: string;
  userCampaigns?: UserCampaign[];
}

interface EquipmentCategory {
  id: string;
  category_name: string;
}

export function CustomiseEquipment({ className, initialEquipment = [], readOnly = false, userId, userCampaigns = [] }: CustomiseEquipmentProps) {
  const [equipment, setEquipment] = useState<CustomEquipment[]>(initialEquipment);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomEquipment | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomEquipment | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalData, setViewModalData] = useState<CustomEquipment | null>(null);
  const [copyModalData, setCopyModalData] = useState<CustomEquipment | null>(null);
  const [shareModalData, setShareModalData] = useState<CustomEquipment | null>(null);
  const supabase = createClient();
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [editForm, setEditForm] = useState({
    equipment_name: '',
    cost: '',
    equipment_category: '',
    equipment_type: 'wargear' as 'wargear' | 'weapon',
    availability_letter: 'C' as 'C' | 'R' | 'E' | 'I',
    availability_number: 6
  });
  const [createForm, setCreateForm] = useState({
    equipment_name: '',
    availability_letter: 'C' as 'C' | 'R' | 'E' | 'I',
    availability_number: 6,
    cost: '',
    equipment_category: '',
    equipment_type: 'wargear' as 'wargear' | 'weapon'
  });
  const [createWeaponProfiles, setCreateWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [editWeaponProfiles, setEditWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [originalEditWeaponProfiles, setOriginalEditWeaponProfiles] = useState<CustomWeaponProfile[]>([]);
  const [weaponProfilesModified, setWeaponProfilesModified] = useState(false);
  

  // Helper functions for availability
  const combineAvailability = (letter: 'C' | 'R' | 'E' | 'I', number: number): string => {
    if (letter === 'C' || letter === 'E') {
      return letter;
    }
    return `${letter}${number}`;
  };

  const parseAvailability = (availability: string): { letter: 'C' | 'R' | 'E' | 'I', number: number } => {
    if (availability === 'C' || availability === 'E') {
      return { letter: availability, number: 6 };
    }
    if (availability === 'I') {
      return { letter: 'I', number: 6 };
    }
    // Parse R12, R6, etc.
    const match = availability.match(/^([CREI])(\d+)$/);
    if (match) {
      const letter = match[1] as 'C' | 'R' | 'E' | 'I';
      const number = parseInt(match[2]);
      return { letter, number: Math.min(Math.max(number, 6), 20) }; // Clamp between 6-20
    }
    // Default fallback
    return { letter: 'C', number: 6 };
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
      toast.error("Error", { description: "Failed to load equipment categories" });
    }
  };

  // Handle create modal close
  const handleCreateModalClose = () => {
    setCreateModalOpen(false);
    setCreateForm({
      equipment_name: '',
      availability_letter: 'C',
      availability_number: 6,
      cost: '',
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
        cost: parseInt(createForm.cost),
        availability: combineAvailability(createForm.availability_letter, createForm.availability_number)
      });

      // Save weapon profiles if this is a weapon and there are profiles
      if (createForm.equipment_type === 'weapon' && createWeaponProfiles.length > 0) {
        await saveCustomWeaponProfiles(newEquipment.id, createWeaponProfiles);
      }
      
      // Add to local state
      setEquipment(prev => [...prev, newEquipment]);

      toast.success("Success", { description: "Custom equipment created successfully" });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error creating equipment:', error);
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to create equipment" });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  // Check if create form is valid
  const isCreateFormValid = () => {
    const costNum = parseInt(createForm.cost);
    return createForm.equipment_name.trim() !== '' &&
           createForm.cost.trim() !== '' &&
           !isNaN(costNum) &&
           costNum >= 0 &&
           createForm.equipment_category !== '';
  };

  // Define columns for the equipment list
  const columns: ListColumn[] = [
    {
      key: 'equipment_name',
      label: 'Name',
      align: 'left',
      width: '30%'
    },
    {
      key: 'equipment_category',
      label: 'Category',
      align: 'left',
      width: '20%',
      cellClassName: 'text-sm text-muted-foreground'
    },
    {
      key: 'equipment_type',
      label: 'Type',
      align: 'left',
      width: '15%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '-'
    },
    {
      key: 'availability',
      label: 'AL',
      align: 'right',
      width: '15%',
      cellClassName: 'text-sm text-muted-foreground'
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      width: '10%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => value ? String(value) : '-'
    },
  ];

  // Define actions for each equipment item
  const actions: ListAction[] = readOnly ? [
    {
      icon: <LuEye className="h-4 w-4" />,
      onClick: (item: CustomEquipment) => handleViewEquipment(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <FaRegCopy className="h-4 w-4" />,
      onClick: (item: CustomEquipment) => handleCopyEquipment(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ] : [
    {
      icon: <FiShare2 className="h-4 w-4" />,
      onClick: (item: CustomEquipment) => setShareModalData(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <LuSquarePen className="h-4 w-4" />,
      onClick: (item: CustomEquipment) => handleEditEquipment(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <LuTrash2 className="h-4 w-4" />,
      onClick: (item: CustomEquipment) => handleDeleteEquipment(item),
      variant: 'outline_remove',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ];

  const handleViewEquipment = async (equipment: CustomEquipment) => {
    setViewModalData(equipment);
    const parsed = parseAvailability(equipment.availability || 'C');
    setEditForm({
      equipment_name: equipment.equipment_name || '',
      cost: equipment.cost?.toString() || '',
      equipment_category: equipment.equipment_category || '',
      equipment_type: (equipment.equipment_type as 'wargear' | 'weapon') || 'wargear',
      availability_letter: parsed.letter,
      availability_number: parsed.number
    });
    
    // Reset weapon profiles modification flag
    setWeaponProfilesModified(false);
    
    // Load weapon profiles if it's a weapon
    if (equipment.equipment_type === 'weapon') {
      try {
        // Fetch weapon profiles directly from Supabase for any user's equipment
        const { data: profiles, error } = await supabase
          .from('custom_weapon_profiles')
          .select('*')
          .eq('weapon_group_id', equipment.id)
          .order('sort_order');
        
        if (error) {
          console.error('Error loading weapon profiles:', error);
          setEditWeaponProfiles([]);
          setOriginalEditWeaponProfiles([]);
        } else {
          // Use the raw database data directly since the view modal expects the original field names
          setEditWeaponProfiles(profiles || []);
          setOriginalEditWeaponProfiles(profiles || []);
        }
      } catch (error) {
        console.error('Error loading weapon profiles:', error);
        setEditWeaponProfiles([]);
        setOriginalEditWeaponProfiles([]);
      }
    } else {
      setEditWeaponProfiles([]);
      setOriginalEditWeaponProfiles([]);
    }
    
    // Fetch categories if not already loaded
    if (categories.length === 0) {
      fetchCategories();
    }
  };

  const handleEditEquipment = async (equipment: CustomEquipment) => {
    setEditModalData(equipment);
    const parsed = parseAvailability(equipment.availability || 'C');
    setEditForm({
      equipment_name: equipment.equipment_name || '',
      cost: equipment.cost?.toString() || '',
      equipment_category: equipment.equipment_category || '',
      equipment_type: (equipment.equipment_type as 'wargear' | 'weapon') || 'wargear',
      availability_letter: parsed.letter,
      availability_number: parsed.number
    });
    
    // Reset weapon profiles modification flag
    setWeaponProfilesModified(false);
    
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
    
    // Fetch categories if not already loaded
    if (categories.length === 0) {
      fetchCategories();
    }
  };

  const handleCopyEquipment = (equipment: CustomEquipment) => {
    setCopyModalData(equipment);
  };

  const handleDeleteEquipment = (equipment: CustomEquipment) => {
    setDeleteModalData(equipment);
  };

  const handleEditModalClose = () => {
    setEditModalData(null);
    setEditForm({
      equipment_name: '',
      cost: '',
      equipment_category: '',
      equipment_type: 'wargear',
      availability_letter: 'C',
      availability_number: 6
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
        cost: parseInt(editForm.cost),
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

      toast.success("Success", { description: "Equipment updated successfully" });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to update equipment" });
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

      toast.success("Success", { description: "Equipment deleted successfully" });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to delete equipment" });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyModalConfirm = async () => {
    if (!copyModalData) return false;

    try {
      setIsLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create a copy of the equipment with new user_id
      const newEquipment = {
        equipment_name: copyModalData.equipment_name,
        cost: copyModalData.cost,
        equipment_category: copyModalData.equipment_category,
        equipment_type: copyModalData.equipment_type,
        availability: copyModalData.availability,
        user_id: user.id
      };

      // Create the new equipment
      const { data: createdEquipment, error: createError } = await supabase
        .from('custom_equipment')
        .insert([newEquipment])
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // If it's a weapon, copy the weapon profiles
      if (copyModalData.equipment_type === 'weapon') {
        const { data: weaponProfiles, error: profilesError } = await supabase
          .from('custom_weapon_profiles')
          .select('*')
          .eq('custom_equipment_id', copyModalData.id);

        if (profilesError) {
          console.error('Error fetching weapon profiles:', profilesError);
          throw new Error('Failed to fetch weapon profiles for copying');
        }

        if (weaponProfiles && weaponProfiles.length > 0) {
          const newProfiles = weaponProfiles.map(profile => ({
            custom_equipment_id: createdEquipment.id,
            profile_name: profile.profile_name,
            range_short: profile.range_short,
            range_long: profile.range_long,
            acc_short: profile.acc_short,
            acc_long: profile.acc_long,
            strength: profile.strength,
            ap: profile.ap,
            damage: profile.damage,
            ammo: profile.ammo,
            traits: profile.traits,
            sort_order: profile.sort_order,
            user_id: user.id
          }));

          const { error: insertError } = await supabase
            .from('custom_weapon_profiles')
            .insert(newProfiles);

          if (insertError) {
            console.error('Error inserting weapon profiles:', insertError);
            throw new Error('Failed to copy weapon profiles');
          }
        }
      }

      // Create success message
      let successMessage = `${copyModalData.equipment_name} has been copied to your custom equipment.`;
      if (copyModalData.equipment_type === 'weapon') {
        const { data: weaponProfiles } = await supabase
          .from('custom_weapon_profiles')
          .select('*')
          .eq('custom_equipment_id', copyModalData.id);
        
        if (weaponProfiles && weaponProfiles.length > 0) {
          successMessage += ` (${weaponProfiles.length} weapon profile${weaponProfiles.length > 1 ? 's' : ''} included)`;
        }
      }

      toast.success("Success", { description: successMessage });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error copying equipment:', error);
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed to copy equipment" });
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
        onAdd={readOnly ? undefined : handleAddEquipment}
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                    <select
                      value={editForm.availability_number}
                      onChange={(e) => handleFormChange('availability_number', parseInt(e.target.value))}
                      disabled={editForm.availability_letter === 'C' || editForm.availability_letter === 'E'}
                      className="flex-1 p-2 border rounded-md disabled:bg-muted disabled:text-gray-400"
                    >
                      {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Cost *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editForm.cost}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow empty string or digits only
                      if (/^\d*$/.test(val)) {
                        handleFormChange('cost', val);
                      }
                    }}
                    className="w-full p-2 border rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter cost"
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
          confirmDisabled={!editForm.equipment_name.trim() || !editForm.cost.trim() || isNaN(parseInt(editForm.cost))}
        />
      )}

      {viewModalData && (
        <Modal
          title="View Equipment"
          width="2xl"
          content={
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Equipment Name
                  </label>
                  <div className="w-full p-2 border rounded-md bg-muted">
                    {editForm.equipment_name}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Equipment Type
                  </label>
                  <div className="w-full p-2 border rounded-md bg-muted">
                    {editForm.equipment_type === 'wargear' ? 'Wargear' : 'Weapon'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Category
                  </label>
                  <div className="w-full p-2 border rounded-md bg-muted">
                    {editForm.equipment_category}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Cost
                  </label>
                  <div className="w-full p-2 border rounded-md bg-muted">
                    {editForm.cost}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Availability
                  </label>
                  <div className="w-full p-2 border rounded-md bg-muted">
                    {editForm.availability_letter}{editForm.availability_number}
                  </div>
                </div>
              </div>

              {editForm.equipment_type === 'weapon' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Weapon Profiles
                  </label>
                  <div className="space-y-2">
                    {editWeaponProfiles.map((profile, index) => (
                      <div key={index} className="p-3 border rounded-md bg-muted">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="font-medium">Name:</span> {profile.profile_name}
                          </div>
                          <div>
                            <span className="font-medium">Range:</span> {profile.range_short} / {profile.range_long}
                          </div>
                          <div>
                            <span className="font-medium">Accuracy:</span> {profile.acc_short} / {profile.acc_long}
                          </div>
                          <div>
                            <span className="font-medium">Strength:</span> {profile.strength}
                          </div>
                          <div>
                            <span className="font-medium">Damage:</span> {profile.damage}
                          </div>
                          <div>
                            <span className="font-medium">AP:</span> {profile.ap}
                          </div>
                          <div>
                            <span className="font-medium">Ammo:</span> {profile.ammo}
                          </div>
                          <div className="md:col-span-2">
                            <span className="font-medium">Traits:</span> {profile.traits || 'None'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {editWeaponProfiles.length === 0 && (
                      <div className="p-3 border rounded-md bg-muted text-center text-muted-foreground">
                        No weapon profiles defined
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          }
          onClose={() => setViewModalData(null)}
          hideCancel={true}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Equipment"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete <strong>{deleteModalData.equipment_name}</strong>?</p>
              <p className="text-sm text-red-600">
                <strong>Warning:</strong> This equipment will be removed from all fighters that currently have it equipped.
              </p>
            </div>
          }
          onClose={handleDeleteModalClose}
          onConfirm={handleDeleteModalConfirm}
          confirmText="Delete"
        />
      )}

      {copyModalData && (
        <Modal
          title="Copy Custom Asset"
          content={
            <div className="space-y-4">
              <p>Do you want to copy the custom asset <strong>"{copyModalData.equipment_name}"</strong> into your own profile?</p>
              <p className="text-sm text-muted-foreground">
                This will create a copy of the equipment in your custom equipment list.
              </p>
            </div>
          }
          onClose={() => setCopyModalData(null)}
          onConfirm={handleCopyModalConfirm}
          confirmText="Copy Custom Asset"
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                    <select
                      value={createForm.availability_number}
                      onChange={(e) => handleCreateFormChange('availability_number', parseInt(e.target.value))}
                      disabled={createForm.availability_letter === 'C' || createForm.availability_letter === 'E'}
                      className="flex-1 p-2 border rounded-md disabled:bg-muted disabled:text-gray-400"
                    >
                      {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Cost *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={createForm.cost}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow empty string or digits only
                      if (/^\d*$/.test(val)) {
                        handleCreateFormChange('cost', val);
                      }
                    }}
                    className="w-full p-2 border rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter cost"
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

      {shareModalData && userId && (
        <ShareCustomEquipmentModal
          equipment={shareModalData}
          userCampaigns={userCampaigns}
          onClose={() => setShareModalData(null)}
        />
      )}
    </div>
  );
} 