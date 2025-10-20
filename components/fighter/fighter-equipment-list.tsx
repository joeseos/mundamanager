'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';
import { moveEquipmentToStash } from '@/app/actions/move-to-stash';
import { deleteEquipmentFromFighter, buyEquipmentForFighter } from '@/app/actions/equipment';
import { Button } from "@/components/ui/button";
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';
import { rollD6 } from '@/utils/dice';

interface WeaponListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number) => void;
  equipment?: Equipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
  onRegisterPurchase?: (fn: (payload: { params: any; item: Equipment }) => void) => void;
}

interface SellModalProps {
  item: Equipment;
  onClose: () => void;
  onConfirm: (cost: number) => void;
}

function SellModal({ item, onClose, onConfirm }: SellModalProps) {
  const originalCost = item.cost ?? 0;
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
              className="px-3 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Cost
              </label>
              <input
                type="number"
                value={manualCost}
                onChange={(e) => setManualCost(Number(e.target.value))}
                className="w-full p-2 border rounded-md"
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum 5 credits</p>
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={() => { onConfirm(Math.max(5, Number(manualCost) || 0)); return true; }}
    />
  );
}

export function WeaponList({ 
  fighterId, 
  gangId, 
  gangCredits, 
  fighterCredits, 
  onEquipmentUpdate,
  equipment = [],
  onAddEquipment,
  userPermissions,
  onRegisterPurchase
}: WeaponListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<Equipment | null>(null);
  const [stashModalData, setStashModalData] = useState<Equipment | null>(null);

  // Optimistic purchase mutation wired from here; modal delegates via onPurchaseRequest
  const purchaseMutation = {
    mutate: async ({ params, item }: { params: any; item: Equipment }) => {
      // Snapshot state for rollback
      const previousEquipment = [...equipment];
      const previousFighterCredits = fighterCredits;
      const previousGangCredits = gangCredits;

      // Compute optimistic rating cost guess
      const isWeapon = item.equipment_type === 'weapon';
      const isMaster = Boolean(params.master_crafted && isWeapon);
      const useBaseForRating = Boolean(params.use_base_cost_for_rating);
      const baseForRating = item.adjusted_cost ?? item.cost ?? 0;
      const appliedRatingCost = useBaseForRating ? baseForRating : (params.manual_cost || baseForRating);
      const ratingCostGuess = isMaster
        ? Math.ceil((appliedRatingCost * 1.25) / 5) * 5
        : appliedRatingCost;

      // Apply optimistic UI update: add temp item and adjust credits
      const tempId = `temp-${Date.now()}`;
      const optimisticEquipment: Equipment = {
        ...item,
        fighter_equipment_id: tempId,
        cost: ratingCostGuess,
        is_master_crafted: isMaster ? true : item.is_master_crafted,
      } as Equipment;

      try {
        // Optimistically update UI
        onEquipmentUpdate(
          [...previousEquipment, optimisticEquipment],
          previousFighterCredits + ratingCostGuess,
          previousGangCredits - (params.manual_cost || 0)
        );

        // Execute server action (authoritative; triggers server cache-tags)
        const result = await buyEquipmentForFighter(params);
        if (!result.success) {
          throw new Error(result.error || 'Failed to buy equipment');
        }

        const data = result.data;
        const newGangCredits = data?.updategangsCollection?.records?.[0]?.credits ?? previousGangCredits;
        const serverRatingCost = data?.rating_cost ?? ratingCostGuess;
        const newEquipmentId = data?.insertIntofighter_equipmentCollection?.records?.[0]?.id;

        // Replace temp with real item and reconcile credits
        const updated = [...previousEquipment, {
          ...item,
          fighter_equipment_id: newEquipmentId || tempId,
          cost: serverRatingCost,
          is_master_crafted: Boolean(data?.insertIntofighter_equipmentCollection?.records?.[0]?.is_master_crafted) || isMaster,
          equipment_effect: data?.equipment_effect
        } as Equipment];

        onEquipmentUpdate(updated, previousFighterCredits + serverRatingCost, newGangCredits);

        toast({
          title: 'Equipment purchased',
          description: `Successfully bought ${item.equipment_name} for ${params.manual_cost || serverRatingCost} credits`,
          variant: 'default'
        });
      } catch (err) {
        // Rollback
        onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to buy equipment',
          variant: 'destructive'
        });
      }
    }
  };

  // Register purchase handler for parent (so ItemModal can delegate and close immediately)
  useEffect(() => {
    if (onRegisterPurchase) {
      onRegisterPurchase((payload) => purchaseMutation.mutate(payload));
    }
  }, [onRegisterPurchase, equipment, fighterCredits, gangCredits]);

  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      // Find the equipment before deleting
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToDelete) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits
      const optimisticEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      const optimisticFighterCredits = previousFighterCredits - (equipmentToDelete.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

      // Execute server action
      const result = await deleteEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        gang_id: gangId,
        fighter_id: fighterId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete equipment');
      }

      // Reconcile with server-provided fighter total cost if available
      const serverFighterTotal = result.data?.updatedFighterTotalCost as number | null | undefined;
      const finalFighterCredits = typeof serverFighterTotal === 'number' 
        ? serverFighterTotal 
        : optimisticFighterCredits;

      onEquipmentUpdate(optimisticEquipment, finalFighterCredits, previousGangCredits);

      toast({
        description: `Successfully deleted ${equipmentToDelete.equipment_name}`,
        variant: "default"
      });
      setDeleteModalData(null);
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error deleting equipment:', error);
      toast({
        description: 'Failed to delete equipment. Please try again.',
        variant: "destructive"
      });
    }
  };

  const handleSellEquipment = async (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      const equipmentToSell = equipment.find(
        item => item.fighter_equipment_id === fighterEquipmentId
      );
      if (!equipmentToSell) throw new Error('Equipment not found');

      // Optimistic UI: remove item, adjust fighter and gang credits
      const optimisticEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const optimisticFighterCredits = previousFighterCredits - (equipmentToSell.cost ?? 0);
      const optimisticGangCredits = previousGangCredits + Math.max(5, manualCost || 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, optimisticGangCredits);

      // Server action
      const result = await sellEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        manual_cost: manualCost
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to sell equipment');
      }

      const reconciledGangCredits = result.data?.gang?.credits ?? optimisticGangCredits;
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, reconciledGangCredits);
      
      toast({
        title: "Success",
        description: `Sold ${equipmentToSell.equipment_name} for ${Math.max(5, manualCost || 0)} credits`,
      });
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error selling equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sell equipment",
        variant: "destructive",
      });
    } finally {
      setSellModalData(null);
    }
  };

  const handleStashEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      // Find the equipment before moving to stash
      const equipmentToStash = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToStash) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits (gang credits unchanged)
      const optimisticEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const optimisticFighterCredits = previousFighterCredits - (equipmentToStash.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

      // Server action
      const result = await moveEquipmentToStash({
        fighter_equipment_id: fighterEquipmentId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to move equipment to stash');
      }

      toast({
        title: "Success",
        description: `${equipmentToStash.equipment_name} moved to gang stash`,
      });
    } catch (error) {
      // Rollback on error
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error moving equipment to stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    } finally {
      setStashModalData(null);
    }
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
        {item.cost ?? '-'}
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
                disabled={isLoading || !userPermissions.canEdit}
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
                disabled={isLoading || !userPermissions.canEdit}
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
                disabled={isLoading || !userPermissions.canEdit}
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-secondary animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
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
            className="bg-neutral-900 hover:bg-gray-800 text-white"
            disabled={isLoading || !userPermissions.canEdit}
          >
            Add
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(equipment?.length > 0) && (
              <thead>
                <tr className="bg-muted">
                  <th className="px-1 py-1 text-left w-[75%]">Name</th>
                  <th className="px-1 py-1 text-right">Cost</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {!equipment?.length ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground italic text-center py-4">
                    No equipment yet.
                  </td>
                </tr>
              ) : (
                <>
                  {weapons.map(renderRow)}
                  {vehicleUpgrades.length > 0 && weapons.length > 0 && (
                    <tr>
                      <td colSpan={3} className="p-0 border-t-8 border-muted" />
                    </tr>
                  )}
                  {vehicleUpgrades.map(renderRow)}
                  {wargear.length > 0 && (weapons.length > 0 || vehicleUpgrades.length > 0) && (
                    <tr>
                      <td colSpan={3} className="p-0 border-t-8 border-muted" />
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
          onConfirm={() => { void handleDeleteEquipment(deleteModalData.id, deleteModalData.equipmentId); return true; }}
        />
      )}

      {sellModalData && (
        <SellModal
          item={sellModalData}
          onClose={() => setSellModalData(null)}
          onConfirm={(manualCost) => { void handleSellEquipment(
            sellModalData.fighter_equipment_id,
            sellModalData.equipment_id,
            manualCost
          ); }}
        />
      )}

      {stashModalData && (
        <Modal
          title="Move to Gang Stash"
          content={`Are you sure you want to move ${stashModalData.equipment_name} to the gang stash?`}
          onClose={() => setStashModalData(null)}
          onConfirm={() => { void handleStashEquipment(
            stashModalData.fighter_equipment_id,
            stashModalData.equipment_id
          ); return true; }}
        />
      )}
    </>
  );
}
