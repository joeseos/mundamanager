'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';
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
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to delete equipment',
        variant: "destructive"
      });
    },
    onSuccess: (data) => {
      // Strategic updates: Remove deleted item from cache instead of full refetch
      queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), (old: Equipment[]) => 
        (old || []).filter(e => e.fighter_equipment_id !== data.deleted_equipment.id)
      );

      // Update fighter total cost if provided in response
      if (data.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }

      // Only invalidate fighter details if needed (for rating updates, etc.)
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });

      toast({
        title: "Success",
        description: `Successfully deleted ${data.deleted_equipment?.equipment_name || 'equipment'}`,
        variant: "default"
      });
      setDeleteModalData(null);
    }
  });

  const sellEquipmentMutation = useMutation({
    mutationFn: sellEquipmentFromFighter,
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to sell equipment",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables) => {
      // Strategic updates: Remove sold item and update credits
      queryClient.setQueryData(queryKeys.fighters.equipment(fighterId), (old: Equipment[]) => 
        (old || []).filter(e => e.fighter_equipment_id !== variables.fighter_equipment_id)
      );

      // Update gang credits with sale proceeds (we know the amount from variables.manual_cost)
      queryClient.setQueryData(queryKeys.gangs.credits(gangId), (old: number) => 
        (old || 0) + (variables.manual_cost || 0)
      );

      // Only invalidate fighter details for rating updates
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });

      // Find equipment name from current equipment list for display
      const soldEquipment = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);
      
      toast({
        title: "Success",
        description: `Sold ${soldEquipment?.equipment_name || 'equipment'} for ${variables.manual_cost || 0} credits`,
      });
      setSellModalData(null);
    }
  });

  const stashEquipmentMutation = useMutation({
    mutationFn: moveEquipmentToStash,
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables) => {
      // Find equipment before removing for stash update
      const stashedEquipment = equipment.find(e => e.fighter_equipment_id === variables.fighter_equipment_id);

      // Strategic updates: Remove from fighter equipment and add to stash
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

      // Only invalidate fighter details for rating updates
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });

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
