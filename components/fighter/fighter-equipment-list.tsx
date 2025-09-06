'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/lib/server-functions/sell-equipment';
import { moveEquipmentToStash } from '@/app/actions/move-to-stash';
import { deleteEquipmentFromFighter } from '@/app/lib/server-functions/equipment';
import { Button } from "@/components/ui/button";
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';
import { rollD6 } from '@/utils/dice';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

interface WeaponListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  equipment?: Equipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
}

interface SellModalProps {
  item: Equipment;
  onClose: () => void;
  onConfirm: (cost: number) => void;
}

function SellModal({ item, onClose, onConfirm }: SellModalProps) {
  const originalCost = item.purchase_cost ?? 0;
  const [manualCost, setManualCost] = useState(originalCost);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const { toast } = useToast();

  const handleRoll = () => {
    const r = rollD6();
    setLastRoll(r);
    const deduction = r * 10;
    const final = Math.max(5, originalCost - deduction);
    setManualCost(final);
    toast({ description: `Roll ${r}: -${deduction} → ${final} credits` });
  };

  return (
    <Modal
      title="Confirm Sale"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to sell {item.equipment_name}?</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRoll}
              className="px-3 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              Roll D6
            </button>
            {lastRoll !== null && (
              <div className="text-sm">
                {`Roll ${lastRoll}: -${lastRoll * 10} → ${Math.max(5, originalCost - lastRoll * 10)} credits`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost
              </label>
              <input
                type="number"
                value={manualCost}
                onChange={(e) => setManualCost(Number(e.target.value))}
                className="w-full p-2 border rounded-md"
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 5 credits</p>
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={() => onConfirm(Math.max(5, Number(manualCost) || 0))}
    />
  );
}

export function WeaponList({ 
  fighterId, 
  gangId, 
  gangCredits, 
  fighterCredits, 
  equipment = [],
  onAddEquipment,
  userPermissions
}: WeaponListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<Equipment | null>(null);
  const [stashModalData, setStashModalData] = useState<Equipment | null>(null);

  // TanStack Query mutations with cache invalidation
  const deleteEquipmentMutation = useMutation({
    mutationFn: async (variables: any) => {
      const result = await deleteEquipmentFromFighter(variables);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot the previous values
      const previousEquipment = queryClient.getQueryData(queryKeys.fighters.equipment(fighterId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Find the equipment being deleted to check if it has effects
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);

      // Optimistically update the UI
      queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), (old: Equipment[]) => 
        (old || []).filter(e => e.fighter_equipment_id !== variables.fighter_equipment_id)
      );

      // Optimistically remove equipment effects if the equipment had any
      if (equipmentToDelete?.equipment_id) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          // Remove effects that were associated with this equipment
          const filteredEffects = {
            ...old,
            equipment: (old?.equipment || []).filter((effect: any) => 
              effect.type_specific_data?.equipment_id !== equipmentToDelete.equipment_id
            )
          };
          
          return filteredEffects;
        });
      }

      // Return a context object with the snapshotted values
      return { previousEquipment, previousEffects, previousTotalCost };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }

      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to delete equipment',
        variant: "destructive"
      });
    },
    onSuccess: (data) => {
      // Update fighter total cost if provided in response
      if (data.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }

      // Update fighter effects with real server data if effects were deleted
      if (data.deleted_effects && data.deleted_effects.length > 0) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          // Remove the deleted effects from the cache
          const deletedEffectIds = data?.deleted_effects?.map((effect: any) => effect.id) || [];
          return {
            ...old,
            equipment: (old?.equipment || []).filter((effect: any) => 
              !deletedEffectIds.includes(effect.id)
            )
          };
        });
      }

      // 🎯 SURGICAL CACHE INVALIDATION - Only invalidate affected caches
      // Fighter equipment (will sync gang page automatically via shared cache)
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      
      // Gang rating and credits (affected by equipment deletion)
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });

      toast({
        title: "Success",
        description: `Successfully deleted ${data.deleted_equipment?.equipment_name || 'equipment'}`,
        variant: "default"
      });
      setDeleteModalData(null);
    }
  });

  const sellEquipmentMutation = useMutation({
    mutationFn: async (variables: any) => {
      const result = await sellEquipmentFromFighter(variables);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot the previous values
      const previousEquipment = queryClient.getQueryData(queryKeys.fighters.equipment(fighterId));
      const previousCredits = queryClient.getQueryData(queryKeys.gangs.credits(gangId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Find the equipment being sold to check if it has effects
      const equipmentToSell = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);

      // Optimistically update the UI
      queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), (old: Equipment[]) => 
        (old || []).filter(e => e.fighter_equipment_id !== variables.fighter_equipment_id)
      );

      queryClient.setQueryData(queryKeys.gangs.credits(gangId), (old: number) => 
        (old || 0) + (variables.manual_cost || 0)
      );

      // Optimistically remove equipment effects if the equipment had any
      if (equipmentToSell?.equipment_id) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          // Remove effects that were associated with this equipment
          const filteredEffects = {
            ...old,
            equipment: (old?.equipment || []).filter((effect: any) => 
              effect.type_specific_data?.equipment_id !== equipmentToSell.equipment_id
            )
          };
          
          return filteredEffects;
        });
      }

      // Return a context object with the snapshotted values
      return { previousEquipment, previousCredits, previousEffects, previousTotalCost };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousCredits);
      }
      if (context?.previousEffects) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), context.previousEffects);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }

      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to sell equipment",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables) => {
      // Find equipment name from current equipment list for display
      const soldEquipment = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);
      
      // Update fighter total cost if provided in response
      if (data && data.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }

      // Update fighter effects with real server data if effects were deleted
      if (data && data.deleted_effects && data.deleted_effects.length > 0) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          // Remove the deleted effects from the cache
          const deletedEffectIds = data?.deleted_effects?.map((effect: any) => effect.id) || [];
          return {
            ...old,
            equipment: (old?.equipment || []).filter((effect: any) => 
              !deletedEffectIds.includes(effect.id)
            )
          };
        });
      }
      
      // 🎯 SURGICAL CACHE INVALIDATION - Only invalidate affected caches
      // Fighter equipment (will sync gang page automatically via shared cache)
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      
      // Gang rating and credits (affected by equipment sale)
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });

      toast({
        title: "Success",
        description: `Sold ${soldEquipment?.equipment_name || 'equipment'} for ${variables.manual_cost || 0} credits`,
        variant: "default"
      });
      setSellModalData(null);
    }
  });

  const stashEquipmentMutation = useMutation({
    mutationFn: moveEquipmentToStash,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.stash(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.effects(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot the previous values
      const previousEquipment = queryClient.getQueryData(queryKeys.fighters.equipment(fighterId));
      const previousStash = queryClient.getQueryData(queryKeys.gangs.stash(gangId));
      const previousEffects = queryClient.getQueryData(queryKeys.fighters.effects(fighterId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Find equipment before removing for stash update
      const stashedEquipment = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);

      // Optimistically update the UI
      queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), (old: Equipment[]) => 
        (old || []).filter(e => e.fighter_equipment_id !== variables.fighter_equipment_id)
      );

      // Add to gang stash if we have the equipment data
      if (stashedEquipment) {
        queryClient.setQueryData(queryKeys.gangs.stash(gangId), (old: any[]) => [
          ...(old || []),
          { ...stashedEquipment, gang_stash: true }
        ]);
      }

      // Optimistically remove equipment effects if the equipment had any
      if (stashedEquipment?.equipment_id) {
        queryClient.setQueryData(queryKeys.fighters.effects(fighterId), (old: any) => {
          if (!old) return old;
          
          // Remove effects that were associated with this equipment
          const filteredEffects = {
            ...old,
            equipment: (old?.equipment || []).filter((effect: any) => 
              effect.type_specific_data?.equipment_id !== stashedEquipment.equipment_id
            )
          };
          
          return filteredEffects;
        });
      }

      // Return a context object with the snapshotted values
      return { previousEquipment, previousStash, previousEffects, previousTotalCost };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEquipment) {
        queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), context.previousEquipment);
      }
      if (context?.previousStash) {
        queryClient.setQueryData(queryKeys.gangs.stash(gangId), context.previousStash);
      }

      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables) => {
      // Find equipment before removing for stash update
      const stashedEquipment = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);

      // 🎯 SURGICAL CACHE INVALIDATION - Only invalidate affected caches  
      // Fighter equipment (will sync gang page automatically via shared cache)
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.equipment(fighterId) });
      
      // Gang stash and rating (affected by equipment moved to stash)
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.stash(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });

      toast({
        title: "Success",
        description: `${stashedEquipment?.equipment_name || 'Equipment'} moved to gang stash`,
      });
      setStashModalData(null);
    }
  });

  const handleDeleteEquipment = (fighterEquipmentId: string, equipmentId: string) => {
    deleteEquipmentMutation.mutate({
      fighter_equipment_id: fighterEquipmentId,
      gang_id: gangId,
      fighter_id: fighterId
    });
  };

  const handleSellEquipment = (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
    sellEquipmentMutation.mutate({
      fighter_equipment_id: fighterEquipmentId,
      manual_cost: manualCost
    });
  };

  const handleStashEquipment = (fighterEquipmentId: string, equipmentId: string) => {
    stashEquipmentMutation.mutate({
      fighter_equipment_id: fighterEquipmentId
    });
  };

  // Sort equipment: core equipment first, then by name
  const sortedEquipment = [...equipment].sort((a, b) => {
    if (a.core_equipment && !b.core_equipment) return -1;
    if (!a.core_equipment && b.core_equipment) return 1;
    return a.equipment_name.localeCompare(b.equipment_name);
  });

  // Filter equipment by type
  const weapons = sortedEquipment.filter(item => item.equipment_type === 'weapon');
  const wargear = sortedEquipment.filter(item => item.equipment_type === 'wargear');
  const vehicleUpgrades = sortedEquipment.filter(item => item.equipment_type === 'vehicle_upgrade');

  const renderRow = (item: Equipment) => (
    <tr
      key={item.fighter_equipment_id || `${item.equipment_id}-${item.equipment_name}`}
      className="border-b"
    >
      <td className="px-1 py-1">
        {item.equipment_name}
      </td>
      <td className="px-1 py-1 text-right">
        {item.purchase_cost ?? '-'}
      </td>
      <td className="px-1 py-1">
        <div className="flex justify-end gap-1">
          {!item.core_equipment && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const equipment = sortedEquipment.find(e => e.fighter_equipment_id === item.fighter_equipment_id);
                  if (equipment) {
                    setStashModalData(equipment);
                  }
                }}
                disabled={deleteEquipmentMutation.isPending || sellEquipmentMutation.isPending || stashEquipmentMutation.isPending || !userPermissions.canEdit}
                className="text-xs px-1.5 h-6"
                title="Store in Stash"
              >
                <FaBox className="h-4 w-4" /> {/* Stash */}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const equipment = sortedEquipment.find(e => e.fighter_equipment_id === item.fighter_equipment_id);
                  if (equipment) {
                    setSellModalData(equipment);
                  }
                }}
                disabled={deleteEquipmentMutation.isPending || sellEquipmentMutation.isPending || stashEquipmentMutation.isPending || !userPermissions.canEdit}
                className="text-xs px-1.5 h-6"
                title="Sell"
              >
                <MdCurrencyExchange className="h-4 w-4" /> {/* Sell */}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteModalData({
                  id: item.fighter_equipment_id,
                  equipmentId: item.equipment_id || '',
                  name: item.equipment_name
                })}
                disabled={deleteEquipmentMutation.isPending || sellEquipmentMutation.isPending || stashEquipmentMutation.isPending || !userPermissions.canEdit}
                className="text-xs px-1.5 h-6"
                title="Delete"
              >
                <LuTrash2 className="h-4 w-4" /> {/* Delete */}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const isLoading = deleteEquipmentMutation.isPending || sellEquipmentMutation.isPending || stashEquipmentMutation.isPending;

  return (
    <>
      <div className="mt-4">
        <div className="flex flex-wrap justify-between items-center mb-2">
          <h2 className="text-xl md:text-2xl font-bold">Equipment</h2>
          <Button 
            onClick={onAddEquipment}
            className="bg-black hover:bg-gray-800 text-white"
            disabled={isLoading || !userPermissions.canEdit}
          >
            Add
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(equipment?.length > 0) && (
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-1 py-1 text-left w-[75%]">Name</th>
                  <th className="px-1 py-1 text-right">Cost</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {!equipment?.length ? (
                <tr>
                  <td colSpan={3} className="text-gray-500 italic text-center py-4">
                    No equipment yet.
                  </td>
                </tr>
              ) : (
                <>
                  {weapons.map(renderRow)}
                  {vehicleUpgrades.length > 0 && weapons.length > 0 && (
                    <tr>
                      <td colSpan={3} className="border-t-8 border-gray-100 p-0" />
                    </tr>
                  )}
                  {vehicleUpgrades.map(renderRow)}
                  {wargear.length > 0 && (weapons.length > 0 || vehicleUpgrades.length > 0) && (
                    <tr>
                      <td colSpan={3} className="border-t-8 border-gray-100 p-0" />
                    </tr>
                  )}
                  {wargear.map(renderRow)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteModalData && (
        <Modal
          title="Delete Equipment"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteEquipment(deleteModalData.id, deleteModalData.equipmentId)}
        />
      )}

      {sellModalData && (
        <SellModal
          item={sellModalData}
          onClose={() => setSellModalData(null)}
          onConfirm={(manualCost) => handleSellEquipment(
            sellModalData.fighter_equipment_id,
            sellModalData.equipment_id || '',
            manualCost
          )}
        />
      )}

      {stashModalData && (
        <Modal
          title="Move to Gang Stash"
          content={`Are you sure you want to move ${stashModalData.equipment_name} to the gang stash?`}
          onClose={() => setStashModalData(null)}
          onConfirm={() => handleStashEquipment(
            stashModalData.fighter_equipment_id,
            stashModalData.equipment_id || ''
          )}
        />
      )}
    </>
  );
}
