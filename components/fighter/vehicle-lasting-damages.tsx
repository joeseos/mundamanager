import { useState, useCallback, useEffect } from 'react';
import { Button } from '../ui/button';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '../ui/use-toast';
import Modal from '../modal';
import { createClient } from '@/utils/supabase/client';
import { Checkbox } from "@/components/ui/checkbox";

interface VehicleDamagesListProps {
  damages: Array<FighterEffect>;
  onDeleteDamage: (damageId: string) => Promise<boolean | void>;
  fighterId: string;
  vehicleId: string;
  vehicle: any; // Pass the full vehicle object for cost calculation
  setDamages: React.Dispatch<React.SetStateAction<FighterEffect[]>>;
  gangCredits?: number;
  setGangCredits: React.Dispatch<React.SetStateAction<number>>;
  onDamageAdded?: (newDamage: FighterEffect) => void;
  onGangCreditsChange?: (newCredits: number) => void;
}

export function VehicleDamagesList({ 
  damages = [],
  onDeleteDamage,
  fighterId,
  vehicleId,
  vehicle,
  setDamages,
  gangCredits,
  setGangCredits,
  onDamageAdded,
  onGangCreditsChange,
}: VehicleDamagesListProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [repairModalData, setRepairModalData] = useState<{ id: string; name: string } | null>(null);
  const [repairCost, setRepairCost] = useState<number>(0);
  const [repairPercent, setRepairPercent] = useState<0 | 10 | 25>(0);
  const [isRepairing, setIsRepairing] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDamageId, setSelectedDamageId] = useState<string>('');
  const [availableDamages, setAvailableDamages] = useState<FighterEffect[]>([]);
  const [isLoadingDamages, setIsLoadingDamages] = useState(false);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [selectedRepairId, setSelectedRepairId] = useState<string>('');
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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('No authenticated user');
      }
      const { data, error } = await supabase
        .rpc('add_vehicle_effect', {
          in_vehicle_id: vehicleId,
          in_fighter_effect_type_id: selectedDamageId,
          in_user_id: session.user.id,
          in_fighter_effect_category_id: VEHICLE_DAMAGE_CATEGORY_ID
        });
      if (error) throw error;
      toast({
        description: 'Lasting damage added successfully',
        variant: "default"
      });
      setSelectedDamageId('');
      setIsAddModalOpen(false);
      if (data && data.id && isValidUUID(data.id)) {
        if (onDamageAdded) onDamageAdded({ ...data });
      }
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
      const supabase = createClient();
      const { error } = await supabase
        .from('fighter_effects')
        .delete()
        .eq('id', damageId);
      if (error) throw error;
      setDamages(prev => prev.filter(d => d.id !== damageId));
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
      setDamages(prev => prev.filter(d => !damageIdsToRepair.includes(d.id)));
      setGangCredits(prev => prev - repairCost);
      if (onGangCreditsChange) onGangCreditsChange(gangCredits - repairCost);
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
      setRepairModalData(null);
      setRepairCost(0);
    }
  };

  const calculateRepairCost = (damage: FighterEffect): number => {
    // If the damage has specific repair cost data in type_specific_data, use that
    if (damage.type_specific_data && typeof damage.type_specific_data === 'object' && 'repair_cost' in damage.type_specific_data) {
      return Number(damage.type_specific_data.repair_cost);
    }
    
    // Otherwise calculate based on fighter_effect_modifiers - more severe damages cost more
    let baseCost = 10; // Base repair cost
    
    if (damage.fighter_effect_modifiers && damage.fighter_effect_modifiers.length > 0) {
      // Add cost based on modifier severity
      damage.fighter_effect_modifiers.forEach(modifier => {
        const value = Math.abs(Number(modifier.numeric_value));
        // Higher modifiers = higher repair costs
        baseCost += value * 5;
      });
    }
    
    return Math.round(baseCost);
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
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-xl md:text-2xl font-bold">Lasting Damage</h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setIsRepairModalOpen(true)}
            className="bg-white hover:bg-gray-100 text-black border border-gray-300"
          >
            Repair
          </Button>
          <Button 
            onClick={handleOpenModal}
            className="bg-black hover:bg-gray-800 text-white"
          >
            Add
          </Button>
        </div>
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(damages.length > 0) && (
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-1 py-1 text-left">Name</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {uniqueDamages.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-gray-500 italic text-center">
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
                      <td className="px-1 py-1">
                        <span>{damage.effect_name}</span>
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteModalData({
                              id: damage.id,
                              name: damage.effect_name
                            })}
                            disabled={isDeleting === damage.id}
                            className="text-xs px-1.5 h-6"
                          >
                            Delete
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

      {isAddModalOpen && (
        <Modal
          title="Add Lasting Damage"
          content={
            <div className="space-y-4">
              <div className="space-y-2">
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
              <p>Are you sure you want to delete "{deleteModalData.name}"?</p>
              <br />
              <p>This action cannot be undone.</p>
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
    </div>
  );
} 