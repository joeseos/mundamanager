import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '../ui/modal';
import { createClient } from '@/utils/supabase/client';
import { Checkbox } from "@/components/ui/checkbox";
import DiceRoller from '@/components/dice-roller';
import { rollD6 } from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import { LuTrash2 } from 'react-icons/lu';
import { addVehicleDamage } from '@/app/actions/add-vehicle-damage';
import { removeVehicleDamage } from '@/app/actions/remove-vehicle-damage';

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
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [repairCost, setRepairCost] = useState<number>(0);
  const [repairPercent, setRepairPercent] = useState<0 | 10 | 25>(0);
  const [isRepairing, setIsRepairing] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDamageId, setSelectedDamageId] = useState<string>('');
  const [availableDamages, setAvailableDamages] = useState<FighterEffect[]>([]);
  const [isLoadingDamages, setIsLoadingDamages] = useState(false);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const { toast } = useToast();

  const VEHICLE_DAMAGE_CATEGORY_ID = 'a993261a-4172-4afb-85bf-f35e78a1189f';

  // Helper to check for valid UUID
  function isValidUUID(id: string) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
  }

  const fetchAvailableDamages = useCallback(async () => {
    if (isLoadingDamages) return;
    try {
      setIsLoadingDamages(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('fighter_effect_types')
        .select('*')
        .eq('fighter_effect_category_id', VEHICLE_DAMAGE_CATEGORY_ID)
        .order('effect_name');
      if (error) throw error;
      setAvailableDamages(data || []);
    } catch (error) {
      toast({
        description: 'Failed to load lasting damage types',
        variant: "destructive"
      });
    } finally {
      setIsLoadingDamages(false);
    }
  }, [isLoadingDamages, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
    if (availableDamages.length === 0) {
      fetchAvailableDamages();
    }
  }, [availableDamages.length, fetchAvailableDamages]);

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

    try {
      // Find the selected damage name for logging
      const selectedDamage = availableDamages.find(d => d.id === selectedDamageId);
      const damageName = selectedDamage?.effect_name || 'Unknown damage';
      
      const result = await addVehicleDamage({
        vehicleId,
        fighterId,
        gangId,
        damageId: selectedDamageId,
        damageName
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add vehicle damage');
      }

      // The server action returns JSON data with the complete damage information
      const damageData = result.data;
      
      // Create the new damage object using the data returned from the server action
      const newDamage: FighterEffect = {
        id: damageData.id,
        effect_name: damageData.effect_name,
        fighter_effect_type_id: damageData.effect_type?.id,
        fighter_effect_modifiers: damageData.fighter_effect_modifiers || [],
        type_specific_data: damageData.type_specific_data,
        created_at: damageData.created_at || new Date().toISOString()
      };

      // Optimistic update: Add the new damage to the list
      const updatedDamages = [...damages, newDamage];
      onDamageUpdate(updatedDamages);
      
      toast({
        description: 'Lasting damage added successfully',
        variant: "default"
      });
      
      setSelectedDamageId('');
      setIsAddModalOpen(false);
      return true;
    } catch (error) {
      console.error('Error adding lasting damage:', error);
      toast({
        description: 'Failed to add lasting damage',
        variant: "destructive"
      });
      return false;
    }
  };

  const handleDeleteDamage = async (damageId: string, damageName: string) => {
    if (!isValidUUID(damageId)) {
      toast({
        description: 'Cannot delete a damage that has not been saved to the server.',
        variant: "destructive"
      });
      return false;
    }
    
    try {
      setIsDeleting(damageId);
      
      const result = await removeVehicleDamage({
        damageId,
        fighterId,
        gangId
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove vehicle damage');
      }
      
      // Optimistic update: Remove the damage from the list
      const updatedDamages = damages.filter(d => d.id !== damageId);
      onDamageUpdate(updatedDamages);
      
      toast({
        description: `${damageName} removed successfully`,
        variant: "default"
      });
      return true;
    } catch (error) {
      console.error('Error deleting lasting damage:', error);
      toast({
        description: 'Failed to delete lasting damage',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsDeleting(null);
      setDeleteModalData(null);
    }
  };

  const handleRepairDamage = async () => {
    if (uniqueDamages.length === 0 || gangCredits === undefined) return false;
    const damageIdsToRepair = uniqueDamages.map(d => d.id).filter(isValidUUID);
    if (damageIdsToRepair.length === 0) {
      toast({
        description: 'No valid damages to repair.',
        variant: 'destructive'
      });
      return false;
    }
    
    try {
      setIsRepairing('batch');
      const supabase = createClient();
      if (gangCredits < repairCost) {
        toast({
          description: `Not enough gang credits to repair these damages. Repair cost: ${repairCost}, Available credits: ${gangCredits}`,
          variant: 'destructive'
        });
        return false;
      }
      
      const { data, error } = await supabase.rpc('repair_vehicle_damage', {
        damage_ids: damageIdsToRepair,
        repair_cost: repairCost,
        in_user_id: (await supabase.auth.getSession()).data.session?.user?.id
      });
      
      if (error) throw error;
      
      // Optimistic update: Remove repaired damages from the list
      const updatedDamages = damages.filter(d => !damageIdsToRepair.includes(d.id));
      onDamageUpdate(updatedDamages);
      
      // Update gang credits
      if (onGangCreditsUpdate) {
        onGangCreditsUpdate(gangCredits - repairCost);
      }
      
      toast({
        description: `Repaired ${damageIdsToRepair.length} damage(s) for ${repairCost} credits`,
        variant: 'default'
      });
      return true;
    } catch (error) {
      console.error('Error repairing lasting damage:', error);
      toast({
        description: 'Failed to repair lasting damage(s)',
        variant: 'destructive'
      });
      return false;
    } finally {
      setIsRepairing(null);
      setRepairCost(0);
    }
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
                              disabled={isDeleting === damage.id || !userPermissions.canEdit}
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
                  ensureItems={availableDamages.length === 0 ? fetchAvailableDamages : undefined}
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
                    const match = availableDamages.find(d => (d as any).effect_name === name);
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
                    const match = availableDamages.find(d => (d as any).effect_name === name);
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
                  {availableDamages.map((damage) => (
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
          confirmDisabled={!selectedDamageId}
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