'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomEquipment } from '@/app/lib/custom-equipment';
import { updateCustomEquipment, deleteCustomEquipment } from '@/app/actions/custom-equipment';
import Modal from '@/components/modal';
import { useToast } from '@/components/ui/use-toast';

interface CustomiseEquipmentProps {
  className?: string;
  initialEquipment?: CustomEquipment[];
}

export function CustomiseEquipment({ className, initialEquipment = [] }: CustomiseEquipmentProps) {
  const [equipment, setEquipment] = useState<CustomEquipment[]>(initialEquipment);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomEquipment | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomEquipment | null>(null);
  const [editForm, setEditForm] = useState({
    equipment_name: '',
    cost: 0
  });
  const { toast } = useToast();

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

  const handleEditEquipment = (equipment: CustomEquipment) => {
    setEditModalData(equipment);
    setEditForm({
      equipment_name: equipment.equipment_name || '',
      cost: equipment.cost || 0
    });
  };

  const handleDeleteEquipment = (equipment: CustomEquipment) => {
    setDeleteModalData(equipment);
  };

  const handleEditModalClose = () => {
    setEditModalData(null);
    setEditForm({
      equipment_name: '',
      cost: 0
    });
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
        cost: editForm.cost
      });

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

  const handleFormChange = (field: string, value: string | number) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
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
        emptyMessage="No custom equipment created yet."
        isLoading={isLoading}
        sortBy={sortEquipment}
      />

      {editModalData && (
        <Modal
          title="Edit Equipment"
          content={
            <div className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Name
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
                    Cost
                  </label>
                  <input
                    type="number"
                    value={editForm.cost}
                    onChange={(e) => handleFormChange('cost', parseInt(e.target.value) || 0)}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter cost"
                    min="0"
                  />
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-500">
                    <strong>Category:</strong> {editModalData.equipment_category || '-'}
                  </p>
                  <p className="text-sm text-gray-500">
                    <strong>Type:</strong> {editModalData.equipment_type || '-'}
                  </p>
                  <p className="text-sm text-gray-500">
                    <strong>Availability:</strong> {editModalData.availability || '-'}
                  </p>
                </div>
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
    </div>
  );
} 