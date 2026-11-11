'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import {
  compareScenarioTableEntries,
  SCENARIO_TABLE_TYPE_LABELS,
  SCENARIO_TABLE_TYPES,
  type ScenarioTable,
  type ScenarioTableEntry,
  type ScenarioTableType,
} from '@/types/campaign';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface GangType {
  id: string;
  gang_type: string;
  edition_id?: string | null;
  parent_gang_type_id?: string | null;
}

/** An entry as the route returns it: with its table's type and gang type. */
type EntryRow = Omit<ScenarioTableEntry, 'scenario_table_id'> & Pick<ScenarioTable, 'table_type' | 'gang_type_id'>;

const ENTRIES_URL = '/api/admin/scenarios?resource=entries';
const ENTRIES_QUERY_KEY = ['admin-scenario-table-entries'];

function verb(operation: OperationType): { doing: string; done: string } {
  switch (operation) {
    case OperationType.POST: return { doing: 'create', done: 'created' };
    case OperationType.UPDATE: return { doing: 'update', done: 'updated' };
    case OperationType.DELETE: return { doing: 'delete', done: 'deleted' };
  }
}

async function submitJson(url: string, operation: OperationType, payload: object) {
  const method = operation === OperationType.POST ? 'POST' : operation === OperationType.UPDATE ? 'PATCH' : 'DELETE';
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to ${verb(operation).doing} entry`);
  }
  return operation === OperationType.DELETE ? null : response.json();
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return response.json();
}

/**
 * The Deployments, Objectives, Side Jobs and Crew of one edition. Side Jobs
 * are the only gang specific type: picking a gang type edits that house's own
 * table instead of the core one. The Scenarios modal shows it in place of the
 * scenario form for editions whose scenarios are made from scenario tables.
 */
export function ScenarioTablesEditor({ editionId, onClose }: { editionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tableType, setTableType] = useState<ScenarioTableType>(SCENARIO_TABLE_TYPES[0]);
  const [gangTypeId, setGangTypeId] = useState('');

  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [entryName, setEntryName] = useState('');
  const [d6, setD6] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(false);

  const { data: entries = [], isLoading: isLoadingEntries } = useQuery<EntryRow[]>({
    queryKey: ENTRIES_QUERY_KEY,
    queryFn: () => fetchJson(ENTRIES_URL),
    staleTime: 5 * 60 * 1000,
  });
  // detailed=1 carries parent_gang_type_id, so only the houses themselves are
  // offered: alternate lists reach their house's tables through it.
  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useQuery<GangType[]>({
    queryKey: ['admin-gang-types', 'detailed'],
    queryFn: () => fetchJson('/api/admin/gang-types?detailed=1'),
    staleTime: 5 * 60 * 1000,
    enabled: tableType === 'side_job',
  });

  const isLoading = isLoadingEntries || isLoadingGangTypes || isSubmitting;

  const gangTypeOptions = useMemo(
    () => [
      { value: '', label: 'Core (All gangs)' },
      ...gangTypes
        .filter(gt => !gt.parent_gang_type_id && gt.edition_id === editionId)
        .map(gt => ({ value: gt.id, label: gt.gang_type })),
    ],
    [gangTypes, editionId]
  );

  const entryOptions = useMemo(
    () => entries
      .filter(entry =>
        entry.edition_id === editionId &&
        entry.table_type === tableType &&
        (entry.gang_type_id ?? '') === gangTypeId
      )
      .sort(compareScenarioTableEntries)
      .map(entry => ({ value: entry.id, label: `${entry.d6_min}. ${entry.name}` })),
    [entries, editionId, tableType, gangTypeId]
  );

  const isFormDisabled = (!isCreateMode && !selectedEntryId) || isLoading;
  const canSubmit = Boolean(entryName.trim() && /^[1-6]$/.test(d6.trim()));

  const selectEntry = (entry?: EntryRow, creating = false) => {
    setSelectedEntryId(entry?.id ?? '');
    setEntryName(entry?.name ?? '');
    setD6(entry ? String(entry.d6_min) : '');
    setIsCreateMode(creating);
  };

  const handleSubmit = async (operation: OperationType) => {
    // Every line of an N26 table is a single result
    const fields = { name: entryName, d6_min: Number(d6), d6_max: Number(d6) };
    setIsSubmitting(true);
    try {
      const saved: EntryRow | null = await submitJson(
        ENTRIES_URL,
        operation,
        operation === OperationType.POST
          ? { ...fields, edition_id: editionId, table_type: tableType, gang_type_id: gangTypeId || null }
          : operation === OperationType.UPDATE ? { id: selectedEntryId, ...fields }
          : { id: selectedEntryId }
      );
      toast.success(`Entry ${verb(operation).done} successfully`);
      await queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
      selectEntry(saved ?? undefined);
    } catch (error) {
      console.error(`Error executing ${operation} entry operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${verb(operation).doing} entry`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="px-[10px] pb-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Type
            </label>
            <select
              value={tableType}
              onChange={(e) => {
                setTableType(e.target.value as ScenarioTableType);
                setGangTypeId('');
                selectEntry();
              }}
              className="w-full p-2 border rounded-md"
              disabled={isLoading}
            >
              {SCENARIO_TABLE_TYPES.map(type => (
                <option key={type} value={type}>{SCENARIO_TABLE_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>

          {tableType === 'side_job' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Type
              </label>
              <Combobox
                value={gangTypeId}
                onValueChange={(value) => {
                  setGangTypeId(value);
                  selectEntry();
                }}
                options={gangTypeOptions}
                placeholder="Core (All gangs)"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Core (All gangs) is the table every gang rolls on. Pick a house to edit its own Side Jobs, such as Goliath&apos;s; its alternate lists use them too.
              </p>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-muted-foreground">
                Select Entry
              </label>
              <Button onClick={() => selectEntry(undefined, true)} disabled={isLoading} className="text-xs h-7 px-3">
                Create New
              </Button>
            </div>
            <Combobox
              value={selectedEntryId}
              onValueChange={(entryId) => selectEntry(entries.find(e => e.id === entryId))}
              options={entryOptions}
              placeholder="Select an entry to edit"
              clearable
              disabled={isLoading}
            />
            {isCreateMode && (
              <p className="text-xs text-amber-600 mt-1">
                Creating new entry. Select from dropdown to cancel and edit existing.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Name *
            </label>
            <Input
              type="text"
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder="E.g. Sniping Range, King of the Hive"
              className="w-full"
              disabled={isFormDisabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              D6 *
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={d6}
              onChange={(e) => setD6(e.target.value)}
              placeholder="E.g. 1"
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
            onClick={() => handleSubmit(OperationType.POST)}
            disabled={!canSubmit || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create'}
          </Button>
        )}

        {!isCreateMode && selectedEntryId && (
          <>
            <Button
              onClick={() => handleSubmit(OperationType.UPDATE)}
              disabled={!canSubmit || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Updating...' : 'Update'}
            </Button>
            <Button
              onClick={() => handleSubmit(OperationType.DELETE)}
              disabled={isLoading}
              className="flex-1 bg-red-600 text-white rounded-sm hover:bg-red-700"
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
