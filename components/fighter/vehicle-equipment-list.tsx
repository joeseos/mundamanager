'use client';

import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { VehicleEquipment } from '@/types/fighter';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/lib/server-functions/sell-equipment';
import { deleteEquipmentFromFighter } from '@/app/lib/server-functions/equipment';
import { moveEquipmentToStash } from '@/app/lib/server-functions/move-to-stash';
import { MdCurrencyExchange } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

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
  const [manualCost, setManualCost] = useState(item.purchase_cost ?? item.cost ?? 0);

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<VehicleEquipment | null>(null);
  const [stashModalData, setStashModalData] = useState<VehicleEquipment | null>(null);

  // TanStack Query mutation for deleting equipment
  const deleteEquipmentMutation = useMutation({
    mutationFn: async (variables: { fighterEquipmentId: string; equipmentId: string; vehicleId?: string }) => {
      const result = await deleteEquipmentFromFighter({
        fighter_equipment_id: variables.fighterEquipmentId, // This is actually the vehicle_weapon_id value
        gang_id: gangId,
        fighter_id: fighterId,
        vehicle_id: variables.vehicleId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete equipment');
      }
      return result.data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot previous values for rollback
      const previousVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousCredits = queryClient.getQueryData(queryKeys.gangs.credits(gangId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Optimistically remove equipment from vehicle
      queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any[]) => {
        if (!old || old.length === 0) return old;
        
        return old.map((vehicle, index) => {
          if (index === 0) {
            const updatedEquipment = (vehicle.equipment || []).filter(
              (item: any) => item.vehicle_weapon_id !== variables.fighterEquipmentId
            );
            
            // Also remove associated effects
            const currentEffects = vehicle.effects || {};
            const vehicleUpgrades = currentEffects['vehicle upgrades'] || [];
            const equipmentToDelete = equipment.find(e => e.vehicle_weapon_id === variables.fighterEquipmentId);
            
            const filteredUpgrades = vehicleUpgrades.filter((effect: any) => 
              effect.effect_name !== equipmentToDelete?.equipment_name
            );
            
            const updatedEffects = {
              ...currentEffects,
              'vehicle upgrades': filteredUpgrades
            };
            
            return { ...vehicle, equipment: updatedEquipment, effects: updatedEffects };
          }
          return vehicle;
        });
      });

      return { previousVehicles, previousCredits, previousTotalCost };
    },
    onError: (err, variables, context) => {
      console.error('❌ DELETE ERROR:', err);
      
      // Rollback optimistic changes
      if (context?.previousVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousVehicles);
      }
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousCredits);
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
    onSuccess: (data, variables) => {
      console.log('✅ DELETE SUCCESS:', data);
      
      // Update with real server data if needed
      if (data.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }
      
      // Enhanced success message showing effects cleanup
      const effectsCount = data?.deleted_effects?.length || 0;
      const effectsMessage = effectsCount > 0 
        ? ` and removed ${effectsCount} associated effect${effectsCount > 1 ? 's' : ''}`
        : '';
      
      toast({
        title: "Success",
        description: `Successfully deleted ${data?.deleted_equipment?.equipment_name}${effectsMessage}`,
        variant: "default"
      });
      
      setDeleteModalData(null);
    }
  });

  const handleDeleteEquipment = (fighterEquipmentId: string, equipmentId: string) => {
    const equipmentToDelete = equipment.find(e => e.vehicle_weapon_id === fighterEquipmentId);
    if (!equipmentToDelete) {
      toast({
        title: "Error",
        description: "Equipment not found",
        variant: "destructive"
      });
      return;
    }

    deleteEquipmentMutation.mutate({
      fighterEquipmentId,
      equipmentId,
      vehicleId: equipmentToDelete.vehicle_id
    });
  };

  // TanStack Query mutation for selling equipment
  const sellEquipmentMutation = useMutation({
    mutationFn: async (variables: { fighterEquipmentId: string; manualCost: number }) => {
      const result = await sellEquipmentFromFighter({
        fighter_equipment_id: variables.fighterEquipmentId,
        manual_cost: variables.manualCost
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to sell equipment');
      }
      return result.data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot previous values for rollback
      const previousVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousCredits = queryClient.getQueryData(queryKeys.gangs.credits(gangId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Find equipment to sell for optimistic update
      const equipmentToSell = equipment.find(item => item.vehicle_weapon_id === variables.fighterEquipmentId);
      if (equipmentToSell) {
        // Optimistically remove equipment from vehicle
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any[]) => {
          if (!old || old.length === 0) return old;
          
          return old.map((vehicle, index) => {
            if (index === 0) {
              const updatedEquipment = (vehicle.equipment || []).filter(
                (item: any) => item.vehicle_weapon_id !== variables.fighterEquipmentId
              );
              
              // Also remove associated effects
              const currentEffects = vehicle.effects || {};
              const vehicleUpgrades = currentEffects['vehicle upgrades'] || [];
              
              const filteredUpgrades = vehicleUpgrades.filter((effect: any) => 
                effect.effect_name !== equipmentToSell?.equipment_name
              );
              
              const updatedEffects = {
                ...currentEffects,
                'vehicle upgrades': filteredUpgrades
              };
              
              return { ...vehicle, equipment: updatedEquipment, effects: updatedEffects };
            }
            return vehicle;
          });
        });

        // Optimistically update gang credits
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), (old: number) => {
          if (old === undefined) return old;
          return old + variables.manualCost;
        });
      }

      return { previousVehicles, previousCredits, previousTotalCost, equipmentToSell };
    },
    onError: (err, variables, context) => {
      console.error('❌ SELL ERROR:', err);
      
      // Rollback optimistic changes
      if (context?.previousVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousVehicles);
      }
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousCredits);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }
      
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to sell equipment',
        variant: "destructive"
      });
    },
    onSuccess: (data, variables, context) => {
      console.log('✅ SELL SUCCESS:', data);
      
      // Update with real server data
      if (data?.gang?.credits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), data.gang.credits);
      }
      
      if (data?.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }
      
      toast({
        title: "Success",
        description: `Sold ${context?.equipmentToSell?.equipment_name} for ${variables.manualCost} credits`,
        variant: "default"
      });
      
      setSellModalData(null);
    }
  });

  const handleSellEquipment = (fighterEquipmentId: string, equipmentId: string, manualCost: number) => {
    sellEquipmentMutation.mutate({ fighterEquipmentId, manualCost });
  };

  // TanStack Query mutation for moving equipment to stash
  const stashEquipmentMutation = useMutation({
    mutationFn: async (variables: { fighterEquipmentId: string }) => {
      const result = await moveEquipmentToStash({
        fighter_equipment_id: variables.fighterEquipmentId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to move equipment to stash');
      }
      return result.data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.stash(gangId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.totalCost(fighterId) });

      // Snapshot previous values for rollback
      const previousVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousStash = queryClient.getQueryData(queryKeys.gangs.stash(gangId));
      const previousTotalCost = queryClient.getQueryData(queryKeys.fighters.totalCost(fighterId));

      // Find equipment to move for optimistic update
      const equipmentToStash = equipment.find(item => item.vehicle_weapon_id === variables.fighterEquipmentId);
      if (equipmentToStash) {
        // Optimistically remove equipment from vehicle
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any[]) => {
          if (!old || old.length === 0) return old;
          
          return old.map((vehicle, index) => {
            if (index === 0) {
              const updatedEquipment = (vehicle.equipment || []).filter(
                (item: any) => item.vehicle_weapon_id !== variables.fighterEquipmentId
              );
              
              // Also remove associated effects
              const currentEffects = vehicle.effects || {};
              const vehicleUpgrades = currentEffects['vehicle upgrades'] || [];
              
              const filteredUpgrades = vehicleUpgrades.filter((effect: any) => 
                effect.effect_name !== equipmentToStash?.equipment_name
              );
              
              const updatedEffects = {
                ...currentEffects,
                'vehicle upgrades': filteredUpgrades
              };
              
              return { ...vehicle, equipment: updatedEquipment, effects: updatedEffects };
            }
            return vehicle;
          });
        });

        // Optimistically add equipment to stash
        queryClient.setQueryData(queryKeys.gangs.stash(gangId), (old: any[]) => {
          if (!old) return old;
          
          const optimisticStashItem = {
            fighter_equipment_id: equipmentToStash.fighter_equipment_id,
            equipment_id: equipmentToStash.equipment_id,
            equipment_name: equipmentToStash.equipment_name,
            equipment_type: equipmentToStash.equipment_type,
            equipment_category: equipmentToStash.equipment_category,
            purchase_cost: equipmentToStash.cost,
            weapon_profiles: equipmentToStash.weapon_profiles || []
          };
          
          return [...old, optimisticStashItem];
        });
      }

      return { previousVehicles, previousStash, previousTotalCost, equipmentToStash };
    },
    onError: (err, variables, context) => {
      console.error('❌ STASH ERROR:', err);
      
      // Rollback optimistic changes
      if (context?.previousVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousVehicles);
      }
      if (context?.previousStash) {
        queryClient.setQueryData(queryKeys.gangs.stash(gangId), context.previousStash);
      }
      if (context?.previousTotalCost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), context.previousTotalCost);
      }
      
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to move equipment to stash',
        variant: "destructive"
      });
    },
    onSuccess: (data, variables, context) => {
      console.log('✅ STASH SUCCESS:', data);
      
      // Update with real server data if provided
      if (data?.fighter_total_cost !== undefined) {
        queryClient.setQueryData(queryKeys.fighters.totalCost(fighterId), data.fighter_total_cost);
      }
      
      toast({
        title: "Success",
        description: `${context?.equipmentToStash?.equipment_name} moved to gang stash`,
        variant: "default"
      });
      
      setStashModalData(null);
    }
  });

  const handleStashEquipment = (fighterEquipmentId: string, equipmentId: string) => {
    stashEquipmentMutation.mutate({ fighterEquipmentId });
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
    
    if (item.equipment_type === 'vehicle_upgrade') {
      // First try to use the vehicle_upgrade_slot directly from equipment data
      if (item.vehicle_upgrade_slot) {
        slot = item.vehicle_upgrade_slot;
      } 
      // Fallback to effects-based detection for compatibility
      else if (vehicleEffects) {
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
    }

    return {
      id: item.vehicle_weapon_id,
      equipment_name: item.equipment_name,
      cost: item.purchase_cost ?? item.cost ?? 0,
      core_equipment: item.core_equipment,
      fighter_equipment_id: item.vehicle_weapon_id,
      equipment_id: item.equipment_id || "",
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
              const equipment = sortedEquipment.find(e => e.vehicle_weapon_id === item.fighter_equipment_id);
              if (equipment) {
                setStashModalData({
                  ...equipment,
                  equipment_name: item.equipment_name, // Use the name from the transformed item
                  fighter_equipment_id: item.fighter_equipment_id // Ensure the ID is correctly set
                });
              }
            },
            disabled: (item) => item.core_equipment || stashEquipmentMutation.isPending || !userPermissions.canEdit
          },
          {
            icon: <MdCurrencyExchange className="h-4 w-4" />,
            variant: 'outline',
            onClick: (item) => {
              const equipment = sortedEquipment.find(e => e.vehicle_weapon_id === item.fighter_equipment_id);
              if (equipment) {
                setSellModalData({
                  ...equipment,
                  equipment_name: item.equipment_name, // Use the name from the transformed item
                  fighter_equipment_id: item.fighter_equipment_id // Ensure the ID is correctly set
                });
              }
            },
            disabled: (item) => item.core_equipment || sellEquipmentMutation.isPending || !userPermissions.canEdit
          },
          {
            icon: <LuTrash2 className="h-4 w-4" />,
            variant: 'destructive',
            onClick: (item) => setDeleteModalData({
              id: item.fighter_equipment_id,
              equipmentId: item.equipment_id || "",
              name: item.equipment_name
            }),
            disabled: (item) => item.core_equipment || deleteEquipmentMutation.isPending || !userPermissions.canEdit
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
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone and will remove any associated stat effects.
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
            sellModalData.equipment_id || "",
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
            stashModalData.equipment_id || ""
          )}
        />
      )}
    </>
  );
} 