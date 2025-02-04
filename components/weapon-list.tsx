'use client';

import React, { useState, useEffect } from 'react';
import { FighterWeaponsTable } from './fighter-weapons-table';
import { useToast } from "@/components/ui/use-toast";
import { Button } from './ui/button';
import Modal from './modal';
import { Equipment } from '@/types/equipment';
import { createClient } from "@/utils/supabase/client";

interface WeaponListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: Equipment[], newFighterCredits: number, newGangCredits: number) => void;
  equipment?: Equipment[];
  onAddEquipment: () => void;
}

interface SellModalProps {
  item: Equipment;
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

export function WeaponList({ 
  fighterId, 
  gangId, 
  gangCredits, 
  fighterCredits, 
  onEquipmentUpdate,
  equipment = [],
  onAddEquipment
}: WeaponListProps) {
  // console.log('WeaponList props:', { fighterId, gangId, gangCredits, fighterCredits, equipment });
  
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<Equipment | null>(null);
  const [session, setSession] = useState<any>(null);
  const [stashModalData, setStashModalData] = useState<Equipment | null>(null);

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
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to delete equipment: ${response.status} ${response.statusText}`);
      }
      
      const updatedEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      const newFighterCredits = fighterCredits - (equipmentToDelete.cost ?? 0); // Use cost with fallback
      
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

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/sell_equipment_from_fighter`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            fighter_equipment_id: fighterEquipmentId,
            manual_cost: manualCost
          })
        }
      );

      if (!response.ok) throw new Error('Failed to sell equipment');

      const { equipment_sold: { sell_value = 0 } = {} } = await response.json();
      
      const updatedEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const newGangCredits = gangCredits + manualCost;
      const newFighterCredits = fighterCredits - manualCost;

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
            fighter_equipment_id: fighterEquipmentId
          })
        }
      );

      if (!response.ok) throw new Error('Failed to move equipment to stash');

      const updatedEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      
      // Adjust fighter credits
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

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Equipment</h2>
        <Button 
          onClick={onAddEquipment}
          className="bg-black hover:bg-gray-800 text-white"
        >
          Add
        </Button>
      </div>
      <FighterWeaponsTable 
        equipment={equipment} 
        onDeleteEquipment={(id, equipId) => setDeleteModalData({ 
          id, 
          equipmentId: equipId, 
          name: equipment.find(e => e.fighter_equipment_id === id)?.equipment_name || 'equipment' 
        })}
        onSellEquipment={(fighterEquipmentId, equipmentId) => {
          const item = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
          if (item) {
            setSellModalData(item);
          }
        }}
        onStashEquipment={(fighterEquipmentId, equipmentId) => {
          const item = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
          if (item) {
            setStashModalData(item);
          }
        }}
        isLoading={isLoading}
      />

      {deleteModalData && (
        <Modal
          title="Confirm Deletion"
          content={`Are you sure you want to delete ${deleteModalData.name}? This action cannot be undone.`}
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
    </div>
  );
}
