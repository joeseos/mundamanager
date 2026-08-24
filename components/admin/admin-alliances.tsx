'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { EditionSelect } from '@/components/edition-select';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface Alliance {
  id: string;
  alliance_type: string | null;
  alliance_name: string;
  alignment: string | null;
  strong_alliance: string | null;
  alliance_crew_name: string | null;
  edition_id: string | null;
}

interface GangType {
  gang_type_id: string;
  gang_type: string;
  edition_id?: string | null;
}

interface AdminAlliancesModalProps {
  onClose: () => void;
}

export function AdminAlliancesModal({ onClose }: AdminAlliancesModalProps) {
  const queryClient = useQueryClient();

  const [selectedAllianceId, setSelectedAllianceId] = useState('');
  const [allianceType, setAllianceType] = useState('');
  const [allianceName, setAllianceName] = useState('');
  const [alignment, setAlignment] = useState('');
  const [strongAlliance, setStrongAlliance] = useState('');
  const [allianceCrewName, setAllianceCrewName] = useState('');
  const [editionId, setEditionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);

  const { data: alliances = [], isLoading: isLoadingAlliances } = useQuery<Alliance[]>({
    queryKey: ['admin-alliances'],
    queryFn: async () => {
      const response = await fetch('/api/admin/alliances');
      if (!response.ok) throw new Error('Failed to fetch alliances');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useQuery<GangType[]>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isLoadingAlliances || isLoadingGangTypes || isSubmitting;
  const isFormDisabled = (!isCreateMode && !selectedAllianceId) || isLoading;

  const filteredAlliances = editionId
    ? alliances.filter(alliance => alliance.edition_id === editionId)
    : alliances;

  const filteredGangTypes = useMemo(
    () => editionId
      ? gangTypes.filter(gt => gt.edition_id === editionId)
      : gangTypes,
    [gangTypes, editionId]
  );

  const clearFormFields = () => {
    setAllianceType('');
    setAllianceName('');
    setAlignment('');
    setStrongAlliance('');
    setAllianceCrewName('');
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    if (newEditionId && selectedAllianceId) {
      const alliance = alliances.find(a => a.id === selectedAllianceId);
      if (alliance && alliance.edition_id !== newEditionId) {
        setSelectedAllianceId('');
        clearFormFields();
        setIsCreateMode(false);
      }
    }

    if (strongAlliance) {
      const selectedGangType = gangTypes.find(gt => gt.gang_type_id === strongAlliance);
      if (selectedGangType && selectedGangType.edition_id !== newEditionId) {
        setStrongAlliance('');
      }
    }
  };

  const handleAllianceSelect = (allianceId: string) => {
    setSelectedAllianceId(allianceId);
    const alliance = alliances.find(a => a.id === allianceId);
    if (alliance) {
      setAllianceType(alliance.alliance_type ?? '');
      setAllianceName(alliance.alliance_name);
      setAlignment(alliance.alignment ?? '');
      setStrongAlliance(alliance.strong_alliance ?? '');
      setAllianceCrewName(alliance.alliance_crew_name ?? '');
      setEditionId(alliance.edition_id ?? '');
      setIsCreateMode(false);
    } else {
      clearFormFields();
      setIsCreateMode(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedAllianceId('');
    clearFormFields();
    setIsCreateMode(true);
  };

  const handleSubmitAlliance = async (operation: OperationType) => {
    if (
      (operation === OperationType.POST || operation === OperationType.UPDATE) &&
      (!allianceType || !allianceName.trim() || !editionId)
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            alliance_type: allianceType,
            alliance_name: allianceName,
            alignment: alignment || null,
            strong_alliance: strongAlliance || null,
            alliance_crew_name: allianceCrewName || null,
            edition_id: editionId,
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedAllianceId,
            alliance_type: allianceType,
            alliance_name: allianceName,
            alignment: alignment || null,
            strong_alliance: strongAlliance || null,
            alliance_crew_name: allianceCrewName || null,
            edition_id: editionId,
          });
          break;
        case OperationType.DELETE:
          method = 'DELETE';
          body = JSON.stringify({
            id: selectedAllianceId,
          });
          break;
        default:
          throw new Error('Invalid operation');
      }

      const response = await fetch('/api/admin/alliances', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
          `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} alliance`
        );
      }

      const resultData = operation === OperationType.DELETE
        ? null
        : await response.json();

      toast.success(
        `Alliance ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`
      );

      await queryClient.invalidateQueries({ queryKey: ['admin-alliances'] });
      await queryClient.invalidateQueries({ queryKey: ['alliances'] });

      if (operation === OperationType.POST && resultData?.id) {
        setSelectedAllianceId(resultData.id);
        setIsCreateMode(false);
        setAllianceType(resultData.alliance_type ?? allianceType);
        setAllianceName(resultData.alliance_name ?? allianceName);
        setAlignment(resultData.alignment ?? '');
        setStrongAlliance(resultData.strong_alliance ?? '');
        setAllianceCrewName(resultData.alliance_crew_name ?? '');
        setEditionId(resultData.edition_id ?? editionId);
      } else if (operation === OperationType.DELETE) {
        setSelectedAllianceId('');
        clearFormFields();
        setIsCreateMode(false);
      }
      // UPDATE: keep selection and fields so the admin can continue editing
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} alliance`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Alliances</h3>
            <p className="text-sm text-muted-foreground">Create, edit, or delete alliances</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="space-y-4">
            <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Select Alliance
                </label>
                <Button
                  onClick={handleCreateNew}
                  disabled={isLoading}
                  className="text-xs h-7 px-3"
                >
                  Create New
                </Button>
              </div>
              <select
                value={selectedAllianceId}
                onChange={(e) => handleAllianceSelect(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isLoading}
              >
                <option value="">Select an alliance to edit</option>
                {filteredAlliances.map((alliance) => (
                  <option key={alliance.id} value={alliance.id}>
                    {alliance.alliance_name}
                    {alliance.alliance_type ? ` (${alliance.alliance_type})` : ''}
                  </option>
                ))}
              </select>
              {isCreateMode && (
                <p className="text-xs text-amber-600 mt-1">
                  Creating new alliance. Select from dropdown to cancel and edit existing.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Alliance Type *
              </label>
              <select
                value={allianceType}
                onChange={(e) => setAllianceType(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">Select alliance type</option>
                <option value="Criminal">Criminal</option>
                <option value="Merchant Guilds">Merchant Guilds</option>
                <option value="Noble Houses">Noble Houses</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Alliance Name *
              </label>
              <Input
                type="text"
                value={allianceName}
                onChange={(e) => setAllianceName(e.target.value)}
                placeholder="E.g. Corpse Guild, Psi-Syndica"
                className="w-full"
                disabled={isFormDisabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Alignment
              </label>
              <select
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None</option>
                <option value="Law Abiding">Law Abiding</option>
                <option value="Outlaw">Outlaw</option>
                <option value="Unrestricted">Unrestricted</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Strong Alliance
              </label>
              <select
                value={strongAlliance}
                onChange={(e) => setStrongAlliance(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isFormDisabled}
              >
                <option value="">None</option>
                {filteredGangTypes.map((gangType) => (
                  <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
                    {gangType.gang_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Alliance Crew Name
              </label>
              <Input
                type="text"
                value={allianceCrewName}
                onChange={(e) => setAllianceCrewName(e.target.value)}
                placeholder="E.g. Corpse Guild, Corpse Harvesting Party"
                className="w-full"
                disabled={isFormDisabled}
              />
            </div>
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>

          {isCreateMode && (
            <Button
              onClick={() => handleSubmitAlliance(OperationType.POST)}
              disabled={!allianceType || !allianceName.trim() || !editionId || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : 'Create Alliance'}
            </Button>
          )}

          {!isCreateMode && selectedAllianceId && (
            <>
              <Button
                onClick={() => handleSubmitAlliance(OperationType.UPDATE)}
                disabled={!allianceType || !allianceName.trim() || !editionId || isLoading}
                className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
              >
                {isLoading ? 'Updating...' : 'Update Alliance'}
              </Button>
              <Button
                onClick={() => handleSubmitAlliance(OperationType.DELETE)}
                disabled={isLoading}
                className="flex-1 bg-red-600 text-white rounded-sm hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Delete Alliance'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
