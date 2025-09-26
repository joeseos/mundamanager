'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomTerritory } from '@/app/lib/customise/custom-territories';
import { updateCustomTerritory, deleteCustomTerritory, createCustomTerritory } from '@/app/actions/customise/custom-territories';
import Modal from '@/components/ui/modal';
import { useToast } from '@/components/ui/use-toast';
import { Edit, Eye } from 'lucide-react';
import { LuTrash2 } from 'react-icons/lu';
import { FaRegCopy } from 'react-icons/fa';

interface CustomiseTerritoriesProps {
  className?: string;
  initialTerritories?: CustomTerritory[];
  readOnly?: boolean;
}


export function CustomiseTerritories({ className, initialTerritories = [], readOnly = false }: CustomiseTerritoriesProps) {
  const [territories, setTerritories] = useState<CustomTerritory[]>(initialTerritories);
  const [isLoading, setIsLoading] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomTerritory | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomTerritory | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalData, setViewModalData] = useState<CustomTerritory | null>(null);
  const [copyModalData, setCopyModalData] = useState<CustomTerritory | null>(null);
  const [editForm, setEditForm] = useState({
    territory_name: ''
  });
  const [createForm, setCreateForm] = useState({
    territory_name: ''
  });
  const { toast } = useToast();

  // Handle opening the add territory modal
  const handleAddTerritory = () => {
    setCreateModalOpen(true);
  };


  // Handle create modal close
  const handleCreateModalClose = () => {
    setCreateModalOpen(false);
    setCreateForm({
      territory_name: ''
    });
  };

  // Handle create form changes
  const handleCreateFormChange = (field: string, value: string) => {
    setCreateForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle create modal confirm
  const handleCreateModalConfirm = async () => {
    try {
      setIsLoading(true);

      const newTerritory = await createCustomTerritory({
        territory_name: createForm.territory_name
      });
      
      // Add to local state
      setTerritories(prev => [...prev, newTerritory]);

      toast({
        title: "Success",
        description: "Custom territory created successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error creating territory:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create territory",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  // Check if create form is valid
  const isCreateFormValid = () => {
    return createForm.territory_name.trim() !== '';
  };

  // Define columns for the territory list
  const columns: ListColumn[] = [
    {
      key: 'territory_name',
      label: 'Name',
      width: '100%'
    }
  ];

  // Define actions for each territory item
  const actions: ListAction[] = readOnly ? [
    {
      icon: <Eye className="h-4 w-4" />,
      onClick: (item: CustomTerritory) => handleViewTerritory(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <FaRegCopy className="h-4 w-4" />,
      onClick: (item: CustomTerritory) => handleCopyTerritory(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ] : [
    {
      icon: <Edit className="h-4 w-4" />,
      onClick: (item: CustomTerritory) => handleEditTerritory(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    },
    {
      icon: <LuTrash2 className="h-4 w-4" />,
      onClick: (item: CustomTerritory) => handleDeleteTerritory(item),
      variant: 'destructive',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ];

  const handleViewTerritory = async (territory: CustomTerritory) => {
    setViewModalData(territory);
    setEditForm({
      territory_name: territory.territory_name || ''
    });
  };

  const handleEditTerritory = async (territory: CustomTerritory) => {
    setEditModalData(territory);
    setEditForm({
      territory_name: territory.territory_name || ''
    });
  };

  const handleCopyTerritory = (territory: CustomTerritory) => {
    setCopyModalData(territory);
  };

  const handleDeleteTerritory = (territory: CustomTerritory) => {
    setDeleteModalData(territory);
  };

  const handleEditModalClose = () => {
    setEditModalData(null);
    setEditForm({
      territory_name: ''
    });
  };

  const handleDeleteModalClose = () => {
    setDeleteModalData(null);
  };

  const handleEditModalConfirm = async () => {
    if (!editModalData) return false;

    try {
      setIsLoading(true);
      
      // Call the server action to update the territory
      const updatedTerritory = await updateCustomTerritory(editModalData.id, {
        territory_name: editForm.territory_name
      });

      // Update the local state with the updated territory
      setTerritories(prev => 
        prev.map(item => 
          item.id === editModalData.id 
            ? { ...item, ...updatedTerritory }
            : item
        )
      );

      toast({
        title: "Success",
        description: "Territory updated successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error updating territory:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update territory",
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
      
      // Call the server action to delete the territory
      await deleteCustomTerritory(deleteModalData.id);

      // Update the local state by removing the deleted territory
      setTerritories(prev => 
        prev.filter(item => item.id !== deleteModalData.id)
      );

      toast({
        title: "Success",
        description: "Territory deleted successfully",
      });

      return true; // Return true to close modal
    } catch (error) {
      console.error('Error deleting territory:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete territory",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyModalConfirm = async () => {
    if (!copyModalData) return false;

    try {
      setIsLoading(true);
      
      // Create a copy of the territory
      const newTerritory = {
        territory_name: copyModalData.territory_name,
      };

      // Call the server action to create the territory
      // Note: createCustomTerritory returns the territory data directly, not wrapped in { success, data }
      const createdTerritory = await createCustomTerritory(newTerritory);

      if (createdTerritory) {
        toast({
          title: "Success",
          description: `${copyModalData.territory_name} has been copied to your custom territories.`,
        });
        setCopyModalData(null);
        return true; // Return true to close modal
      } else {
        throw new Error('Failed to copy territory');
      }
    } catch (error) {
      console.error('Error copying territory:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to copy territory",
        variant: "destructive",
      });
      return false; // Return false to keep modal open
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Sort territories by name alphabetically
  const sortTerritories = (a: CustomTerritory, b: CustomTerritory) => {
    return a.territory_name.localeCompare(b.territory_name);
  };

  return (
    <div className={className}>
      <List<CustomTerritory>
        title="Territories"
        items={territories}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : handleAddTerritory}
        addButtonText="Add"
        emptyMessage="No custom territories created yet."
        isLoading={isLoading}
        sortBy={sortTerritories}
      />

      {editModalData && (
        <Modal
          title="Edit Territory"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Territory Name *
                </label>
                <input
                  type="text"
                  value={editForm.territory_name}
                  onChange={(e) => handleFormChange('territory_name', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter territory name"
                />
              </div>
            </div>
          }
          onClose={handleEditModalClose}
          onConfirm={handleEditModalConfirm}
          confirmText="Save Changes"
          confirmDisabled={!editForm.territory_name.trim()}
        />
      )}

      {viewModalData && (
        <Modal
          title="View Territory"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Territory Name
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {editForm.territory_name}
                </div>
              </div>
            </div>
          }
          onClose={() => setViewModalData(null)}
          hideCancel={true}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Territory"
          content={
            <div className="space-y-4">
              <p>Are you sure you want to delete <strong>{deleteModalData.territory_name}</strong>?</p>
              <p className="text-sm text-red-600">
                <strong>Warning:</strong> This territory will be removed from all campaigns that currently use it.
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
              <p>Do you want to copy the custom asset <strong>"{copyModalData.territory_name}"</strong> into your own profile?</p>
              <p className="text-sm text-muted-foreground">
                This will create a copy of the territory in your custom territories list.
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
          title="Create Custom Territory"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Territory Name *
                </label>
                <input
                  type="text"
                  value={createForm.territory_name}
                  onChange={(e) => handleCreateFormChange('territory_name', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter territory name"
                />
              </div>
            </div>
          }
          onClose={handleCreateModalClose}
          onConfirm={handleCreateModalConfirm}
          confirmText="Create Territory"
          confirmDisabled={!isCreateFormValid() || isLoading}
        />
      )}
    </div>
  );
}