import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '../ui/modal';
import { Checkbox } from "@/components/ui/checkbox";
import DiceRoller from '@/components/dice-roller';
import { rollD6, resolveVehicleDamageFromUtil, getVehicleDamageRollForName, resolveVehicleRepairFromUtil, getVehicleRepairRollForName, VEHICLE_REPAIR_TABLE } from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import { LuTrash2 } from 'react-icons/lu';
import { addVehicleDamage } from '@/app/actions/add-vehicle-damage';
import { removeVehicleDamage, repairVehicleDamage } from '@/app/actions/remove-vehicle-damage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Combobox } from '@/components/ui/combobox';

interface VehicleDamagesListProps {
  damages: Array<FighterEffect>;
  /** When true, open the Add Lasting Damage modal on mount (e.g. from gang card floating menu) */
  initialOpenAddModal?: boolean;
  /** When true, render only the add form (no list). Use when opening directly from gang card menu. */
  addFormOnly?: boolean;
  /** When addFormOnly, called when user cancels or after successful add (closes parent modal). */
  onRequestClose?: () => void;
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

// Static array of repair types based on VEHICLE_REPAIR_TABLE
const repairTypes = VEHICLE_REPAIR_TABLE.map((entry) => ({
  id: `repair-${entry.name.toLowerCase().replace(/\s+/g, '-')}`,
  effect_name: entry.name,
  range: entry.range
}));

export function VehicleDamagesList({ 
  damages = [],
  initialOpenAddModal = false,
  addFormOnly = false,
  onRequestClose,
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
  const [selectedRepairTypeId, setSelectedRepairTypeId] = useState<string>('');
  
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
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to add vehicle damage');
      }

      // Replace optimistic damage with real one from server so delete uses real id
      const realDamage: FighterEffect = {
        id: result.data.id,
        effect_name: result.data.effect_name,
        fighter_effect_type_id: result.data.effect_type?.id,
        fighter_effect_modifiers: result.data.fighter_effect_modifiers || [],
        type_specific_data: result.data.type_specific_data,
        created_at: result.data.created_at || new Date().toISOString()
      };

      if (context?.previousDamages && onDamageUpdate) {
        onDamageUpdate([...context.previousDamages, realDamage]);
      }

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
      if (addFormOnly) onRequestClose?.();
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

      // If repair type is "Almost like new", add "Persistent Rattle" damage
      if (variables.repairType === 'Almost like new') {
        try {
          const match = availableDamages.find((d: any) => d.effect_name === 'Persistent Rattle');
          const damageId = match?.id;
  
          // Call addDamageMutation with the ID directly
          if (damageId) {
            addDamageMutation.mutate({
              vehicleId,
              fighterId,
              gangId,
              damageId: damageId,
              damageName: 'Persistent Rattle'
            });
          } else {
            console.warn('Persistent Rattle damage type not found in availableDamages');
          }
        } catch (error) {
          console.error('Error adding Persistent Rattle:', error);
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

  // Helper function to format vehicle damage range (D6 roll value)
  const formatVehicleDamageRange = (damageName: string): string => {
    const roll = getVehicleDamageRollForName(damageName);
    return roll ? `${roll}` : '';
  };

  // Helper function to format vehicle repair range (D6 roll range)
  const formatVehicleRepairRange = (repairName: string): string => {
    const entry = VEHICLE_REPAIR_TABLE.find((e) => e.name === repairName);
    if (!entry) return '';
    const [min, max] = entry.range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Fetch available damages using TanStack Query - when add modal or repair modal is opened
  const { data: availableDamages = [], isLoading: isLoadingDamages, error: damagesError } = useQuery({
    queryKey: ['vehicle-lasting-damages'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles/lasting-damage');
      if (!response.ok) {
        throw new Error('Failed to fetch lasting damage types');
      }
      return response.json();
    },
    enabled: isAddModalOpen || isRepairModalOpen, // Fetch when either modal is open
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

  // When opened from gang card floating menu, open the Add modal instead of showing the list first
  useEffect(() => {
    if (initialOpenAddModal) {
      setIsAddModalOpen(true);
    }
  }, [initialOpenAddModal]);

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

  // When opened directly from gang card menu, render only the add form (no list, no inner modal)
  if (addFormOnly) {
    return (
      <div className="space-y-4">
        <div>
          <DiceRoller
            items={availableDamages}
            ensureItems={undefined}
            getRange={(i: FighterEffect) => {
              const roll = getVehicleDamageRollForName((i as any).effect_name);
              return roll ? { min: roll, max: roll } : null;
            }}
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
              if (name) {
                const match = availableDamages.find((d: any) => d.effect_name === name);
                if (match) {
                  setSelectedDamageId(match.id);
                  toast({ description: `Roll ${roll}: ${match.effect_name}` });
                }
              }
            }}
            onRoll={(roll) => {
              const name = resolveVehicleDamageFromUtil(roll);
              if (name) {
                const match = availableDamages.find((d: any) => d.effect_name === name);
                if (match) {
                  setSelectedDamageId(match.id);
                  toast({ description: `Roll ${roll}: ${match.effect_name}` });
                }
              }
            }}
          />
        </div>
        <div className="space-y-2 pt-3 border-t">
          <label htmlFor="damageSelect" className="text-sm font-medium">
            Lasting Damage
          </label>
          <Combobox
            value={selectedDamageId}
            onValueChange={(value) => {
              setSelectedDamageId(value);
            }}
            placeholder={isLoadingDamages && availableDamages.length === 0
              ? "Loading damages..."
              : "Select a Lasting Damage"
            }
            disabled={isLoadingDamages && availableDamages.length === 0}
            options={availableDamages
              .slice()
              .sort((a: any, b: any) => {
                const rollA = getVehicleDamageRollForName(a.effect_name);
                const rollB = getVehicleDamageRollForName(b.effect_name);
                if (!rollA && !rollB) return 0;
                if (!rollA) return 1;
                if (!rollB) return -1;
                return rollA - rollB;
              })
              .map((damage: any) => {
                const range = formatVehicleDamageRange(damage.effect_name);
                const displayText = range ? `${range} ${damage.effect_name}` : damage.effect_name;
                return {
                  value: damage.id,
                  label: range ? (
                    <>
                      <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{damage.effect_name}
                    </>
                  ) : damage.effect_name,
                  displayValue: displayText
                };
              })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onRequestClose} disabled={addDamageMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAddDamage()}
            disabled={!selectedDamageId || addDamageMutation.isPending}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
          >
            Add Lasting Damage
          </Button>
        </div>
      </div>
    );
  }

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
          title="Lasting Damage"
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                  items={availableDamages}
                  ensureItems={undefined}
                  getRange={(i: FighterEffect) => {
                    const roll = getVehicleDamageRollForName((i as any).effect_name);
                    return roll ? { min: roll, max: roll } : null;
                  }}
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
                    if (name) {
                      const match = availableDamages.find((d: any) => d.effect_name === name);
                      if (match) {
                        setSelectedDamageId(match.id);
                        toast({ description: `Roll ${roll}: ${match.effect_name}` });
                      }
                    }
                  }}
                  onRoll={(roll) => {
                    const name = resolveVehicleDamageFromUtil(roll);
                    if (name) {
                      const match = availableDamages.find((d: any) => d.effect_name === name);
                      if (match) {
                        setSelectedDamageId(match.id);
                        toast({ description: `Roll ${roll}: ${match.effect_name}` });
                      }
                    }
                  }}
                />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="damageSelect" className="text-sm font-medium">
                  Lasting Damage
                </label>
                <Combobox
                  value={selectedDamageId}
                  onValueChange={(value) => {
                    setSelectedDamageId(value);
                  }}
                  placeholder={isLoadingDamages && availableDamages.length === 0
                    ? "Loading damages..."
                    : "Select a Lasting Damage"
                  }
                  disabled={isLoadingDamages && availableDamages.length === 0}
                  options={availableDamages
                    .slice()
                    .sort((a: any, b: any) => {
                      // Sort by D6 roll value (1-6)
                      const rollA = getVehicleDamageRollForName(a.effect_name);
                      const rollB = getVehicleDamageRollForName(b.effect_name);
                      
                      if (!rollA && !rollB) return 0;
                      if (!rollA) return 1;
                      if (!rollB) return -1;
                      
                      return rollA - rollB;
                    })
                    .map((damage: any) => {
                      const range = formatVehicleDamageRange(damage.effect_name);
                      const displayText = range ? `${range} ${damage.effect_name}` : damage.effect_name;
                      return {
                        value: damage.id,
                        label: range ? (
                          <>
                            <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{damage.effect_name}
                          </>
                        ) : damage.effect_name,
                        displayValue: displayText
                      };
                    })}
                />
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
                <div className="overflow-x-auto mb-4">
                  <table className="w-full table-auto">
                    <tbody>
                      {uniqueDamages.map((damage: FighterEffect) => (
                        <tr key={damage.id} className="border-t">
                          <td className="px-1 py-1">{damage.effect_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Repair type selection */}
                <div className="space-y-2 pt-3 border-t">
                  <label htmlFor="repairTypeSelect" className="text-sm font-medium">
                    Repair Type
                  </label>
                  <DiceRoller
                    items={repairTypes}
                    getRange={(i: { id: string; effect_name: string; range: [number, number] }) => {
                      const [min, max] = i.range;
                      return { min, max };
                    }}
                    getName={(i: { id: string; effect_name: string }) => i.effect_name}
                    rollFn={rollD6}
                    resolveNameForRoll={(roll) => {
                      return resolveVehicleRepairFromUtil(roll);
                    }}
                    buttonText="Roll D6"
                    inline
                    disabled={!userPermissions.canEdit}
                    onRolled={(rolled) => {
                      if (rolled.length === 0) return;
                      const roll = rolled[0].roll;
                      const name = resolveVehicleRepairFromUtil(roll);
                      if (name) {
                        const match = repairTypes.find((r) => r.effect_name === name);
                        if (match) {
                          setSelectedRepairTypeId(match.id);
                          setRepairType(name as RepairCondition);
                          if (name === 'Superficial Damage') {
                            setRepairPercent(10);
                          } else {
                            setRepairPercent(25);
                          }
                          toast({ description: `Roll ${roll}: ${name}` });
                        }
                      }
                    }}
                    onRoll={(roll) => {
                      const name = resolveVehicleRepairFromUtil(roll);
                      if (name) {
                        const match = repairTypes.find((r) => r.effect_name === name);
                        if (match) {
                          setSelectedRepairTypeId(match.id);
                          setRepairType(name as RepairCondition);
                          if (name === 'Superficial Damage') {
                            setRepairPercent(10);
                          } else {
                            setRepairPercent(25);
                          }
                          toast({ description: `Roll ${roll}: ${name}` });
                        }
                      }
                    }}
                  />
                  <Combobox
                    value={selectedRepairTypeId}
                    onValueChange={(value) => {
                      setSelectedRepairTypeId(value);
                      const selectedRepair = repairTypes.find((r) => r.id === value);
                      if (selectedRepair) {
                        const selectedType = selectedRepair.effect_name as RepairCondition;
                        setRepairType(selectedType);
                        if (selectedType === 'Superficial Damage') {
                          setRepairPercent(10);
                        } else {
                          setRepairPercent(25);
                        }
                      }
                    }}
                    placeholder="Select a Repair Type"
                    options={repairTypes
                      .slice()
                      .sort((a, b) => {
                        // Sort by range minimum value
                        const minA = a.range[0];
                        const minB = b.range[0];
                        return minA - minB;
                      })
                      .map((repair) => {
                        const range = formatVehicleRepairRange(repair.effect_name);
                        const displayText = range ? `${range} ${repair.effect_name}` : repair.effect_name;
                        return {
                          value: repair.id,
                          label: range ? (
                            <>
                              <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{repair.effect_name}
                            </>
                          ) : repair.effect_name,
                          displayValue: displayText
                        };
                      })}
                  />
                </div>
                {/* Calculate vehicle cost + upgrades (excluding weapons) */}
                <div className="mt-4">
                  <div className="flex items-center gap-2">
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
                  {selectedRepairTypeId && (
                    <p className={`mt-2 text-xs ${repairType === 'Almost like new' ? 'text-amber-700' : ''}`}>
                      {repairType === 'Almost like new' 
                        ? 'All Lasting Damage will be replaced with a Persistent Rattle.'
                        : 'All Lasting Damage will be repaired.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          }
          onClose={() => {
            setIsRepairModalOpen(false);
            setSelectedRepairTypeId('');
            setRepairCost(0);
            setRepairPercent(0);
            setRepairType("Superficial Damage");
          }}
          onConfirm={handleRepairDamage}
          confirmText="Repair"
          confirmDisabled={uniqueDamages.length === 0 || repairDamageMutation.isPending}
        />
      )}
    </>
  );
} 