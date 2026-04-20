'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FiShare2 } from 'react-icons/fi';
import { ShareCustomGangTypeModal } from '@/components/customise/custom-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCustomGangType,
  updateCustomGangType,
  deleteCustomGangType,
  type CustomGangType,
  type CustomGangTypeData,
} from '@/app/actions/customise/custom-gang-types';

interface UserCampaign {
  id: string;
  campaign_name: string;
  status: string | null;
}

interface CustomiseGangTypesProps {
  className?: string;
  initialGangTypes: CustomGangType[];
  userId?: string;
  userCampaigns?: UserCampaign[];
  readOnly?: boolean;
}

const ALIGNMENT_OPTIONS = ['Outlaw', 'Law Abiding', 'Unaligned'] as const;

export function CustomiseGangTypes({
  className,
  initialGangTypes,
  userId,
  userCampaigns = [],
  readOnly = false,
}: CustomiseGangTypesProps) {
  const [gangTypes, setGangTypes] = useState<CustomGangType[]>(initialGangTypes);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomGangType | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomGangType | null>(null);
  const [viewModalData, setViewModalData] = useState<CustomGangType | null>(null);
  const [shareModalData, setShareModalData] = useState<CustomGangType | null>(null);

  // Form state
  const [formData, setFormData] = useState<CustomGangTypeData>({
    gang_type: '',
    alignment: null,
  });

  const queryClient = useQueryClient();

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createCustomGangType,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['customGangTypes'] });
      const previous = gangTypes;
      const optimistic: CustomGangType = {
        id: `temp-${Date.now()}`,
        user_id: userId || '',
        gang_type: newData.gang_type,
        alignment: newData.alignment,
        created_at: new Date().toISOString(),
      };
      setGangTypes(prev => [...prev, optimistic]);
      return { previous };
    },
    onSuccess: (result, _, context) => {
      if (result.success && result.data) {
        setGangTypes(prev => prev.map(g => g.id.startsWith('temp-') ? result.data! : g));
        setIsAddModalOpen(false);
        resetForm();
        toast.success('Custom gang type created successfully');
      } else {
        if (context?.previous) setGangTypes(context.previous);
        toast.error(result.error || 'Failed to create custom gang type');
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setGangTypes(context.previous);
      toast.error(error.message || 'Failed to create custom gang type');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customGangTypes'] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomGangTypeData }) =>
      updateCustomGangType(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['customGangTypes'] });
      const previous = gangTypes;
      setGangTypes(prev =>
        prev.map(g =>
          g.id === id
            ? { ...g, ...data, updated_at: new Date().toISOString() }
            : g
        )
      );
      return { previous };
    },
    onSuccess: (result, { id }, context) => {
      if (result.success && result.data) {
        setGangTypes(prev => prev.map(g => (g.id === id ? result.data! : g)));
        setEditModalData(null);
        resetForm();
        toast.success('Custom gang type updated successfully');
      } else {
        if (context?.previous) setGangTypes(context.previous);
        toast.error(result.error || 'Failed to update custom gang type');
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setGangTypes(context.previous);
      toast.error(error.message || 'Failed to update custom gang type');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customGangTypes'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCustomGangType,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['customGangTypes'] });
      const previous = gangTypes;
      setGangTypes(prev => prev.filter(g => g.id !== deletedId));
      return { previous };
    },
    onSuccess: (result, _, context) => {
      if (result.success) {
        toast.success('Custom gang type deleted successfully');
      } else {
        if (context?.previous) setGangTypes(context.previous);
        toast.error(result.error || 'Failed to delete custom gang type');
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setGangTypes(context.previous);
      toast.error(error.message || 'Failed to delete custom gang type');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customGangTypes'] });
    },
  });

  const resetForm = () => {
    setFormData({
      gang_type: '',
      alignment: null,
    });
  };

  const handleEdit = (gangType: CustomGangType) => {
    setEditModalData(gangType);
    setFormData({
      gang_type: gangType.gang_type,
      alignment: (gangType.alignment as CustomGangTypeData['alignment']) || null,
    });
  };

  const handleView = (gangType: CustomGangType) => {
    setViewModalData(gangType);
  };

  const handleDelete = (gangType: CustomGangType) => {
    setDeleteModalData(gangType);
  };

  const handleAddModalOpen = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const isFormValid = () => {
    return formData.gang_type.trim() !== '';
  };

  const handleCreateConfirm = async () => {
    if (!isFormValid()) return false;
    createMutation.mutate(formData);
    return true;
  };

  const handleEditConfirm = async () => {
    if (!editModalData || !isFormValid()) return false;
    updateMutation.mutate({ id: editModalData.id, data: formData });
    return true;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalData) return false;
    deleteMutation.mutate(deleteModalData.id);
    setDeleteModalData(null);
    return true;
  };

  // List columns
  const columns: ListColumn[] = [
    {
      key: 'gang_type',
      label: 'Gang Type',
      align: 'left',
      width: '50%',
    },
    {
      key: 'alignment',
      label: 'Alignment',
      align: 'left',
      width: '40%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => value || '-',
    },
  ];

  // List actions
  const actions: ListAction[] = readOnly
    ? [
        {
          icon: <LuEye className="h-4 w-4" />,
          onClick: (item: CustomGangType) => handleView(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ]
    : [
        {
          icon: <FiShare2 className="h-4 w-4" />,
          onClick: (item: CustomGangType) => setShareModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuSquarePen className="h-4 w-4" />,
          onClick: (item: CustomGangType) => handleEdit(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuTrash2 className="h-4 w-4" />,
          onClick: (item: CustomGangType) => handleDelete(item),
          variant: 'outline_remove',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ];

  // Shared form JSX
  const renderForm = (isReadOnly = false) => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Gang Type Name *</label>
        <Input
          value={formData.gang_type}
          onChange={(e) => setFormData({ ...formData, gang_type: e.target.value })}
          placeholder="Enter gang type name"
          disabled={isReadOnly}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Alignment</label>
        <select
          className="w-full border rounded-md p-2 bg-background"
          value={formData.alignment || ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              alignment: (e.target.value || null) as CustomGangTypeData['alignment'],
            })
          }
          disabled={isReadOnly}
        >
          <option value="">None</option>
          {ALIGNMENT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

    </div>
  );

  return (
    <div className={className}>
      <List
        title="Gang Types"
        items={gangTypes}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : handleAddModalOpen}
        addButtonText="Add"
        emptyMessage="No custom gang types created yet."
      />

      {/* Add Modal */}
      {isAddModalOpen && (
        <Modal
          title="Add Custom Gang Type"
          onClose={() => {
            setIsAddModalOpen(false);
            resetForm();
          }}
          onConfirm={handleCreateConfirm}
          confirmText="Create"
          confirmDisabled={!isFormValid() || createMutation.isPending}
        >
          {renderForm()}
        </Modal>
      )}

      {/* Edit Modal */}
      {editModalData && (
        <Modal
          title="Edit Custom Gang Type"
          onClose={() => {
            setEditModalData(null);
            resetForm();
          }}
          onConfirm={handleEditConfirm}
          confirmText="Save"
          confirmDisabled={!isFormValid() || updateMutation.isPending}
        >
          {renderForm()}
        </Modal>
      )}

      {/* View Modal */}
      {viewModalData && (
        <Modal
          title="View Custom Gang Type"
          onClose={() => setViewModalData(null)}
        >
          {renderForm(true)}
        </Modal>
      )}

      {/* Share Modal */}
      {shareModalData && userId && (
        <ShareCustomGangTypeModal
          gangType={shareModalData}
          userCampaigns={userCampaigns}
          onClose={() => setShareModalData(null)}
        />
      )}

      {/* Delete Modal */}
      {deleteModalData && (
        <Modal
          title="Delete Custom Gang Type"
          onClose={() => setDeleteModalData(null)}
          onConfirm={handleDeleteConfirm}
          confirmText="Delete"
        >
          <p>
            Are you sure you want to delete <strong>{deleteModalData.gang_type}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            This will also delete all gangs using this gang type and remove any campaign shares.
          </p>
        </Modal>
      )}
    </div>
  );
}
