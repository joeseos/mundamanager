'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { Equipment, FighterLoadout } from '@/types/equipment';
import { createLoadout, updateLoadout, deleteLoadout, setActiveLoadout } from '@/app/actions/loadouts';
import { useToast } from '@/components/ui/use-toast';
import { LuTrash2, LuPencil, LuCheck, LuX } from 'react-icons/lu';
import { TbCornerLeftUp } from 'react-icons/tb';
import { useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

type ConfirmationType = 'delete' | 'discard' | null;

interface FighterLoadoutsModalProps {
  fighterId: string;
  gangId: string;
  equipment: Equipment[];
  loadouts: FighterLoadout[];
  activeLoadoutId?: string | null;
  fighterBaseCost?: number;
  onClose: () => void;
  onLoadoutsUpdate: (loadouts: FighterLoadout[], activeLoadoutId: string | null) => void;
}

export default function FighterLoadoutsModal({
  fighterId,
  gangId,
  equipment,
  loadouts: initialLoadouts,
  activeLoadoutId: initialActiveLoadoutId,
  fighterBaseCost = 0,
  onClose,
  onLoadoutsUpdate
}: FighterLoadoutsModalProps) {
  
  const [loadouts, setLoadouts] = useState<FighterLoadout[]>(initialLoadouts);
  const [activeLoadoutId, setActiveLoadoutIdState] = useState<string | null>(initialActiveLoadoutId ?? null);
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string | null>(initialActiveLoadoutId ?? null);
  const [newLoadoutName, setNewLoadoutName] = useState('');
  const [editingLoadoutId, setEditingLoadoutId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, Set<string>>>(new Map());
  const [confirmationType, setConfirmationType] = useState<ConfirmationType>(null);
  const [pendingDeleteLoadoutId, setPendingDeleteLoadoutId] = useState<string | null>(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);

  // Filter out vehicle upgrades (always shown, not part of loadouts)
  // Apply same sorting as fighter-equipment-list.tsx
  const loadoutEquipment = useMemo(() => {
    const filtered = equipment.filter(e => e.equipment_type !== 'vehicle_upgrade');
    
    // Separate equipment into parent items (equipment that targets fighters/vehicles) and child items (equipment targeting other equipment)
    const parentEquipment = filtered.filter(item => !item.target_equipment_id);
    const childEquipment = filtered.filter(item => item.target_equipment_id);
    
    // Sort parent equipment: core equipment first, then by name
    const sortedParentEquipment = [...parentEquipment].sort((a, b) => {
      if (a.core_equipment && !b.core_equipment) return -1;
      if (!a.core_equipment && b.core_equipment) return 1;
      return a.equipment_name.localeCompare(b.equipment_name);
    });
    
    // Build a tree structure: map parent equipment IDs to their child equipment
    const equipmentTree = new Map<string, Equipment[]>();
    childEquipment.forEach(child => {
      const parentId = child.target_equipment_id!;
      if (!equipmentTree.has(parentId)) {
        equipmentTree.set(parentId, []);
      }
      equipmentTree.get(parentId)!.push(child);
    });
    
    // Sort children within each parent group
    equipmentTree.forEach((children) => {
      children.sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
    });
    
    // Filter parent equipment by type
    const weapons = sortedParentEquipment.filter(item => item.equipment_type === 'weapon');
    const wargear = sortedParentEquipment.filter(item => item.equipment_type === 'wargear');
    
    // Build final list: weapons first, then wargear, with children included
    const result: Equipment[] = [];
    
    weapons.forEach(weapon => {
      result.push(weapon);
      const children = equipmentTree.get(weapon.fighter_equipment_id) || [];
      result.push(...children);
    });
    
    if (wargear.length > 0 && weapons.length > 0) {
      // Add separator conceptually (we'll handle this in rendering if needed)
    }
    
    wargear.forEach(item => {
      result.push(item);
      const children = equipmentTree.get(item.fighter_equipment_id) || [];
      result.push(...children);
    });
    
    return result;
  }, [equipment]);

  // Get the selected loadout
  const selectedLoadout = selectedLoadoutId
    ? loadouts.find(l => l.id === selectedLoadoutId)
    : null;

  // Get equipment IDs for the selected loadout (with pending changes)
  const getLoadoutEquipmentIds = useCallback((loadoutId: string): Set<string> => {
    if (pendingChanges.has(loadoutId)) {
      return pendingChanges.get(loadoutId)!;
    }
    const loadout = loadouts.find(l => l.id === loadoutId);
    return new Set(loadout?.equipment_ids || []);
  }, [pendingChanges, loadouts]);

  // Calculate total cost of checked equipment in the selected loadout
  const totalLoadoutCost = useMemo(() => {
    if (!selectedLoadout) return 0;
    const equipmentIds = getLoadoutEquipmentIds(selectedLoadout.id);
    return loadoutEquipment
      .filter(item => equipmentIds.has(item.fighter_equipment_id))
      .reduce((sum, item) => sum + (item.cost ?? 0), 0);
  }, [selectedLoadout, loadoutEquipment, getLoadoutEquipmentIds]);

  // Calculate total cost of fighter with only the selected loadout equipment
  const totalFighterCost = useMemo(() => {
    return fighterBaseCost + totalLoadoutCost;
  }, [fighterBaseCost, totalLoadoutCost]);

  const handleEquipmentToggle = (equipmentId: string) => {
    if (!selectedLoadoutId) return;

    const currentIds = getLoadoutEquipmentIds(selectedLoadoutId);
    const newIds = new Set(currentIds);

    if (newIds.has(equipmentId)) {
      newIds.delete(equipmentId);
    } else {
      newIds.add(equipmentId);
    }

    setPendingChanges(prev => new Map(prev).set(selectedLoadoutId, newIds));
  };

  // TanStack Query mutation for creating loadouts with optimistic update
  const createLoadoutMutation = useMutation({
    mutationFn: async (loadoutName: string) => {
      const result = await createLoadout({
        fighter_id: fighterId,
        gang_id: gangId,
        loadout_name: loadoutName
      });
      if (!result.success) throw new Error(result.error || 'Failed to create loadout');
      return result.data;
    },
    onMutate: async (loadoutName) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticLoadout: FighterLoadout = {
        id: tempId,
        fighter_id: fighterId,
        loadout_name: loadoutName,
        equipment_ids: []
      };
      const previousLoadouts = [...loadouts];
      setLoadouts([...loadouts, optimisticLoadout]);
      setNewLoadoutName('');
      setSelectedLoadoutId(tempId);
      return { previousLoadouts, tempId, loadoutName };
    },
    onError: (error, _loadoutName, context) => {
      if (context) {
        setLoadouts(context.previousLoadouts);
        setSelectedLoadoutId(null);
      }
      toast({
        description: error instanceof Error ? error.message : 'Failed to create loadout',
        variant: 'destructive'
      });
    },
    onSuccess: (data, _loadoutName, context) => {
      // Replace temp ID with real ID from server
      if (context) {
        setLoadouts(prev => prev.map(l =>
          l.id === context.tempId ? { ...l, id: data.loadout_id, loadout_name: data.loadout_name } : l
        ));
        setSelectedLoadoutId(data.loadout_id);
      }
      toast({ description: `Created loadout "${data.loadout_name}"` });
    }
  });

  const handleCreateLoadout = () => {
    if (!newLoadoutName.trim()) {
      toast({ description: 'Please enter a loadout name', variant: 'destructive' });
      return;
    }
    createLoadoutMutation.mutate(newLoadoutName.trim());
  };

  // TanStack Query mutation for renaming loadouts with optimistic update
  const renameLoadoutMutation = useMutation({
    mutationFn: async ({ loadoutId, newName }: { loadoutId: string; newName: string }) => {
      const result = await updateLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId,
        loadout_name: newName
      });
      if (!result.success) throw new Error(result.error || 'Failed to rename loadout');
      return { loadoutId, newName };
    },
    onMutate: async ({ loadoutId, newName }) => {
      const previousLoadouts = [...loadouts];
      setLoadouts(loadouts.map(l =>
        l.id === loadoutId ? { ...l, loadout_name: newName } : l
      ));
      return { previousLoadouts };
    },
    onError: (error, _vars, context) => {
      if (context) setLoadouts(context.previousLoadouts);
      // Keep editing mode on error so user can fix and retry
      toast({
        description: error instanceof Error ? error.message : 'Failed to rename loadout',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      setEditingLoadoutId(null);
      setEditingName('');
      toast({ description: 'Loadout renamed' });
    }
  });

  const handleRenameLoadout = (loadoutId: string) => {
    if (!editingName.trim()) {
      toast({ description: 'Please enter a loadout name', variant: 'destructive' });
      return;
    }
    renameLoadoutMutation.mutate({ loadoutId, newName: editingName.trim() });
  };

  const startEditing = (loadout: FighterLoadout) => {
    setEditingLoadoutId(loadout.id);
    setEditingName(loadout.loadout_name);
  };

  const handleCancelEdit = () => {
    setEditingLoadoutId(null);
    setEditingName('');
  };

  const requestDeleteLoadout = (loadoutId: string) => {
    setPendingDeleteLoadoutId(loadoutId);
    setConfirmationType('delete');
  };

  // TanStack Query mutation for deleting loadouts with optimistic update
  const deleteLoadoutMutation = useMutation({
    mutationFn: async (loadoutId: string) => {
      const result = await deleteLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId
      });
      if (!result.success) throw new Error(result.error || 'Failed to delete loadout');
      return { loadoutId };
    },
    onMutate: async (loadoutId) => {
      const previousLoadouts = [...loadouts];
      const previousActiveLoadoutId = activeLoadoutId;
      const previousSelectedLoadoutId = selectedLoadoutId;
      const previousPendingChanges = new Map(pendingChanges);
      const deletedLoadout = loadouts.find(l => l.id === loadoutId);

      setLoadouts(loadouts.filter(l => l.id !== loadoutId));

      // If this was the active or selected loadout, clear selection
      if (activeLoadoutId === loadoutId) {
        setActiveLoadoutIdState(null);
      }
      if (selectedLoadoutId === loadoutId) {
        setSelectedLoadoutId(null);
      }

      // Remove pending changes for this loadout
      setPendingChanges(prev => {
        const newMap = new Map(prev);
        newMap.delete(loadoutId);
        return newMap;
      });

      return { previousLoadouts, previousActiveLoadoutId, previousSelectedLoadoutId, previousPendingChanges, deletedLoadout };
    },
    onError: (error, _loadoutId, context) => {
      if (context) {
        setLoadouts(context.previousLoadouts);
        setActiveLoadoutIdState(context.previousActiveLoadoutId);
        setSelectedLoadoutId(context.previousSelectedLoadoutId);
        setPendingChanges(context.previousPendingChanges);
      }
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete loadout',
        variant: 'destructive'
      });
    },
    onSuccess: (_data, _loadoutId, context) => {
      toast({ description: `Deleted loadout "${context?.deletedLoadout?.loadout_name}"` });
    }
  });

  const handleDeleteLoadout = (loadoutId: string) => {
    deleteLoadoutMutation.mutate(loadoutId);
  };

  // TanStack Query mutation for setting active loadout with optimistic update
  const setActiveLoadoutMutation = useMutation({
    mutationFn: async (loadoutId: string | null) => {
      const result = await setActiveLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId
      });
      if (!result.success) throw new Error(result.error || 'Failed to set active loadout');
      return { loadoutId };
    },
    onMutate: async (loadoutId) => {
      const previousActiveLoadoutId = activeLoadoutId;
      setActiveLoadoutIdState(loadoutId);
      return { previousActiveLoadoutId };
    },
    onError: (error, _loadoutId, context) => {
      if (context) setActiveLoadoutIdState(context.previousActiveLoadoutId);
      toast({
        description: error instanceof Error ? error.message : 'Failed to set active loadout',
        variant: 'destructive'
      });
    },
    onSuccess: (_data, loadoutId) => {
      const loadoutName = loadoutId
        ? loadouts.find(l => l.id === loadoutId)?.loadout_name
        : 'Show All Equipment';
      toast({ description: `Active loadout: ${loadoutName}` });
    }
  });

  const handleSetActiveLoadout = (loadoutId: string | null) => {
    setActiveLoadoutMutation.mutate(loadoutId);
  };

  // TanStack Query mutation for saving all pending changes
  const saveChangesMutation = useMutation({
    mutationFn: async (changes: Map<string, Set<string>>) => {
      // Save all pending changes
      for (const [loadoutId, equipmentIds] of Array.from(changes.entries())) {
        const result = await updateLoadout({
          loadout_id: loadoutId,
          fighter_id: fighterId,
          gang_id: gangId,
          equipment_ids: Array.from(equipmentIds)
        });
        if (!result.success) throw new Error(result.error || 'Failed to save loadout changes');
      }
      return { changes };
    },
    onMutate: async (changes) => {
      // Optimistically update loadouts with pending changes
      const updatedLoadouts = loadouts.map(l => {
        if (changes.has(l.id)) {
          return { ...l, equipment_ids: Array.from(changes.get(l.id)!) };
        }
        return l;
      });
      return { updatedLoadouts };
    },
    onError: (error) => {
      toast({
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive'
      });
    },
    onSuccess: (_data, _changes, context) => {
      if (context) {
        toast({ description: 'Loadout changes saved' });
        onLoadoutsUpdate(context.updatedLoadouts, activeLoadoutId);
      }
    }
  });

  const handleSaveChanges = () => {
    if (pendingChanges.size === 0) {
      onLoadoutsUpdate(loadouts, activeLoadoutId);
      return;
    }
    saveChangesMutation.mutate(pendingChanges);
  };

  const hasUnsavedChanges = pendingChanges.size > 0;

  // Compute isSaving from mutation pending states (only for preventing double-clicks)
  const isSaving = createLoadoutMutation.isPending ||
    renameLoadoutMutation.isPending ||
    deleteLoadoutMutation.isPending ||
    setActiveLoadoutMutation.isPending ||
    saveChangesMutation.isPending;

  const requestCloseWithUnsavedChanges = (action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingDiscardAction(() => action);
      setConfirmationType('discard');
    } else {
      action();
    }
  };

  const handleConfirmationConfirm = () => {
    if (confirmationType === 'delete' && pendingDeleteLoadoutId) {
      handleDeleteLoadout(pendingDeleteLoadoutId);
    } else if (confirmationType === 'discard' && pendingDiscardAction) {
      pendingDiscardAction();
    }
    setConfirmationType(null);
    setPendingDeleteLoadoutId(null);
    setPendingDiscardAction(null);
  };

  const handleConfirmationCancel = () => {
    setConfirmationType(null);
    setPendingDeleteLoadoutId(null);
    setPendingDiscardAction(null);
  };

  return (
    <div
        className="fixed inset-0 flex justify-center items-center z-[100] px-[10px] bg-black/50 dark:bg-neutral-700/50"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            requestCloseWithUnsavedChanges(onClose);
          }
        }}
      >
        <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
          <div className="border-b px-[10px] py-2 flex justify-between items-center">
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Equipment Loadouts</h3>
            <button
              type="button"
              onClick={() => requestCloseWithUnsavedChanges(onClose)}
              aria-label="Close"
              className="text-muted-foreground hover:text-muted-foreground text-xl"
            >
              ×
            </button>
          </div>

        <div className="px-[10px] py-2 overflow-y-auto flex-1 mt-2">
          <div className="space-y-4">
            {/* Loadout List */}
            <div>
              
              {/* Loadout Badges */}
              <div className="flex items-center gap-1 flex-wrap mb-2">
                <h4 className="text-sm text-muted-foreground">Loadouts:</h4>
                <Badge
                  variant={selectedLoadoutId === null ? 'default' : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setSelectedLoadoutId(null)}
                  title="Show all equipment"
                >
                  None
                </Badge>
                {loadouts.map((loadout) => (
                  <Badge
                    key={loadout.id}
                    variant={selectedLoadoutId === loadout.id ? 'default' : 'outline'}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setSelectedLoadoutId(loadout.id)}
                    title={`View equipment in ${loadout.loadout_name}`}
                  >
                    {loadout.loadout_name}
                    {pendingChanges.has(loadout.id) && (
                      <span className="ml-1">*</span>
                    )}
                  </Badge>
                ))}
              </div>

              {/* Create new loadout */}
              <div className="flex space-x-2 mb-4">
                <Input
                  type="text"
                  value={newLoadoutName}
                  onChange={(e) => setNewLoadoutName(e.target.value)}
                  placeholder="Add a Loadout (max 50 characters)"
                  maxLength={50}
                  className="flex-grow text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateLoadout();
                    }
                  }}
                />
                <Button
                  onClick={handleCreateLoadout}
                  type="button"
                  disabled={!newLoadoutName.trim() || isSaving}
                >
                  Add
                </Button>
              </div>

              {/* Equipment Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  {selectedLoadout && editingLoadoutId === selectedLoadout.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="Enter loadout name (max 50 characters)"
                        maxLength={50}
                        className="flex-grow mr-2 h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRenameLoadout(selectedLoadout.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelEdit();
                          }
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline_accept"
                          size="sm"
                          onClick={() => handleRenameLoadout(selectedLoadout.id)}
                          className="h-8 w-8 p-0"
                          title="Save"
                          disabled={!editingName.trim() || renameLoadoutMutation.isPending}
                        >
                          <LuCheck className="size-4" />
                        </Button>
                        <Button
                          variant="outline_cancel"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8 w-8 p-0"
                          title="Cancel"
                          disabled={renameLoadoutMutation.isPending}
                        >
                          <LuX className="size-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="font-semibold">
                        {selectedLoadout ? (
                          <span className="text-base" title={selectedLoadout.loadout_name}>
                            {selectedLoadout.loadout_name.length > 30 
                              ? `${selectedLoadout.loadout_name.substring(0, 30)}...` 
                              : `${selectedLoadout.loadout_name}`}
                          </span>
                        ) : (
                          'Select a loadout to edit'
                        )}
                      </h4>
                      {selectedLoadout && (
                        <div className="flex items-center gap-1">
                          {activeLoadoutId === selectedLoadout.id && (
                            <Badge variant="default">Active</Badge>
                          )}
                          {activeLoadoutId !== selectedLoadout.id && (
                            <Badge
                              variant="outline"
                              className={`cursor-pointer transition-opacity ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                              onClick={() => !isSaving && handleSetActiveLoadout(selectedLoadout.id)}
                              title="Set as active loadout"
                            >
                              Set as Active
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(selectedLoadout)}
                            className="h-8 w-8 p-0"
                            title="Edit loadout"
                          >
                            <LuPencil className="size-4" />
                          </Button>
                          <Button
                            variant="outline_remove"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => requestDeleteLoadout(selectedLoadout.id)}
                            title="Delete loadout"
                            disabled={isSaving}
                          >
                            <LuTrash2 className="size-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {selectedLoadout && loadoutEquipment.length > 0 ? (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full table-auto">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted">
                          <th className="px-1 py-1 text-left w-[5%] bg-muted"></th>
                          <th className="px-1 py-1 text-left w-[75%] bg-muted">Name</th>
                          <th className="px-1 py-1 pr-2 text-right bg-muted">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadoutEquipment.map(item => {
                          const equipmentIds = getLoadoutEquipmentIds(selectedLoadout.id);
                          const isInLoadout = equipmentIds.has(item.fighter_equipment_id);
                          const checkboxId = `loadout-equipment-${item.fighter_equipment_id}`;
                          const isChild = !!item.target_equipment_id;
                          const mutedClass = !isInLoadout ? "text-muted-foreground" : "";

                          return (
                            <tr
                              key={item.fighter_equipment_id}
                              className={`${isChild ? "border-b bg-muted/20" : "border-b"} hover:bg-muted cursor-pointer`}
                              onClick={() => handleEquipmentToggle(item.fighter_equipment_id)}
                            >
                              <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  id={checkboxId}
                                  checked={isInLoadout}
                                  onCheckedChange={() => handleEquipmentToggle(item.fighter_equipment_id)}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <label
                                  htmlFor={checkboxId}
                                  className="cursor-pointer"
                                >
                                  {isChild && (
                                    <span className="text-muted-foreground mr-1" style={{ position: 'relative', top: '-4px' }}>
                                      <TbCornerLeftUp className="inline" />
                                    </span>
                                  )}
                                  <span className={`${isChild ? "text-sm" : ""} ${mutedClass}`}>
                                    {item.equipment_name}
                                  </span>
                                </label>
                              </td>
                              <td className="px-1 py-1 pr-2 text-right">
                                <span className={`${isChild ? "text-sm" : ""} ${mutedClass}`}>
                                  {item.cost ?? '-'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : selectedLoadout && loadoutEquipment.length === 0 ? (
                  <p className="text-muted-foreground italic">No equipment available</p>
                ) : (
                  <p className="text-muted-foreground italic">
                    Select a loadout from the list to manage its equipment
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-[10px] pb-2">
          {selectedLoadout && (
            <div className="mt-1 flex justify-end">
              <table className="w-auto">
                <tbody>
                  <tr>
                    <td className="text-right leading-none pr-2 py-0">
                      <span className="text-sm text-muted-foreground">Loadout:</span>
                    </td>
                    <td className="text-right leading-none py-0">
                      <span className="text-sm text-muted-foreground">{totalLoadoutCost} credits</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="text-right leading-none pr-2 py-0">
                      <span className="text-sm text-muted-foreground">Fighter:</span>
                    </td>
                    <td className="text-right leading-none py-0">
                      <span className="text-sm text-muted-foreground">{fighterBaseCost} credits</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="text-right leading-none pr-2 py-0">
                      <span className="text-sm font-semibold">Total Cost:</span>
                    </td>
                    <td className="text-right leading-none py-0">
                      <span className="text-sm font-semibold">{totalFighterCost} credits</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2 bg-card rounded-b-lg">
          <Button
            variant="outline"
            onClick={() => requestCloseWithUnsavedChanges(onClose)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="bg-neutral-900 text-white hover:bg-gray-800"
          >
            {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Done'}
          </Button>
        </div>

        {/* Confirmation Modal - rendered inside to layer on top */}
        {confirmationType && (
          <Modal
            title={confirmationType === 'delete' ? 'Delete Loadout' : 'Unsaved Changes'}
            content={
              <p className="text-muted-foreground">
                {confirmationType === 'delete'
                  ? 'Are you sure you want to delete this loadout? This action cannot be undone.'
                  : 'You have unsaved changes. Are you sure you want to discard them?'}
              </p>
            }
            onClose={handleConfirmationCancel}
            onConfirm={handleConfirmationConfirm}
            confirmText={confirmationType === 'delete' ? 'Delete' : 'Discard'}
            width="sm"
          />
        )}
      </div>
    </div>
  );
}
