'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import Modal from '@/components/ui/modal';
import { Equipment, FighterLoadout } from '@/types/equipment';
import { createLoadout, updateLoadout, deleteLoadout, setActiveLoadout } from '@/app/actions/loadouts';
import { useToast } from '@/components/ui/use-toast';
import { LuTrash2, LuPlus, LuCheck } from 'react-icons/lu';

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
  const [isSaving, setIsSaving] = useState(false);
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

  const handleCreateLoadout = async () => {
    if (!newLoadoutName.trim()) {
      toast({ description: 'Please enter a loadout name', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const result = await createLoadout({
        fighter_id: fighterId,
        gang_id: gangId,
        loadout_name: newLoadoutName.trim()
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create loadout');
      }

      const newLoadout: FighterLoadout = {
        id: result.data.loadout_id,
        fighter_id: fighterId,
        loadout_name: result.data.loadout_name,
        equipment_ids: []
      };

      setLoadouts([...loadouts, newLoadout]);
      setNewLoadoutName('');
      setIsCreating(false);
      setSelectedLoadoutId(newLoadout.id);
      toast({ description: `Created loadout "${newLoadout.loadout_name}"` });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to create loadout',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenameLoadout = async (loadoutId: string) => {
    if (!editingName.trim()) {
      toast({ description: 'Please enter a loadout name', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId,
        loadout_name: editingName.trim()
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to rename loadout');
      }

      setLoadouts(loadouts.map(l =>
        l.id === loadoutId ? { ...l, loadout_name: editingName.trim() } : l
      ));
      setEditingLoadoutId(null);
      setEditingName('');
      toast({ description: 'Loadout renamed' });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to rename loadout',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeleteLoadout = (loadoutId: string) => {
    setPendingDeleteLoadoutId(loadoutId);
    setConfirmationType('delete');
  };

  const handleDeleteLoadout = async (loadoutId: string) => {
    setIsSaving(true);
    try {
      const result = await deleteLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete loadout');
      }

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

      toast({ description: `Deleted loadout "${deletedLoadout?.loadout_name}"` });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete loadout',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActiveLoadout = async (loadoutId: string | null) => {
    setIsSaving(true);
    try {
      const result = await setActiveLoadout({
        loadout_id: loadoutId,
        fighter_id: fighterId,
        gang_id: gangId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to set active loadout');
      }

      setActiveLoadoutIdState(loadoutId);
      const loadoutName = loadoutId
        ? loadouts.find(l => l.id === loadoutId)?.loadout_name
        : 'Show All Equipment';
      toast({ description: `Active loadout: ${loadoutName}` });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to set active loadout',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) {
      onLoadoutsUpdate(loadouts, activeLoadoutId);
      return;
    }

    setIsSaving(true);
    try {
      // Save all pending changes
      for (const [loadoutId, equipmentIds] of Array.from(pendingChanges.entries())) {
        const result = await updateLoadout({
          loadout_id: loadoutId,
          fighter_id: fighterId,
          gang_id: gangId,
          equipment_ids: Array.from(equipmentIds)
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to save loadout changes');
        }
      }

      // Update local state with pending changes
      const updatedLoadouts = loadouts.map(l => {
        if (pendingChanges.has(l.id)) {
          return { ...l, equipment_ids: Array.from(pendingChanges.get(l.id)!) };
        }
        return l;
      });

      toast({ description: 'Loadout changes saved' });
      onLoadoutsUpdate(updatedLoadouts, activeLoadoutId);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = pendingChanges.size > 0;

  const requestCloseWithUnsavedChanges = (action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingDiscardAction(() => action);
      setConfirmationType('discard');
    } else {
      action();
    }
  };

  const handleConfirmationConfirm = async () => {
    if (confirmationType === 'delete' && pendingDeleteLoadoutId) {
      await handleDeleteLoadout(pendingDeleteLoadoutId);
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
