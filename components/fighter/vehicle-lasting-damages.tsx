import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '../ui/modal';
import { Checkbox } from "@/components/ui/checkbox";
import DiceRoller from '@/components/dice-roller';
import { rollD6 } from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import { LuTrash2 } from 'react-icons/lu';
import { addVehicleDamage } from '@/app/actions/add-vehicle-damage';
import { removeVehicleDamage, repairVehicleDamage } from '@/app/actions/remove-vehicle-damage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

type RepairCondition = "Almost like new" | "Quality repairs" | "Superficial Damage";

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
  const [repairType, setRepairType] = useState<RepairCondition>("Superficial Damage");
  const [isRepairing, setIsRepairing] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDamageId, setSelectedDamageId] = useState<string>('');
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const VEHICLE_DAMAGE_CATEGORY_ID = 'a993261a-4172-4afb-85bf-f35e78a1189f';

  // TanStack Query mutations
  const addDamageMutation = useMutation({
    mutationFn: addVehicleDamage,
    onMutate: async (variables) => {
      // Find the selected damage for optimistic update
      const selectedDamage = availableDamages.find((d: any) => d.id === variables.damageId);
      if (!selectedDamage) return { previousDamages: damages };

      // Create optimistic damage object
      const optimisticDamage: FighterEffect = {
        id: `temp-${Date.now()}`, // Temporary ID for optimistic update
        effect_name: selectedDamage.effect_name,
        fighter_effect_type_id: variables.damageId,
        fighter_effect_modifiers: selectedDamage.fighter_effect_modifiers || [],
        type_specific_data: selectedDamage.type_specific_data,
        created_at: new Date().toISOString()
      };

      // Store previous state for rollback
      const previousDamages = [...damages];

      // Optimistically update the UI
      const updatedDamages = [...damages, optimisticDamage];
      onDamageUpdate(updatedDamages);

      return { previousDamages, optimisticDamage };
    },
    onSuccess: (result, variables, context) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to add vehicle damage');
      }

      // Replace optimistic update with real data
      const realDamage: FighterEffect = {
        id: result.data.id,
        effect_name: result.data.effect_name,
        fighter_effect_type_id: result.data.effect_type?.id,
        fighter_effect_modifiers: result.data.fighter_effect_modifiers || [],
        type_specific_data: result.data.type_specific_data,
        created_at: result.data.created_at || new Date().toISOString()
      };

      // Update with real data
      const updatedDamages = damages.filter((d: FighterEffect) => d.id !== context?.optimisticDamage?.id);
      updatedDamages.push(realDamage);
      onDamageUpdate(updatedDamages);

      // Invalidate related queries in the query client
      queryClient.invalidateQueries({ queryKey: ['fighter', variables.fighterId] });
      queryClient.invalidateQueries({ queryKey: ['gang', variables.gangId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });

      toast({
        description: 'Lasting damage added successfully',
        variant: 'default'
      });
      
      setSelectedDamageId('');
      setIsAddModalOpen(false);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }

      toast({
        description: 'Failed to add lasting damage',
        variant: 'destructive'
      });
    }
  });

  const removeDamageMutation = useMutation({
    mutationFn: removeVehicleDamage,
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousDamages = [...damages];
      
      // Find the damage being removed for the toast message
      const damageToRemove = damages.find(d => d.id === variables.damageId);
      
      // Optimistically remove the damage
      const updatedDamages = damages.filter((d: FighterEffect) => d.id !== variables.damageId);
      onDamageUpdate(updatedDamages);

      return { previousDamages, damageName: damageToRemove?.effect_name || 'damage' };
    },
    onSuccess: (result, variables, context) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove vehicle damage');
      }

      // Invalidate related queries in the query client
      queryClient.invalidateQueries({ queryKey: ['fighter', variables.fighterId] });
      queryClient.invalidateQueries({ queryKey: ['gang', variables.gangId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });

      toast({
        description: `${context?.damageName} removed successfully`,
        variant: 'default'
      });

      setDeleteModalData(null);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }

      toast({
        description: 'Failed to delete lasting damage',
        variant: 'destructive'
      });

      setDeleteModalData(null);
    }
  });

  const repairDamageMutation = useMutation({
    mutationFn: repairVehicleDamage,
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousDamages = [...damages];
      const previousCredits = gangCredits;
      
      // Optimistically remove all damages
      const updatedDamages: FighterEffect[] = [];
      onDamageUpdate(updatedDamages);
      
      // Optimistically update gang credits
      if (onGangCreditsUpdate && gangCredits !== undefined) {
        onGangCreditsUpdate(gangCredits - variables.repairCost);
      } 

      return { previousDamages, previousCredits };
    },
    onSuccess: (result, variables, context) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to repair vehicle damage');
      }

      toast({
        description: `Repaired ${variables.damageIds.length} damage(s) for ${variables.repairCost} credits`,
        variant: 'default'
      });

       if (repairType === 'Almost like new') {
         const match = availableDamages.find((d: any) => d.effect_name === 'Persistent Rattle');
         const damageId = match.id;
   
         // Call handleAddDamage with the ID directly
         if (damageId) {
           addDamageMutation.mutate({
             vehicleId,
             fighterId,
             gangId,
             damageId: damageId,
             damageName: 'Persistent Rattle'
           });
         }
       }

      // Close repair modal
      setIsRepairModalOpen(false);
      setRepairCost(0);
      setRepairPercent(0);
      setRepairType("Superficial Damage")
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }
      if (context?.previousCredits !== undefined && onGangCreditsUpdate) {
        onGangCreditsUpdate(context.previousCredits);
      }

      toast({
        description: 'Failed to repair lasting damage(s)',
        variant: 'destructive'
      });

      // Reset repair modal state
      setIsRepairing(null);
    }
  });

  // Helper to check for valid UUID
  function isValidUUID(id: string) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
  }

  // Fetch available damages using TanStack Query - only when modal is opened
  const { data: availableDamages = [], isLoading: isLoadingDamages, error: damagesError } = useQuery({
    queryKey: ['vehicle-lasting-damages'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles/lasting-damage');
      if (!response.ok) {
        throw new Error('Failed to fetch lasting damage types');
      }
      return response.json();
    },
    enabled: isAddModalOpen, // Only fetch when modal is open
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes
  });

  // Show error toast if damages failed to load
  useEffect(() => {
    if (damagesError) {
      toast({
        description: 'Failed to load lasting damage types',
        variant: 'destructive'
      });
    }
  }, [damagesError, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedDamageId('');
  }, []);

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

  const handleDeleteDamage = async (damageId: string, damageName: string) => {
    if (!isValidUUID(damageId)) {
      toast({
        description: 'Cannot delete a damage that has not been saved to the server.',
        variant: "destructive"
      });
      return false;
    }
    
    removeDamageMutation.mutate({
      damageId,
      fighterId,
      gangId
    });

    return true;
  };

  const handleRepairDamage = async () => {
    if (uniqueDamages.length === 0 || gangCredits === undefined) return false;
    const damageIdsToRepair = uniqueDamages.map((d: FighterEffect) => d.id).filter(isValidUUID);
    if (damageIdsToRepair.length === 0) {
      toast({
        description: 'No valid damages to repair.',
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
      repairType,
      vehicleId,
      fighterId,
      gangId
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
              className="bg-card hover:bg-muted text-foreground border border-border"
              disabled={uniqueDamages.length === 0 || !userPermissions.canEdit}
            >
              Repair
            </Button>
            <Button 
              onClick={handleOpenModal}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
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
                  <tr className="bg-muted">
                    <th className="px-1 py-1 text-left" style={{ width: '75%' }}>Name</th>
                    <th className="px-1 py-1 text-right">Action</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {uniqueDamages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-muted-foreground italic text-center py-4">
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
                    const map: Record<number, string> = {
                      1: 'Persistent Rattle',
                      2: 'Handling Glitch',
                      3: 'Unreliable',
                      4: 'Loss of Power',
                      5: 'Damaged Bodywork',
                      6: 'Damaged Frame',
                    };
                    return map[roll as 1|2|3|4|5|6];
                  }}
                  buttonText="Roll D6"
                  disabled={!userPermissions.canEdit}
                  onRolled={(rolled) => {
                    if (rolled.length === 0) return;
                    const roll = rolled[0].roll;
                    const map: Record<number, string> = {
                      1: 'Persistent Rattle',
                      2: 'Handling Glitch',
                      3: 'Unreliable',
                      4: 'Loss of Power',
                      5: 'Damaged Bodywork',
                      6: 'Damaged Frame',
                    };
                    const name = map[roll as 1|2|3|4|5|6];
                    const match = availableDamages.find((d: any) => d.effect_name === name);
                    if (match) {
                      setSelectedDamageId(match.id);
                      toast({ description: `Roll ${roll}: ${match.effect_name}` });
                    }
                  }}
                  onRoll={(roll) => {
                    const map: Record<number, string> = {
                      1: 'Persistent Rattle',
                      2: 'Handling Glitch',
                      3: 'Unreliable',
                      4: 'Loss of Power',
                      5: 'Damaged Bodywork',
                      6: 'Damaged Frame',
                    };
                    const name = map[roll as 1|2|3|4|5|6];
                    const match = availableDamages.find((d: any) => d.effect_name === name);
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
                  disabled={isLoadingDamages}
                >
                  <option value="">
                    {isLoadingDamages 
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
                <span className="text-sm text-muted-foreground">Gang Credits</span>
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
                  {uniqueDamages.map((damage: FighterEffect) => (
                    <li key={damage.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-base">{damage.effect_name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Repair type selection */}
                <div className="space-y-2 pt-3 border-t">
                  <label htmlFor="repairTypeSelect" className="text-sm font-medium">
                    Repair Type
                  </label>
                  <DiceRoller
                    items={[
                      { id: 'repair-almost', effect_name: 'Almost like new' },
                      { id: 'repair-quality', effect_name: 'Quality repairs' },
                      { id: 'repair-superficial', effect_name: 'Superficial Damage' },
                    ]}
                    getRange={() => null}
                    getName={(i: { id: string; effect_name: string }) => i.effect_name}
                    rollFn={rollD6}
                    resolveNameForRoll={(roll) => {
                      const map: Record<number, string> = {
                        1: 'Almost like new',
                        2: 'Almost like new',
                        3: 'Almost like new',
                        4: 'Quality repairs',
                        5: 'Quality repairs',
                        6: 'Superficial Damage',
                      };
                      return map[roll as 1|2|3|4|5|6];
                    }}
                    buttonText="Roll D6"
                    inline
                    disabled={!userPermissions.canEdit}
                    onRoll={(roll) => {
                      const map: Record<number, string> = {
                        1: 'Almost like new',
                        2: 'Almost like new',
                        3: 'Almost like new',
                        4: 'Quality repairs',
                        5: 'Quality repairs',
                        6: 'Superficial Damage',
                      };
                      var name =  map[roll as 1|2|3|4|5|6];
                      if (name) {
                        toast({ description: `Roll ${roll}: ${name as typeof repairType}` });
                      }                      
                      if (name === 'Superficial Damage') {
                        setRepairType('Superficial Damage');
                        setRepairPercent(10);
                      } else if (name === 'Quality repairs') {
                        setRepairType('Quality repairs');
                        setRepairPercent(25);
                      } else if (name ==='Almost like new'){
                        setRepairType('Almost like new')
                        setRepairPercent(25) 
                      }
                    }}
                  />
                  <select
                    id="repairTypeSelect"
                    value={repairType}
                    onChange={(e) => {
                      const selectedType = e.target.value as RepairCondition;
                      setRepairType(selectedType);
                      if (selectedType === 'Superficial Damage') {
                        setRepairPercent(10);
                      } else {
                        setRepairPercent(25);
                      }
                    }}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="Almost like new">1|2|3 - Almost like new</option>
                    <option value="Quality repairs">4|5 - Quality repairs</option>
                    <option value="Superficial Damage">6 - Superficial Damage</option>
                  </select>
                </div>
                {/* Calculate vehicle cost + upgrades (excluding weapons) */}
                <div className="mt-4 flex items-center gap-2">
                  <label htmlFor="repairTotalCost" className="block text-sm font-medium text-muted-foreground">
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
          confirmDisabled={uniqueDamages.length === 0 || repairDamageMutation.isPending}
        />
      )}
    </>
  );
} 