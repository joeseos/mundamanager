'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import Modal from '@/components/ui/modal';
import { Equipment, FighterLoadout } from '@/types/equipment';
import { createLoadout, updateLoadout, deleteLoadout, setActiveLoadout } from '@/app/actions/loadouts';
import { useToast } from '@/components/ui/use-toast';
import { LuTrash2, LuPlus, LuCheck } from 'react-icons/lu';
import { useMutation } from '@tanstack/react-query';

type ConfirmationType = 'delete' | 'discard' | null;

interface FighterLoadoutsModalProps {
  fighterId: string;
  gangId: string;
  equipment: Equipment[];
  loadouts: FighterLoadout[];
  activeLoadoutId?: string | null;
  onClose: () => void;
  onLoadoutsUpdate: (loadouts: FighterLoadout[], activeLoadoutId: string | null) => void;
}

export default function FighterLoadoutsModal({
  fighterId,
  gangId,
  equipment,
  loadouts: initialLoadouts,
  activeLoadoutId: initialActiveLoadoutId,
  onClose,
  onLoadoutsUpdate
}: FighterLoadoutsModalProps) {
  const { toast } = useToast();
  const [loadouts, setLoadouts] = useState<FighterLoadout[]>(initialLoadouts);
  const [activeLoadoutId, setActiveLoadoutIdState] = useState<string | null>(initialActiveLoadoutId ?? null);
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string | null>(initialActiveLoadoutId ?? null);
  const [isCreating, setIsCreating] = useState(false);
  const [newLoadoutName, setNewLoadoutName] = useState('');
  const [editingLoadoutId, setEditingLoadoutId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, Set<string>>>(new Map());
  const [confirmationType, setConfirmationType] = useState<ConfirmationType>(null);
  const [pendingDeleteLoadoutId, setPendingDeleteLoadoutId] = useState<string | null>(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);

  // Filter out vehicle upgrades (always shown, not part of loadouts)
  const loadoutEquipment = useMemo(
    () => equipment.filter(e => e.equipment_type !== 'vehicle_upgrade'),
    [equipment]
  );

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
      setIsCreating(false);
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
      setEditingLoadoutId(null);
      setEditingName('');
      return { previousLoadouts };
    },
    onError: (error, _vars, context) => {
      if (context) setLoadouts(context.previousLoadouts);
      toast({
        description: error instanceof Error ? error.message : 'Failed to rename loadout',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
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
        className="fixed inset-0 flex justify-center items-center z-[100] px-[10px] bg-neutral-300 bg-opacity-50 dark:bg-neutral-700 dark:bg-opacity-50"
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

        <div className="px-[10px] py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Loadout List */}
            <div className="space-y-2">
              <h4 className="font-semibold mb-2">Loadouts</h4>

              {/* Show All Equipment option */}
              <div
                className={`p-2 border rounded cursor-pointer flex items-center justify-between ${
                  selectedLoadoutId === null ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                }`}
                onClick={() => setSelectedLoadoutId(null)}
              >
                <span className="font-medium">Show All Equipment</span>
                <div className="flex items-center gap-2">
                  {activeLoadoutId === null && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                  )}
                  {selectedLoadoutId === null && activeLoadoutId !== null && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetActiveLoadout(null);
                      }}
                      disabled={isSaving}
                    >
                      Set Active
                    </Button>
                  )}
                </div>
              </div>

              {/* Loadout items */}
              {loadouts.map(loadout => (
                <div
                  key={loadout.id}
                  className={`p-2 border rounded cursor-pointer ${
                    selectedLoadoutId === loadout.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => setSelectedLoadoutId(loadout.id)}
                >
                  {editingLoadoutId === loadout.id ? (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 p-1 border rounded text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameLoadout(loadout.id);
                          if (e.key === 'Escape') {
                            setEditingLoadoutId(null);
                            setEditingName('');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRenameLoadout(loadout.id)}
                        disabled={isSaving}
                      >
                        <LuCheck className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span
                        className="font-medium cursor-text"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingLoadoutId(loadout.id);
                          setEditingName(loadout.loadout_name);
                        }}
                      >
                        {loadout.loadout_name}
                        {pendingChanges.has(loadout.id) && (
                          <span className="text-xs text-muted-foreground ml-1">*</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        {activeLoadoutId === loadout.id && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                        )}
                        {selectedLoadoutId === loadout.id && activeLoadoutId !== loadout.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetActiveLoadout(loadout.id);
                            }}
                            disabled={isSaving}
                          >
                            Set Active
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeleteLoadout(loadout.id);
                          }}
                          disabled={isSaving}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete ${loadout.loadout_name}`}
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Create new loadout */}
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newLoadoutName}
                    onChange={(e) => setNewLoadoutName(e.target.value)}
                    placeholder="Loadout name"
                    className="flex-1 p-2 border rounded"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateLoadout();
                      if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewLoadoutName('');
                      }
                    }}
                  />
                  <Button onClick={handleCreateLoadout} disabled={isSaving}>
                    <LuCheck className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsCreating(true)}
                  disabled={isSaving}
                >
                  <LuPlus className="h-4 w-4 mr-2" />
                  New Loadout
                </Button>
              )}
            </div>

            {/* Equipment Selection */}
            <div className="space-y-2">
              <h4 className="font-semibold mb-2">
                {selectedLoadout ? `Equipment in "${selectedLoadout.loadout_name}"` : 'Select a loadout to edit'}
              </h4>

              {selectedLoadout && loadoutEquipment.length > 0 ? (
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {loadoutEquipment.map(item => {
                    const equipmentIds = getLoadoutEquipmentIds(selectedLoadout.id);
                    const isInLoadout = equipmentIds.has(item.fighter_equipment_id);
                    const checkboxId = `loadout-equipment-${item.fighter_equipment_id}`;

                    return (
                      <label
                        key={item.fighter_equipment_id}
                        htmlFor={checkboxId}
                        className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={isInLoadout}
                          onCheckedChange={() => handleEquipmentToggle(item.fighter_equipment_id)}
                        />
                        <span className="flex-1">{item.equipment_name}</span>
                        <span className="text-muted-foreground text-sm">{item.cost}</span>
                      </label>
                    );
                  })}
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
