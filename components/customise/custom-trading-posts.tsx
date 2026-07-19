'use client';

import React, { useState, useEffect, useId } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { LuEye, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import { FiShare2 } from 'react-icons/fi';
import { ImInfo } from 'react-icons/im';
import { BiSolidNotepad } from 'react-icons/bi';
import { Tooltip } from 'react-tooltip';
import { renderDescriptionTooltip } from '@/components/ui/tooltip-renderers';
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
import { DESCRIPTION_MAX_LENGTH } from '@/app/actions/customise/custom-constants';
import type { CampaignResource } from '@/utils/campaigns/resources';
import type { UserCampaign } from '@/types/campaign';
import type { EquipmentListItem } from '@/types/equipment';
import { AvailabilityPicker, parseAvailability, combineAvailability } from '@/components/ui/availability-picker';

interface EquipmentPendingChanges {
  costOverride: number | null;
  costTypeResourceId: string | null;
  costCampaignResourceId: string | null;
  costReputation: boolean;
  costResourceAmount: number | null;
  availabilityOverride: string | null;
  availRules: CustomTPAvailabilityRule[];
  pricingRules: CustomTPPricingRule[];
  rulesModified: boolean;
  banned: boolean;
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
  const [shareModalData, setShareModalData] = useState<CustomTradingPost | null>(null);
  const [pendingOverrides, setPendingOverrides] = useState<Map<string, EquipmentPendingChanges>>(new Map());
  const [pendingAdditions, setPendingAdditions] = useState<EquipmentOption[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState<CustomTradingPostData>({
    custom_trading_post_name: '',
    description: null,
  });
  const descCharCount = formData.description?.length ?? 0;

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
      } else {
        if (context?.previous) setTradingPosts(context.previous);
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
    return formData.custom_trading_post_name.trim() !== '' && descCharCount <= DESCRIPTION_MAX_LENGTH;
  };

  const createMutation = useMutation({
    mutationFn: async ({ data }: { data: CustomTradingPostData }) => {
      const result = await createCustomTradingPost(data);
      if (!result.success || !result.data) throw new Error(result.error || 'Failed to create custom trading post');
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
    createMutation.mutate({ data: formData });
    setIsAddModalOpen(false);
    resetForm();
    return true;
  };

  const handleEditConfirm = async () => {
    if (!editModalData || !isFormValid()) return false;

    const tradingPostId = editModalData.id;
    const overridesToSave = new Map(pendingOverrides);
    const additionsToSave = [...pendingAdditions];
    const removalsToSave = new Set(pendingRemovals);

    const insertedAdditionTempIds = new Set<string>();
    const insertedTempToRealId = new Map<string, string>();
    const succeededAdditionRuleRealIds = new Set<string>();
    const failedAdditionRulesByRealId = new Map<string, EquipmentPendingChanges>();
    const succeededRemovalIds = new Set<string>();
    const succeededOverrideIds = new Set<string>();

    const reconcilePersistedPendingState = () => {
      const hasProgress =
        insertedAdditionTempIds.size > 0 ||
        succeededRemovalIds.size > 0 ||
        succeededOverrideIds.size > 0 ||
        failedAdditionRulesByRealId.size > 0 ||
        insertedTempToRealId.size > 0;
      if (!hasProgress) return;

      // Drop operations that already persisted so a retry cannot duplicate them.
      if (insertedAdditionTempIds.size > 0) {
        setPendingAdditions(prev => prev.filter(e => !insertedAdditionTempIds.has(e.id)));
      }
      if (succeededRemovalIds.size > 0) {
        setPendingRemovals(prev => {
          const next = new Set(prev);
          succeededRemovalIds.forEach(id => next.delete(id));
          return next;
        });
      }
      setPendingOverrides(prev => {
        const next = new Map(prev);
        succeededOverrideIds.forEach(id => next.delete(id));
        insertedTempToRealId.forEach((realId, tempId) => {
          next.delete(tempId);
          if (succeededAdditionRuleRealIds.has(realId)) return;
          // Keep unfinished/failed addition rules under the real DB id for retry.
          const changes = failedAdditionRulesByRealId.get(realId) ?? overridesToSave.get(tempId);
          if (changes?.rulesModified) {
            next.set(realId, changes);
          }
        });
        return next;
      });
    };

    try {
      const result = await updateMutation.mutateAsync({ id: tradingPostId, data: formData });
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to update custom trading post');
        return false;
      }

      const hasEquipmentChanges =
        overridesToSave.size > 0 || additionsToSave.length > 0 || removalsToSave.size > 0;

      if (hasEquipmentChanges) {
        let equipmentSaveFailed = false;
        const pendingAdditionTempIds = new Set(additionsToSave.map(e => e.id));

        if (additionsToSave.length > 0) {
          const batchResult = await addTPEquipmentBatch(
            tradingPostId,
            additionsToSave.map(equip => {
              const override = overridesToSave.get(equip.id);
              return {
                equipmentId: equip.is_custom ? equip.original_id! : equip.id,
                isCustom: equip.is_custom,
                costOverride: override?.costOverride,
                costTypeResourceId: override?.costTypeResourceId,
                costCampaignResourceId: override?.costCampaignResourceId,
                costReputation: override?.costReputation,
                costResourceAmount: override?.costResourceAmount,
                availabilityOverride: override?.availabilityOverride,
                banned: override?.banned,
              };
            })
          );
          if (!batchResult.success) {
            toast.error(batchResult.error || 'Failed to add equipment');
            equipmentSaveFailed = true;
          } else if (batchResult.data) {
            const tempToReal = additionsToSave
              .map((equip) => {
                const realRow = batchResult.data!.find(r =>
                  equip.is_custom
                    ? r.custom_equipment_id === equip.original_id
                    : r.equipment_id === equip.id
                );
                return { tempId: equip.id, realId: realRow?.id };
              })
              .filter((entry): entry is { tempId: string; realId: string } => !!entry.realId);

            tempToReal.forEach(({ tempId, realId }) => {
              insertedAdditionTempIds.add(tempId);
              insertedTempToRealId.set(tempId, realId);
            });

            const pendingRulesSaves = tempToReal
              .filter(({ tempId }) => overridesToSave.get(tempId)?.rulesModified)
              .map(async ({ tempId, realId }) => {
                const changes = overridesToSave.get(tempId)!;
                const rulesResult = await saveEquipmentRules(
                  realId,
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
                  equipmentSaveFailed = true;
                  // Remap under the real DB id so a retry uses updateTPEquipment, not re-insert.
                  failedAdditionRulesByRealId.set(realId, changes);
                  return;
                }
                succeededAdditionRuleRealIds.add(realId);
              });
            // allSettled ensures every sibling completes before we read the bookkeeping sets,
            // preventing a single throw from cutting off in-flight siblings mid-reconcile.
            const settledRules = await Promise.allSettled(pendingRulesSaves);
            for (const result of settledRules) {
              if (result.status === 'rejected') {
                equipmentSaveFailed = true;
                toast.error(
                  result.reason instanceof Error
                    ? result.reason.message
                    : 'Failed to save equipment rules'
                );
              }
            }
          }
        }

        if (removalsToSave.size > 0) {
          const settledRemovals = await Promise.allSettled(
            Array.from(removalsToSave).map(async (id) => {
              const res = await removeTPEquipment(id);
              if (!res.success) {
                toast.error(res.error || 'Failed to remove equipment');
                equipmentSaveFailed = true;
                return;
              }
              succeededRemovalIds.add(id);
            })
          );
          for (const result of settledRemovals) {
            if (result.status === 'rejected') {
              equipmentSaveFailed = true;
              toast.error(
                result.reason instanceof Error
                  ? result.reason.message
                  : 'Failed to remove equipment'
              );
            }
          }
        }

        const equipmentSaves = Array.from(overridesToSave.entries())
          .filter(([itemId]) => !pendingAdditionTempIds.has(itemId))
          .map(async ([itemId, changes]) => {
            const overridesResult = await updateTPEquipment(itemId, {
              cost_override: changes.costOverride,
              cost_type_resource_id: changes.costTypeResourceId,
              cost_campaign_resource_id: changes.costCampaignResourceId,
              cost_reputation: changes.costReputation,
              cost_resource_amount: changes.costResourceAmount,
              availability_override: changes.availabilityOverride,
              banned: changes.banned,
            });
            if (!overridesResult.success) {
              toast.error(overridesResult.error || 'Failed to save equipment overrides');
              equipmentSaveFailed = true;
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
                equipmentSaveFailed = true;
                return;
              }
            }
            succeededOverrideIds.add(itemId);
          });
        const settledOverrides = await Promise.allSettled(equipmentSaves);
        for (const result of settledOverrides) {
          if (result.status === 'rejected') {
            equipmentSaveFailed = true;
            toast.error(
              result.reason instanceof Error
                ? result.reason.message
                : 'Failed to save equipment overrides'
            );
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['tpEquipment', tradingPostId] });
        await Promise.all(
          Array.from(overridesToSave.keys()).map((itemId) =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['tpAvailabilityRules', itemId] }),
              queryClient.invalidateQueries({ queryKey: ['tpPricingRules', itemId] }),
            ])
          )
        );
        await Promise.all(
          Array.from(failedAdditionRulesByRealId.keys()).map((itemId) =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['tpAvailabilityRules', itemId] }),
              queryClient.invalidateQueries({ queryKey: ['tpPricingRules', itemId] }),
            ])
          )
        );

        if (equipmentSaveFailed) {
          reconcilePersistedPendingState();
          return false;
        }
      }

      toast.success('Custom trading post updated successfully');
      return true;
    } catch (error) {
      reconcilePersistedPendingState();
      // Ensure the UI reflects any rows already written if we threw before invalidate.
      const anyPersisted =
        insertedAdditionTempIds.size > 0 ||
        succeededRemovalIds.size > 0 ||
        succeededOverrideIds.size > 0 ||
        succeededAdditionRuleRealIds.size > 0;
      if (anyPersisted) {
        void queryClient.invalidateQueries({ queryKey: ['tpEquipment', tradingPostId] });
        // Invalidate per-item rule caches for anything that may have silently persisted.
        const allRelevantItemIds = new Set([
          ...Array.from(overridesToSave.keys()),
          ...Array.from(succeededAdditionRuleRealIds),
          ...Array.from(failedAdditionRulesByRealId.keys()),
        ]);
        allRelevantItemIds.forEach(itemId => {
          void queryClient.invalidateQueries({ queryKey: ['tpAvailabilityRules', itemId] });
          void queryClient.invalidateQueries({ queryKey: ['tpPricingRules', itemId] });
        });
      }
      toast.error(error instanceof Error ? error.message : 'Failed to update custom trading post');
      return false;
    }
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
      label: 'Name',
      align: 'left',
      width: '85%',
    },
    {
      key: 'description',
      label: 'Desc.',
      align: 'left',
      width: '5%',
      render: (_value, item: CustomTradingPost) =>
        item.description?.trim() ? (
          <span
            className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
            data-tooltip-id="custom-trading-post-description-tooltip"
            data-tooltip-title={item.custom_trading_post_name}
            data-tooltip-description={item.description}
          >
            <BiSolidNotepad className="text-lg" aria-label="View trading post description" />
          </span>
        ) : null,
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
        <Label className="block mb-2">Trading Post Name *</Label>
        <Input
          value={formData.custom_trading_post_name}
          onChange={(e) => setFormData({ ...formData, custom_trading_post_name: e.target.value })}
          placeholder="Enter trading post name"
          disabled={isReadOnly}
        />
      </div>

      <div>
        <label htmlFor="tp-description" className="flex justify-between items-center text-sm font-medium mb-1">
          <span>Description</span>
          {!isReadOnly && (
            <span className={`text-sm ${descCharCount > DESCRIPTION_MAX_LENGTH ? 'text-red-500' : 'text-muted-foreground'}`}>
              {descCharCount}/{DESCRIPTION_MAX_LENGTH} characters
            </span>
          )}
        </label>
        <Textarea
          id="tp-description"
          className="min-h-20 resize-y"
          value={formData.description || ''}
          onChange={(e) => {
            const value = e.target.value;
            setFormData({ ...formData, description: value || null });
          }}
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
        addButtonText="Create"
        emptyMessage="No custom trading posts created yet."
      />

      {isAddModalOpen && (
        <Modal
          title="Create Custom Trading Post"
          onClose={() => {
            setIsAddModalOpen(false);
            resetForm();
          }}
          onConfirm={handleCreateConfirm}
          confirmText="Create"
          confirmDisabled={!isFormValid()}
          width="2xl"
        >
          <div className="space-y-4">
            {renderForm()}
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Once the Trading Post has been created, you will be able to add equipment items to it and set their custom cost and availability rules.
            </p>
          </div>
        </Modal>
      )}

      {editModalData && (
        <EditTradingPostModal
          tradingPost={editModalData}
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

      <Tooltip
        id="custom-trading-post-description-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        render={renderDescriptionTooltip}
        style={{
          padding: '6px',
          width: '24rem',
          maxWidth: '90vw',
          maxHeight: '60vh',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipment Items Section — shared between edit and view modals
// ---------------------------------------------------------------------------

type EquipmentOption = EquipmentListItem;

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
  const tooltipId = useId();
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

  const displayItems: CustomTPEquipment[] = [
    ...equipmentItems
      .filter(item => !pendingRemovals?.has(item.id))
      .map(item => {
        const pending = pendingOverrides?.get(item.id);
        if (!pending) return item;
        return {
          ...item,
          cost_override: pending.costOverride,
          cost_type_resource_id: pending.costTypeResourceId,
          cost_campaign_resource_id: pending.costCampaignResourceId,
          cost_reputation: pending.costReputation,
          cost_resource_amount: pending.costResourceAmount,
          availability_override: pending.availabilityOverride,
          banned: pending.banned,
        };
      }),
    ...(pendingAdditions ?? []).map(equip => {
      const pending = pendingOverrides?.get(equip.id);
      return {
        id: equip.id,
        custom_trading_post_id: tradingPostId,
        equipment_id: equip.is_custom ? null : equip.id,
        custom_equipment_id: equip.is_custom ? (equip.original_id ?? null) : null,
        equipment_name: equip.equipment_name,
        equipment_category: equip.equipment_category,
        is_custom: equip.is_custom,
        cost_override: pending?.costOverride ?? null,
        cost_type_resource_id: pending?.costTypeResourceId ?? null,
        cost_campaign_resource_id: pending?.costCampaignResourceId ?? null,
        cost_reputation: pending?.costReputation ?? false,
        cost_resource_amount: pending?.costResourceAmount ?? null,
        availability_override: pending?.availabilityOverride ?? null,
        sort_order: null,
        banned: pending?.banned ?? false,
      };
    }),
  ];

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h4 className="text-lg font-semibold">Equipment Items</h4>
            <span
              className="relative cursor-pointer text-muted-foreground hover:text-foreground"
              data-tooltip-id={tooltipId}
            >
              <ImInfo />
            </span>
          </div>
          {isEditable && (
            <Button onClick={() => setIsAddEquipOpen(true)}>
              Add
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
                  <th className="py-2 pr-2 font-medium text-center">Cost</th>
                  <th className="py-2 pr-2 font-medium text-center">AL</th>
                  <th className="py-2 pr-2 font-medium text-center">Banned</th>
                  {isEditable && <th className="py-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {item.equipment_name}
                      {item.is_custom && <span className="text-xs text-muted-foreground ml-1">(Custom)</span>}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">{item.equipment_category || '-'}</td>
                    <td className="py-2 pr-2 text-center">
                      {(item.cost_type_resource_id || item.cost_campaign_resource_id || item.cost_reputation) && item.cost_resource_amount != null
                        ? `${item.cost_resource_amount} ${item.cost_reputation ? 'Reputation' : 'Resource'}`
                        : item.cost_override != null ? item.cost_override : '-'}
                    </td>
                    <td className="py-2 pr-2 text-center">{item.availability_override || '-'}</td>
                    <td className="py-2 pr-2 text-center">{item.banned ? 'Yes' : '-'}</td>
                    {isEditable && (
                      <td className="py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          {onEquipmentOverrideChange && (
                            <Button variant="outline" size="sm" className="text-xs px-1.5 h-6" onClick={() => setEditOverridesItem(item)}>
                              <LuSquarePen className="h-4 w-4" />
                            </Button>
                          )}
                          {onRemoveEquipment && (
                            <Button variant="outline_remove" size="sm" className="text-xs px-1.5 h-6" onClick={() => onRemoveEquipment(item.id)}>
                              <LuTrash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
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
          tradingPostId={tradingPostId}
        />
      )}

      <Tooltip
        id={tooltipId}
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      >
        <div>
          <p>
            To override the default cost or availability of an item from the official Trading Posts, add the equipment first, then click the edit icon next to its row.
          </p>
          <p className="mt-2">
            Custom rules can also be set per <strong>gang</strong>, <strong>alignment</strong>, <strong>gang variant</strong>, or <strong>allegiance</strong> to apply a dedicated cost or availability for specific groups.
          </p>
        </div>
      </Tooltip>

    </>
  );
}

// ---------------------------------------------------------------------------
// Edit Trading Post Modal — form + equipment items
// ---------------------------------------------------------------------------

function EditTradingPostModal({
  tradingPost,
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
    queryKey: ['equipment', { core_equipment: false }],
    queryFn: async () => {
      const res = await fetch('/api/equipment?core_equipment=false');
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
  tradingPostId,
}: {
  item: CustomTPEquipment;
  pendingChanges?: EquipmentPendingChanges;
  onClose: () => void;
  onSaveLocal: (changes: EquipmentPendingChanges) => void;
  tradingPostId: string;
}) {
  type ResourceOption = { id: string; name: string; type: 'campaign_type' | 'campaign' | 'reputation' };

  const [costOverride, setCostOverride] = useState(
    pendingChanges ? (pendingChanges.costOverride?.toString() ?? '') : (item.cost_override?.toString() ?? '')
  );
  const [costResourceAmount, setCostResourceAmount] = useState(
    pendingChanges ? (pendingChanges.costResourceAmount?.toString() ?? '') : (item.cost_resource_amount?.toString() ?? '')
  );

  const getInitialResourceValue = (): string => {
    if (pendingChanges) {
      if (pendingChanges.costReputation) return 'reputation';
      if (pendingChanges.costTypeResourceId) return pendingChanges.costTypeResourceId;
      if (pendingChanges.costCampaignResourceId) return pendingChanges.costCampaignResourceId;
      return '';
    }
    if (item.cost_reputation) return 'reputation';
    if (item.cost_type_resource_id) return item.cost_type_resource_id;
    if (item.cost_campaign_resource_id) return item.cost_campaign_resource_id;
    return '';
  };
  const [selectedResourceValue, setSelectedResourceValue] = useState(getInitialResourceValue);
  const parsedAvail = parseAvailability(
    pendingChanges ? pendingChanges.availabilityOverride : item.availability_override
  );
  const [availLetter, setAvailLetter] = useState(parsedAvail.letter);
  const [availNumber, setAvailNumber] = useState(parsedAvail.number);
  const [isBanned, setIsBanned] = useState(
    pendingChanges ? pendingChanges.banned : item.banned
  );
  const [localAvailRules, setLocalAvailRules] = useState<CustomTPAvailabilityRule[] | null>(
    pendingChanges ? pendingChanges.availRules : null
  );
  const [localPricingRules, setLocalPricingRules] = useState<CustomTPPricingRule[] | null>(
    pendingChanges ? pendingChanges.pricingRules : null
  );
  const [availRuleModal, setAvailRuleModal] = useState<'add' | number | null>(null);
  const [pricingRuleModal, setPricingRuleModal] = useState<'add' | number | null>(null);

  const { data: availableResources = [] } = useQuery<ResourceOption[]>({
    queryKey: ['tpAvailableResources', tradingPostId],
    queryFn: async () => {
      const sharedRes = await fetch(`/api/custom-trading-posts/${tradingPostId}/shared-campaigns`);
      const sharedIds: string[] = sharedRes.ok ? await sharedRes.json() : [];

      const reputationOption: ResourceOption = { id: 'reputation', name: 'Reputation', type: 'reputation' };

      if (sharedIds.length === 0) return [reputationOption];

      const allResources = await Promise.all(
        sharedIds.map(async (id) => {
          const res = await fetch(`/api/campaigns/${id}/resources`);
          if (!res.ok) return [] as CampaignResource[];
          return res.json() as Promise<CampaignResource[]>;
        })
      );

      const seen = new Set<string>();
      const options: ResourceOption[] = [reputationOption];
      allResources.flat().forEach(r => {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          options.push({
            id: r.id,
            name: r.resource_name,
            type: r.is_custom ? 'campaign' : 'campaign_type',
          });
        }
      });
      return options;
    },
    staleTime: 10 * 60 * 1000,
  });

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

  const selectedResource = availableResources.find(r => r.id === selectedResourceValue) ?? null;
  const hasResourceCost = !!selectedResource;

  const handleSave = async () => {
    if (hasResourceCost && (!costResourceAmount.trim() || Number(costResourceAmount) <= 0)) {
      toast.error('A resource cost requires a resource amount greater than 0');
      return false;
    }
    onSaveLocal({
      costOverride: costOverride.trim() ? Number(costOverride) : null,
      costTypeResourceId: selectedResource?.type === 'campaign_type' ? selectedResource.id : null,
      costCampaignResourceId: selectedResource?.type === 'campaign' ? selectedResource.id : null,
      costReputation: selectedResource?.type === 'reputation',
      costResourceAmount: hasResourceCost && costResourceAmount.trim() ? Number(costResourceAmount) : null,
      availabilityOverride: combineAvailability(availLetter, availNumber),
      availRules,
      pricingRules,
      rulesModified: localAvailRules !== null || localPricingRules !== null,
      banned: isBanned,
    });
    return true;
  };

  const handleAddAvailRule = (rule: CustomTPAvailabilityRule) => {
    setLocalAvailRules(prev => [...(prev ?? fetchedAvailRules), rule]);
    setAvailRuleModal(null);
  };

  const handleUpdateAvailRule = (index: number, rule: CustomTPAvailabilityRule) => {
    setLocalAvailRules(prev => {
      const rules = [...(prev ?? fetchedAvailRules)];
      rules[index] = rule;
      return rules;
    });
    setAvailRuleModal(null);
  };

  const handleRemoveAvailRule = (index: number) => {
    setLocalAvailRules(prev => (prev ?? fetchedAvailRules).filter((_, i) => i !== index));
  };

  const handleAddPricingRule = (rule: CustomTPPricingRule) => {
    setLocalPricingRules(prev => [...(prev ?? fetchedPricingRules), rule]);
    setPricingRuleModal(null);
  };

  const handleUpdatePricingRule = (index: number, rule: CustomTPPricingRule) => {
    setLocalPricingRules(prev => {
      const rules = [...(prev ?? fetchedPricingRules)];
      rules[index] = rule;
      return rules;
    });
    setPricingRuleModal(null);
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
            <label className="flex items-start space-x-2">
              <Checkbox
                checked={isBanned}
                onCheckedChange={(checked) => setIsBanned(checked === true)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-medium">Banned</span>
                <p className="text-xs text-muted-foreground">
                  Banned items are visible but cannot be purchased.
                </p>
              </div>
            </label>
            <div>
              <Label>Resource Type</Label>
              <Combobox
                options={availableResources.map(r => ({ value: r.id, label: r.name }))}
                value={selectedResourceValue}
                onValueChange={setSelectedResourceValue}
                placeholder="Credits (default)"
                clearable
              />
            </div>
            {hasResourceCost && (
              <div>
                <Label>Resource Amount</Label>
                <Input
                  type="number"
                  value={costResourceAmount}
                  onChange={(e) => setCostResourceAmount(e.target.value)}
                  placeholder="Resource amount to charge"
                />
              </div>
            )}
            <div>
              <Label>General Cost Override</Label>
              <Input
                type="number"
                value={costOverride}
                onChange={(e) => setCostOverride(e.target.value)}
                placeholder="Leave empty for default cost"
              />
            </div>
            <AvailabilityPicker
              label="General Availability Override"
              letter={availLetter}
              number={availNumber}
              onLetterChange={setAvailLetter}
              onNumberChange={setAvailNumber}
              allowEmpty
            />
          </div>

          {/* Availability Rules */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Availability Rules</h4>
              <Button onClick={() => setAvailRuleModal('add')}>
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
                      <th className="py-1 pr-2 font-medium text-center">AL</th>
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
                        <td className="py-1 pr-2 text-center">{rule.availability || '-'}</td>
                        <td className="py-1 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs px-1 h-5"
                              onClick={() => setAvailRuleModal(index)}
                            >
                              <LuSquarePen className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline_remove"
                              size="sm"
                              className="text-xs px-1 h-5"
                              onClick={() => handleRemoveAvailRule(index)}
                            >
                              <LuTrash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cost Rules */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Cost Rules</h4>
              <Button onClick={() => setPricingRuleModal('add')}>
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
                      <th className="py-1 pr-2 font-medium text-center">Cost</th>
                      <th className="py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingRules.map((rule, index) => (
                      <tr key={rule.id || `new_${index}`} className="border-b last:border-0">
                        <td className="py-1 pr-2">{rule.gang_type_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.gang_origin_name || '-'}</td>
                        <td className="py-1 pr-2">{rule.fighter_type_name || '-'}</td>
                        <td className="py-1 pr-2 text-center">{rule.adjusted_cost != null ? rule.adjusted_cost : '-'}</td>
                        <td className="py-1 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs px-1 h-5"
                              onClick={() => setPricingRuleModal(index)}
                            >
                              <LuSquarePen className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline_remove"
                              size="sm"
                              className="text-xs px-1 h-5"
                              onClick={() => handleRemovePricingRule(index)}
                            >
                              <LuTrash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      {availRuleModal !== null && (
        <AddAvailabilityRuleModal
          equipmentItemId={item.id}
          initialRule={typeof availRuleModal === 'number' ? availRules[availRuleModal] : undefined}
          onClose={() => setAvailRuleModal(null)}
          onSaved={(rule) => {
            if (typeof availRuleModal === 'number') {
              handleUpdateAvailRule(availRuleModal, rule);
            } else {
              handleAddAvailRule(rule);
            }
          }}
        />
      )}

      {pricingRuleModal !== null && (
        <AddPricingRuleModal
          equipmentItemId={item.id}
          initialRule={typeof pricingRuleModal === 'number' ? pricingRules[pricingRuleModal] : undefined}
          onClose={() => setPricingRuleModal(null)}
          onSaved={(rule) => {
            if (typeof pricingRuleModal === 'number') {
              handleUpdatePricingRule(pricingRuleModal, rule);
            } else {
              handleAddPricingRule(rule);
            }
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Availability Rule Modal (add / edit)
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
          className="w-full border rounded-md p-2 bg-background text-base md:text-sm"
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
            className="w-full border rounded-md p-2 bg-background text-base md:text-sm"
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
  initialRule,
  onClose,
  onSaved,
}: {
  equipmentItemId: string;
  initialRule?: CustomTPAvailabilityRule;
  onClose: () => void;
  onSaved: (rule: CustomTPAvailabilityRule) => void;
}) {
  const parsedAvail = parseAvailability(initialRule?.availability);
  const [gangTypeId, setGangTypeId] = useState(
    initialRule ? (initialRule.custom_gang_type_id || initialRule.gang_type_id || '') : ''
  );
  const [isCustomGangType, setIsCustomGangType] = useState(!!initialRule?.custom_gang_type_id);
  const [gangOriginId, setGangOriginId] = useState(initialRule?.gang_origin_id || '');
  const [gangTypeName, setGangTypeName] = useState<string | null>(initialRule?.gang_type_name ?? null);
  const [gangOriginName, setGangOriginName] = useState<string | null>(initialRule?.gang_origin_name ?? null);
  const [gangVariantId, setGangVariantId] = useState(initialRule?.gang_variant_id || '');
  const [allegiance, setAllegiance] = useState(initialRule?.campaign_type_allegiance_id || '');
  const [alignment, setAlignment] = useState(initialRule?.alignment || '');
  const [availLetter, setAvailLetter] = useState(parsedAvail.letter);
  const [availNumber, setAvailNumber] = useState(parsedAvail.number);

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

  const handleSave = () => {
    const rule: CustomTPAvailabilityRule = {
      id: initialRule?.id ?? `local_${Date.now()}`,
      custom_trading_post_equipment_id: equipmentItemId,
      gang_type_id: !isCustomGangType && gangTypeId ? gangTypeId : null,
      custom_gang_type_id: isCustomGangType && gangTypeId ? gangTypeId : null,
      gang_origin_id: gangOriginId || null,
      gang_variant_id: gangVariantId || null,
      campaign_type_allegiance_id: allegiance || null,
      alignment: alignment || null,
      availability: combineAvailability(availLetter, availNumber),
      gang_type_name: gangTypeName,
      gang_origin_name: gangOriginName,
      gang_variant_name: selectedVariantName,
      allegiance_name: selectedAllegianceName,
    };
    onSaved(rule);
  };

  const hasAnyField = gangTypeId || gangOriginId || gangVariantId || allegiance || alignment;
  const isEditing = !!initialRule;

  return (
    <Modal
      title={isEditing ? 'Edit Availability Rule' : 'Add Availability Rule'}
      onClose={onClose}
      onConfirm={async () => {
        handleSave();
        return true;
      }}
      confirmText={isEditing ? 'Save Rule' : 'Add Rule'}
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
            className="w-full border rounded-md p-2 bg-background text-base md:text-sm"
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
            className="w-full border rounded-md p-2 bg-background text-base md:text-sm"
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
            className="w-full border rounded-md p-2 bg-background text-base md:text-sm"
            value={alignment}
            onChange={(e) => setAlignment(e.target.value)}
          >
            <option value="">Any alignment</option>
            {ALIGNMENT_OPTIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <AvailabilityPicker
          label="Availability"
          letter={availLetter}
          number={availNumber}
          onLetterChange={setAvailLetter}
          onNumberChange={setAvailNumber}
          allowEmpty
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cost Rule Modal (add / edit)
// ---------------------------------------------------------------------------

type PricingRuleFighterType = {
  id: string;
  fighter_type: string;
  fighter_class?: string;
  gang_type?: string;
  gang_type_id?: string;
  sub_type?: { id?: string; sub_type_name?: string } | null;
};

function getPricingRuleFighterTypeClassKey(ft: PricingRuleFighterType): string {
  return `${ft.fighter_type}-${ft.fighter_class || 'Unknown'}`;
}

function buildMultiProfileKeys(fighterTypes: PricingRuleFighterType[]): Set<string> {
  const keyCounts = new Map<string, number>();
  for (const ft of fighterTypes) {
    const key = getPricingRuleFighterTypeClassKey(ft);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const keys = new Set<string>();
  keyCounts.forEach((count, key) => {
    if (count > 1) keys.add(key);
  });
  return keys;
}

function formatPricingRuleFighterTypeLabel(
  ft: PricingRuleFighterType,
  multiProfileKeys: Set<string>
): string {
  const fighterClass = ft.fighter_class || 'Unknown';
  const base = `${ft.fighter_type} (${fighterClass})`;
  if (!multiProfileKeys.has(getPricingRuleFighterTypeClassKey(ft))) return base;
  if (!ft.sub_type?.sub_type_name) return base;
  return `${base} - ${ft.sub_type.sub_type_name}`;
}

function AddPricingRuleModal({
  equipmentItemId,
  initialRule,
  onClose,
  onSaved,
}: {
  equipmentItemId: string;
  initialRule?: CustomTPPricingRule;
  onClose: () => void;
  onSaved: (rule: CustomTPPricingRule) => void;
}) {
  const [gangTypeId, setGangTypeId] = useState(
    initialRule ? (initialRule.custom_gang_type_id || initialRule.gang_type_id || '') : ''
  );
  const [isCustomGangType, setIsCustomGangType] = useState(!!initialRule?.custom_gang_type_id);
  const [gangOriginId, setGangOriginId] = useState(initialRule?.gang_origin_id || '');
  const [gangTypeName, setGangTypeName] = useState<string | null>(initialRule?.gang_type_name ?? null);
  const [gangOriginName, setGangOriginName] = useState<string | null>(initialRule?.gang_origin_name ?? null);
  const [fighterTypeId, setFighterTypeId] = useState(initialRule?.fighter_type_id || '');
  const [adjustedCost, setAdjustedCost] = useState(
    initialRule?.adjusted_cost != null ? initialRule.adjusted_cost.toString() : ''
  );

  const { data: fighterTypes = [], isLoading: isFighterTypesLoading } = useQuery({
    queryKey: ['fighterTypes'],
    queryFn: async () => {
      const res = await fetch('/api/fighter-types?include_all_types=true');
      if (!res.ok) throw new Error('Failed to fetch fighter types');
      return res.json() as Promise<PricingRuleFighterType[]>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: customFighterTypes = [], isLoading: isCustomFighterTypesLoading } = useQuery({
    queryKey: ['fighterTypes', 'custom', gangTypeId],
    queryFn: async () => {
      const res = await fetch(`/api/fighter-types?custom_gang_type_id=${gangTypeId}`);
      if (!res.ok) throw new Error('Failed to fetch custom fighter types');
      return res.json() as Promise<PricingRuleFighterType[]>;
    },
    enabled: isCustomGangType && !!gangTypeId,
    staleTime: 10 * 60 * 1000,
  });

  const scopedFighterTypes = React.useMemo(() => {
    if (!gangTypeId) return [];
    if (isCustomGangType) return customFighterTypes;
    return fighterTypes.filter(
      ft => ft.gang_type_id === gangTypeId || (fighterTypeId !== '' && ft.id === fighterTypeId)
    );
  }, [gangTypeId, isCustomGangType, fighterTypes, customFighterTypes, fighterTypeId]);

  const fighterTypeOptions = React.useMemo(() => {
    const multiProfileKeys = buildMultiProfileKeys(scopedFighterTypes);
    return [...scopedFighterTypes]
      .map(ft => {
        const label = formatPricingRuleFighterTypeLabel(ft, multiProfileKeys);
        return {
          value: ft.id,
          label,
          displayValue: label,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedFighterTypes]);

  const selectedFighterTypeName = React.useMemo(() => {
    const ft =
      scopedFighterTypes.find(item => item.id === fighterTypeId)
      || fighterTypes.find(item => item.id === fighterTypeId)
      || customFighterTypes.find(item => item.id === fighterTypeId);
    if (!ft) return null;
    const scopeForLabel =
      scopedFighterTypes.length > 0
        ? scopedFighterTypes
        : isCustomGangType
          ? customFighterTypes
          : fighterTypes.filter(
              item => item.gang_type_id === gangTypeId || (fighterTypeId !== '' && item.id === fighterTypeId)
            );
    return formatPricingRuleFighterTypeLabel(ft, buildMultiProfileKeys(scopeForLabel));
  }, [scopedFighterTypes, fighterTypeId, fighterTypes, customFighterTypes, isCustomGangType, gangTypeId]);

  const scopeResetKey = `${gangTypeId}:${isCustomGangType}:${scopedFighterTypes.map(ft => ft.id).join(',')}:${isCustomGangType ? isCustomFighterTypesLoading : isFighterTypesLoading}`;
  const [prevScopeResetKey, setPrevScopeResetKey] = useState(scopeResetKey);
  if (scopeResetKey !== prevScopeResetKey) {
    setPrevScopeResetKey(scopeResetKey);
    if (fighterTypeId && gangTypeId) {
      const loading = isCustomGangType ? isCustomFighterTypesLoading : isFighterTypesLoading;
      if (!loading && !scopedFighterTypes.some(ft => ft.id === fighterTypeId)) {
        setFighterTypeId('');
      }
    }
  }

  const handleSave = () => {
    const rule: CustomTPPricingRule = {
      id: initialRule?.id ?? `local_${Date.now()}`,
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
    onSaved(rule);
  };

  const isValid = adjustedCost.trim() !== '' && (gangTypeId || gangOriginId || fighterTypeId);
  const isEditing = !!initialRule;

  return (
    <Modal
      title={isEditing ? 'Edit Cost Rule' : 'Add Cost Rule'}
      onClose={onClose}
      onConfirm={async () => {
        handleSave();
        return true;
      }}
      confirmText={isEditing ? 'Save Rule' : 'Add Rule'}
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
            if (!id) {
              setFighterTypeId('');
            } else if (fighterTypeId) {
              if (isCustom) {
                setFighterTypeId('');
              } else if (!fighterTypes.some(ft => ft.gang_type_id === id && ft.id === fighterTypeId)) {
                setFighterTypeId('');
              }
            }
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
            disabled={!gangTypeId}
          />
        </div>

        <div>
          <Label className="mb-1">Cost *</Label>
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
