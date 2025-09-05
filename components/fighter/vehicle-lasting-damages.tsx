import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '../ui/modal';
import { Checkbox } from "@/components/ui/checkbox";
import DiceRoller from '@/components/dice-roller';
import { rollD6, resolveVehicleDamageFromUtil } from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import { LuTrash2 } from 'react-icons/lu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addVehicleDamage, removeVehicleDamage, repairVehicleDamage } from '@/app/lib/server-functions/vehicle-damage';
import { queryKeys } from '@/app/lib/queries/keys';

interface VehicleDamagesListProps {
  damages: Array<FighterEffect>;
  onDamageUpdate: (updatedDamages: FighterEffect[]) => void;
  fighterId: string;
  vehicleId: string;
  gangId: string;
  vehicle: any; // Pass the full vehicle object for cost calculation
  gangCredits?: number;
  onGangCreditsUpdate?: (newCredits: number) => void;
  userPermissions: UserPermissions;
}

export function VehicleDamagesList({ 
  damages = [],
  onDamageUpdate,
  fighterId,
  vehicleId,
  gangId,
  vehicle,
  gangCredits,
  onGangCreditsUpdate,
  userPermissions
}: VehicleDamagesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [repairCost, setRepairCost] = useState<number>(0);
  const [repairPercent, setRepairPercent] = useState<0 | 10 | 25>(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDamageId, setSelectedDamageId] = useState<string>('');
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const VEHICLE_DAMAGE_CATEGORY_ID = 'a993261a-4172-4afb-85bf-f35e78a1189f';


  // Query for available vehicle damages using the API route (includes complete modifier data)
  const { data: availableDamages = [], isLoading: isLoadingDamages } = useQuery({
    queryKey: ['vehicle-damages', 'available'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles/lasting-damages');
      if (!response.ok) {
        throw new Error('Failed to fetch vehicle damages');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: isAddModalOpen, // Only fetch when modal is open
  });

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedDamageId('');
  }, []);

  // Mutation for adding vehicle damage
  const addDamageMutation = useMutation({
    mutationFn: addVehicleDamage,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // Snapshot the previous values
      const previousVehicleEffects = queryClient.getQueryData(queryKeys.vehicles.effects(vehicleId));
      const previousFighterVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousGangRating = queryClient.getQueryData(queryKeys.gangs.rating(gangId));
      
      // Find the damage being added for optimistic update
      const damageToAdd = availableDamages.find((damage: any) => damage.id === variables.damageId);
      
      if (damageToAdd) {
        // Optimistically add the damage (with temporary ID)
        const optimisticDamage = {
          id: `temp-damage-${Date.now()}`, // Temporary ID for optimistic update
          effect_name: damageToAdd.effect_name,
          fighter_effect_type_id: damageToAdd.id,
          fighter_effect_modifiers: damageToAdd.fighter_effect_modifiers || [],
          type_specific_data: damageToAdd.type_specific_data,
          created_at: new Date().toISOString(),
        };
        
        // Update TanStack Query cache - this will trigger re-renders
        queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            damages: [...(old.damages || []), optimisticDamage]
          };
        });
        
        // Also update fighter vehicles cache which might contain the damage data
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any) => {
          if (!old) return old;
          return old.map((vehicle: any) => {
            if (vehicle.id === vehicleId) {
              return {
                ...vehicle,
                effects: {
                  ...vehicle.effects,
                  'lasting damages': [...(vehicle.effects?.['lasting damages'] || []), optimisticDamage]
                }
              };
            }
            return vehicle;
          });
        });
      }
      
      return { previousVehicleEffects, previousFighterVehicles, previousGangRating };
    },
    onSuccess: (result, variables) => {
      toast({
        description: 'Lasting damage added successfully',
        variant: "default"
      });
      
      // Clear modal state
      setSelectedDamageId('');
      setIsAddModalOpen(false);
      
      // Invalidate queries to get fresh data with real IDs - this will replace optimistic updates
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousVehicleEffects) {
        queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), context.previousVehicleEffects);
      }
      if (context?.previousFighterVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousFighterVehicles);
      }
      if (context?.previousGangRating) {
        queryClient.setQueryData(queryKeys.gangs.rating(gangId), context.previousGangRating);
      }
      
      toast({
        description: `Failed to add lasting damage: ${error.message}`,
        variant: "destructive"
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure correct data
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
    },
  });

  const handleAddDamage = async () => {
    if (!selectedDamageId) {
      toast({
        description: "Please select a lasting damage",
        variant: "destructive"
      });
      return false;
    }

    // Find the selected damage name for logging
    const selectedDamage = availableDamages.find((d: any) => d.id === selectedDamageId);
    const damageName = selectedDamage?.effect_name || 'Unknown damage';
    
    addDamageMutation.mutate({
      vehicleId,
      fighterId,
      gangId,
      damageId: selectedDamageId,
      damageName
    });
    
    return true;
  };

  // Mutation for removing vehicle damage
  const removeDamageMutation = useMutation({
    mutationFn: removeVehicleDamage,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      // Snapshot the previous values
      const previousVehicleEffects = queryClient.getQueryData(queryKeys.vehicles.effects(vehicleId));
      const previousFighterVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousGangRating = queryClient.getQueryData(queryKeys.gangs.rating(gangId));
      
      // Update TanStack Query cache to remove the damage - this will trigger re-renders
      queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          damages: old.damages?.filter((damage: any) => damage.id !== variables.damageId) || []
        };
      });
      
      // Also update fighter vehicles cache
      queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any) => {
        if (!old) return old;
        return old.map((vehicle: any) => {
          if (vehicle.id === vehicleId) {
            return {
              ...vehicle,
              effects: {
                ...vehicle.effects,
                'lasting damages': vehicle.effects?.['lasting damages']?.filter((damage: any) => damage.id !== variables.damageId) || []
              }
            };
          }
          return vehicle;
        });
      });
      
      return { previousVehicleEffects, previousFighterVehicles, previousGangRating };
    },
    onSuccess: (result, variables) => {
      const damageName = deleteModalData?.name || 'Lasting damage';
      toast({
        description: `${damageName} removed successfully`,
        variant: "default"
      });
      
      // Invalidate queries to get fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      
      setDeleteModalData(null);
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousVehicleEffects) {
        queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), context.previousVehicleEffects);
      }
      if (context?.previousFighterVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousFighterVehicles);
      }
      if (context?.previousGangRating) {
        queryClient.setQueryData(queryKeys.gangs.rating(gangId), context.previousGangRating);
      }
      
      toast({
        description: `Failed to delete lasting damage: ${error.message}`,
        variant: "destructive"
      });
      setDeleteModalData(null);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure correct data
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
    },
  });

  const handleDeleteDamage = (damageId: string, damageName: string) => {
    removeDamageMutation.mutate({
      damageId,
      fighterId,
      gangId
    });
    
    return true;
  };

  // Mutation for repairing vehicle damages
  const repairDamageMutation = useMutation({
    mutationFn: repairVehicleDamage,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      
      // Snapshot the previous values
      const previousVehicleEffects = queryClient.getQueryData(queryKeys.vehicles.effects(vehicleId));
      const previousFighterVehicles = queryClient.getQueryData(queryKeys.fighters.vehicles(fighterId));
      const previousGangCredits = queryClient.getQueryData(queryKeys.gangs.credits(gangId));
      
      // Optimistically remove all damages being repaired
      queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          damages: old.damages?.filter((damage: any) => !variables.damageIds.includes(damage.id)) || []
        };
      });
      
      // Also update fighter vehicles cache
      queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), (old: any) => {
        if (!old) return old;
        return old.map((vehicle: any) => {
          if (vehicle.id === vehicleId) {
            return {
              ...vehicle,
              effects: {
                ...vehicle.effects,
                'lasting damages': vehicle.effects?.['lasting damages']?.filter((damage: any) => !variables.damageIds.includes(damage.id)) || []
              }
            };
          }
          return vehicle;
        });
      });
      
      // Optimistically update gang credits
      if (gangCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), gangCredits - variables.repairCost);
        if (onGangCreditsUpdate) {
          onGangCreditsUpdate(gangCredits - variables.repairCost);
        }
      }
      
      return { previousVehicleEffects, previousFighterVehicles, previousGangCredits };
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        toast({
          description: `Repaired ${result.data.repairedCount} damage(s) for ${variables.repairCost} credits`,
          variant: 'default'
        });
        
        // Update gang credits with actual value from server
        if (onGangCreditsUpdate) {
          onGangCreditsUpdate(result.data.newGangCredits);
        }
      }
      
      // Invalidate queries to get fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });
      
      setIsRepairModalOpen(false);
      setRepairCost(0);
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousVehicleEffects) {
        queryClient.setQueryData(queryKeys.vehicles.effects(vehicleId), context.previousVehicleEffects);
      }
      if (context?.previousFighterVehicles) {
        queryClient.setQueryData(queryKeys.fighters.vehicles(fighterId), context.previousFighterVehicles);
      }
      if (context?.previousGangCredits !== undefined) {
        queryClient.setQueryData(queryKeys.gangs.credits(gangId), context.previousGangCredits);
        if (onGangCreditsUpdate && typeof context.previousGangCredits === 'number') {
          onGangCreditsUpdate(context.previousGangCredits);
        }
      }
      
      toast({
        description: `Failed to repair damages: ${error.message}`,
        variant: 'destructive'
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure correct data
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.effects(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(fighterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });
    },
  });

  const handleRepairDamage = async () => {
    if (uniqueDamages.length === 0 || gangCredits === undefined) return false;
    const damageIdsToRepair = uniqueDamages.map(d => d.id);
    
    if (damageIdsToRepair.length === 0) {
      toast({
        description: 'No damages to repair.',
        variant: 'destructive'
      });
      return false;
    }
    
    if (gangCredits < repairCost) {
      toast({
        description: `Not enough gang credits to repair these damages. Repair cost: ${repairCost}, Available credits: ${gangCredits}`,
        variant: 'destructive'
      });
      return false;
    }
    
    repairDamageMutation.mutate({
      damageIds: damageIdsToRepair,
      repairCost,
      gangId,
      fighterId,
      vehicleId
    });
    
    return true;
  };

  // Deduplicate damages by id before rendering to avoid React key warnings
  const uniqueDamages = Array.isArray(damages)
    ? damages.filter((d, idx, arr) => arr.findIndex(x => x.id === d.id) === idx)
    : damages;

  // Calculate vehicle cost + upgrades (excluding weapons)
  useEffect(() => {
    if (!isRepairModalOpen) return;
    if (!vehicle) {
      setRepairCost(0);
      return;
    }
    const vehicleBaseCost = vehicle.cost || 0;
    const upgrades = (vehicle.equipment || []).filter((eq: any) => eq.equipment_type !== 'weapon');
    const upgradesCost = upgrades.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
    const total = vehicleBaseCost + upgradesCost;
    let cost = 0;
    if (repairPercent === 10) {
      cost = Math.ceil((total * 0.10) / 5) * 5;
    } else if (repairPercent === 25) {
      cost = Math.ceil((total * 0.25) / 5) * 5;
    }
    setRepairCost(cost);
  }, [isRepairModalOpen, repairPercent, vehicle]);

  return (
    <>
      {/* Custom header with both Add and Repair buttons */}
      <div className="mt-6">
        <div className="flex flex-wrap justify-between items-center mb-2">
          <h2 className="text-xl md:text-2xl font-bold">Lasting Damage</h2>
          <div className="flex gap-2">
            <Button 
              onClick={() => setIsRepairModalOpen(true)}
              className="bg-white hover:bg-gray-100 text-black border border-gray-300"
              disabled={uniqueDamages.length === 0 || !userPermissions.canEdit}
            >
              Repair
            </Button>
            <Button 
              onClick={handleOpenModal}
              className="bg-black hover:bg-gray-800 text-white"
              disabled={!userPermissions.canEdit}
            >
              Add
            </Button>
          </div>
        </div>

        {/* List component without header */}
        <div>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              {(uniqueDamages.length > 0) && (
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-1 py-1 text-left" style={{ width: '75%' }}>Name</th>
                    <th className="px-1 py-1 text-right">Action</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {uniqueDamages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-gray-500 italic text-center py-4">
                      No lasting damage yet.
                    </td>
                  </tr>
                ) : (
                  uniqueDamages
                    .sort((a, b) => {
                      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return dateA - dateB;
                    })
                    .map((damage) => (
                      <tr key={damage.id} className="border-t">
                        <td className="px-1 py-1">{damage.effect_name}</td>
                        <td className="px-1 py-1">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteModalData({
                                id: damage.id,
                                name: damage.effect_name
                              })}
                              disabled={removeDamageMutation.isPending || !userPermissions.canEdit}
                              className="text-xs px-1.5 h-6"
                              title="Delete"
                            >
                              <LuTrash2 className="h-4 w-4" /> {/* Delete */}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <Modal
          title="Add Lasting Damage"
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                  items={availableDamages}
                  ensureItems={undefined}
                  getRange={(i: FighterEffect) => null}
                  getName={(i: FighterEffect) => (i as any).effect_name}
                  inline
                  rollFn={rollD6}
                  resolveNameForRoll={(roll) => {
                    return resolveVehicleDamageFromUtil(roll);
                  }}
                  buttonText="Roll D6"
                  disabled={!userPermissions.canEdit}
                  onRolled={(rolled) => {
                    if (rolled.length === 0) return;
                    const roll = rolled[0].roll;
                    const name = resolveVehicleDamageFromUtil(roll);
                    const match = availableDamages.find((d: any) => (d as any).effect_name === name);
                    if (match) {
                      setSelectedDamageId(match.id);
                      toast({ description: `Roll ${roll}: ${match.effect_name}` });
                    }
                  }}
                  onRoll={(roll) => {
                    const name = resolveVehicleDamageFromUtil(roll);
                    const match = availableDamages.find((d: any) => (d as any).effect_name === name);
                    if (match) {
                      setSelectedDamageId(match.id);
                      toast({ description: `Roll ${roll}: ${match.effect_name}` });
                    }
                  }}
                />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="damageSelect" className="text-sm font-medium">
                  Lasting Damage
                </label>
                <select
                  id="damageSelect"
                  value={selectedDamageId}
                  onChange={(e) => setSelectedDamageId(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoadingDamages && availableDamages.length === 0}
                >
                  <option value="">
                    {isLoadingDamages && availableDamages.length === 0 
                      ? "Loading damages..." 
                      : "Select a Lasting Damage"
                    }
                  </option>
                  {availableDamages.map((damage: any) => (
                    <option key={damage.id} value={damage.id}>
                      {damage.effect_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleAddDamage}
          confirmText="Add Lasting Damage"
          confirmDisabled={!selectedDamageId || addDamageMutation.isPending}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Lasting Damage"
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
          onConfirm={() => handleDeleteDamage(deleteModalData.id, deleteModalData.name)}
        />
      )}

      {isRepairModalOpen && (
        <Modal
          title="Repair Damage"
          headerContent={
            gangCredits !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Gang Credits</span>
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                  {gangCredits}
                </span>
              </div>
            )
          }
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">The following damages will be repaired:</label>
                <ul className="divide-y divide-gray-200 mb-4">
                  {uniqueDamages.map(damage => (
                    <li key={damage.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-base">{damage.effect_name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Repair cost percentage checkboxes */}
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox
                      checked={repairPercent === 10}
                      onCheckedChange={() => {
                        if (repairPercent === 10) {
                          setRepairPercent(0);
                          setRepairCost(0);
                        } else {
                          setRepairPercent(10);
                        }
                      }}
                    />
                    <span className="text-sm">10%</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox
                      checked={repairPercent === 25}
                      onCheckedChange={() => {
                        if (repairPercent === 25) {
                          setRepairPercent(0);
                          setRepairCost(0);
                        } else {
                          setRepairPercent(25);
                        }
                      }}
                    />
                    <span className="text-sm">25%</span>
                  </label>
                </div>
                {/* Calculate vehicle cost + upgrades (excluding weapons) */}
                <div className="mt-4 flex items-center gap-2">
                  <label htmlFor="repairTotalCost" className="block text-sm font-medium text-gray-700">
                    Total Cost
                  </label>
                  <input
                    id="repairTotalCost"
                    type="number"
                    min="0"
                    value={repairCost}
                    onChange={e => setRepairCost(Number(e.target.value))}
                    className="w-24 p-2 border rounded focus:ring-2 focus:ring-black focus:border-black text-base"
                  />
                </div>
              </div>
            </div>
          }
          onClose={() => {
            setIsRepairModalOpen(false);
          }}
          onConfirm={handleRepairDamage}
          confirmText="Repair"
          confirmDisabled={uniqueDamages.length === 0}
        />
      )}
    </>
  );
} 