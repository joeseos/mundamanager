'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FaRegCopy } from 'react-icons/fa';
import { FiShare2 } from 'react-icons/fi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShareCustomCollectionModal } from '@/components/customise/custom-shared';
import {
  createCustomCollection,
  updateCustomCollection,
  deleteCustomCollection,
  addCollectionItem,
  removeCollectionItem,
  copyCollection,
  type CustomCollectionData,
  type CollectionItemType,
} from '@/app/actions/customise/custom-collections';
import type { CustomCollectionWithItems, ResolvedCollectionItem } from '@/app/lib/customise/custom-collections';
import type { CustomEquipment } from '@/types/equipment';
import type { CustomFighterType } from '@/types/fighter';
import type { CustomSkill } from '@/app/lib/customise/custom-skills';
import type { CustomGangType } from '@/app/actions/customise/custom-gang-types';
import type { CustomTradingPost } from '@/app/actions/customise/custom-trading-posts';
import type { UserCampaign } from '@/types/campaign';

const TYPE_LABELS: Record<CollectionItemType, string> = {
  gang_type: 'Gang Type',
  fighter_type: 'Fighter',
  equipment: 'Equipment',
  skill: 'Skill',
  trading_post: 'Trading Post',
};

interface CandidateItem {
  id: string;
  name: string;
}

interface CustomiseCollectionsProps {
  className?: string;
  initialCollections: CustomCollectionWithItems[];
  userId?: string;
  userCampaigns?: UserCampaign[];
  readOnly?: boolean;
  // Candidate custom assets to add into a collection — the same arrays the Custom Assets
  // tab already holds, so the editor needs no extra fetch.
  customEquipment?: CustomEquipment[];
  customFighterTypes?: CustomFighterType[];
  customSkills?: CustomSkill[];
  customGangTypes?: CustomGangType[];
  customTradingPosts?: CustomTradingPost[];
}

export function CustomiseCollections({
  className,
  initialCollections,
  userId,
  userCampaigns = [],
  readOnly = false,
  customEquipment = [],
  customFighterTypes = [],
  customSkills = [],
  customGangTypes = [],
  customTradingPosts = [],
}: CustomiseCollectionsProps) {
  const [collections, setCollections] = useState<CustomCollectionWithItems[]>(initialCollections);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomCollectionWithItems | null>(null);
  const [viewModalData, setViewModalData] = useState<CustomCollectionWithItems | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomCollectionWithItems | null>(null);
  const [shareModalData, setShareModalData] = useState<CustomCollectionWithItems | null>(null);
  const [copyModalData, setCopyModalData] = useState<CustomCollectionWithItems | null>(null);

  const [formData, setFormData] = useState<{ name: string; description: string }>({ name: '', description: '' });

  const queryClient = useQueryClient();

  // Candidate items available to add, keyed by type.
  const candidates: Record<CollectionItemType, CandidateItem[]> = {
    gang_type: customGangTypes.map(g => ({ id: g.id, name: g.gang_type })),
    fighter_type: customFighterTypes.map(f => ({ id: f.id, name: f.fighter_type })),
    equipment: customEquipment.map(e => ({ id: e.id, name: e.equipment_name || 'Unnamed' })),
    skill: customSkills.map(s => ({ id: s.id, name: s.skill_name })),
    trading_post: customTradingPosts.map(t => ({ id: t.id, name: t.custom_trading_post_name })),
  };

  const resetForm = () => setFormData({ name: '', description: '' });
  const isFormValid = () => formData.name.trim() !== '';

  // Keep the edit modal and the list in sync when a collection's items change.
  // `items` is the DB shape (CollectionItem[], no name); `resolvedItems` carries the name for display.
  const applyItemsUpdate = (collectionId: string, resolvedItems: ResolvedCollectionItem[]) => {
    const items = resolvedItems.map(({ type, id }) => ({ type, id }));
    setCollections(prev => prev.map(p => (p.id === collectionId ? { ...p, resolvedItems, items } : p)));
    setEditModalData(prev => (prev && prev.id === collectionId ? { ...prev, resolvedItems, items } : prev));
  };

  // --- Create ---
  const createMutation = useMutation({
    mutationFn: async (data: CustomCollectionData) => {
      const result = await createCustomCollection(data);
      if (!result.success || !result.data) throw new Error(result.error || 'Failed to create collection');
      return result.data;
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['customCollections'] });
      const tempId = `temp-${Date.now()}`;
      const optimistic: CustomCollectionWithItems = {
        id: tempId,
        user_id: userId || '',
        name: data.name,
        description: data.description ?? null,
        items: [],
        resolvedItems: [],
        created_at: new Date().toISOString(),
      };
      const previous = collections;
      setCollections(prev => [...prev, optimistic]);
      return { previous, tempId };
    },
    onSuccess: (serverData, _vars, context) => {
      if (context) {
        setCollections(prev => prev.map(p => (p.id === context.tempId ? { ...serverData, resolvedItems: [] } : p)));
      }
      toast.success('Collection created successfully');
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) setCollections(context.previous);
      toast.error(error.message || 'Failed to create collection');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customCollections'] });
    },
  });

  // --- Update (name / description) ---
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CustomCollectionData }) => {
      const result = await updateCustomCollection(id, data);
      if (!result.success || !result.data) throw new Error(result.error || 'Failed to update collection');
      return result.data;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['customCollections'] });
      const previous = collections;
      setCollections(prev =>
        prev.map(p => (p.id === id ? { ...p, name: data.name, description: data.description ?? null } : p))
      );
      return { previous };
    },
    onSuccess: (serverData) => {
      setCollections(prev => prev.map(p => (p.id === serverData.id ? { ...p, ...serverData } : p)));
      toast.success('Collection updated successfully');
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) setCollections(context.previous);
      toast.error(error.message || 'Failed to update collection');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customCollections'] });
    },
  });

  // --- Delete ---
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCustomCollection(id);
      if (!result.success) throw new Error(result.error || 'Failed to delete collection');
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['customCollections'] });
      const previous = collections;
      setCollections(prev => prev.filter(p => p.id !== id));
      return { previous };
    },
    onSuccess: () => {
      toast.success('Collection deleted successfully');
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) setCollections(context.previous);
      toast.error(error.message || 'Failed to delete collection');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customCollections'] });
    },
  });

  // --- Copy (into the current user's account) ---
  const copyMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await copyCollection(id);
      if (!result.success) throw new Error(result.error || 'Failed to copy collection');
      return result;
    },
    onSuccess: () => {
      toast.success(`"${copyModalData?.name ?? 'Collection'}" has been copied to your account.`);
      setCopyModalData(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to copy collection');
    },
  });

  // --- Add item (live, optimistic) ---
  const addItemMutation = useMutation({
    mutationFn: async ({ collectionId, type, id }: { collectionId: string; type: CollectionItemType; id: string; name: string }) => {
      const result = await addCollectionItem(collectionId, type, id);
      if (!result.success) throw new Error(result.error || 'Failed to add item');
      return result;
    },
    onMutate: async ({ collectionId, type, id, name }) => {
      const collection = collections.find(p => p.id === collectionId);
      const previousItems = collection?.resolvedItems ?? [];
      if (!previousItems.some(i => i.type === type && i.id === id)) {
        applyItemsUpdate(collectionId, [...previousItems, { type, id, name }]);
      }
      return { collectionId, previousItems };
    },
    onError: (error: Error, _vars, context) => {
      if (context) applyItemsUpdate(context.collectionId, context.previousItems);
      toast.error(error.message || 'Failed to add item');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customCollections'] });
    },
  });

  // --- Remove item (live, optimistic) ---
  const removeItemMutation = useMutation({
    mutationFn: async ({ collectionId, type, id }: { collectionId: string; type: CollectionItemType; id: string }) => {
      const result = await removeCollectionItem(collectionId, type, id);
      if (!result.success) throw new Error(result.error || 'Failed to remove item');
      return result;
    },
    onMutate: async ({ collectionId, type, id }) => {
      const collection = collections.find(p => p.id === collectionId);
      const previousItems = collection?.resolvedItems ?? [];
      applyItemsUpdate(collectionId, previousItems.filter(i => !(i.type === type && i.id === id)));
      return { collectionId, previousItems };
    },
    onError: (error: Error, _vars, context) => {
      if (context) applyItemsUpdate(context.collectionId, context.previousItems);
      toast.error(error.message || 'Failed to remove item');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customCollections'] });
    },
  });

  const handleCreateConfirm = () => {
    if (!isFormValid()) return false;
    createMutation.mutate({ name: formData.name, description: formData.description || null });
    setIsAddModalOpen(false);
    resetForm();
    return true;
  };

  const handleEditConfirm = () => {
    if (!editModalData || !isFormValid()) return false;
    updateMutation.mutate({ id: editModalData.id, data: { name: formData.name, description: formData.description || null } });
    setEditModalData(null);
    resetForm();
    return true;
  };

  const handleDeleteConfirm = () => {
    if (!deleteModalData) return false;
    deleteMutation.mutate(deleteModalData.id);
    setDeleteModalData(null);
    return true;
  };

  const handleCopyConfirm = () => {
    if (!copyModalData) return false;
    copyMutation.mutate(copyModalData.id);
    return true;
  };

  const handleEditOpen = (collection: CustomCollectionWithItems) => {
    setEditModalData(collection);
    setFormData({ name: collection.name, description: collection.description || '' });
  };

  const columns: ListColumn[] = [
    { key: 'name', label: 'Collection', align: 'left', width: '35%' },
    {
      key: 'resolvedItems',
      label: 'Items',
      align: 'left',
      width: '15%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => {
        const count = (value as ResolvedCollectionItem[]).length;
        return `${count} item${count !== 1 ? 's' : ''}`;
      },
    },
    {
      key: 'description',
      label: 'Description',
      align: 'left',
      width: '45%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => (value as string) || '-',
    },
  ];

  const actions: ListAction[] = readOnly
    ? [
        {
          icon: <LuEye className="h-4 w-4" />,
          onClick: (item: CustomCollectionWithItems) => setViewModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <FaRegCopy className="h-4 w-4" />,
          onClick: (item: CustomCollectionWithItems) => setCopyModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ]
    : [
        {
          icon: <FiShare2 className="h-4 w-4" />,
          onClick: (item: CustomCollectionWithItems) => setShareModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuSquarePen className="h-4 w-4" />,
          onClick: (item: CustomCollectionWithItems) => handleEditOpen(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuTrash2 className="h-4 w-4" />,
          onClick: (item: CustomCollectionWithItems) => setDeleteModalData(item),
          variant: 'outline_remove',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ];

  return (
    <div className={className}>
      <List<CustomCollectionWithItems>
        title="Collections"
        items={collections}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : () => { resetForm(); setIsAddModalOpen(true); }}
        addButtonText="Create"
        emptyMessage="No collections created yet."
        sortBy={(a, b) => a.name.localeCompare(b.name)}
      />

      {isAddModalOpen && (
        <Modal
          title="Create Collection"
          helper="Bundle your custom items into a collection you can apply to your campaigns or share. Add items after creating."
          onClose={() => { setIsAddModalOpen(false); resetForm(); }}
          onConfirm={handleCreateConfirm}
          confirmText="Create"
          confirmDisabled={!isFormValid() || createMutation.isPending}
        >
          <CollectionForm formData={formData} setFormData={setFormData} />
        </Modal>
      )}

      {editModalData && (
        <Modal
          title="Edit Collection"
          onClose={() => { setEditModalData(null); resetForm(); }}
          onConfirm={handleEditConfirm}
          confirmText="Save"
          confirmDisabled={!isFormValid() || updateMutation.isPending}
          width="2xl"
        >
          <div className="space-y-6">
            <CollectionForm formData={formData} setFormData={setFormData} />
            <div className="border-t pt-4">
              <CollectionItemsEditor
                items={editModalData.resolvedItems}
                candidates={candidates}
                onAdd={(type, candidate) => addItemMutation.mutate({ collectionId: editModalData.id, type, id: candidate.id, name: candidate.name })}
                onRemove={(item) => removeItemMutation.mutate({ collectionId: editModalData.id, type: item.type, id: item.id })}
              />
            </div>
          </div>
        </Modal>
      )}

      {viewModalData && (
        <Modal title="View Collection" onClose={() => setViewModalData(null)} width="2xl" hideCancel>
          <div className="space-y-4">
            <div>
              <Label className="block mb-1">Collection Name</Label>
              <div className="w-full p-2 border rounded-md bg-muted">{viewModalData.name}</div>
            </div>
            <div>
              <Label className="block mb-1">Description</Label>
              <div className="w-full p-2 border rounded-md bg-muted whitespace-pre-wrap">{viewModalData.description || '-'}</div>
            </div>
            <div>
              <Label className="block mb-2">Items ({viewModalData.resolvedItems.length})</Label>
              <CollectionItemsList items={viewModalData.resolvedItems} />
            </div>
          </div>
        </Modal>
      )}

      {deleteModalData && (
        <Modal
          title="Delete Collection"
          onClose={() => setDeleteModalData(null)}
          onConfirm={handleDeleteConfirm}
          confirmText="Delete"
        >
          <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
          <p className="text-sm text-muted-foreground mt-2">
            This only deletes the collection. Items already shared to campaigns from this collection stay shared, and the custom items themselves are not deleted.
          </p>
        </Modal>
      )}

      {copyModalData && (
        <Modal
          title="Copy Collection"
          onClose={() => setCopyModalData(null)}
          onConfirm={handleCopyConfirm}
          confirmText={copyMutation.isPending ? 'Copying...' : 'Copy to my account'}
          confirmDisabled={copyMutation.isPending}
        >
          <p>Copy <strong>"{copyModalData.name}"</strong> and all its custom items into your own account?</p>
          <p className="text-sm text-muted-foreground mt-2">
            You'll get your own editable duplicates of every item in the collection. This won't affect the original.
          </p>
        </Modal>
      )}

      {shareModalData && userId && (
        <ShareCustomCollectionModal
          collection={shareModalData}
          userCampaigns={userCampaigns}
          onClose={() => setShareModalData(null)}
        />
      )}
    </div>
  );
}

function CollectionForm({
  formData,
  setFormData,
}: {
  formData: { name: string; description: string };
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; description: string }>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="block mb-2">Collection Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter collection name"
        />
      </div>
      <div>
        <Label className="block mb-2">Description</Label>
        <Textarea
          className="min-h-20 resize-y"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter description (optional)"
        />
      </div>
    </div>
  );
}

function CollectionItemsEditor({
  items,
  candidates,
  onAdd,
  onRemove,
}: {
  items: ResolvedCollectionItem[];
  candidates: Record<CollectionItemType, CandidateItem[]>;
  onAdd: (type: CollectionItemType, candidate: CandidateItem) => void;
  onRemove: (item: ResolvedCollectionItem) => void;
}) {
  const [selectedType, setSelectedType] = useState<CollectionItemType>('gang_type');
  const [selectedId, setSelectedId] = useState('');

  const inCollection = new Set(items.map(i => `${i.type}:${i.id}`));
  const available = (candidates[selectedType] || []).filter(c => !inCollection.has(`${selectedType}:${c.id}`));

  return (
    <div className="space-y-3">
      <h4 className="text-lg font-semibold">Items</h4>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          className="border rounded-md p-2 bg-background text-base md:text-sm"
          value={selectedType}
          onChange={(e) => { setSelectedType(e.target.value as CollectionItemType); setSelectedId(''); }}
        >
          {(Object.keys(TYPE_LABELS) as CollectionItemType[]).map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          className="flex-1 border rounded-md p-2 bg-background text-base md:text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">{available.length === 0 ? 'No items available' : 'Select an item...'}</option>
          {available.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button
          disabled={!selectedId}
          onClick={() => {
            const candidate = available.find(c => c.id === selectedId);
            if (candidate) { onAdd(selectedType, candidate); setSelectedId(''); }
          }}
        >
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No items in this collection yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-2 font-medium">Type</th>
              <th className="py-2 pr-2 font-medium">Name</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={`${item.type}:${item.id}`} className="border-b last:border-0">
                <td className="py-2 pr-2 text-muted-foreground">{TYPE_LABELS[item.type]}</td>
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 text-right">
                  <Button
                    variant="outline_remove"
                    size="sm"
                    className="text-xs px-1.5 h-6"
                    onClick={() => onRemove(item)}
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CollectionItemsList({ items }: { items: ResolvedCollectionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">This collection has no items.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-2 font-medium">Type</th>
          <th className="py-2 font-medium">Name</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={`${item.type}:${item.id}`} className="border-b last:border-0">
            <td className="py-2 pr-2 text-muted-foreground">{TYPE_LABELS[item.type]}</td>
            <td className="py-2">{item.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
