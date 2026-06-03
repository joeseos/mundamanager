'use client';

import React, { useState, useEffect } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Combobox } from '@/components/ui/combobox';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FiShare2 } from 'react-icons/fi';
import { ShareCustomTradingPostModal } from '@/components/customise/custom-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomTradingPost,
  updateCustomTradingPost,
  deleteCustomTradingPost,
  getTPEquipment,
  addTPEquipmentBatch,
  updateTPEquipment,
  removeTPEquipment,
  getAvailabilityRules,
  getPricingRules,
  saveEquipmentRules,
  type CustomTradingPost,
  type CustomTradingPostData,
  type CustomTPEquipment,
  type CustomTPAvailabilityRule,
  type CustomTPPricingRule,
} from '@/app/actions/customise/custom-trading-posts';
import type { UserCampaign } from '@/types/campaign';

interface EquipmentPendingChanges {
  costOverride: number | null;
  availabilityOverride: string | null;
  availRules: CustomTPAvailabilityRule[];
  pricingRules: CustomTPPricingRule[];
  rulesModified: boolean;
}

interface CustomiseTradingPostsProps {
  className?: string;
  initialTradingPosts: CustomTradingPost[];
  userId?: string;
  userCampaigns?: UserCampaign[];
  readOnly?: boolean;
}

export function CustomiseTradingPosts({
  className,
  initialTradingPosts,
  userId,
  userCampaigns = [],
  readOnly = false,
}: CustomiseTradingPostsProps) {
  const [tradingPosts, setTradingPosts] = useState<CustomTradingPost[]>(initialTradingPosts);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<CustomTradingPost | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<CustomTradingPost | null>(null);
  const [viewModalData, setViewModalData] = useState<CustomTradingPost | null>(null);
  const [pendingEquipment, setPendingEquipment] = useState<EquipmentOption[]>([]);
  const [shareModalData, setShareModalData] = useState<CustomTradingPost | null>(null);
  const [pendingOverrides, setPendingOverrides] = useState<Map<string, EquipmentPendingChanges>>(new Map());
  const [pendingAdditions, setPendingAdditions] = useState<EquipmentOption[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState<CustomTradingPostData>({
    custom_trading_post_name: '',
    description: null,
  });

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomTradingPostData }) =>
      updateCustomTradingPost(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['customTradingPosts'] });
      const previous = tradingPosts;
      setTradingPosts(prev =>
        prev.map(tp =>
          tp.id === id
            ? { ...tp, ...data, updated_at: new Date().toISOString() }
            : tp
        )
      );
      return { previous };
    },
    onSuccess: (result, { id }, context) => {
      if (result.success && result.data) {
        setTradingPosts(prev => prev.map(tp => (tp.id === id ? result.data! : tp)));
        setEditModalData(null);
        resetForm();
        toast.success('Custom trading post updated successfully');
      } else {
        if (context?.previous) setTradingPosts(context.previous);
        toast.error(result.error || 'Failed to update custom trading post');
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setTradingPosts(context.previous);
      toast.error(error.message || 'Failed to update custom trading post');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customTradingPosts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomTradingPost,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['customTradingPosts'] });
      const previous = tradingPosts;
      setTradingPosts(prev => prev.filter(tp => tp.id !== deletedId));
      return { previous };
    },
    onSuccess: (result, _, context) => {
      if (result.success) {
        toast.success('Custom trading post deleted successfully');
      } else {
        if (context?.previous) setTradingPosts(context.previous);
        toast.error(result.error || 'Failed to delete custom trading post');
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setTradingPosts(context.previous);
      toast.error(error.message || 'Failed to delete custom trading post');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customTradingPosts'] });
    },
  });

  const resetForm = () => {
    setFormData({
      custom_trading_post_name: '',
      description: null,
    });
    setPendingEquipment([]);
    setPendingOverrides(new Map());
    setPendingAdditions([]);
    setPendingRemovals(new Set());
  };

  const handleEdit = (tradingPost: CustomTradingPost) => {
    setEditModalData(tradingPost);
    setPendingOverrides(new Map());
    setPendingAdditions([]);
    setPendingRemovals(new Set());
    setFormData({
      custom_trading_post_name: tradingPost.custom_trading_post_name,
      description: tradingPost.description || null,
    });
  };

  const handleView = (tradingPost: CustomTradingPost) => {
    setViewModalData(tradingPost);
    setFormData({
      custom_trading_post_name: tradingPost.custom_trading_post_name,
      description: tradingPost.description || null,
    });
  };

  const handleDelete = (tradingPost: CustomTradingPost) => {
    setDeleteModalData(tradingPost);
  };

  const handleAddModalOpen = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const isFormValid = () => {
    return formData.custom_trading_post_name.trim() !== '';
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, equipment }: { data: CustomTradingPostData; equipment: EquipmentOption[] }) => {
      const result = await createCustomTradingPost(data);
      if (!result.success || !result.data) throw new Error(result.error || 'Failed to create custom trading post');

      if (equipment.length > 0) {
        const batchResult = await addTPEquipmentBatch(
          result.data.id,
          equipment.map(equip => ({
            equipmentId: equip.is_custom ? equip.original_id! : equip.id,
            isCustom: equip.is_custom,
          }))
        );
        if (!batchResult.success) {
          toast.warning(`Trading post created, but equipment failed to save: ${batchResult.error}`);
        }
      }
      return result.data;
    },
    onMutate: async ({ data }) => {
      const tempId = `temp-${Date.now()}`;
      const optimistic: CustomTradingPost = {
        id: tempId,
        user_id: userId || '',
        custom_trading_post_name: data.custom_trading_post_name,
        description: data.description,
        created_at: new Date().toISOString(),
      };
      const previous = tradingPosts;
      setTradingPosts(prev => [...prev, optimistic]);
      return { previous, tempId };
    },
    onSuccess: (serverData, _, context) => {
      if (context) {
        setTradingPosts(prev => prev.map(tp => tp.id === context.tempId ? serverData : tp));
      }
      toast.success('Custom trading post created successfully');
    },
    onError: (error: Error, _, context) => {
      if (context?.previous) setTradingPosts(context.previous);
      toast.error(error.message || 'Failed to create custom trading post');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customTradingPosts'] });
    },
  });

  const handleCreateConfirm = async () => {
    if (!isFormValid()) return false;
    createMutation.mutate({ data: formData, equipment: pendingEquipment });
    setIsAddModalOpen(false);
    resetForm();
    return true;
  };

  const handleEditConfirm = async () => {
    if (!editModalData || !isFormValid()) return false;

    const overridesToSave = new Map(pendingOverrides);
    const additionsToSave = [...pendingAdditions];
    const removalsToSave = new Set(pendingRemovals);
    updateMutation.mutate(
      { id: editModalData.id, data: formData },
      {
        onSuccess: async (result) => {
          if (!result.success) return;
          const hasChanges = overridesToSave.size > 0 || additionsToSave.length > 0 || removalsToSave.size > 0;
          if (!hasChanges) return;

          if (additionsToSave.length > 0) {
            const batchResult = await addTPEquipmentBatch(
              editModalData.id,
              additionsToSave.map(equip => ({
                equipmentId: equip.is_custom ? equip.original_id! : equip.id,
                isCustom: equip.is_custom,
              }))
            );
            if (!batchResult.success) {
              toast.error(batchResult.error || 'Failed to add equipment');
            }
          }

          if (removalsToSave.size > 0) {
            await Promise.all(
              Array.from(removalsToSave).map(async (id) => {
                const res = await removeTPEquipment(id);
                if (!res.success) toast.error(res.error || 'Failed to remove equipment');
              })
            );
          }

          const equipmentSaves = Array.from(overridesToSave.entries()).map(
            async ([itemId, changes]) => {
              const overridesResult = await updateTPEquipment(itemId, {
                cost_override: changes.costOverride,
                availability_override: changes.availabilityOverride,
              });
              if (!overridesResult.success) {
                toast.error(overridesResult.error || 'Failed to save equipment overrides');
                return;
              }
              if (changes.rulesModified) {
                const rulesResult = await saveEquipmentRules(
                  itemId,
                  changes.availRules.map(r => ({
                    gang_type_id: r.gang_type_id,
                    custom_gang_type_id: r.custom_gang_type_id,
                    gang_origin_id: r.gang_origin_id,
                    gang_variant_id: r.gang_variant_id,
                    campaign_type_allegiance_id: r.campaign_type_allegiance_id,
                    alignment: r.alignment,
                    availability: r.availability,
                  })),
                  changes.pricingRules.map(r => ({
                    gang_type_id: r.gang_type_id,
                    custom_gang_type_id: r.custom_gang_type_id,
                    gang_origin_id: r.gang_origin_id,
                    fighter_type_id: r.fighter_type_id,
                    adjusted_cost: r.adjusted_cost,
                  }))
                );
                if (!rulesResult.success) {
                  toast.error(rulesResult.error || 'Failed to save equipment rules');
                }
              }
            }
          );
          await Promise.all(equipmentSaves);

          queryClient.invalidateQueries({ queryKey: ['tpEquipment', editModalData.id] });
          overridesToSave.forEach((_, itemId) => {
            queryClient.invalidateQueries({ queryKey: ['tpAvailabilityRules', itemId] });
            queryClient.invalidateQueries({ queryKey: ['tpPricingRules', itemId] });
          });
        },
      }
    );
    return true;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalData) return false;
    deleteMutation.mutate(deleteModalData.id);
    setDeleteModalData(null);
    return true;
  };

  const columns: ListColumn[] = [
    {
      key: 'custom_trading_post_name',
      label: 'Trading Post',
      align: 'left',
      width: '50%',
    },
    {
      key: 'description',
      label: 'Description',
      align: 'left',
      width: '40%',
      cellClassName: 'text-sm text-muted-foreground',
      render: (value) => value || '-',
    },
  ];

  const actions: ListAction[] = readOnly
    ? [
        {
          icon: <LuEye className="h-4 w-4" />,
          onClick: (item: CustomTradingPost) => handleView(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ]
    : [
        {
          icon: <FiShare2 className="h-4 w-4" />,
          onClick: (item: CustomTradingPost) => setShareModalData(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuSquarePen className="h-4 w-4" />,
          onClick: (item: CustomTradingPost) => handleEdit(item),
          variant: 'outline',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
        {
          icon: <LuTrash2 className="h-4 w-4" />,
          onClick: (item: CustomTradingPost) => handleDelete(item),
          variant: 'outline_remove',
          size: 'sm',
          className: 'text-xs px-1.5 h-6',
        },
      ];

  const renderForm = (isReadOnly = false) => (
    <div className="space-y-4">
      <div>
        <Label className="mb-1">Trading Post Name *</Label>
        <Input
          value={formData.custom_trading_post_name}
          onChange={(e) => setFormData({ ...formData, custom_trading_post_name: e.target.value })}
          placeholder="Enter trading post name"
          disabled={isReadOnly}
        />
      </div>

      <div>
        <Label className="mb-1">Description</Label>
        <Textarea
          className="min-h-20 resize-y"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
          placeholder="Enter description (optional)"
          disabled={isReadOnly}
        />
      </div>
    </div>
  );

  return (
    <div className={className}>
      <List
        title="Trading Posts"
        items={tradingPosts}
        columns={columns}
        actions={actions}
        onAdd={readOnly ? undefined : handleAddModalOpen}
        addButtonText="Add"
        emptyMessage="No custom trading posts created yet."
      />

      {isAddModalOpen && (
        <Modal
          title="Add Custom Trading Post"
          onClose={() => {
            setIsAddModalOpen(false);
            resetForm();
          }}
          onConfirm={handleCreateConfirm}
          confirmText="Create"
          confirmDisabled={!isFormValid()}
          width="2xl"
        >
          <div className="space-y-6">
            {renderForm()}
            <div className="border-t pt-4">
              <PendingEquipmentSection
                pendingEquipment={pendingEquipment}
                setPendingEquipment={setPendingEquipment}
              />
            </div>
          </div>
        </Modal>
      )}

      {editModalData && (
        <EditTradingPostModal
          tradingPost={editModalData}
          formData={formData}
          setFormData={setFormData}
          isFormValid={isFormValid}
          onClose={() => {
            setEditModalData(null);
            resetForm();
          }}
          onConfirm={handleEditConfirm}
          isPending={updateMutation.isPending}
          renderForm={renderForm}
          pendingOverrides={pendingOverrides}
          pendingAdditions={pendingAdditions}
          pendingRemovals={pendingRemovals}
          onEquipmentOverrideChange={(itemId, changes) => {
            setPendingOverrides(prev => {
              const next = new Map(prev);
              next.set(itemId, changes);
              return next;
            });
          }}
          onAddEquipment={(equip) => setPendingAdditions(prev => [...prev, equip])}
          onRemoveEquipment={(itemId) => {
            const isPendingAdd = pendingAdditions.some(e => e.id === itemId);
            if (isPendingAdd) {
              setPendingAdditions(prev => prev.filter(e => e.id !== itemId));
            } else {
              setPendingRemovals(prev => new Set(prev).add(itemId));
            }
            setPendingOverrides(prev => {
              const next = new Map(prev);
              next.delete(itemId);
              return next;
            });
          }}
        />
      )}

      {viewModalData && (
        <ViewTradingPostModal
          tradingPost={viewModalData}
          onClose={() => setViewModalData(null)}
          renderForm={renderForm}
        />
      )}

      {shareModalData && userId && (
        <ShareCustomTradingPostModal
          tradingPost={shareModalData}
          userCampaigns={userCampaigns}
          onClose={() => setShareModalData(null)}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Custom Trading Post"
          onClose={() => setDeleteModalData(null)}
          onConfirm={handleDeleteConfirm}
          confirmText="Delete"
        >
          <p>
            Are you sure you want to delete <strong>{deleteModalData.custom_trading_post_name}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            This will also delete all equipment items, availability rules, and pricing in this trading post, and remove any campaign shares.
          </p>
        </Modal>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipment Items Section — shared between edit and view modals
// ---------------------------------------------------------------------------

interface EquipmentOption {
  id: string;
  equipment_name: string;
  equipment_category: string;
  is_custom: boolean;
  original_id?: string;
}

function EquipmentItemsSection({
  tradingPostId,
  pendingOverrides,
  pendingAdditions,
  pendingRemovals,
  onEquipmentOverrideChange,
  onAddEquipment,
  onRemoveEquipment,
}: {
  tradingPostId: string;
  pendingOverrides?: Map<string, EquipmentPendingChanges>;
  pendingAdditions?: EquipmentOption[];
  pendingRemovals?: Set<string>;
  onEquipmentOverrideChange?: (itemId: string, changes: EquipmentPendingChanges) => void;
  onAddEquipment?: (equip: EquipmentOption) => void;
  onRemoveEquipment?: (itemId: string) => void;
}) {
  const isEditable = !!(onAddEquipment || onRemoveEquipment || onEquipmentOverrideChange);
  const [isAddEquipOpen, setIsAddEquipOpen] = useState(false);
  const [editOverridesItem, setEditOverridesItem] = useState<CustomTPEquipment | null>(null);

  const { data: equipmentItems = [], isLoading: isLoadingItems, error: equipmentError } = useQuery({
    queryKey: ['tpEquipment', tradingPostId],
    queryFn: async () => {
      const result = await getTPEquipment(tradingPostId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (equipmentError) toast.error('Failed to load equipment items');
  }, [equipmentError]);

  const pendingAdditionIds = new Set(pendingAdditions?.map(e => e.id) ?? []);

  const displayItems: CustomTPEquipment[] = [
    ...equipmentItems
      .filter(item => !pendingRemovals?.has(item.id))
      .map(item => {
        const pending = pendingOverrides?.get(item.id);
        if (!pending) return item;
        return { ...item, cost_override: pending.costOverride, availability_override: pending.availabilityOverride };
      }),
    ...(pendingAdditions ?? []).map(equip => ({
      id: equip.id,
      custom_trading_post_id: tradingPostId,
      equipment_id: equip.is_custom ? null : equip.id,
      custom_equipment_id: equip.is_custom ? (equip.original_id ?? null) : null,
      equipment_name: equip.equipment_name,
      equipment_category: equip.equipment_category,
      is_custom: equip.is_custom,
      cost_override: null,
      availability_override: null,
      sort_order: null,
    })),
  ];

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Equipment Items</h4>
          {isEditable && (
            <Button size="sm" className="text-xs" onClick={() => setIsAddEquipOpen(true)}>
              Add Equipment
            </Button>
          )}
        </div>

        {isLoadingItems ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No equipment items added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-2 font-medium">Equipment</th>
                  <th className="py-2 pr-2 font-medium">Category</th>
                  <th className="py-2 pr-2 font-medium">Cost</th>
                  <th className="py-2 pr-2 font-medium">Avail.</th>
                  {isEditable && <th className="py-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const isPendingAdd = pendingAdditionIds.has(item.id);
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        {item.equipment_name}
                        {item.is_custom && <span className="text-xs text-muted-foreground ml-1">(Custom)</span>}
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground">{item.equipment_category || '-'}</td>
                      <td className="py-2 pr-2">
                        {item.cost_override != null ? item.cost_override : '-'}
                      </td>
                      <td className="py-2 pr-2">{item.availability_override || '-'}</td>
                      {isEditable && (
                        <td className="py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            {!isPendingAdd && onEquipmentOverrideChange && (
                              <Button variant="outline" size="sm" className="text-xs px-1.5 h-6" onClick={() => setEditOverridesItem(item)}>
                                <LuSquarePen className="h-3 w-3" />
                              </Button>
                            )}
                            {onRemoveEquipment && (
                              <Button variant="outline_remove" size="sm" className="text-xs px-1.5 h-6" onClick={() => onRemoveEquipment(item.id)}>
                                <LuTrash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAddEquipOpen && onAddEquipment && (
        <AddEquipmentModal
          existingItems={equipmentItems}
          pendingAdditions={pendingAdditions}
          onClose={() => setIsAddEquipOpen(false)}
          onAddLocal={(equip) => {
            onAddEquipment(equip);
            setIsAddEquipOpen(false);
          }}
        />
      )}

      {editOverridesItem && onEquipmentOverrideChange && (
        <EditEquipmentModal
          item={editOverridesItem}
          pendingChanges={pendingOverrides?.get(editOverridesItem.id)}
          onClose={() => setEditOverridesItem(null)}
          onSaveLocal={(changes) => {
            onEquipmentOverrideChange(editOverridesItem.id, changes);
            setEditOverridesItem(null);
          }}
        />
      )}

    </>
  );
}

// ---------------------------------------------------------------------------
// Edit Trading Post Modal — form + equipment items
// ---------------------------------------------------------------------------

function EditTradingPostModal({
  tradingPost,
  formData,
  setFormData,
  isFormValid,
  onClose,
  onConfirm,
  isPending,
  renderForm,
  pendingOverrides,
  pendingAdditions,
  pendingRemovals,
  onEquipmentOverrideChange,
  onAddEquipment,
  onRemoveEquipment,
}: {
  tradingPost: CustomTradingPost;
  formData: CustomTradingPostData;
  setFormData: React.Dispatch<React.SetStateAction<CustomTradingPostData>>;
  isFormValid: () => boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean | undefined>;
  isPending: boolean;
  renderForm: (isReadOnly?: boolean) => React.ReactNode;
  pendingOverrides: Map<string, EquipmentPendingChanges>;
  pendingAdditions: EquipmentOption[];
  pendingRemovals: Set<string>;
  onEquipmentOverrideChange: (itemId: string, changes: EquipmentPendingChanges) => void;
  onAddEquipment: (equip: EquipmentOption) => void;
  onRemoveEquipment: (itemId: string) => void;
}) {
  return (
    <Modal
      title="Edit Custom Trading Post"
      onClose={onClose}
      onConfirm={onConfirm}
      confirmText="Save"
      confirmDisabled={!isFormValid() || isPending}
      width="2xl"
    >
      <div className="space-y-6">
        {renderForm()}

        <div className="border-t pt-4">
          <EquipmentItemsSection
            tradingPostId={tradingPost.id}
            pendingOverrides={pendingOverrides}
            pendingAdditions={pendingAdditions}
            pendingRemovals={pendingRemovals}
            onEquipmentOverrideChange={onEquipmentOverrideChange}
            onAddEquipment={onAddEquipment}
            onRemoveEquipment={onRemoveEquipment}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// View Trading Post Modal (readOnly) — form + equipment items
// ---------------------------------------------------------------------------

function ViewTradingPostModal({
  tradingPost,
  onClose,
  renderForm,
}: {
  tradingPost: CustomTradingPost;
  onClose: () => void;
  renderForm: (isReadOnly?: boolean) => React.ReactNode;
}) {
  return (
    <Modal
      title="View Custom Trading Post"
      onClose={onClose}
      width="2xl"
    >
      <div className="space-y-6">
        {renderForm(true)}

        <div className="border-t pt-4">
          <EquipmentItemsSection tradingPostId={tradingPost.id} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pending Equipment Section — inline picker for Add Trading Post modal
// ---------------------------------------------------------------------------

function useEquipmentData() {
  const { data: categories = [], error: categoriesError } = useQuery({
    queryKey: ['equipmentCategories'],
    queryFn: async () => {
      const res = await fetch('/api/equipment/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json() as Promise<Array<{ id: string; category_name: string }>>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: allEquipment = [], error: equipmentError } = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const res = await fetch('/api/equipment');
      if (!res.ok) throw new Error('Failed to fetch equipment');
      return res.json() as Promise<EquipmentOption[]>;
    },
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (categoriesError) toast.error('Failed to load equipment categories');
  }, [categoriesError]);

  useEffect(() => {
    if (equipmentError) toast.error('Failed to load equipment');
  }, [equipmentError]);

  return { categories, allEquipment };
}

function PendingEquipmentSection({
  pendingEquipment,
  setPendingEquipment,
}: {
  pendingEquipment: EquipmentOption[];
  setPendingEquipment: React.Dispatch<React.SetStateAction<EquipmentOption[]>>;
}) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');

  const { categories, allEquipment } = useEquipmentData();

  const pendingIds = new Set(pendingEquipment.map(e => e.id));

  const filteredEquipment = allEquipment
    .filter(e => e.equipment_category === selectedCategory)
    .filter(e => !pendingIds.has(e.id));

  const handleAdd = () => {
    const selected = allEquipment.find(e => e.id === selectedEquipmentId);
    if (!selected) return;
    setPendingEquipment(prev => [...prev, selected]);
    setSelectedEquipmentId('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Equipment Items</h4>
      </div>

      {pendingEquipment.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-2 font-medium">Equipment</th>
                <th className="py-2 pr-2 font-medium">Category</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingEquipment.map((equip) => (
                <tr key={equip.id} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    {equip.equipment_name}
                    {equip.is_custom && <span className="text-xs text-muted-foreground ml-1">(Custom)</span>}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">{equip.equipment_category || '-'}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="outline_remove"
                      size="sm"
                      className="text-xs px-1.5 h-6"
                      onClick={() => setPendingEquipment(prev => prev.filter(e => e.id !== equip.id))}
                    >
                      <LuTrash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="mb-1">Category</Label>
          <select
            className="w-full border rounded-md p-2 bg-background text-sm"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedEquipmentId('');
            }}
          >
            <option value="">Select a category...</option>
            {categories.map(c => (
              <option key={c.id} value={c.category_name}>{c.category_name}</option>
            ))}
          </select>
        </div>

        {selectedCategory && (
          <div className="flex-1">
            <Label className="mb-1">Equipment</Label>
            <select
              className="w-full border rounded-md p-2 bg-background text-sm"
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
            >
              <option value="">Select equipment...</option>
              {filteredEquipment.map(e => (
                <option key={e.id} value={e.id}>{e.equipment_name}</option>
              ))}
            </select>
          </div>
        )}

        <Button
          size="sm"
          className="text-xs"
          disabled={!selectedEquipmentId}
          onClick={handleAdd}
        >
          Add Equipment
        </Button>
      </div>

      {selectedCategory && filteredEquipment.length === 0 && (
        <p className="text-xs text-muted-foreground">No available equipment in this category.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Equipment Modal — category → equipment cascading dropdowns
// ---------------------------------------------------------------------------

function AddEquipmentModal({
  existingItems,
  pendingAdditions,
  onClose,
  onAddLocal,
}: {
  existingItems: CustomTPEquipment[];
  pendingAdditions?: EquipmentOption[];
  onClose: () => void;
  onAddLocal: (equip: EquipmentOption) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');

  const { categories, allEquipment } = useEquipmentData();

  const existingIds = new Set(
    existingItems.map(i => i.equipment_id || `custom_${i.custom_equipment_id}`)
  );
  const pendingIds = new Set(pendingAdditions?.map(e => e.id) ?? []);

  const filteredEquipment = allEquipment
    .filter(e => e.equipment_category === selectedCategory)
    .filter(e => !existingIds.has(e.id) && !pendingIds.has(e.id));

  return (
    <Modal
      title="Add Equipment"
      onClose={onClose}
      onConfirm={async () => {
        const selected = allEquipment.find(e => e.id === selectedEquipmentId);
        if (!selected) return false;
        onAddLocal(selected);
        return true;
      }}
      confirmText="Add"
      confirmDisabled={!selectedEquipmentId}
    >
      <div className="space-y-4">
        <div>
          <Label className="mb-1">Equipment Category</Label>
          <select
            className="w-full border rounded-md p-2 bg-background"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedEquipmentId('');
            }}
          >
            <option value="">Select a category...</option>
            {categories.map(c => (
              <option key={c.id} value={c.category_name}>{c.category_name}</option>
            ))}
          </select>
        </div>

        {selectedCategory && (
          <div>
            <Label className="mb-1">Equipment</Label>
            <select
              className="w-full border rounded-md p-2 bg-background"
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
            >
              <option value="">Select equipment...</option>
              {filteredEquipment.map(e => (
                <option key={e.id} value={e.id}>{e.equipment_name}</option>
              ))}
            </select>
            {filteredEquipment.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No available equipment in this category.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit Overrides Modal
// ---------------------------------------------------------------------------

const ALIGNMENT_OPTIONS = ['Outlaw', 'Law Abiding', 'Unaligned'] as const;

function EditEquipmentModal({
  item,
  pendingChanges,
  onClose,
  onSaveLocal,
}: {
  item: CustomTPEquipment;
  pendingChanges?: EquipmentPendingChanges;
  onClose: () => void;
  onSaveLocal: (changes: EquipmentPendingChanges) => void;
}) {
  const [costOverride, setCostOverride] = useState(
    pendingChanges ? (pendingChanges.costOverride?.toString() ?? '') : (item.cost_override?.toString() ?? '')
  );
  const [availabilityOverride, setAvailabilityOverride] = useState(
    pendingChanges ? (pendingChanges.availabilityOverride ?? '') : (item.availability_override ?? '')
  );
  const [localAvailRules, setLocalAvailRules] = useState<CustomTPAvailabilityRule[] | null>(
    pendingChanges ? pendingChanges.availRules : null
  );
  const [localPricingRules, setLocalPricingRules] = useState<CustomTPPricingRule[] | null>(
    pendingChanges ? pendingChanges.pricingRules : null
  );
  const [isAddAvailOpen, setIsAddAvailOpen] = useState(false);
  const [isAddPricingOpen, setIsAddPricingOpen] = useState(false);

  const { data: fetchedAvailRules = [] } = useQuery({
    queryKey: ['tpAvailabilityRules', item.id],
    queryFn: async () => {
      const result = await getAvailabilityRules(item.id);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: fetchedPricingRules = [] } = useQuery({
    queryKey: ['tpPricingRules', item.id],
    queryFn: async () => {
      const result = await getPricingRules(item.id);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    staleTime: 10 * 60 * 1000,
  });

  const availRules = localAvailRules ?? fetchedAvailRules;
  const pricingRules = localPricingRules ?? fetchedPricingRules;

  const handleSave = async () => {
    onSaveLocal({
      costOverride: costOverride.trim() ? Number(costOverride) : null,
      availabilityOverride: availabilityOverride.trim() || null,
      availRules,
      pricingRules,
      rulesModified: localAvailRules !== null || localPricingRules !== null,
    });
    return true;
  };

  const handleAddAvailRule = (rule: CustomTPAvailabilityRule) => {
    setLocalAvailRules(prev => [...(prev ?? fetchedAvailRules), rule]);
    setIsAddAvailOpen(false);
  };

  const handleRemoveAvailRule = (index: number) => {
    setLocalAvailRules(prev => (prev ?? fetchedAvailRules).filter((_, i) => i !== index));
  };

  const handleAddPricingRule = (rule: CustomTPPricingRule) => {
    setLocalPricingRules(prev => [...(prev ?? fetchedPricingRules), rule]);
    setIsAddPricingOpen(false);
  };

  const handleRemovePricingRule = (index: number) => {
    setLocalPricingRules(prev => (prev ?? fetchedPricingRules).filter((_, i) => i !== index));
  };

  return (
    <>
      <Modal
        title={`Edit: ${item.equipment_name}`}
        onClose={onClose}
        onConfirm={handleSave}
        confirmText="Save"
        width="2xl"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="mb-1">Cost Override</Label>
              <Input
                type="number"
                value={costOverride}
                onChange={(e) => setCostOverride(e.target.value)}
                placeholder="Leave empty for default cost"
              />
            </div>
            <div>
              <Label className="mb-1">Availability Override</Label>
              <Input
                value={availabilityOverride}
                onChange={(e) => setAvailabilityOverride(e.target.value)}
                placeholder="e.g. R12, C, E (leave empty for default)"
              />
            </div>
          </div>

          {/* Availability Rules */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Availability Rules</h4>
              <Button size="sm" className="text-xs" onClick={() => setIsAddAvailOpen(true)}>
                Add
              </Button>
            </div>
            {availRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules — available to all gangs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 pr-2 font-medium">Gang Type</th>
                      <th className="py-1 pr-2 font-medium">Origin</th>
                      <th className="py-1 pr-2 font-medium">Variant</th>
                      <th className="py-1 pr-2 font-medium">Allegiance</th>
                      <th className="py-1 pr-2 font-medium">Alignment</th>
                      <th className="py-1 pr-2 font-medium">Avail.</th>
                      <th className="py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availRules.map((rule, index) => (
                      <tr key={rule.id || `new_${index}`} className="border-b last:border-0">
                        <td className="py-1 pr-2">{rule.gang_type_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.gang_origin_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.gang_variant_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.allegiance_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.alignment || '-'}</td>
                        <td className="py-1 pr-2">{rule.availability || '-'}</td>
                        <td className="py-1 text-right">
                          <Button
                            variant="outline_remove"
                            size="sm"
                            className="text-xs px-1 h-5"
                            onClick={() => handleRemoveAvailRule(index)}
                          >
                            <LuTrash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pricing Rules */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Pricing Rules</h4>
              <Button size="sm" className="text-xs" onClick={() => setIsAddPricingOpen(true)}>
                Add
              </Button>
            </div>
            {pricingRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pricing rules — default cost applies.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 pr-2 font-medium">Gang Type</th>
                      <th className="py-1 pr-2 font-medium">Origin</th>
                      <th className="py-1 pr-2 font-medium">Fighter Type</th>
                      <th className="py-1 pr-2 font-medium">Adjusted Cost</th>
                      <th className="py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingRules.map((rule, index) => (
                      <tr key={rule.id || `new_${index}`} className="border-b last:border-0">
                        <td className="py-1 pr-2">{rule.gang_type_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.gang_origin_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.fighter_type_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.adjusted_cost != null ? rule.adjusted_cost : '-'}</td>
                        <td className="py-1 text-right">
                          <Button
                            variant="outline_remove"
                            size="sm"
                            className="text-xs px-1 h-5"
                            onClick={() => handleRemovePricingRule(index)}
                          >
                            <LuTrash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {isAddAvailOpen && (
        <AddAvailabilityRuleModal
          equipmentItemId={item.id}
          onClose={() => setIsAddAvailOpen(false)}
          onAdded={handleAddAvailRule}
        />
      )}

      {isAddPricingOpen && (
        <AddPricingRuleModal
          equipmentItemId={item.id}
          onClose={() => setIsAddPricingOpen(false)}
          onAdded={handleAddPricingRule}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add Availability Rule Modal
// ---------------------------------------------------------------------------

interface GangTypeOption {
  gang_type_id?: string;
  id?: string;
  gang_type: string;
  is_custom?: boolean;
  available_origins?: Array<{ id: string; origin_name: string }>;
}

function GangScopeFields({
  gangTypeId,
  gangOriginId,
  onGangTypeChange,
  onGangOriginChange,
}: {
  gangTypeId: string;
  gangOriginId: string;
  onGangTypeChange: (id: string, isCustom: boolean, name: string | null) => void;
  onGangOriginChange: (id: string, name: string | null) => void;
}) {
  const { data: gangTypes = [] } = useQuery({
    queryKey: ['gangTypes'],
    queryFn: async () => {
      const res = await fetch('/api/gang-types?includeAll=true');
      if (!res.ok) throw new Error('Failed to fetch gang types');
      return res.json() as Promise<GangTypeOption[]>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const selectedGangType = gangTypes.find(gt => (gt.gang_type_id || gt.id) === gangTypeId);
  const origins = selectedGangType?.available_origins || [];
  const systemGangTypes = gangTypes.filter(gt => !gt.is_custom);
  const customGangTypes = gangTypes.filter(gt => gt.is_custom);

  return (
    <>
      <div>
        <Label className="mb-1">Gang Type</Label>
        <select
          className="w-full border rounded-md p-2 bg-background text-sm"
          value={gangTypeId}
          onChange={(e) => {
            const val = e.target.value;
            const gt = gangTypes.find(g => (g.gang_type_id || g.id) === val);
            onGangTypeChange(val, !!gt?.is_custom, gt?.gang_type || null);
          }}
        >
          <option value="">Any gang type</option>
          {systemGangTypes.length > 0 && (
            <optgroup label="System Gang Types">
              {systemGangTypes.map(gt => (
                <option key={`system_${gt.gang_type_id || gt.id}`} value={gt.gang_type_id || gt.id}>
                  {gt.gang_type}
                </option>
              ))}
            </optgroup>
          )}
          {customGangTypes.length > 0 && (
            <optgroup label="Custom Gang Types">
              {customGangTypes.map(gt => (
                <option key={`custom_${gt.id}`} value={gt.id}>
                  {gt.gang_type}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {origins.length > 0 && (
        <div>
          <Label className="mb-1">Gang Origin</Label>
          <select
            className="w-full border rounded-md p-2 bg-background text-sm"
            value={gangOriginId}
            onChange={(e) => {
              const val = e.target.value;
              const origin = origins.find(o => o.id === val);
              onGangOriginChange(val, origin?.origin_name || null);
            }}
          >
            <option value="">Any origin</option>
            {origins.map(o => (
              <option key={o.id} value={o.id}>{o.origin_name}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

function AddAvailabilityRuleModal({
  equipmentItemId,
  onClose,
  onAdded,
}: {
  equipmentItemId: string;
  onClose: () => void;
  onAdded: (rule: CustomTPAvailabilityRule) => void;
}) {
  const [gangTypeId, setGangTypeId] = useState('');
  const [isCustomGangType, setIsCustomGangType] = useState(false);
  const [gangOriginId, setGangOriginId] = useState('');
  const [gangTypeName, setGangTypeName] = useState<string | null>(null);
  const [gangOriginName, setGangOriginName] = useState<string | null>(null);
  const [gangVariantId, setGangVariantId] = useState('');
  const [allegiance, setAllegiance] = useState('');
  const [alignment, setAlignment] = useState('');
  const [availability, setAvailability] = useState('');

  const { data: variants = [] } = useQuery({
    queryKey: ['gangVariantTypes'],
    queryFn: async () => {
      const res = await fetch('/api/gang-variant-types');
      if (!res.ok) throw new Error('Failed to fetch variants');
      return res.json() as Promise<Array<{ id: string; variant: string }>>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: allegiances = [] } = useQuery({
    queryKey: ['campaignTypeAllegiances'],
    queryFn: async () => {
      const res = await fetch('/api/campaign-type-allegiances');
      if (!res.ok) throw new Error('Failed to fetch allegiances');
      return res.json() as Promise<Array<{ id: string; allegiance_name: string; campaign_type_name: string }>>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const selectedVariantName = variants.find(v => v.id === gangVariantId)?.variant || null;
  const selectedAllegianceName = allegiances.find(a => a.id === allegiance)?.allegiance_name || null;

  const handleAdd = () => {
    const rule: CustomTPAvailabilityRule = {
      id: `local_${Date.now()}`,
      custom_trading_post_equipment_id: equipmentItemId,
      gang_type_id: !isCustomGangType && gangTypeId ? gangTypeId : null,
      custom_gang_type_id: isCustomGangType && gangTypeId ? gangTypeId : null,
      gang_origin_id: gangOriginId || null,
      gang_variant_id: gangVariantId || null,
      campaign_type_allegiance_id: allegiance || null,
      alignment: alignment || null,
      availability: availability || null,
      gang_type_name: gangTypeName,
      gang_origin_name: gangOriginName,
      gang_variant_name: selectedVariantName,
      allegiance_name: selectedAllegianceName,
    };
    onAdded(rule);
  };

  const hasAnyField = gangTypeId || gangOriginId || gangVariantId || allegiance || alignment;

  return (
    <Modal
      title="Add Availability Rule"
      onClose={onClose}
      onConfirm={async () => {
        handleAdd();
        return true;
      }}
      confirmText="Add Rule"
      confirmDisabled={!hasAnyField}
    >
      <div className="space-y-3">
        <GangScopeFields
          gangTypeId={gangTypeId}
          gangOriginId={gangOriginId}
          onGangTypeChange={(id, isCustom, name) => {
            setGangTypeId(id);
            setIsCustomGangType(isCustom);
            setGangTypeName(name);
            setGangOriginId('');
            setGangOriginName(null);
          }}
          onGangOriginChange={(id, name) => {
            setGangOriginId(id);
            setGangOriginName(name);
          }}
        />

        <div>
          <Label className="mb-1">Gang Variant</Label>
          <select
            className="w-full border rounded-md p-2 bg-background text-sm"
            value={gangVariantId}
            onChange={(e) => setGangVariantId(e.target.value)}
          >
            <option value="">Any variant</option>
            {variants.map(v => (
              <option key={v.id} value={v.id}>{v.variant}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1">Allegiance</Label>
          <select
            className="w-full border rounded-md p-2 bg-background text-sm"
            value={allegiance}
            onChange={(e) => setAllegiance(e.target.value)}
          >
            <option value="">Any allegiance</option>
            {allegiances.map(a => (
              <option key={a.id} value={a.id}>{a.allegiance_name} ({a.campaign_type_name})</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1">Alignment</Label>
          <select
            className="w-full border rounded-md p-2 bg-background text-sm"
            value={alignment}
            onChange={(e) => setAlignment(e.target.value)}
          >
            <option value="">Any alignment</option>
            {ALIGNMENT_OPTIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1">Availability</Label>
          <Input
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            placeholder="e.g. R12, C, E"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Pricing Rule Modal
// ---------------------------------------------------------------------------

function AddPricingRuleModal({
  equipmentItemId,
  onClose,
  onAdded,
}: {
  equipmentItemId: string;
  onClose: () => void;
  onAdded: (rule: CustomTPPricingRule) => void;
}) {
  const [gangTypeId, setGangTypeId] = useState('');
  const [isCustomGangType, setIsCustomGangType] = useState(false);
  const [gangOriginId, setGangOriginId] = useState('');
  const [gangTypeName, setGangTypeName] = useState<string | null>(null);
  const [gangOriginName, setGangOriginName] = useState<string | null>(null);
  const [fighterTypeId, setFighterTypeId] = useState('');
  const [adjustedCost, setAdjustedCost] = useState('');

  const { data: fighterTypes = [] } = useQuery({
    queryKey: ['fighterTypes'],
    queryFn: async () => {
      const res = await fetch('/api/fighter-types?include_all_types=true');
      if (!res.ok) throw new Error('Failed to fetch fighter types');
      return res.json() as Promise<Array<{ id: string; fighter_type: string; gang_type?: string }>>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const fighterTypeOptions = React.useMemo(() => {
    const grouped: Record<string, Array<{ id: string; fighter_type: string }>> = {};
    for (const ft of fighterTypes) {
      const group = ft.gang_type || 'Other';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(ft);
    }
    const options: Array<{ value: string; label: string; displayValue?: string; disabled?: boolean }> = [];
    for (const gangType of Object.keys(grouped)) {
      options.push({ value: `header_${gangType}`, label: gangType, disabled: true });
      for (const ft of grouped[gangType]) {
        options.push({ value: ft.id, label: ft.fighter_type, displayValue: ft.fighter_type });
      }
    }
    return options;
  }, [fighterTypes]);

  const selectedFighterTypeName = fighterTypes.find(ft => ft.id === fighterTypeId)?.fighter_type || null;

  const handleAdd = () => {
    const rule: CustomTPPricingRule = {
      id: `local_${Date.now()}`,
      custom_trading_post_equipment_id: equipmentItemId,
      gang_type_id: !isCustomGangType && gangTypeId ? gangTypeId : null,
      custom_gang_type_id: isCustomGangType && gangTypeId ? gangTypeId : null,
      gang_origin_id: gangOriginId || null,
      fighter_type_id: fighterTypeId || null,
      adjusted_cost: adjustedCost.trim() ? Number(adjustedCost) : null,
      gang_type_name: gangTypeName,
      gang_origin_name: gangOriginName,
      fighter_type_name: selectedFighterTypeName,
    };
    onAdded(rule);
  };

  const isValid = adjustedCost.trim() !== '' && (gangTypeId || gangOriginId || fighterTypeId);

  return (
    <Modal
      title="Add Pricing Rule"
      onClose={onClose}
      onConfirm={async () => {
        handleAdd();
        return true;
      }}
      confirmText="Add Rule"
      confirmDisabled={!isValid}
    >
      <div className="space-y-3">
        <GangScopeFields
          gangTypeId={gangTypeId}
          gangOriginId={gangOriginId}
          onGangTypeChange={(id, isCustom, name) => {
            setGangTypeId(id);
            setIsCustomGangType(isCustom);
            setGangTypeName(name);
            setGangOriginId('');
            setGangOriginName(null);
          }}
          onGangOriginChange={(id, name) => {
            setGangOriginId(id);
            setGangOriginName(name);
          }}
        />

        <div>
          <Label className="mb-1">Fighter Type</Label>
          <Combobox
            options={fighterTypeOptions}
            value={fighterTypeId}
            onValueChange={setFighterTypeId}
            placeholder="Any fighter type"
            clearable
          />
        </div>

        <div>
          <Label className="mb-1">Adjusted Cost *</Label>
          <Input
            type="number"
            value={adjustedCost}
            onChange={(e) => setAdjustedCost(e.target.value)}
            placeholder="Enter adjusted cost"
          />
        </div>
      </div>
    </Modal>
  );
}
