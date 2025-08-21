'use client';

import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { useSellFighterEquipment, useMoveEquipmentToStash, useDeleteFighterEquipment } from '@/lib/mutations/fighters';
import { useGetFighterEquipment } from '@/lib/queries/fighters';
import { Button } from "@/components/ui/button";
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';
import { rollD6 } from '@/utils/dice';

interface WeaponListProps {
  fighterId: string;
  gangId: string;
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
  onAddEquipment,
  userPermissions
}: WeaponListProps) {
  const { toast } = useToast();
  
  // TanStack Query hooks
  const { data: equipment = [], isLoading: equipmentLoading } = useGetFighterEquipment(fighterId);
  const sellEquipmentMutation = useSellFighterEquipment(fighterId, gangId);
  const moveToStashMutation = useMoveEquipmentToStash(fighterId, gangId);
  const deleteEquipmentMutation = useDeleteFighterEquipment(fighterId, gangId);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<Equipment | null>(null);
  const [stashModalData, setStashModalData] = useState<Equipment | null>(null);

  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    const equipmentToDelete = equipment.find(
      item => item.fighter_equipment_id === fighterEquipmentId
    );
    if (!equipmentToDelete) return;

    deleteEquipmentMutation.mutate(
      {
        fighter_equipment_id: fighterEquipmentId,
        equipment_id: equipmentId
      },
      {
        onSuccess: () => {
          // TanStack Query mutation handles optimistic updates and cache invalidation
          toast({
            description: `Successfully deleted ${equipmentToDelete.equipment_name}`,
            variant: "default"
          });
          setDeleteModalData(null);
        },
        onError: (error) => {
          console.error('Error deleting equipment:', error);
          
          toast({
            description: 'Failed to delete equipment. Please try again.',
            variant: "destructive"
          });
          setDeleteModalData(null);
        }
      }
    );
  };

  const handleSellEquipment = async (fighterEquipmentId: string, _equipmentId: string, manualCost: number) => {
    const equipmentToSell = equipment.find(
      item => item.fighter_equipment_id === fighterEquipmentId
    );
    if (!equipmentToSell) return;

    sellEquipmentMutation.mutate(
      {
        fighter_equipment_id: fighterEquipmentId,
        manual_cost: manualCost
      },
      {
        onSuccess: () => {
          // TanStack Query mutation handles optimistic updates and cache invalidation
          toast({
            title: "Success",
            description: `Sold ${equipmentToSell.equipment_name} for ${manualCost} credits`,
          });
          setSellModalData(null);
        },
        onError: (error) => {
          console.error('Error selling equipment:', error);
          
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to sell equipment",
            variant: "destructive",
          });
          setSellModalData(null);
        }
      }
    );
  };

  const handleStashEquipment = async (fighterEquipmentId: string, _equipmentId: string) => {
    const equipmentToStash = equipment.find(
      item => item.fighter_equipment_id === fighterEquipmentId
    );
    if (!equipmentToStash) return;

    moveToStashMutation.mutate(
      {
        fighter_equipment_id: fighterEquipmentId
      },
      {
        onSuccess: () => {
          // TanStack Query mutation handles optimistic updates and cache invalidation
          toast({
            title: "Success",
            description: `${equipmentToStash.equipment_name} moved to gang stash`,
          });
          setStashModalData(null);
        },
        onError: (error) => {
          console.error('Error moving equipment to stash:', error);
          
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to move equipment to stash",
            variant: "destructive",
          });
          setStashModalData(null);
        }
      }
    );
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
                disabled={sellEquipmentMutation.isPending || moveToStashMutation.isPending || deleteEquipmentMutation.isPending || !userPermissions.canEdit}
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
                disabled={sellEquipmentMutation.isPending || moveToStashMutation.isPending || deleteEquipmentMutation.isPending || !userPermissions.canEdit}
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
                  equipmentId: item.equipment_id,
                  name: item.equipment_name
                })}
                disabled={sellEquipmentMutation.isPending || moveToStashMutation.isPending || deleteEquipmentMutation.isPending || !userPermissions.canEdit}
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

  if (equipmentLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4">
        <div className="flex flex-wrap justify-between items-center mb-2">
          <h2 className="text-xl md:text-2xl font-bold">Equipment</h2>
          <Button 
            onClick={onAddEquipment}
            className="bg-black hover:bg-gray-800 text-white"
            disabled={!userPermissions.canEdit}
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
            sellModalData.equipment_id,
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
            stashModalData.equipment_id
          )}
        />
      )}
    </>
  );
}
