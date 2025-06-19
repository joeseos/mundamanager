'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../modal';
import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';
import { createClient } from "@/utils/supabase/client";
import { List } from "../ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';

interface VehicleEquipmentListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: VehicleEquipment[], newFighterCredits: number, newGangCredits: number) => void;
  equipment?: VehicleEquipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
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
  userPermissions
}: VehicleEquipmentListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<VehicleEquipment | null>(null);
  const [session, setSession] = useState<any>(null);
  const [stashModalData, setStashModalData] = useState<VehicleEquipment | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    getSession();
  }, []);

  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    setIsLoading(true);
    try {
      // Find the equipment cost before deleting
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToDelete) {
        throw new Error('Equipment not found');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_equipment?id=eq.${fighterEquipmentId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to delete equipment: ${response.status} ${response.statusText}`);
      }
      
      const updatedEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      const newFighterCredits = fighterCredits - (equipmentToDelete.cost ?? 0);
      
      onEquipmentUpdate(updatedEquipment, newFighterCredits, gangCredits);
      
      toast({
        description: `Successfully deleted ${equipmentToDelete.equipment_name}`,
        variant: "default"
      });
      setDeleteModalData(null);
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast({
        description: 'Failed to delete equipment. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSellEquipment = async (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
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
      // Find the equipment cost before moving to stash
      const equipmentToStash = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToStash) {
        throw new Error('Equipment not found');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/move_to_gang_stash`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            in_fighter_equipment_id: fighterEquipmentId,
            in_user_id: session.user.id
          })
        }
      );

      if (!response.ok) throw new Error('Failed to move equipment to stash');

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
  const listItems = sortedEquipment.map((item) => ({
    id: item.fighter_equipment_id,
    equipment_name: item.equipment_name,
    cost: item.cost ?? 0,
    core_equipment: item.core_equipment,
    fighter_equipment_id: item.fighter_equipment_id,
    equipment_id: item.equipment_id
  }));

  return (
    <>
      <List
        title="Vehicle Equipment"
        items={listItems}
        columns={[
          {
            key: 'equipment_name',
            label: 'Name',
            width: '75%'
          },
          {
            key: 'cost',
            label: 'Cost',
            align: 'right'
          }
        ]}
        actions={[
          {
            label: 'Stash',
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
            label: 'Sell',
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
            label: 'Delete',
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
              <p>This action cannot be undone.</p>
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