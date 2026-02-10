'use client';

import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import Modal from '../ui/modal';
import { VehicleEquipment } from '@/types/fighter';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { sellEquipmentFromFighter } from '@/app/actions/sell-equipment';
import { buyEquipmentForFighter } from '@/app/actions/equipment';
import { deleteEquipmentFromFighter } from '@/app/actions/equipment';
import { moveEquipmentToStash } from '@/app/actions/move-to-stash';
import { fitWeaponToHardpoint, updateVehicleHardpoint } from '@/app/actions/vehicle-hardpoints';
import { MdCurrencyExchange, MdOutlineLinkOff } from 'react-icons/md';
import { FaBox } from 'react-icons/fa';
import { LuTrash2 } from 'react-icons/lu';
import { EquipmentTooltipTrigger, EquipmentTooltip } from '@/components/equipment-tooltip';
import { Equipment } from '@/types/equipment';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';

interface VehicleEquipmentListProps {
  fighterId: string;
  gangId: string;
  gangCredits: number;
  fighterCredits: number;
  onEquipmentUpdate: (updatedEquipment: VehicleEquipment[], newFighterCredits: number, newGangCredits: number) => void;
  equipment?: VehicleEquipment[];
  onAddEquipment: () => void;
  userPermissions: UserPermissions;
  vehicleEffects?: any;
  vehicleId: string;
  onRegisterPurchase?: (fn: (payload: { params: any; item: any }) => void) => void;
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
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
      onConfirm={() => { onConfirm(manualCost); return true; }}
    />
  );
}

interface FitWeaponModalProps {
  weaponName: string;
  currentHardpointId: string | null;
  hardpoints: Array<{
    id: string;
    effect_name: string;
    fitted_weapon_name: string;
    fitted_weapon_id?: string;
    operated_by: string;
    arcs: string[];
    default_arcs: string[];
    credits_increase: number;
    location: string;
  }>;
  equipment: VehicleEquipment[];
  gangCredits: number;
  vehicleId: string;
  gangId: string;
  onClose: () => void;
  onConfirm: (hardpointEffectId: string, weaponEquipmentId: string) => Promise<void>;
}

const ALL_ARCS = ['Front', 'Left', 'Right', 'Rear'];

function FitWeaponModal({
  weaponName,
  currentHardpointId,
  hardpoints,
  equipment,
  gangCredits,
  vehicleId,
  gangId,
  onClose,
  onConfirm
}: FitWeaponModalProps) {
  const { toast } = useToast();
  const [selectedHardpointId, setSelectedHardpointId] = useState<string | null>(currentHardpointId);
  const [editedArcs, setEditedArcs] = useState<string[]>([]);
  const [editedOperatedBy, setEditedOperatedBy] = useState<'crew' | 'passenger'>('crew');
  const [editedLocation, setEditedLocation] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>('');
  const [modalHardpoints, setModalHardpoints] = useState(hardpoints);

  // Keep local hardpoints view in sync with incoming props when modal is (re)opened
  React.useEffect(() => {
    setModalHardpoints(hardpoints);
  }, [hardpoints]);

  // Auto-select weapon when weaponName is provided (user came from clicking "Fit to hardpoint" on a weapon)
  React.useEffect(() => {
    if (weaponName && equipment.length > 0) {
      const weapon = equipment.find(eq => eq.equipment_name === weaponName && eq.equipment_type === 'weapon');
      if (weapon) {
        setSelectedWeaponId(weapon.fighter_equipment_id);
      }
    }
  }, [weaponName, equipment]);

  // Sync edit state when selection changes
  React.useEffect(() => {
    if (selectedHardpointId) {
      const hp = hardpoints.find(h => h.id === selectedHardpointId);
      if (hp) {
        setEditedArcs(hp.arcs);
        setEditedOperatedBy(hp.operated_by as 'crew' | 'passenger');
        setEditedLocation(hp.location || '');
        // Don't reset weapon selection if weaponName was provided (user came from weapon selection)
        if (!weaponName) {
          setSelectedWeaponId(''); // Reset weapon selection when hardpoint changes
        }
      }
    }
  }, [selectedHardpointId, hardpoints, weaponName]);

  const selected = hardpoints.find(hp => hp.id === selectedHardpointId);
  const hasWeaponFitted = !!selected?.fitted_weapon_name && selected.fitted_weapon_name !== '—' && selected.fitted_weapon_name !== '';

  // Get all fitted weapon IDs
  const fittedWeaponIds = new Set(
    modalHardpoints
      .map(hp => hp.fitted_weapon_id)
      .filter((id): id is string => !!id)
  );

  // Filter available weapons (weapons that are not fitted to any hardpoint)
  const availableWeapons = equipment.filter(
    eq => eq.equipment_type === 'weapon' && !fittedWeaponIds.has(eq.fighter_equipment_id)
  );

  const weaponOptions = availableWeapons.map(weapon => ({
    value: weapon.fighter_equipment_id,
    label: weapon.equipment_name
  }));

  // Cost calculations
  const defaultArcsCount = selected?.default_arcs?.length || 0;
  const currentCost = selected?.credits_increase || 0;
  const newCost = Math.max(0, editedArcs.length - defaultArcsCount) * 15;
  const costDelta = newCost - currentCost;
  const insufficientCredits = costDelta > 0 && gangCredits < costDelta;

  // Check if arcs/operated_by/location have changed from current values
  const hasArcChanges = selected && (
    editedOperatedBy !== selected.operated_by ||
    editedArcs.length !== selected.arcs.length ||
    !editedArcs.every(a => selected.arcs.includes(a)) ||
    editedLocation !== (selected.location || '')
  );

  const handleArcToggle = (arc: string, checked: boolean) => {
    setEditedArcs(prev => {
      if (checked) {
        return [...prev, arc];
      } else {
        // Don't allow removing last arc
        if (prev.length === 1) return prev;
        return prev.filter(a => a !== arc);
      }
    });
  };

  // Handle unfitting weapon instantly
  const handleUnfitWeapon = async (hardpointId: string) => {
    if (!hardpointId || isSaving) return;
    setIsSaving(true);
    try {
      const unfitResult = await fitWeaponToHardpoint({
        vehicleId,
        hardpointEffectId: hardpointId,
        weaponEquipmentId: '',  // empty = unfit
        gangId
      });
      if (!unfitResult.success) throw new Error(unfitResult.error || 'Failed to unfit weapon');
      
      toast({ title: 'Weapon unfitted', description: 'Weapon has been removed from hardpoint', variant: 'default' });
      setIsSaving(false);
      // Note: Modal stays open so user can continue editing or fit another weapon
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to unfit weapon', variant: 'destructive' });
      setIsSaving(false);
    }
  };

  // Save all changes: arc/layout updates plus any weapon changes across hardpoints
  const handleSave = async () => {
    if (!selectedHardpointId || insufficientCredits) return;
    setIsSaving(true);
    try {
      // Save arc changes if any
      if (hasArcChanges) {
        const updateResult = await updateVehicleHardpoint({
          vehicleId,
          effectId: selectedHardpointId,
          gangId,
          operated_by: editedOperatedBy,
          arcs: editedArcs,
          location: editedLocation
        });
        if (!updateResult.success) throw new Error(updateResult.error || 'Failed to update hardpoint');
      }

      // Persist any weapon changes after arc/layout updates
      const weaponChanges = modalHardpoints
        .map(hp => {
          const original = hardpoints.find(orig => orig.id === hp.id);
          const originalWeaponId = original?.fitted_weapon_id || '';
          const newWeaponId = hp.fitted_weapon_id || '';
          return {
            hardpointId: hp.id,
            originalWeaponId,
            newWeaponId
          };
        })
        .filter(change => change.originalWeaponId !== change.newWeaponId);

      for (const change of weaponChanges) {
        await onConfirm(change.hardpointId, change.newWeaponId);
      }

      toast({ title: 'Changes saved', variant: 'default' });
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' });
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Edit Hardpoints"
      content={
        <div className="space-y-4">
          {/* Hardpoints table */}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="w-4 pl-3 py-2"></th>
                  <th className="text-left px-1 md:px-2 py-2">
                    <span className="md:hidden">Loc.</span>
                    <span className="hidden md:inline">Location</span>
                  </th>
                  <th className="text-left px-1 md:px-2 py-2">
                    <span className="md:hidden">Oper.</span>
                    <span className="hidden md:inline">Operator</span>
                  </th>
                  <th className="text-left px-1 md:px-2 py-2">Arc</th>
                  <th className="text-left px-1 md:px-2 py-2">Weapon</th>
                  <th className="text-left px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {modalHardpoints.map(hp => {
                  const hasWeapon = hp.fitted_weapon_name && hp.fitted_weapon_name !== '—' && hp.fitted_weapon_name !== '';
                  return (
                    <tr
                      key={hp.id}
                      className={`border-t cursor-pointer ${selectedHardpointId === hp.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedHardpointId(hp.id)}
                    >
                      <td className="w-4 pl-2 py-2">
                        <input type="radio" checked={selectedHardpointId === hp.id} onChange={() => setSelectedHardpointId(hp.id)} />
                      </td>
                      <td className={`px-1 py-2 ${hp.location ? '' : 'text-muted-foreground'}`}>
                        <span className="block max-w-[5ch] md:max-w-none truncate">
                          {hp.location || '—'}
                        </span>
                      </td>
                      <td className="px-1  py-2 capitalize">
                        <span className="block max-w-[5ch] md:max-w-none truncate">
                          {hp.operated_by}
                        </span>
                      </td>
                      <td className={`px-1 md:px-2 py-2 max-w-[3rem] ${hp.arcs?.length ? '' : 'text-muted-foreground'}`}>
                        {hp.arcs?.length ? hp.arcs.join(', ') : '—'}
                      </td>
                      <td
                        className={`px-1 md:px-2 py-2 text-ellipsis overflow-hidden ${hasWeapon ? '' : 'text-muted-foreground'}`}
                        title={hasWeapon ? hp.fitted_weapon_name : undefined}
                      >
                        {hasWeapon ? hp.fitted_weapon_name : '-'}
                      </td>
                      <td className="px-1 md:px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {hasWeapon && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-xs py-0"
                            variant="default"
                            onClick={() => handleUnfitWeapon(hp.id)}
                            disabled={isSaving}
                            title="Unfit Weapon"
                          >
                            <MdOutlineLinkOff className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Hardpoint settings - shown when a hardpoint is selected */}
          {selectedHardpointId && (
            <div className="space-y-4">
              {/* Location */}
              <div>
                <label className="block text-sm font-medium mb-2">Location</label>
                <input
                  type="text"
                  value={editedLocation}
                  onChange={(e) => setEditedLocation(e.target.value)}
                  className="w-full p-2 border rounded-md text-sm"
                  placeholder="e.g. hull, rear platform"
                />
              </div>

              {/* Operated By and Arcs side by side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Operated By */}
                <div>
                  <label className="block text-sm font-medium mb-2">Operated By</label>
                  <div className="flex flex-col gap-2">
                    {(['crew', 'passenger'] as const).map(op => (
                      <label key={op} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={editedOperatedBy === op}
                          onChange={() => setEditedOperatedBy(op)}
                        />
                        <span className="capitalize">{op}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Arcs */}
                <div>
                  <label className="block text-sm font-medium mb-2">Arcs</label>
                  <div className="space-y-2">
                    {ALL_ARCS.map(arc => {
                      const isDefault = selected?.default_arcs?.includes(arc);
                      const isChecked = editedArcs.includes(arc);
                      return (
                        <div key={arc} className="flex items-center space-x-2">
                          <Checkbox
                            id={`arc-${arc}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => handleArcToggle(arc, !!checked)}
                            disabled={editedArcs.length === 1 && isChecked}
                          />
                          <label htmlFor={`arc-${arc}`} className="text-sm cursor-pointer">{arc}</label>
                          {!isDefault && (
                            <span className="text-sm text-muted-foreground">+15 credits</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Fit a Weapon to this Hardpoint */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Fit a Weapon to this Hardpoint
                  {hasWeaponFitted &&
                    selected?.fitted_weapon_name &&
                    weaponOptions.some(option => option.value === selectedWeaponId) && (
                      <span className="block md:inline text-xs text-muted-foreground md:ml-1">
                        (this will replace <strong>{selected.fitted_weapon_name}</strong>)
                      </span>
                    )}
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Combobox
                      options={weaponOptions}
                      value={selectedWeaponId}
                      onValueChange={setSelectedWeaponId}
                      placeholder="Select a Weapon"
                      disabled={isSaving}
                    />
                  </div>
                  {selectedWeaponId && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!selectedHardpointId || !selectedWeaponId) return;
                        const selectedWeapon = equipment.find(
                          eq => eq.fighter_equipment_id === selectedWeaponId && eq.equipment_type === 'weapon'
                        );
                        if (!selectedWeapon) return;

                        // Update local hardpoints view to reflect the pending fit
                        setModalHardpoints(prev =>
                          prev.map(hp =>
                            hp.id === selectedHardpointId
                              ? {
                                  ...hp,
                                  fitted_weapon_id: selectedWeapon.fighter_equipment_id,
                                  fitted_weapon_name: selectedWeapon.equipment_name
                                }
                              : hp
                          )
                        );
                      }}
                      disabled={isSaving || insufficientCredits}
                    >
                      Fit to Hardpoint
                    </Button>
                  )}
                </div>
              </div>

              {insufficientCredits && (
                <div className="text-red-600 text-sm font-medium">Insufficient credits!</div>
              )}
            </div>
          )}
        </div>
      }
      onClose={onClose}
      onConfirm={handleSave}
      confirmDisabled={selectedHardpointId === null || isSaving || insufficientCredits}
      confirmText="Save"
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
  vehicleEffects,
  vehicleId,
  onRegisterPurchase
}: VehicleEquipmentListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; equipmentId: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<VehicleEquipment | null>(null);
  const [stashModalData, setStashModalData] = useState<VehicleEquipment | null>(null);
  const [fitWeaponData, setFitWeaponData] = useState<{
    weaponEquipmentId: string;
    weaponName: string;
  } | null>(null);

  // Optimistic purchase mutation for vehicle equipment delegated from modal
  const purchaseMutation = {
    mutate: async ({ params, item }: { params: any; item: any }) => {
      const previousEquipment = [...equipment];
      const previousFighterCredits = fighterCredits;
      const previousGangCredits = gangCredits;

      // rating cost guess (no master-crafted for vehicle upgrades)
      const baseForRating = item.adjusted_cost ?? item.cost ?? 0;
      const appliedRatingCost = params.use_base_cost_for_rating ? baseForRating : (params.manual_cost ?? baseForRating);
      const ratingCostGuess = appliedRatingCost;

      const tempId = `temp-${Date.now()}`;
      const optimisticItem: VehicleEquipment = {
        fighter_equipment_id: tempId,
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name,
        equipment_type: item.equipment_type,
        cost: ratingCostGuess,
        core_equipment: false,
        vehicle_id: params.vehicle_id,
        vehicle_equipment_id: tempId
      } as VehicleEquipment;

      try {
        // Optimistic UI: add item and adjust fighter/gang credits
        onEquipmentUpdate(
          [...previousEquipment, optimisticItem],
          previousFighterCredits + ratingCostGuess,
          previousGangCredits - (params.manual_cost || 0)
        );

        const result = await buyEquipmentForFighter(params);
        if (!result.success) {
          throw new Error(result.error || 'Failed to buy vehicle equipment');
        }

        const data = result.data;
        const newGangCredits = data?.updategangsCollection?.records?.[0]?.credits ?? previousGangCredits;
        const serverRatingCost = data?.rating_cost ?? ratingCostGuess;
        const serverPurchaseCost = data?.purchase_cost ?? params.manual_cost ?? serverRatingCost;
        const newEquipmentId = data?.insertIntofighter_equipmentCollection?.records?.[0]?.id;

        const updated = [...previousEquipment, {
          fighter_equipment_id: newEquipmentId || tempId,
          equipment_id: item.equipment_id,
          equipment_name: item.equipment_name,
          equipment_type: item.equipment_type,
          cost: serverRatingCost,
          core_equipment: false,
          vehicle_id: params.vehicle_id,
          vehicle_equipment_id: newEquipmentId || tempId
        } as VehicleEquipment];

        onEquipmentUpdate(updated, previousFighterCredits + serverRatingCost, newGangCredits);

        toast({
          title: 'Equipment purchased',
          description: `Successfully bought ${item.equipment_name} for ${serverPurchaseCost} credits`,
          variant: 'default'
        });
      } catch (err) {
        // Rollback
        onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to buy vehicle equipment',
          variant: 'destructive'
        });
      }
    }
  };

  React.useEffect(() => {
    if (onRegisterPurchase) {
      onRegisterPurchase((payload) => purchaseMutation.mutate(payload));
    }
  }, [onRegisterPurchase, equipment, fighterCredits, gangCredits]);

  // Enhanced delete function using server actions with targeted cache invalidation
  const handleDeleteEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      const equipmentToDelete = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToDelete) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits (rating value)
      const optimisticEquipment = equipment.filter(e => e.fighter_equipment_id !== fighterEquipmentId);
      const optimisticFighterCredits = previousFighterCredits - (equipmentToDelete.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

      const result = await deleteEquipmentFromFighter({
        fighter_equipment_id: fighterEquipmentId,
        gang_id: gangId,
        fighter_id: fighterId,
        vehicle_id: equipmentToDelete.vehicle_id
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete equipment');
      }

      // Reconcile fighter credits with server-provided total if available
      const serverFighterTotal = result.data?.updatedFighterTotalCost as number | null | undefined;
      const finalFighterCredits = typeof serverFighterTotal === 'number' ? serverFighterTotal : optimisticFighterCredits;

      onEquipmentUpdate(optimisticEquipment, finalFighterCredits, previousGangCredits);

      toast({
        title: "Success",
        description: `Successfully deleted ${result.data?.deletedEquipment?.equipment_name || equipmentToDelete.equipment_name}`,
        variant: "default"
      });
      setDeleteModalData(null);
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error deleting equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to delete equipment',
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
      const optimisticGangCredits = previousGangCredits + (manualCost || 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, optimisticGangCredits);

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
        description: `Sold ${equipmentToSell.equipment_name} for ${manualCost || 0} credits`,
      });
      setSellModalData(null);
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error selling equipment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sell equipment",
        variant: "destructive",
      });
    }
  };

  const handleStashEquipment = async (fighterEquipmentId: string, equipmentId: string) => {
    // Snapshot for rollback
    const previousEquipment = [...equipment];
    const previousFighterCredits = fighterCredits;
    const previousGangCredits = gangCredits;

    try {
      const equipmentToStash = equipment.find(e => e.fighter_equipment_id === fighterEquipmentId);
      if (!equipmentToStash) {
        throw new Error('Equipment not found');
      }

      // Optimistic UI: remove item and adjust fighter credits
      const optimisticEquipment = equipment.filter(
        item => item.fighter_equipment_id !== fighterEquipmentId
      );
      const optimisticFighterCredits = previousFighterCredits - (equipmentToStash.cost ?? 0);
      onEquipmentUpdate(optimisticEquipment, optimisticFighterCredits, previousGangCredits);

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
      setStashModalData(null);
    } catch (error) {
      // Rollback
      onEquipmentUpdate(previousEquipment, previousFighterCredits, previousGangCredits);
      console.error('Error moving equipment to stash:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move equipment to stash",
        variant: "destructive",
      });
    }
  };

  // Sort equipment: core equipment first, then by name
  const sortedEquipment = [...equipment].sort((a, b) => {
    if (a.core_equipment && !b.core_equipment) return -1;
    if (!a.core_equipment && b.core_equipment) return 1;
    return a.equipment_name.localeCompare(b.equipment_name);
  });

  // Hardpoints derivation — extracted to component scope for access in Fit modal and actions
  const hardpoints = (vehicleEffects?.['hardpoint'] || []) as Array<{
    id: string;
    effect_name: string;
    fighter_equipment_id?: string;
    type_specific_data?: {
      operated_by?: string;
      arcs?: string[];
      default_arcs?: string[];
      credits_increase?: number;
      location?: string;
    };
  }>;

  const hardpointItems = hardpoints.map(hp => ({
    id: hp.id,
    effect_name: hp.effect_name,
    operated_by: hp.type_specific_data?.operated_by || 'crew',
    arcs: (hp.type_specific_data?.arcs || []).join(', ') || '—',
    credits_increase: hp.type_specific_data?.credits_increase || 0,
    location: hp.type_specific_data?.location || '',
    fighter_equipment_id: hp.fighter_equipment_id || '',
    fitted_weapon_name: hp.fighter_equipment_id
      ? (equipment.find(e => e.fighter_equipment_id === hp.fighter_equipment_id)?.equipment_name || '(unknown)')
      : '—'
  }));

  // Determine if there are any weapons available that are not currently fitted to a hardpoint
  const fittedWeaponIds = new Set(
    hardpoints
      .map(hp => hp.fighter_equipment_id)
      .filter((id): id is string => !!id)
  );

  const hasAvailableWeaponsForHardpoints = equipment.some(
    eq => eq.equipment_type === 'weapon' && !fittedWeaponIds.has(eq.fighter_equipment_id)
  );

  const hardpointsButtonDisabled =
    !userPermissions.canEdit ||
    isLoading ||
    hardpoints.length === 0 ||
    !hasAvailableWeaponsForHardpoints;

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

    // If this is a weapon, find the hardpoint it is attached to (if any) and grab its location
    let hardpointLocation: string | undefined;
    if (item.equipment_type === 'weapon') {
      const attachedHardpoint = hardpoints.find(
        hp => hp.fighter_equipment_id === item.fighter_equipment_id
      );
      const location = attachedHardpoint?.type_specific_data?.location;
      if (location && location.trim().length > 0) {
        hardpointLocation = location;
      }
    }

    return {
      id: item.fighter_equipment_id,
      equipment_name: item.equipment_name,
      equipment_type: item.equipment_type,
      cost: item.cost ?? 0,
      core_equipment: item.core_equipment,
      fighter_equipment_id: item.fighter_equipment_id,
      equipment_id: item.equipment_id,
      slot: slot,
      hardpoint_location: hardpointLocation,
      _equipment: item as Equipment
    };
  });

  return (
    <>
      <List
        title="Vehicle Equipment"
        headerActions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFitWeaponData({
                weaponEquipmentId: '',
                weaponName: ''
              });
            }}
            disabled={hardpointsButtonDisabled}
          >
            Hardpoints
          </Button>
        }
        items={listItems}
        columns={[
          {
            key: 'equipment_name',
            label: 'Name',
            width: '65%',
            render: (value: string, item: { _equipment?: Equipment; hardpoint_location?: string }) => {
              const equipment = item._equipment;
              const locationSuffix = item.hardpoint_location
                ? ` (Hardpoint: ${item.hardpoint_location})`
                : '';
              const displayName = `${value}${locationSuffix}`;

              if (!equipment) return displayName;
              return (
                <EquipmentTooltipTrigger item={equipment} className="block w-full">
                  {displayName}
                </EquipmentTooltipTrigger>
              );
            }
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
                setStashModalData({
                  ...equipment,
                  equipment_name: item.equipment_name, // Use the name from the transformed item
                  fighter_equipment_id: item.fighter_equipment_id // Ensure the ID is correctly set
                });
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
                setSellModalData({
                  ...equipment,
                  equipment_name: item.equipment_name, // Use the name from the transformed item
                  fighter_equipment_id: item.fighter_equipment_id // Ensure the ID is correctly set
                });
              }
            },
            disabled: (item) => item.core_equipment || isLoading || !userPermissions.canEdit
          }
          // Delete Action Removed - Not needed for now
          // {
          //   icon: <LuTrash2 className="h-4 w-4" />,
          //   variant: 'outline_remove',
          //   onClick: (item) => setDeleteModalData({
          //     id: item.fighter_equipment_id,
          //     equipmentId: item.equipment_id,
          //     name: item.equipment_name
          //   }),
          //   disabled: (item) => item.core_equipment || isLoading || !userPermissions.canEdit
          // }
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

      {fitWeaponData && (
        <FitWeaponModal
          weaponName={fitWeaponData.weaponName}
          currentHardpointId={
            hardpoints.find(hp => hp.fighter_equipment_id === fitWeaponData.weaponEquipmentId)?.id || null
          }
          hardpoints={hardpointItems.map(hp => ({
            id: hp.id,
            effect_name: hp.effect_name,
            fitted_weapon_name: hp.fitted_weapon_name,
            fitted_weapon_id: hp.fighter_equipment_id || undefined,
            operated_by: hp.operated_by,
            arcs: hardpoints.find(h => h.id === hp.id)?.type_specific_data?.arcs || [],
            default_arcs: hardpoints.find(h => h.id === hp.id)?.type_specific_data?.default_arcs || [],
            credits_increase: hp.credits_increase,
            location: hp.location
          }))}
          equipment={equipment}
          gangCredits={gangCredits}
          vehicleId={vehicleId}
          gangId={gangId}
          onClose={() => setFitWeaponData(null)}
          onConfirm={async (hardpointEffectId, weaponEquipmentId) => {
            try {
              const result = await fitWeaponToHardpoint({
                vehicleId,
                hardpointEffectId,
                weaponEquipmentId,
                gangId
              });
              if (!result.success) throw new Error(result.error || 'Failed to fit weapon');
              const weaponName = equipment.find(eq => eq.fighter_equipment_id === weaponEquipmentId)?.equipment_name || 'weapon';
              toast({ title: 'Weapon fitted', description: `${weaponName} fitted to hardpoint`, variant: 'default' });
              setFitWeaponData(null);
            } catch (err) {
              toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to fit weapon', variant: 'destructive' });
            }
          }}
        />
      )}

      <EquipmentTooltip />
    </>
  );
} 