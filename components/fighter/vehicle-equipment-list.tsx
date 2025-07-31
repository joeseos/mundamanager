'use client';

import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../modal';
import { VehicleEquipment } from '@/types/fighter';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';
import { deleteEquipmentFromFighter } from '@/app/actions/equipment';
import { moveEquipmentToStash } from '@/app/actions/move-to-stash';
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';

interface VehicleEquipmentListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: VehicleEquipment[], newFighterCredits: number, newGangCredits: number) => void;
  equipment?: VehicleEquipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
  vehicleEffects?: any; // Add vehicle effects prop
}

interface SellModalProps {
  item: VehicleEquipment;
  onClose: () => void;
  onConfirm: (cost: number) => void;
}

function SellModal({ item, onClose, onConfirm }: SellModalProps) {
  const [manualCost, setManualCost] = useState(item.cost);

  return (
    <Modal
      title="Confirm Sale"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to sell {item.equipment_name}?</p>
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
                min="0"
              />
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={() => onConfirm(manualCost)}
    />
  );
}

export function VehicleEquipmentList({ 
  fighterId, 
  gangId, 
  gangCredits, 
  fighterCredits, 
  onEquipmentUpdate,
  equipment = [],
  onAddEquipment,
  userPermissions,
  vehicleEffects
}: VehicleEquipmentListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<VehicleEquipment | null>(null);
  const [stashModalData, setStashModalData] = useState<VehicleEquipment | null>(null);

  // Enhanced delete function using server actions with targeted cache invalidation
  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    setIsLoading(true);
    try {
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToDelete) {
        throw new Error('Equipment not found');
      }

      const result = await deleteEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        gang_id: gangId,
        fighter_id: fighterId,
        vehicle_id: equipmentToDelete.vehicle_id
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete equipment');
      }

      // Use server response data for accurate state updates
      const updatedEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      
      // Use fresh data from server response if available, otherwise fall back to calculations
      const newFighterCredits = result.data?.updatedFighter?.credits || fighterCredits;
      const newGangCredits = result.data?.updatedGang?.credits || gangCredits;
      
      onEquipmentUpdate(updatedEquipment, newFighterCredits, newGangCredits);
      
      // Enhanced success message showing effects cleanup
      const effectsCount = result.data?.deletedEffects?.length || 0;
      const effectsMessage = effectsCount > 0 
        ? ` and removed ${effectsCount} associated effect${effectsCount > 1 ? 's' : ''}`
        : '';
      
      toast({
        title: "Success",
        description: `Successfully deleted ${result.data?.deletedEquipment?.equipment_name || equipmentToDelete.equipment_name}${effectsMessage}`,
        variant: "default"
      });
      setDeleteModalData(null);
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to delete equipment',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSellEquipment = async (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
    setIsLoading(true);
    try {
      const equipmentToSell = equipment.find(
        item => item.fighter_equipment_id === fighterEquipmentId
      );
      if (!equipmentToSell) return;

      const result = await sellEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        manual_cost: manualCost
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to sell equipment');
      }

      const updatedEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const newGangCredits = result.data?.gang.credits || gangCredits;
      const newFighterCredits = fighterCredits - equipmentToSell.cost;

      onEquipmentUpdate(updatedEquipment, newFighterCredits, newGangCredits);
      
      toast({
        title: "Success",
        description: `Sold ${equipmentToSell.equipment_name} for ${manualCost} credits`,
      });
    } catch (error) {
      console.error('Error selling equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sell equipment",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setSellModalData(null);
    }
  };

  const handleStashEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    setIsLoading(true);
    try {
      const equipmentToStash = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToStash) {
        throw new Error('Equipment not found');
      }

      const result = await moveEquipmentToStash({
        fighter_equipment_id: fighterEquipmentId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to move equipment to stash');
      }

      const updatedEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      
      const newFighterCredits = fighterCredits - (equipmentToStash.cost ?? 0);

      onEquipmentUpdate(updatedEquipment, newFighterCredits, gangCredits);
      
      toast({
        title: "Success",
        description: `${equipmentToStash.equipment_name} moved to gang stash`,
      });
    } catch (error) {
      console.error('Error moving equipment to stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setStashModalData(null);
    }
  };

  // Sort equipment: core equipment first, then by name
  const sortedEquipment = [...equipment].sort((a, b) => {
    if (a.core_equipment && !b.core_equipment) return -1;
    if (!a.core_equipment && b.core_equipment) return 1;
    return a.equipment_name.localeCompare(b.equipment_name);
  });

  // Transform equipment for List component
  const listItems = sortedEquipment.map((item) => {
    // Determine slot for vehicle upgrades
    let slot = '';
    
    if (item.equipment_type === 'vehicle_upgrade' && vehicleEffects) {
      // Look for effects that match this equipment
      const vehicleUpgradeEffects = vehicleEffects['vehicle upgrades'] || vehicleEffects['vehicle_upgrades'] || [];
      const matchingEffect = vehicleUpgradeEffects.find((effect: any) => 
        effect.effect_name === item.equipment_name || 
        effect.effect_name.toLowerCase().includes(item.equipment_name.toLowerCase())
      );
      
      if (matchingEffect?.fighter_effect_modifiers) {
        const modifiers = matchingEffect.fighter_effect_modifiers;
        if (modifiers.some((mod: any) => mod.stat_name === 'body_slots' && mod.numeric_value > 0)) {
          slot = 'Body';
        } else if (modifiers.some((mod: any) => mod.stat_name === 'drive_slots' && mod.numeric_value > 0)) {
          slot = 'Drive';
        } else if (modifiers.some((mod: any) => mod.stat_name === 'engine_slots' && mod.numeric_value > 0)) {
          slot = 'Engine';
        }
      }
    }

    return {
      id: item.fighter_equipment_id,
      equipment_name: item.equipment_name,
      cost: item.cost ?? 0,
      core_equipment: item.core_equipment,
      fighter_equipment_id: item.fighter_equipment_id,
      equipment_id: item.equipment_id,
      slot: slot
    };
  });

  return (
    <>
      <List
        title="Vehicle Equipment"
        items={listItems}
        columns={[
          {
            key: 'equipment_name',
            label: 'Name',
            width: '65%'
          },
          {
            key: 'slot',
            label: 'Slot',
            width: '10%'
          },
          {
            key: 'cost',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            icon: <FaBox className="h-4 w-4" />,
            variant: 'outline',
            onClick: (item) => {
              const equipment = sortedEquipment.find(e => e.fighter_equipment_id === item.fighter_equipment_id);
              if (equipment) {
                setStashModalData(equipment);
              }
            },
            disabled: (item) => item.core_equipment || isLoading || !userPermissions.canEdit
          },
          {
            icon: <MdCurrencyExchange className="h-4 w-4" />,
            variant: 'outline',
            onClick: (item) => {
              const equipment = sortedEquipment.find(e => e.fighter_equipment_id === item.fighter_equipment_id);
              if (equipment) {
                setSellModalData(equipment);
              }
            },
            disabled: (item) => item.core_equipment || isLoading || !userPermissions.canEdit
          },
          {
            icon: <LuTrash2 className="h-4 w-4" />,
            variant: 'destructive',
            onClick: (item) => setDeleteModalData({
              id: item.fighter_equipment_id,
              equipmentId: item.equipment_id,
              name: item.equipment_name
            }),
            disabled: (item) => item.core_equipment || isLoading || !userPermissions.canEdit
          }
        ]}
        onAdd={onAddEquipment}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No vehicle equipment installed"
      />

      {deleteModalData && (
        <Modal
          title="Delete Vehicle Equipment"
          content={
            <div>
              <p>Are you sure you want to delete "{deleteModalData.name}"?</p>
              <br />
              <p>This action cannot be undone and will remove any associated stat effects.</p>
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